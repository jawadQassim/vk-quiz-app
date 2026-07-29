export type OrganizerUser = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  updatedAt: string;
};

export type OrganizerQuizStatus =
  | "draft"
  | "active"
  | "finished";

export type OrganizerQuestionType =
  | "single"
  | "multiple";

export type OrganizerQuizOption = {
  id: string;
  text: string;
  position: number;
  isCorrect?: boolean;
};

export type OrganizerQuizQuestion = {
  id: string;
  text: string;
  imageUrl: string | null;
  type: OrganizerQuestionType;
  options: OrganizerQuizOption[];
  correctAnswers: number[];
};

export type OrganizerQuizParticipant = {
  id: string;
  name: string;
  score: number;
  joinedAt: string;
};

export type OrganizerQuizSession = {
  id: string;
  roomCode: string;
  status: "waiting" | "active" | "finished";
  currentQuestionIndex: number;
  startedAt: string | null;
  finishedAt: string | null;
  participants: OrganizerQuizParticipant[];
};

export type OrganizerQuiz = {
  id: string;
  title: string;
  category: string;
  description: string | null;
  timePerQuestion: number;
  status: OrganizerQuizStatus;
  roomCode: string | null;
  currentQuestionIndex: number;
  createdAt: string;
  updatedAt: string;
  owner: OrganizerUser;
  participantCount: number;
  questions: OrganizerQuizQuestion[];
  session: OrganizerQuizSession | null;
};

type AuthResponse = {
  user: OrganizerUser;
};

type QuizzesResponse = {
  quizzes: OrganizerQuiz[];
};

type QuizResponse = {
  quiz: OrganizerQuiz;
};

type ApiErrorPayload = {
  error?: string;
};

export type CreateOrganizerQuizPayload = {
  title: string;
  category: string;
  description: string | null;
  timePerQuestion: number;
  questions: {
    text: string;
    imageUrl: string;
    type: OrganizerQuestionType;
    options: string[];
    correctAnswers: number[];
  }[];
};

export type UpdateOrganizerQuizPayload = Partial<{
  title: string;
  category: string;
  description: string | null;
  timePerQuestion: number;
  status: OrganizerQuizStatus;
  roomCode: string;
  currentQuestionIndex: number;
  questions: CreateOrganizerQuizPayload["questions"];
}>;

export class OrganizerApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "OrganizerApiError";
    this.status = status;
  }
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
    throw new OrganizerApiError(
      response.status,
      getPayloadErrorMessage(payload) ??
        "Не удалось выполнить запрос.",
    );
  }

  return payload as T;
}

export function isUnauthorizedError(error: unknown) {
  return (
    error instanceof OrganizerApiError &&
    error.status === 401
  );
}

export function getOrganizerApiErrorMessage(
  error: unknown,
  fallback = "Произошла ошибка. Попробуйте ещё раз.",
) {
  if (error instanceof OrganizerApiError) {
    return error.message;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

export function registerOrganizer(payload: {
  name: string;
  email: string;
  password: string;
}) {
  return request<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function loginOrganizer(payload: {
  email: string;
  password: string;
}) {
  return request<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getCurrentOrganizer() {
  return request<AuthResponse>("/api/auth/me");
}

export function logoutOrganizer() {
  return request<{ ok: true }>("/api/auth/logout", {
    method: "POST",
  });
}

export function getOrganizerQuizzes() {
  return request<QuizzesResponse>("/api/quizzes");
}

export function createOrganizerQuiz(
  payload: CreateOrganizerQuizPayload,
) {
  return request<QuizResponse>("/api/quizzes", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getOrganizerQuiz(id: string) {
  return request<QuizResponse>(`/api/quizzes/${id}`);
}

export function updateOrganizerQuiz(
  id: string,
  payload: UpdateOrganizerQuizPayload,
) {
  return request<QuizResponse>(`/api/quizzes/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteOrganizerQuiz(id: string) {
  return request<void>(`/api/quizzes/${id}`, {
    method: "DELETE",
  });
}
