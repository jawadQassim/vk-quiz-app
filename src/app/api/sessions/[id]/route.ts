import { QuizSessionStatus } from "@prisma/client";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getAuthenticatedUser } from "@/lib/auth";
import { jsonError, parseJsonRequest } from "@/lib/http";
import {
  isValidRecordId,
  normalizeSessionStatus,
  serializeSessionLeaderboard,
  serializeSessionForOrganizer,
  serializeSessionParticipants,
  SessionApiRouteError,
  updateOwnedSession,
} from "@/lib/session";
import {
  emitLeaderboardUpdated,
  emitParticipantListUpdated,
  emitQuizFinished,
  emitQuizQuestionChanged,
  emitQuizStarted,
} from "@/lib/socket/server";

export const runtime = "nodejs";

type SessionRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function getUpdateSessionPayload(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      error: "Request body must be a JSON object.",
    };
  }

  const body = payload as Record<string, unknown>;
  const data: {
    status?: ReturnType<typeof normalizeSessionStatus>;
    currentQuestionIndex?: number;
  } = {};

  if ("status" in body) {
    const status = normalizeSessionStatus(body.status);

    if (!status) {
      return {
        error:
          'status must be "waiting", "active", or "finished".',
      };
    }

    data.status = status;
  }

  if ("currentQuestionIndex" in body) {
    const currentQuestionIndex = body.currentQuestionIndex;

    if (
      typeof currentQuestionIndex !== "number" ||
      !Number.isInteger(currentQuestionIndex) ||
      currentQuestionIndex < 0
    ) {
      return {
        error:
          "currentQuestionIndex must be a non-negative integer.",
      };
    }

    data.currentQuestionIndex = currentQuestionIndex;
  }

  if (
    data.status === undefined &&
    data.currentQuestionIndex === undefined
  ) {
    return {
      error: "Provide status or currentQuestionIndex.",
    };
  }

  return {
    data,
  };
}

export async function PATCH(
  request: NextRequest,
  context: SessionRouteContext,
) {
  const user = await getAuthenticatedUser(request);

  if (!user) {
    return jsonError(401, "Authentication required.");
  }

  const { id } = await context.params;

  if (!isValidRecordId(id)) {
    return jsonError(400, "Session id must be a valid identifier.");
  }

  const payload = await parseJsonRequest(request);

  if (!payload) {
    return jsonError(400, "Request body must be valid JSON.");
  }

  const parsedPayload = getUpdateSessionPayload(payload);

  if ("error" in parsedPayload) {
    return jsonError(
      400,
      parsedPayload.error ?? "Invalid session update payload.",
    );
  }

  try {
    const session = await updateOwnedSession(user.id, id, {
      status: parsedPayload.data.status ?? undefined,
      currentQuestionIndex:
        parsedPayload.data.currentQuestionIndex,
    });
    const organizerSession =
      serializeSessionForOrganizer(session);
    const participantsPayload =
      serializeSessionParticipants(session);
    const leaderboardPayload =
      serializeSessionLeaderboard(session);

    if (parsedPayload.data.status === QuizSessionStatus.ACTIVE) {
      emitQuizStarted({
        sessionId: session.id,
        roomCode: session.roomCode,
        status: "active",
        currentQuestionIndex: session.currentQuestionIndex,
        startedAt: session.startedAt?.toISOString() ?? null,
      });
      emitParticipantListUpdated(
        session.id,
        participantsPayload,
      );
      emitLeaderboardUpdated(session.id, leaderboardPayload);
    } else if (
      parsedPayload.data.status === QuizSessionStatus.FINISHED
    ) {
      emitQuizFinished({
        sessionId: session.id,
        roomCode: session.roomCode,
        status: "finished",
        currentQuestionIndex: session.currentQuestionIndex,
        finishedAt: session.finishedAt?.toISOString() ?? null,
      });
      emitParticipantListUpdated(
        session.id,
        participantsPayload,
      );
      emitLeaderboardUpdated(session.id, leaderboardPayload);
    } else if (
      parsedPayload.data.currentQuestionIndex !== undefined ||
      parsedPayload.data.status === QuizSessionStatus.WAITING
    ) {
      emitQuizQuestionChanged({
        sessionId: session.id,
        roomCode: session.roomCode,
        status:
          session.status === QuizSessionStatus.ACTIVE
            ? "active"
            : session.status === QuizSessionStatus.FINISHED
              ? "finished"
              : "waiting",
        currentQuestionIndex: session.currentQuestionIndex,
      });

      if (parsedPayload.data.status === QuizSessionStatus.WAITING) {
        emitParticipantListUpdated(
          session.id,
          participantsPayload,
        );
        emitLeaderboardUpdated(
          session.id,
          leaderboardPayload,
        );
      }
    }

    return NextResponse.json({
      session: organizerSession,
    });
  } catch (error) {
    if (error instanceof SessionApiRouteError) {
      return jsonError(error.status, error.message);
    }

    return jsonError(500, "Unable to update quiz session.");
  }
}
