import {
  Prisma,
  QuestionType,
  QuizSessionStatus,
  QuizStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { publicUserSelect } from "@/lib/user";

type UnknownRecord = Record<string, unknown>;

type NormalizedQuestion = {
  text: string;
  imageUrl: string | null;
  type: QuestionType;
  options: {
    text: string;
    isCorrect: boolean;
    position: number;
  }[];
};

export type NormalizedQuizInput = {
  title?: string;
  category?: string;
  description?: string | null;
  timePerQuestion?: number;
  status?: QuizStatus;
  roomCode?: string;
  currentQuestionIndex?: number;
  questions?: NormalizedQuestion[];
};

export const organizerQuizInclude = {
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
  sessions: {
    orderBy: {
      createdAt: "desc",
    },
    take: 1,
    include: {
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
  },
} satisfies Prisma.QuizInclude;

export const publicRoomSessionInclude = {
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
      owner: {
        select: publicUserSelect,
      },
    },
  },
} satisfies Prisma.QuizSessionInclude;

export type OrganizerQuizRecord = Prisma.QuizGetPayload<{
  include: typeof organizerQuizInclude;
}>;

export type PublicRoomSessionRecord = Prisma.QuizSessionGetPayload<{
  include: typeof publicRoomSessionInclude;
}>;

type QuizValidationResult =
  | {
      data: NormalizedQuizInput;
    }
  | {
      error: string;
    };

type NormalizedQuestionResult =
  | {
      question: NormalizedQuestion;
    }
  | {
      error: string;
    };

const ROOM_CODE_PATTERN = /^\d{6}$/;

export async function isRoomCodeAvailable(
  roomCode: string,
  currentSessionId?: string,
) {
  const existingSession = await prisma.quizSession.findUnique({
    where: {
      roomCode,
    },
    select: {
      id: true,
    },
  });

  return !existingSession || existingSession.id === currentSessionId;
}

export async function generateUniqueRoomCode() {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const roomCode = Math.floor(
      100000 + Math.random() * 900000,
    ).toString();

    if (await isRoomCodeAvailable(roomCode)) {
      return roomCode;
    }
  }

  throw new Error("Unable to generate a unique room code.");
}

function asObject(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as UnknownRecord;
}

function normalizeQuestionType(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "single") {
    return QuestionType.SINGLE;
  }

  if (normalized === "multiple") {
    return QuestionType.MULTIPLE;
  }

  return null;
}

export function normalizeQuizStatus(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "draft") {
    return QuizStatus.DRAFT;
  }

  if (normalized === "active") {
    return QuizStatus.ACTIVE;
  }

  if (normalized === "finished") {
    return QuizStatus.FINISHED;
  }

  return null;
}

export function toSessionStatus(status: QuizStatus) {
  if (status === QuizStatus.ACTIVE) {
    return QuizSessionStatus.ACTIVE;
  }

  if (status === QuizStatus.FINISHED) {
    return QuizSessionStatus.FINISHED;
  }

  return QuizSessionStatus.WAITING;
}

function normalizeRoomCode(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return ROOM_CODE_PATTERN.test(trimmed) ? trimmed : null;
}

