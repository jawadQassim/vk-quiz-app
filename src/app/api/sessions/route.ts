import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getAuthenticatedUser } from "@/lib/auth";
import { jsonError, parseJsonRequest } from "@/lib/http";
import {
  createOrReuseActiveSession,
  isValidRecordId,
  isValidRoomCode,
  serializeSessionLeaderboard,
  serializeSessionForOrganizer,
  serializeSessionParticipants,
  SessionApiRouteError,
} from "@/lib/session";
import {
  emitLeaderboardUpdated,
  emitParticipantListUpdated,
  emitQuizStarted,
} from "@/lib/socket/server";

export const runtime = "nodejs";

function getCreateSessionPayload(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      error: "Request body must be a JSON object.",
    };
  }

  const body = payload as Record<string, unknown>;
  const quizId = typeof body.quizId === "string" ? body.quizId.trim() : "";
  const roomCodeRaw =
    typeof body.roomCode === "string" ? body.roomCode.trim() : "";

  if (!isValidRecordId(quizId)) {
    return {
      error: "quizId must be a valid identifier.",
    };
  }

  if (roomCodeRaw && !isValidRoomCode(roomCodeRaw)) {
    return {
      error: "roomCode must be a 6-digit string.",
    };
  }

  return {
    data: {
      quizId,
      roomCode: roomCodeRaw || undefined,
    },
  };
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);

  if (!user) {
    return jsonError(401, "Authentication required.");
  }

  const payload = await parseJsonRequest(request);

  if (!payload) {
    return jsonError(400, "Request body must be valid JSON.");
  }

  const parsedPayload = getCreateSessionPayload(payload);

  if ("error" in parsedPayload) {
    return jsonError(
      400,
      parsedPayload.error ?? "Invalid session payload.",
    );
  }

  try {
    const session = await createOrReuseActiveSession(
      user.id,
      parsedPayload.data.quizId,
      parsedPayload.data.roomCode,
    );
    const organizerSession =
      serializeSessionForOrganizer(session);

    emitQuizStarted({
      sessionId: session.id,
      roomCode: session.roomCode,
      status: "active",
      currentQuestionIndex: session.currentQuestionIndex,
      startedAt: session.startedAt?.toISOString() ?? null,
    });
    emitParticipantListUpdated(
      session.id,
      serializeSessionParticipants(session),
    );
    emitLeaderboardUpdated(
      session.id,
      serializeSessionLeaderboard(session),
    );

    return NextResponse.json({
      session: organizerSession,
    });
  } catch (error) {
    if (error instanceof SessionApiRouteError) {
      return jsonError(error.status, error.message);
    }

    return jsonError(500, "Unable to start quiz session.");
  }
}
