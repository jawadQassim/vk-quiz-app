import { QuizSessionStatus } from "@prisma/client";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { jsonError, parseJsonRequest } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import {
  isUniqueConstraintError,
  isValidRecordId,
  serializeSessionLeaderboard,
  serializeSessionParticipants,
  SessionApiRouteError,
  sessionWithQuizInclude,
} from "@/lib/session";
import {
  emitLeaderboardUpdated,
  emitParticipantJoined,
  emitParticipantListUpdated,
} from "@/lib/socket/server";

export const runtime = "nodejs";

type SessionJoinRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function getJoinPayload(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      error: "Request body must be a JSON object.",
    };
  }

  const body = payload as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";

  if (!name) {
    return {
      error: "Participant name is required.",
    };
  }

  if (name.length > 60) {
    return {
      error: "Participant name must be 60 characters or fewer.",
    };
  }

  return {
    data: {
      name,
    },
  };
}

export async function POST(
  request: NextRequest,
  context: SessionJoinRouteContext,
) {
  const { id } = await context.params;

  if (!isValidRecordId(id)) {
    return jsonError(400, "Session id must be a valid identifier.");
  }

  const payload = await parseJsonRequest(request);

  if (!payload) {
    return jsonError(400, "Request body must be valid JSON.");
  }

  const parsedPayload = getJoinPayload(payload);

  if ("error" in parsedPayload) {
    return jsonError(
      400,
      parsedPayload.error ?? "Invalid join payload.",
    );
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const session = await tx.quizSession.findUnique({
        where: {
          id,
        },
        include: {
          quiz: {
            select: {
              title: true,
              questions: {
                select: {
                  id: true,
                },
              },
            },
          },
        },
      });

      if (!session) {
        throw new SessionApiRouteError(404, "Session not found.");
      }

      if (session.status === QuizSessionStatus.WAITING) {
        throw new SessionApiRouteError(
          409,
          "Quiz has not started yet.",
        );
      }

      if (session.status === QuizSessionStatus.FINISHED) {
        throw new SessionApiRouteError(
          409,
          "Quiz has already finished.",
        );
      }

      if (session.quiz.questions.length === 0) {
        throw new SessionApiRouteError(
          409,
          "Quiz session does not have any questions.",
        );
      }

      const participant = await tx.participant.create({
        data: {
          quizSessionId: session.id,
          name: parsedPayload.data.name,
        },
        select: {
          id: true,
        },
      });

      return {
        participantId: participant.id,
        sessionId: session.id,
        quizTitle: session.quiz.title,
        roomCode: session.roomCode,
      };
    });
    const sessionSnapshot = await prisma.quizSession.findUnique({
      where: {
        id: result.sessionId,
      },
      include: sessionWithQuizInclude,
    });

    if (sessionSnapshot) {
      const participantsPayload =
        serializeSessionParticipants(sessionSnapshot);
      const leaderboardPayload =
        serializeSessionLeaderboard(sessionSnapshot);
      const joinedParticipant =
        participantsPayload.participants.find(
          (participant) =>
            participant.id === result.participantId,
        ) ?? null;

      if (joinedParticipant) {
        emitParticipantJoined({
          sessionId: result.sessionId,
          roomCode: result.roomCode,
          participant: joinedParticipant,
          participantCount:
            participantsPayload.participantCount,
        });
      }

      emitParticipantListUpdated(
        result.sessionId,
        participantsPayload,
      );
      emitLeaderboardUpdated(
        result.sessionId,
        leaderboardPayload,
      );
    }

    return NextResponse.json(result, {
      status: 201,
    });
  } catch (error) {
    if (error instanceof SessionApiRouteError) {
      return jsonError(error.status, error.message);
    }

    if (isUniqueConstraintError(error)) {
      return jsonError(
        409,
        "A participant with that name has already joined this session.",
      );
    }

    return jsonError(500, "Unable to join quiz session.");
  }
}
