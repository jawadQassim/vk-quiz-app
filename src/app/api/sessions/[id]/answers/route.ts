import {
  QuestionType,
  QuizSessionStatus,
} from "@prisma/client";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { jsonError, parseJsonRequest } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import {
  createAnswerPayloadFromSelection,
  isUniqueConstraintError,
  isValidRecordId,
  serializeSessionLeaderboard,
  serializeSessionParticipants,
  scoreForCorrectAnswer,
  SessionApiRouteError,
  sessionWithQuizInclude,
} from "@/lib/session";
import {
  emitAnswerSubmitted,
  emitLeaderboardUpdated,
  emitParticipantListUpdated,
} from "@/lib/socket/server";

export const runtime = "nodejs";

type SessionAnswersRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function arraysAreEqual(first: string[], second: string[]) {
  return (
    first.length === second.length &&
    first.every((value, index) => value === second[index])
  );
}

function getSubmitAnswerPayload(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      error: "Request body must be a JSON object.",
    };
  }

  const body = payload as Record<string, unknown>;
  const participantId =
    typeof body.participantId === "string"
      ? body.participantId.trim()
      : "";
  const questionId =
    typeof body.questionId === "string"
      ? body.questionId.trim()
      : "";

  if (!isValidRecordId(participantId)) {
    return {
      error: "participantId must be a valid identifier.",
    };
  }

  if (!isValidRecordId(questionId)) {
    return {
      error: "questionId must be a valid identifier.",
    };
  }

  if (!Array.isArray(body.selectedOptionIds)) {
    return {
      error: "selectedOptionIds must be an array of option ids.",
    };
  }

  const rawSelectedOptionIds = body.selectedOptionIds;
  const selectedOptionIds = rawSelectedOptionIds.map((value) =>
    typeof value === "string" ? value.trim() : "",
  );

  if (
    selectedOptionIds.length === 0 ||
    selectedOptionIds.some(
      (value) => !value || !isValidRecordId(value),
    )
  ) {
    return {
      error:
        "selectedOptionIds must contain one or more valid option ids.",
    };
  }

  const normalizedSelectedOptionIds = [
    ...new Set(selectedOptionIds),
  ];

  if (
    normalizedSelectedOptionIds.length !==
    selectedOptionIds.length
  ) {
    return {
      error: "selectedOptionIds cannot contain duplicates.",
    };
  }

  return {
    data: {
      participantId,
      questionId,
      selectedOptionIds: normalizedSelectedOptionIds,
    },
  };
}

export async function POST(
  request: NextRequest,
  context: SessionAnswersRouteContext,
) {
  const { id } = await context.params;

  if (!isValidRecordId(id)) {
    return jsonError(400, "Session id must be a valid identifier.");
  }

  const payload = await parseJsonRequest(request);

  if (!payload) {
    return jsonError(400, "Request body must be valid JSON.");
  }

  const parsedPayload = getSubmitAnswerPayload(payload);

  if ("error" in parsedPayload) {
    return jsonError(
      400,
      parsedPayload.error ?? "Invalid answer payload.",
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
            include: {
              questions: {
                orderBy: {
                  position: "asc",
                },
                include: {
                  options: {
                    orderBy: {
                      position: "asc",
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!session) {
        throw new SessionApiRouteError(404, "Session not found.");
      }

      if (session.status !== QuizSessionStatus.ACTIVE) {
        throw new SessionApiRouteError(
          409,
          "Answers are only accepted while the quiz is active.",
        );
      }

      const currentQuestion =
        session.quiz.questions[session.currentQuestionIndex] ?? null;

      if (!currentQuestion) {
        throw new SessionApiRouteError(
          409,
          "Current question is not available.",
        );
      }

      if (currentQuestion.id !== parsedPayload.data.questionId) {
        throw new SessionApiRouteError(
          409,
          "You can only answer the current question.",
        );
      }

      const participant = await tx.participant.findFirst({
        where: {
          id: parsedPayload.data.participantId,
          quizSessionId: session.id,
        },
        select: {
          id: true,
          score: true,
        },
      });

      if (!participant) {
        throw new SessionApiRouteError(
          404,
          "Participant not found.",
        );
      }

      const existingAnswer = await tx.answer.findUnique({
        where: {
          participantId_questionId: {
            participantId: participant.id,
            questionId: currentQuestion.id,
          },
        },
        select: {
          id: true,
        },
      });

      if (existingAnswer) {
        throw new SessionApiRouteError(
          409,
          "This question has already been answered.",
        );
      }

      if (
        currentQuestion.type === QuestionType.SINGLE &&
        parsedPayload.data.selectedOptionIds.length !== 1
      ) {
        throw new SessionApiRouteError(
          400,
          "Single choice questions require exactly one selected option.",
        );
      }

      const validOptionIds = new Set(
        currentQuestion.options.map((option) => option.id),
      );
      const hasInvalidOptionId =
        parsedPayload.data.selectedOptionIds.some(
          (optionId) => !validOptionIds.has(optionId),
        );

      if (hasInvalidOptionId) {
        throw new SessionApiRouteError(
          400,
          "Selected options must belong to the current question.",
        );
      }

      const selectedOptionIds = [
        ...parsedPayload.data.selectedOptionIds,
      ].sort();
      const correctOptionIds = currentQuestion.options
        .filter((option) => option.isCorrect)
        .map((option) => option.id)
        .sort();
      const isCorrect = arraysAreEqual(
        selectedOptionIds,
        correctOptionIds,
      );
      const scoreAwarded = scoreForCorrectAnswer(isCorrect);

      await tx.answer.create({
        data: {
          participantId: participant.id,
          questionId: currentQuestion.id,
          selectedOptionIds:
            createAnswerPayloadFromSelection(
              selectedOptionIds,
            ),
          isCorrect,
          scoreAwarded,
        },
      });

      const updatedParticipant = await tx.participant.update({
        where: {
          id: participant.id,
        },
        data: {
          score: {
            increment: scoreAwarded,
          },
        },
        select: {
          score: true,
        },
      });

      return {
        sessionId: session.id,
        roomCode: session.roomCode,
        participantId: participant.id,
        questionId: currentQuestion.id,
        selectedOptionIds,
        correctOptionIds,
        isCorrect,
        scoreAwarded,
        score: updatedParticipant.score,
      };
    });
    const sessionSnapshot = await prisma.quizSession.findUnique({
      where: {
        id: result.sessionId,
      },
      include: sessionWithQuizInclude,
    });

    if (sessionSnapshot) {
      emitAnswerSubmitted({
        sessionId: result.sessionId,
        roomCode: result.roomCode,
        participantId: result.participantId,
        questionId: result.questionId,
      });
      emitParticipantListUpdated(
        result.sessionId,
        serializeSessionParticipants(sessionSnapshot),
      );
      emitLeaderboardUpdated(
        result.sessionId,
        serializeSessionLeaderboard(sessionSnapshot),
      );
    }

    const answer = {
      questionId: result.questionId,
      selectedOptionIds: result.selectedOptionIds,
      correctOptionIds: result.correctOptionIds,
      isCorrect: result.isCorrect,
      scoreAwarded: result.scoreAwarded,
      score: result.score,
    };

    return NextResponse.json(
      {
        answer,
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    if (error instanceof SessionApiRouteError) {
      return jsonError(error.status, error.message);
    }

    if (isUniqueConstraintError(error)) {
      return jsonError(
        409,
        "This question has already been answered.",
      );
    }

    return jsonError(500, "Unable to submit answer.");
  }
}
