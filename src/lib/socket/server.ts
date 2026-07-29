import type { Server as SocketServer } from "socket.io";

import type {
  AnswerSubmittedEvent,
  ClientToServerEvents,
  ParticipantJoinEvent,
  QuizFinishedEvent,
  QuizQuestionChangedEvent,
  QuizStartedEvent,
  ServerToClientEvents,
} from "@/lib/socket/events";
import type {
  SessionLeaderboardData,
  SessionParticipantsData,
} from "@/lib/session-api";

declare global {
  var __vkQuizSocketServer:
    | SocketServer<ClientToServerEvents, ServerToClientEvents>
    | undefined;
}

export function getSessionSocketRoom(sessionId: string) {
  return `session:${sessionId}`;
}

export function getOrganizerSocketRoom(sessionId: string) {
  return `organizer:session:${sessionId}`;
}

export function getSocketServer() {
  return globalThis.__vkQuizSocketServer;
}

export function emitParticipantJoined(
  payload: ParticipantJoinEvent,
) {
  const io = getSocketServer();

  if (!io) {
    return;
  }

  io.to(getSessionSocketRoom(payload.sessionId)).emit(
    "participant:join",
    payload,
  );
}

export function emitParticipantListUpdated(
  sessionId: string,
  payload: SessionParticipantsData,
) {
  const io = getSocketServer();

  if (!io) {
    return;
  }

  io.to(getSessionSocketRoom(sessionId)).emit(
    "participant:list-updated",
    payload,
  );
}

export function emitQuizStarted(payload: QuizStartedEvent) {
  const io = getSocketServer();

  if (!io) {
    return;
  }

  io.to(getSessionSocketRoom(payload.sessionId)).emit(
    "quiz:started",
    payload,
  );
}

export function emitQuizQuestionChanged(
  payload: QuizQuestionChangedEvent,
) {
  const io = getSocketServer();

  if (!io) {
    return;
  }

  io.to(getSessionSocketRoom(payload.sessionId)).emit(
    "quiz:question-changed",
    payload,
  );
}

export function emitQuizFinished(payload: QuizFinishedEvent) {
  const io = getSocketServer();

  if (!io) {
    return;
  }

  io.to(getSessionSocketRoom(payload.sessionId)).emit(
    "quiz:finished",
    payload,
  );
}

export function emitAnswerSubmitted(
  payload: AnswerSubmittedEvent,
) {
  const io = getSocketServer();

  if (!io) {
    return;
  }

  io.to(getOrganizerSocketRoom(payload.sessionId)).emit(
    "answer:submitted",
    payload,
  );
}

export function emitLeaderboardUpdated(
  sessionId: string,
  payload: SessionLeaderboardData,
) {
  const io = getSocketServer();

  if (!io) {
    return;
  }

  io.to(getSessionSocketRoom(sessionId)).emit(
    "leaderboard:updated",
    payload,
  );
}
