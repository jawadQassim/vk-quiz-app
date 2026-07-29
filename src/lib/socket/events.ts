import type {
  SessionLeaderboardData,
  SessionParticipantsData,
  SessionParticipantSummary,
  SessionStatus,
} from "@/lib/session-api";

export type SocketSubscriptionRole =
  | "organizer"
  | "participant"
  | "leaderboard";

export type SocketSubscribePayload =
  | {
      role: "organizer";
      sessionId: string;
    }
  | {
      role: "participant";
      sessionId: string;
      roomCode: string;
      participantId: string;
    }
  | {
      role: "leaderboard";
      sessionId: string;
      roomCode: string;
    };

export type SocketSubscribeAck =
  | {
      ok: true;
      role: SocketSubscriptionRole;
      sessionId: string;
      roomCode: string;
    }
  | {
      ok: false;
      error: string;
    };

export type SocketUnsubscribeAck =
  | {
      ok: true;
    }
  | {
      ok: false;
      error: string;
    };

export type ParticipantJoinEvent = {
  sessionId: string;
  roomCode: string;
  participant: SessionParticipantSummary;
  participantCount: number;
};

export type QuizStartedEvent = {
  sessionId: string;
  roomCode: string;
  status: "active";
  currentQuestionIndex: number;
  startedAt: string | null;
};

export type QuizQuestionChangedEvent = {
  sessionId: string;
  roomCode: string;
  status: SessionStatus;
  currentQuestionIndex: number;
};

export type QuizFinishedEvent = {
  sessionId: string;
  roomCode: string;
  status: "finished";
  currentQuestionIndex: number;
  finishedAt: string | null;
};

export type AnswerSubmittedEvent = {
  sessionId: string;
  roomCode: string;
  participantId: string;
  questionId: string;
};

export type SocketErrorEvent = {
  message: string;
};

export type ServerToClientEvents = {
  "participant:join": (payload: ParticipantJoinEvent) => void;
  "participant:list-updated": (
    payload: SessionParticipantsData,
  ) => void;
  "quiz:started": (payload: QuizStartedEvent) => void;
  "quiz:question-changed": (
    payload: QuizQuestionChangedEvent,
  ) => void;
  "quiz:finished": (payload: QuizFinishedEvent) => void;
  "answer:submitted": (payload: AnswerSubmittedEvent) => void;
  "leaderboard:updated": (
    payload: SessionLeaderboardData,
  ) => void;
  "socket:error": (payload: SocketErrorEvent) => void;
};

export type ClientToServerEvents = {
  "session:subscribe": (
    payload: SocketSubscribePayload,
    acknowledge?: (payload: SocketSubscribeAck) => void,
  ) => void;
  "session:unsubscribe": (
    payload: {
      sessionId: string;
    },
    acknowledge?: (payload: SocketUnsubscribeAck) => void,
  ) => void;
};
