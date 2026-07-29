export type QuizStatus = "draft" | "active" | "finished";

export type SessionStatus = "waiting" | "active" | "finished";

export type SessionQuestionType = "single" | "multiple";

export type SessionParticipantSummary = {
  id: string;
  name: string;
  score: number;
  joinedAt: string;
  correctAnswers: number;
};

export type OrganizerSessionSummary = {
  id: string;
  roomCode: string;
  status: SessionStatus;
  currentQuestionIndex: number;
  startedAt: string | null;
  finishedAt: string | null;
  participantCount: number;
  quiz: {
    id: string;
    title: string;
    status: QuizStatus;
    timePerQuestion: number;
    totalQuestions: number;
  };
  participants: SessionParticipantSummary[];
};

export type RoomSessionQuestion = {
  id: string;
  text: string;
  imageUrl: string | null;
  type: SessionQuestionType;
  questionNumber: number;
  totalQuestions: number;
  options: {
    id: string;
    text: string;
    position: number;
  }[];
};

export type RoomSessionData = {
  id: string;
  roomCode: string;
  status: SessionStatus;
  currentQuestionIndex: number;
  startedAt: string | null;
  finishedAt: string | null;
  participantCount: number;
  quiz: {
    id: string;
    title: string;
    category: string;
    description: string | null;
    timePerQuestion: number;
    totalQuestions: number;
  };
  participant: {
    id: string;
    name: string;
    score: number;
    correctAnswers: number;
  } | null;
  currentQuestion: RoomSessionQuestion | null;
  currentAnswer: {
    questionId: string;
    selectedOptionIds: string[];
    isCorrect: boolean;
    scoreAwarded: number;
    correctOptionIds: string[];
  } | null;
};

export type SessionParticipantsData = {
  id: string;
  roomCode: string;
  status: SessionStatus;
  participantCount: number;
  participants: SessionParticipantSummary[];
};

export type SessionLeaderboardData = {
  sessionId: string;
  roomCode: string;
  status: SessionStatus;
  quizTitle: string;
  participants: SessionParticipantSummary[];
};

type CreateSessionResponse = {
  session: OrganizerSessionSummary;
};

type RoomSessionResponse = {
  session: RoomSessionData;
};

type UpdateSessionResponse = {
  session: OrganizerSessionSummary;
};

type SessionParticipantsResponse = {
  session: SessionParticipantsData;
};

type SessionLeaderboardResponse = {
  leaderboard: SessionLeaderboardData;
};

type JoinSessionResponse = {
  participantId: string;
  sessionId: string;
  quizTitle: string;
  roomCode: string;
};

type SubmitAnswerResponse = {
  answer: {
    questionId: string;
    selectedOptionIds: string[];
    correctOptionIds: string[];
    isCorrect: boolean;
    scoreAwarded: number;
    score: number;
  };
};

type ApiErrorPayload = {
  error?: string;
};

export class SessionApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "SessionApiError";
    this.status = status;
  }
}

export function isSessionUnauthorizedError(error: unknown) {
  return (
    error instanceof SessionApiError &&
    error.status === 401
  );
}

function getPayloadErrorMessage(payload: unknown) {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof (payload as ApiErrorPayload).error === "string"
  ) {
    return (payload as ApiErrorPayload).error;
  }

  return null;
}

async function request<T>(
  input: string,
  init?: RequestInit,
) {
  const headers = new Headers(init?.headers);

  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(input, {
    ...init,
    headers,
    cache: "no-store",
    credentials: "same-origin",
  });

  let payload: unknown = null;

  if (response.status !== 204) {
    const contentType = response.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      payload = await response.json();
    } else {
      payload = await response.text();
    }
  }

  if (!response.ok) {
    throw new SessionApiError(
      response.status,
      getPayloadErrorMessage(payload) ??
        "Не удалось выполнить запрос к API сессии.",
    );
  }

  return payload as T;
}

export function getSessionApiErrorMessage(
  error: unknown,
  fallback = "Произошла ошибка. Попробуйте ещё раз.",
) {
  if (error instanceof SessionApiError) {
    return error.message;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

export function createQuizSession(payload: {
  quizId: string;
  roomCode?: string;
}) {
  return request<CreateSessionResponse>("/api/sessions", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getRoomSession(
  roomCode: string,
  participantId?: string,
) {
  const searchParams = new URLSearchParams();

  if (participantId) {
    searchParams.set("participantId", participantId);
  }

  const suffix = searchParams.size
    ? `?${searchParams.toString()}`
    : "";

  return request<RoomSessionResponse>(
    `/api/sessions/room/${roomCode}${suffix}`,
  );
}

export function updateQuizSession(
  id: string,
  payload: {
    status?: SessionStatus;
    currentQuestionIndex?: number;
  },
) {
  return request<UpdateSessionResponse>(`/api/sessions/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function joinQuizSession(id: string, payload: { name: string }) {
  return request<JoinSessionResponse>(
    `/api/sessions/${id}/join`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export function getQuizSessionParticipants(id: string) {
  return request<SessionParticipantsResponse>(
    `/api/sessions/${id}/participants`,
  );
}

export function submitSessionAnswer(
  id: string,
  payload: {
    participantId: string;
    questionId: string;
    selectedOptionIds: string[];
  },
) {
  return request<SubmitAnswerResponse>(
    `/api/sessions/${id}/answers`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export function getQuizSessionLeaderboard(id: string) {
  return request<SessionLeaderboardResponse>(
    `/api/sessions/${id}/leaderboard`,
  );
}
