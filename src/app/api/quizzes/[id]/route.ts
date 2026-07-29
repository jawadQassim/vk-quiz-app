import {
  QuizSessionStatus,
  QuizStatus,
  type Prisma,
} from "@prisma/client";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getAuthenticatedUser } from "@/lib/auth";
import { jsonError, parseJsonRequest } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import {
  buildQuestionCreateInput,
  generateUniqueRoomCode,
  isRoomCodeAvailable,
  organizerQuizInclude,
  serializeOrganizerQuiz,
  toSessionStatus,
  validateQuizInput,
} from "@/lib/quiz";

export const runtime = "nodejs";

type QuizRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function getSessionMutation(
  nextStatus: QuizStatus,
  currentQuestionIndex?: number,
  existingStartedAt?: Date | null,
) {
  if (nextStatus === QuizStatus.DRAFT) {
    return {
      status: QuizSessionStatus.WAITING,
      currentQuestionIndex: currentQuestionIndex ?? 0,
      startedAt: null,
      finishedAt: null,
    } satisfies Prisma.QuizSessionUpdateInput;
  }

  if (nextStatus === QuizStatus.ACTIVE) {
    return {
      status: QuizSessionStatus.ACTIVE,
      currentQuestionIndex: currentQuestionIndex ?? 0,
      startedAt: existingStartedAt ?? new Date(),
      finishedAt: null,
    } satisfies Prisma.QuizSessionUpdateInput;
  }

  return {
    status: QuizSessionStatus.FINISHED,
    currentQuestionIndex: currentQuestionIndex ?? 0,
    startedAt: existingStartedAt ?? new Date(),
    finishedAt: new Date(),
  } satisfies Prisma.QuizSessionUpdateInput;
}

export async function GET(
  request: NextRequest,
  context: QuizRouteContext,
) {
  const user = await getAuthenticatedUser(request);

  if (!user) {
    return jsonError(401, "Authentication required.");
  }

  const { id } = await context.params;
  const quiz = await prisma.quiz.findFirst({
    where: {
      id,
      ownerId: user.id,
    },
    include: organizerQuizInclude,
  });

  if (!quiz) {
    return jsonError(404, "Quiz not found.");
  }

  return NextResponse.json({
    quiz: serializeOrganizerQuiz(quiz),
  });
}

export async function PATCH(
  request: NextRequest,
  context: QuizRouteContext,
) {
  const user = await getAuthenticatedUser(request);

  if (!user) {
    return jsonError(401, "Authentication required.");
  }

  const payload = await parseJsonRequest(request);

  if (!payload) {
    return jsonError(400, "Request body must be valid JSON.");
  }

  const parsedPayload = validateQuizInput(payload, "update");

  if ("error" in parsedPayload) {
    return jsonError(400, parsedPayload.error);
  }

  const { id } = await context.params;
  const existingQuiz = await prisma.quiz.findFirst({
    where: {
      id,
      ownerId: user.id,
    },
    include: {
      sessions: {
        orderBy: {
          createdAt: "desc",
        },
        take: 1,
      },
    },
  });

  if (!existingQuiz) {
    return jsonError(404, "Quiz not found.");
  }

  const latestSession = existingQuiz.sessions[0] ?? null;

  if (
    parsedPayload.data.roomCode &&
    !(await isRoomCodeAvailable(
      parsedPayload.data.roomCode,
      latestSession?.id,
    ))
  ) {
    return jsonError(409, "That room code is already in use.");
  }

  const updatedQuiz = await prisma.$transaction(async (tx) => {
    if (parsedPayload.data.questions) {
      await tx.question.deleteMany({
        where: {
          quizId: existingQuiz.id,
        },
      });
    }

    const quizData: Prisma.QuizUpdateInput = {};

    if (parsedPayload.data.title !== undefined) {
      quizData.title = parsedPayload.data.title;
    }

    if (parsedPayload.data.category !== undefined) {
      quizData.category = parsedPayload.data.category;
    }

    if (parsedPayload.data.description !== undefined) {
      quizData.description = parsedPayload.data.description;
    }

    if (parsedPayload.data.timePerQuestion !== undefined) {
      quizData.timePerQuestion = parsedPayload.data.timePerQuestion;
    }

    if (parsedPayload.data.status !== undefined) {
      quizData.status = parsedPayload.data.status;
    }

    if (parsedPayload.data.questions) {
      quizData.questions = {
        create: buildQuestionCreateInput(
          parsedPayload.data.questions,
        ),
      };
    }

    await tx.quiz.update({
      where: {
        id: existingQuiz.id,
      },
      data: quizData,
    });

    const nextStatus =
      parsedPayload.data.status ?? existingQuiz.status;
    const shouldMutateSession =
      !latestSession ||
      parsedPayload.data.roomCode !== undefined ||
      parsedPayload.data.currentQuestionIndex !== undefined ||
      parsedPayload.data.status !== undefined;

    if (shouldMutateSession) {
      const roomCode =
        parsedPayload.data.roomCode ??
        latestSession?.roomCode ??
        (await generateUniqueRoomCode());

      const sessionData = getSessionMutation(
        nextStatus,
        parsedPayload.data.currentQuestionIndex ??
          latestSession?.currentQuestionIndex,
        latestSession?.startedAt,
      );

      if (latestSession) {
        await tx.quizSession.update({
          where: {
            id: latestSession.id,
          },
          data: {
            ...sessionData,
            roomCode,
          },
        });
      } else {
        await tx.quizSession.create({
          data: {
            quizId: existingQuiz.id,
            roomCode,
            status: toSessionStatus(nextStatus),
            currentQuestionIndex:
              parsedPayload.data.currentQuestionIndex ?? 0,
            startedAt:
              nextStatus === QuizStatus.ACTIVE ||
              nextStatus === QuizStatus.FINISHED
                ? new Date()
                : null,
            finishedAt:
              nextStatus === QuizStatus.FINISHED
                ? new Date()
                : null,
          },
        });
      }
    }

    return tx.quiz.findUniqueOrThrow({
      where: {
        id: existingQuiz.id,
      },
      include: organizerQuizInclude,
    });
  });

  return NextResponse.json({
    quiz: serializeOrganizerQuiz(updatedQuiz),
  });
}

export async function DELETE(
  request: NextRequest,
  context: QuizRouteContext,
) {
  const user = await getAuthenticatedUser(request);

  if (!user) {
    return jsonError(401, "Authentication required.");
  }

  const { id } = await context.params;
  const existingQuiz = await prisma.quiz.findFirst({
    where: {
      id,
      ownerId: user.id,
    },
    select: {
      id: true,
    },
  });

  if (!existingQuiz) {
    return jsonError(404, "Quiz not found.");
  }

  await prisma.quiz.delete({
    where: {
      id,
    },
  });

  return new NextResponse(null, {
    status: 204,
  });
}