function normalizeQuestion(
  value: unknown,
  index: number,
): NormalizedQuestionResult {
  const question = asObject(value);

  if (!question) {
    return {
      error: `Question ${index + 1} must be an object.`,
    };
  }

  const text = typeof question.text === "string" ? question.text.trim() : "";

  if (!text) {
    return {
      error: `Question ${index + 1} must include text.`,
    };
  }

  const type = normalizeQuestionType(question.type);

  if (!type) {
    return {
      error: `Question ${index + 1} must use "single" or "multiple" as its type.`,
    };
  }

  if (!Array.isArray(question.options) || question.options.length < 2) {
    return {
      error: `Question ${index + 1} must include at least two options.`,
    };
  }

  if (
    !Array.isArray(question.correctAnswers) ||
    question.correctAnswers.length === 0
  ) {
    return {
      error: `Question ${index + 1} must include at least one correct answer index.`,
    };
  }

  const optionValues = question.options as unknown[];
  const rawCorrectAnswers = question.correctAnswers as unknown[];
  const integerCorrectAnswers = rawCorrectAnswers.filter(
    (value): value is number => Number.isInteger(value),
  );

  if (integerCorrectAnswers.length !== rawCorrectAnswers.length) {
    return {
      error: `Question ${index + 1} contains a non-integer correct answer index.`,
    };
  }

  const correctAnswerIndexes = [...new Set(integerCorrectAnswers)].sort(
    (first, second) => first - second,
  );

  if (
    !correctAnswerIndexes.every(
      (value) =>
        Number.isInteger(value) &&
        value >= 0 &&
        value < optionValues.length,
    )
  ) {
    return {
      error: `Question ${index + 1} contains an invalid correct answer index.`,
    };
  }

  if (
    type === QuestionType.SINGLE &&
    correctAnswerIndexes.length !== 1
  ) {
    return {
      error: `Question ${index + 1} must have exactly one correct answer when type is "single".`,
    };
  }

  const options = optionValues.map((option, optionIndex) => {
    if (typeof option !== "string" || !option.trim()) {
      return null;
    }

    return {
      text: option.trim(),
      isCorrect: correctAnswerIndexes.includes(optionIndex),
      position: optionIndex,
    };
  });

  if (options.includes(null)) {
    return {
      error: `Question ${index + 1} contains an empty option.`,
    };
  }

  const normalizedOptions = options.filter(
    (
      option,
    ): option is NonNullable<(typeof options)[number]> =>
      option !== null,
  );

  const imageUrl =
    typeof question.imageUrl === "string" && question.imageUrl.trim()
      ? question.imageUrl.trim()
      : null;

  return {
    question: {
      text,
      imageUrl,
      type,
      options: normalizedOptions,
    } satisfies NormalizedQuestion,
  };
}

export function validateQuizInput(
  payload: unknown,
  mode: "create" | "update",
): QuizValidationResult {
  const body = asObject(payload);

  if (!body) {
    return {
      error: "Request body must be a JSON object.",
    };
  }

  const normalized: NormalizedQuizInput = {};

  if ("title" in body) {
    if (typeof body.title !== "string" || !body.title.trim()) {
      return {
        error: "Quiz title is required.",
      };
    }

    normalized.title = body.title.trim();
  } else if (mode === "create") {
    return {
      error: "Quiz title is required.",
    };
  }

  if ("category" in body) {
    if (typeof body.category !== "string" || !body.category.trim()) {
      return {
        error: "Quiz category must be a non-empty string.",
      };
    }

    normalized.category = body.category.trim();
  }

  if ("description" in body) {
    if (body.description === null) {
      normalized.description = null;
    } else if (typeof body.description === "string") {
      normalized.description = body.description.trim() || null;
    } else {
      return {
        error: "Quiz description must be a string or null.",
      };
    }
  }

  if ("timePerQuestion" in body) {
    const timePerQuestion = body.timePerQuestion;

    if (
      typeof timePerQuestion !== "number" ||
      !Number.isInteger(timePerQuestion) ||
      timePerQuestion < 5 ||
      timePerQuestion > 600
    ) {
      return {
        error: "timePerQuestion must be an integer between 5 and 600 seconds.",
      };
    }

    normalized.timePerQuestion = timePerQuestion;
  }

  if ("status" in body) {
    const status = normalizeQuizStatus(body.status);

    if (!status) {
      return {
        error: 'Quiz status must be "draft", "active", or "finished".',
      };
    }

    normalized.status = status;
  }

  if ("roomCode" in body) {
    const roomCode = normalizeRoomCode(body.roomCode);

    if (!roomCode) {
      return {
        error: "roomCode must be a 6-digit string.",
      };
    }

    normalized.roomCode = roomCode;
  }

  if ("currentQuestionIndex" in body) {
    const currentQuestionIndex = body.currentQuestionIndex;

    if (
      typeof currentQuestionIndex !== "number" ||
      !Number.isInteger(currentQuestionIndex) ||
      currentQuestionIndex < 0
    ) {
      return {
        error: "currentQuestionIndex must be a non-negative integer.",
      };
    }

    normalized.currentQuestionIndex = currentQuestionIndex;
  }

  if ("questions" in body) {
    if (!Array.isArray(body.questions) || body.questions.length === 0) {
      return {
        error: "Quiz questions must be a non-empty array.",
      };
    }

    const normalizedQuestions: NormalizedQuestion[] = [];

    for (const [index, question] of body.questions.entries()) {
      const result = normalizeQuestion(question, index);

      if ("error" in result) {
        return result;
      }

      normalizedQuestions.push(result.question);
    }

    normalized.questions = normalizedQuestions;
  } else if (mode === "create") {
    return {
      error: "Quiz questions are required.",
    };
  }

  if (mode === "update" && Object.keys(normalized).length === 0) {
    return {
      error: "Provide at least one quiz field to update.",
    };
  }

  return {
    data: normalized,
  };
}

