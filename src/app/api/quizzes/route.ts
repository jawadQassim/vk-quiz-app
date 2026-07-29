import {
  QuizSessionStatus,
  QuizStatus,
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

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);

  if (!user) {
    return jsonError(401, "Authentication required.");
  }

  const quizzes = await prisma.quiz.findMany({
    where: {
      ownerId: user.id,
    },
    orderBy: {
      createdAt: "desc",
    },
    include: organizerQuizInclude,
  });

  return NextResponse.json({
    quizzes: quizzes.map(serializeOrganizerQuiz),
  });
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

  const parsedPayload = validateQuizInput(payload, "create");

  if ("error" in parsedPayload) {
    return jsonError(400, parsedPayload.error);
  }

  const roomCode =
    parsedPayload.data.roomCode ?? (await generateUniqueRoomCode());

  if (!(await isRoomCodeAvailable(roomCode))) {
    return jsonError(409, "That room code is already in use.");
  }

  const quizStatus =
    parsedPayload.data.status ?? QuizStatus.DRAFT;
  const sessionStatus = toSessionStatus(quizStatus);

  const quiz = await prisma.quiz.create({
    data: {
      ownerId: user.id,
      title: parsedPayload.data.title!,
      category:
        parsedPayload.data.category ?? "General Knowledge",
      description: parsedPayload.data.description ?? null,
      timePerQuestion: parsedPayload.data.timePerQuestion ?? 30,
      status: quizStatus,
      questions: {
        create: buildQuestionCreateInput(
          parsedPayload.data.questions!,
        ),
      },
      sessions: {
        create: {
          roomCode,
          status: sessionStatus,
          currentQuestionIndex:
            parsedPayload.data.currentQuestionIndex ?? 0,
          startedAt:
            sessionStatus === QuizSessionStatus.ACTIVE ||
            sessionStatus === QuizSessionStatus.FINISHED
              ? new Date()
              : null,
          finishedAt:
            sessionStatus === QuizSessionStatus.FINISHED
              ? new Date()
              : null,
        },
      },
    },
    include: organizerQuizInclude,
  });

  return NextResponse.json(
    {
      quiz: serializeOrganizerQuiz(quiz),
    },
    {
      status: 201,
    },
  );
}
