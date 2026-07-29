import {
  Prisma,
  QuizSessionStatus,
  QuizStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { publicUserSelect } from "@/lib/user";

const ROOM_CODE_PATTERN = /^\d{6}$/;
const RECORD_ID_PATTERN = /^[a-z0-9]+$/i;
const POINTS_PER_CORRECT_ANSWER = 100;

export class SessionApiRouteError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "SessionApiRouteError";
    this.status = status;
  }
}

export const sessionWithQuizInclude = {
  participants: {
    orderBy: [
      {
        score: "desc",
      },
      {
        joinedAt: "asc",
      },
    ],
    include: {
      answers: true,
    },
  },
  quiz: {
    include: {
      owner: {
        select: publicUserSelect,
      },
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
} satisfies Prisma.QuizSessionInclude;

export type SessionWithQuizRecord = Prisma.QuizSessionGetPayload<{
  include: typeof sessionWithQuizInclude;
}>;

type SessionParticipantRecord =
  SessionWithQuizRecord["participants"][number];

function parseSelectedOptionIds(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;

    if (
      Array.isArray(parsed) &&
      parsed.every((item) => typeof item === "string")
    ) {
      return parsed;
    }
  } catch {
    return [];
  }

  return [];
}

function getCorrectOptionIds(
  question: SessionWithQuizRecord["quiz"]["questions"][number],
) {
  return question.options
    .filter((option) => option.isCorrect)
    .map((option) => option.id)
    .sort();
}

function toParticipantSummary(
  participant: SessionParticipantRecord,
) {
  return {
    id: participant.id,
    name: participant.name,
    score: participant.score,
    joinedAt: participant.joinedAt.toISOString(),
    correctAnswers: participant.answers.filter(
      (answer) => answer.isCorrect,
    ).length,
  };
}

function serializeSessionStatus(
  status: QuizSessionStatus,
): "waiting" | "active" | "finished" {
  if (status === QuizSessionStatus.ACTIVE) {
    return "active";
  }

  if (status === QuizSessionStatus.FINISHED) {
    return "finished";
  }

  return "waiting";
}

function serializeQuizStatus(
  status: QuizStatus,
): "draft" | "active" | "finished" {
  if (status === QuizStatus.ACTIVE) {
    return "active";
  }

  if (status === QuizStatus.FINISHED) {
    return "finished";
  }

  return "draft";
}

function serializeOptionalDate(value: Date | null) {
  return value ? value.toISOString() : null;
}

async function generateUniqueRoomCodeInTransaction(
  tx: Prisma.TransactionClient,
) {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const roomCode = Math.floor(
      100000 + Math.random() * 900000,
    ).toString();

    const existingSession = await tx.quizSession.findUnique({
      where: {
        roomCode,
      },
      select: {
        id: true,
      },
    });

    if (!existingSession) {
      return roomCode;
    }
  }

  throw new SessionApiRouteError(
    500,
    "Unable to generate a unique room code.",
  );
}

export function isValidRoomCode(value: unknown): value is string {
  return (
    typeof value === "string" &&
    ROOM_CODE_PATTERN.test(value.trim())
  );
}

export function isValidRecordId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 10 &&
    RECORD_ID_PATTERN.test(value.trim())
  );
}

export function normalizeSessionStatus(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "waiting") {
    return QuizSessionStatus.WAITING;
  }

  if (normalized === "active") {
    return QuizSessionStatus.ACTIVE;
  }

  if (normalized === "finished") {
    return QuizSessionStatus.FINISHED;
  }

  return null;
}

export function quizStatusFromSessionStatus(
  status: QuizSessionStatus,
) {
  if (status === QuizSessionStatus.ACTIVE) {
    return QuizStatus.ACTIVE;
  }

  if (status === QuizSessionStatus.FINISHED) {
    return QuizStatus.FINISHED;
  }

  return QuizStatus.DRAFT;
}

export function serializeSessionForOrganizer(
  session: SessionWithQuizRecord,
) {
  return {
    id: session.id,
    roomCode: session.roomCode,
    status: serializeSessionStatus(session.status),
    currentQuestionIndex: session.currentQuestionIndex,
    startedAt: serializeOptionalDate(session.startedAt),
    finishedAt: serializeOptionalDate(session.finishedAt),
    participantCount: session.participants.length,
    quiz: {
      id: session.quiz.id,
      title: session.quiz.title,
      status: serializeQuizStatus(session.quiz.status),
      timePerQuestion: session.quiz.timePerQuestion,
      totalQuestions: session.quiz.questions.length,
    },
    participants: session.participants.map(toParticipantSummary),
  };
}