export function buildQuestionCreateInput(
  questions: NonNullable<NormalizedQuizInput["questions"]>,
) {
  return questions.map((question, questionIndex) => ({
    text: question.text,
    imageUrl: question.imageUrl,
    type: question.type,
    position: questionIndex,
    options: {
      create: question.options.map((option, optionIndex) => ({
        text: option.text,
        isCorrect: option.isCorrect,
        position: optionIndex,
      })),
    },
  }));
}

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

export function serializeOrganizerQuiz(quiz: OrganizerQuizRecord) {
  const session = quiz.sessions[0] ?? null;

  return {
    id: quiz.id,
    title: quiz.title,
    category: quiz.category,
    description: quiz.description,
    timePerQuestion: quiz.timePerQuestion,
    status: quiz.status.toLowerCase(),
    roomCode: session?.roomCode ?? null,
    currentQuestionIndex: session?.currentQuestionIndex ?? 0,
    createdAt: quiz.createdAt,
    updatedAt: quiz.updatedAt,
    owner: quiz.owner,
    participantCount: session?.participants.length ?? 0,
    questions: quiz.questions.map((question) => ({
      id: question.id,
      text: question.text,
      imageUrl: question.imageUrl,
      type: question.type.toLowerCase(),
      options: question.options.map((option) => ({
        id: option.id,
        text: option.text,
        position: option.position,
        isCorrect: option.isCorrect,
      })),
      correctAnswers: question.options
        .filter((option) => option.isCorrect)
        .map((option) => option.position),
    })),
    session: session
      ? {
          id: session.id,
          roomCode: session.roomCode,
          status: session.status.toLowerCase(),
          currentQuestionIndex: session.currentQuestionIndex,
          startedAt: session.startedAt,
          finishedAt: session.finishedAt,
          participants: session.participants.map((participant) => ({
            id: participant.id,
            name: participant.name,
            score: participant.score,
            joinedAt: participant.joinedAt,
            answers: participant.answers.map((answer) => ({
              id: answer.id,
              questionId: answer.questionId,
              selectedOptionIds: parseSelectedOptionIds(
                answer.selectedOptionIds,
              ),
              isCorrect: answer.isCorrect,
              scoreAwarded: answer.scoreAwarded,
              answeredAt: answer.answeredAt,
            })),
          })),
        }
      : null,
  };
}

export function serializePublicRoomSession(
  session: PublicRoomSessionRecord,
) {
  return {
    id: session.id,
    roomCode: session.roomCode,
    status: session.status.toLowerCase(),
    currentQuestionIndex: session.currentQuestionIndex,
    startedAt: session.startedAt,
    finishedAt: session.finishedAt,
    participantCount: session.participants.length,
    participants: session.participants.map((participant) => ({
      id: participant.id,
      name: participant.name,
      score: participant.score,
      joinedAt: participant.joinedAt,
      correctAnswers: participant.answers.filter(
        (answer) => answer.isCorrect,
      ).length,
    })),
    quiz: {
      id: session.quiz.id,
      title: session.quiz.title,
      category: session.quiz.category,
      description: session.quiz.description,
      timePerQuestion: session.quiz.timePerQuestion,
      status: session.quiz.status.toLowerCase(),
      createdAt: session.quiz.createdAt,
      updatedAt: session.quiz.updatedAt,
      owner: session.quiz.owner,
      questions: session.quiz.questions.map((question) => ({
        id: question.id,
        text: question.text,
        imageUrl: question.imageUrl,
        type: question.type.toLowerCase(),
        options: question.options.map((option) => ({
          id: option.id,
          text: option.text,
          position: option.position,
        })),
      })),
    },
  };
}