export function serializeSessionParticipants(
  session: SessionWithQuizRecord,
) {
  return {
    id: session.id,
    roomCode: session.roomCode,
    status: serializeSessionStatus(session.status),
    participantCount: session.participants.length,
    participants: session.participants.map(toParticipantSummary),
  };
}

export function serializeSessionLeaderboard(
  session: SessionWithQuizRecord,
) {
  return {
    sessionId: session.id,
    roomCode: session.roomCode,
    status: serializeSessionStatus(session.status),
    quizTitle: session.quiz.title,
    participants: session.participants.map(toParticipantSummary),
  };
}

export function serializeRoomSession(
  session: SessionWithQuizRecord,
  participantId?: string,
) {
  const currentQuestion =
    session.quiz.questions[session.currentQuestionIndex] ?? null;
  const participant = participantId
    ? session.participants.find(
        (item) => item.id === participantId,
      ) ?? null
    : null;
  const currentAnswer =
    participant && currentQuestion
      ? participant.answers.find(
          (answer) => answer.questionId === currentQuestion.id,
        ) ?? null
      : null;

  return {
    id: session.id,
    roomCode: session.roomCode,
    status: serializeSessionStatus(session.status),
    currentQuestionIndex: session.currentQuestionIndex,
    startedAt: serializeOptionalDate(session.startedAt),
    finishedAt: serializeOptionalDate(session.finishedAt),
    participantCount: session.participants.length,
    quiz: {
      id: session.quiz.id,
      title: session.quiz.title,
      category: session.quiz.category,
      description: session.quiz.description,
      timePerQuestion: session.quiz.timePerQuestion,
      totalQuestions: session.quiz.questions.length,
    },
    participant: participant
      ? {
          id: participant.id,
          name: participant.name,
          score: participant.score,
          correctAnswers: participant.answers.filter(
            (answer) => answer.isCorrect,
          ).length,
        }
      : null,
    currentQuestion: currentQuestion
      ? {
          id: currentQuestion.id,
          text: currentQuestion.text,
          imageUrl: currentQuestion.imageUrl,
          type: currentQuestion.type.toLowerCase(),
          questionNumber: currentQuestion.position + 1,
          totalQuestions: session.quiz.questions.length,
          options: currentQuestion.options.map((option) => ({
            id: option.id,
            text: option.text,
            position: option.position,
          })),
        }
      : null,
    currentAnswer:
      currentAnswer && currentQuestion
        ? {
            questionId: currentAnswer.questionId,
            selectedOptionIds: parseSelectedOptionIds(
              currentAnswer.selectedOptionIds,
            ),
            isCorrect: currentAnswer.isCorrect,
            scoreAwarded: currentAnswer.scoreAwarded,
            correctOptionIds: getCorrectOptionIds(
              currentQuestion,
            ),
          }
        : null,
  };
}

export async function getOwnedSessionOrThrow(
  userId: string,
  sessionId: string,
) {
  const session = await prisma.quizSession.findFirst({
    where: {
      id: sessionId,
      quiz: {
        ownerId: userId,
      },
    },
    include: sessionWithQuizInclude,
  });

  if (!session) {
    throw new SessionApiRouteError(404, "Session not found.");
  }

  return session;
}

export async function createOrReuseActiveSession(
  userId: string,
  quizId: string,
  requestedRoomCode?: string,
) {
  return prisma.$transaction(async (tx) => {
    const quiz = await tx.quiz.findFirst({
      where: {
        id: quizId,
        ownerId: userId,
      },
      include: {
        questions: {
          orderBy: {
            position: "asc",
          },
          select: {
            id: true,
          },
        },
        sessions: {
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
          include: {
            participants: {
              select: {
                id: true,
              },
            },
          },
        },
      },
    });

    if (!quiz) {
      throw new SessionApiRouteError(404, "Quiz not found.");
    }

    if (quiz.questions.length === 0) {
      throw new SessionApiRouteError(
        409,
        "Quiz must contain at least one question.",
      );
    }

    const latestSession = quiz.sessions[0] ?? null;
    const reusableSession =
      latestSession?.status === QuizSessionStatus.ACTIVE
        ? latestSession
        : latestSession?.status === QuizSessionStatus.WAITING &&
            latestSession.participants.length === 0 &&
            !latestSession.startedAt &&
            !latestSession.finishedAt
          ? latestSession
          : null;

    const roomCode =
      requestedRoomCode?.trim() ||
      reusableSession?.roomCode ||
      (await generateUniqueRoomCodeInTransaction(tx));

    if (requestedRoomCode?.trim()) {
      const existingSession = await tx.quizSession.findUnique({
        where: {
          roomCode: requestedRoomCode.trim(),
        },
        select: {
          id: true,
        },
      });

      if (
        existingSession &&
        existingSession.id !== reusableSession?.id
      ) {
        throw new SessionApiRouteError(
          409,
          "That room code is already in use.",
        );
      }
    }

    const now = new Date();
    let sessionId = reusableSession?.id ?? null;

    if (reusableSession) {
      await tx.quizSession.update({
        where: {
          id: reusableSession.id,
        },
        data: {
          roomCode,
          status: QuizSessionStatus.ACTIVE,
          currentQuestionIndex: 0,
          startedAt: now,
          finishedAt: null,
        },
      });
    } else {
      const createdSession = await tx.quizSession.create({
        data: {
          quizId: quiz.id,
          roomCode,
          status: QuizSessionStatus.ACTIVE,
          currentQuestionIndex: 0,
          startedAt: now,
          finishedAt: null,
        },
        select: {
          id: true,
        },
      });

      sessionId = createdSession.id;
    }

    await tx.quiz.update({
      where: {
        id: quiz.id,
      },
      data: {
        status: QuizStatus.ACTIVE,
      },
    });

    return tx.quizSession.findUniqueOrThrow({
      where: {
        id: sessionId ?? reusableSession!.id,
      },
      include: sessionWithQuizInclude,
    });
  });
}

export async function updateOwnedSession(
  userId: string,
  sessionId: string,
  payload: {
    status?: QuizSessionStatus;
    currentQuestionIndex?: number;
  },
) {
  return prisma.$transaction(async (tx) => {
    const session = await tx.quizSession.findFirst({
      where: {
        id: sessionId,
        quiz: {
          ownerId: userId,
        },
      },
      include: {
        quiz: {
          include: {
            owner: {
              select: publicUserSelect,
            },
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
        participants: {
          orderBy: [
            {
              score: "desc",
            },
            {
              joinedAt: "asc",
            },
          ],
          include: {
            answers: true,
          },
        },
      },
    });

    if (!session) {
      throw new SessionApiRouteError(404, "Session not found.");
    }

    if (payload.currentQuestionIndex !== undefined) {
      if (
        payload.currentQuestionIndex < 0 ||
        payload.currentQuestionIndex >= session.quiz.questions.length
      ) {
        throw new SessionApiRouteError(
          400,
          "currentQuestionIndex is out of range.",
        );
      }
    }

    const nextStatus = payload.status ?? session.status;
    const nextQuestionIndex =
      payload.currentQuestionIndex ??
      (nextStatus === QuizSessionStatus.ACTIVE
        ? session.currentQuestionIndex
        : 0);
    const now = new Date();

    await tx.quizSession.update({
      where: {
        id: session.id,
      },
      data: {
        status: nextStatus,
        currentQuestionIndex: nextQuestionIndex,
        startedAt:
          nextStatus === QuizSessionStatus.ACTIVE
            ? session.startedAt ?? now
            : nextStatus === QuizSessionStatus.FINISHED
              ? session.startedAt ?? now
              : null,
        finishedAt:
          nextStatus === QuizSessionStatus.FINISHED
            ? now
            : null,
      },
    });

    await tx.quiz.update({
      where: {
        id: session.quiz.id,
      },
      data: {
        status: quizStatusFromSessionStatus(nextStatus),
      },
    });

    return tx.quizSession.findUniqueOrThrow({
      where: {
        id: session.id,
      },
      include: sessionWithQuizInclude,
    });
  });
}

export function isUniqueConstraintError(error: unknown) {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "P2002"
  );
}

export function createAnswerPayloadFromSelection(
  selectedOptionIds: string[],
) {
  return JSON.stringify([...selectedOptionIds].sort());
}

export function scoreForCorrectAnswer(isCorrect: boolean) {
  return isCorrect ? POINTS_PER_CORRECT_ANSWER : 0;
}
