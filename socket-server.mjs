import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { Server } from "socket.io";

const SESSION_COOKIE_NAME = "vk_quiz_session";
const DEV_AUTH_SECRET = "vk-quiz-dev-secret";
const ROOM_CODE_PATTERN = /^\d{6}$/;
const RECORD_ID_PATTERN = /^[a-z0-9]+$/i;

function getPrismaClient() {
  if (!globalThis.__vkQuizSocketPrismaClient) {
    globalThis.__vkQuizSocketPrismaClient = new PrismaClient();
  }

  return globalThis.__vkQuizSocketPrismaClient;
}

function isValidRecordId(value) {
  return (
    typeof value === "string" &&
    value.trim().length > 10 &&
    RECORD_ID_PATTERN.test(value.trim())
  );
}

function isValidRoomCode(value) {
  return (
    typeof value === "string" &&
    ROOM_CODE_PATTERN.test(value.trim())
  );
}

function getSessionSocketRoom(sessionId) {
  return `session:${sessionId}`;
}

function getOrganizerSocketRoom(sessionId) {
  return `organizer:session:${sessionId}`;
}

function getAuthSecret() {
  const secret = process.env.AUTH_SECRET?.trim();

  if (secret) {
    return secret;
  }

  if (process.env.NODE_ENV !== "production") {
    return DEV_AUTH_SECRET;
  }

  throw new Error("AUTH_SECRET must be set in production.");
}

function parseCookies(cookieHeader) {
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separatorIndex = part.indexOf("=");

      if (separatorIndex === -1) {
        return cookies;
      }

      const key = part.slice(0, separatorIndex).trim();
      const value = part.slice(separatorIndex + 1).trim();

      if (!key) {
        return cookies;
      }

      cookies[key] = decodeURIComponent(value);
      return cookies;
    }, {});
}

function decodeBase64Url(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(value) {
  return createHmac("sha256", getAuthSecret())
    .update(value)
    .digest("base64url");
}

function signaturesMatch(received, expected) {
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);

  if (receivedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(receivedBuffer, expectedBuffer);
}

function verifySessionToken(token) {
  if (!token) {
    return null;
  }

  const [payload, signature] = token.split(".");

  if (!payload || !signature) {
    return null;
  }

  const expectedSignature = sign(payload);

  if (!signaturesMatch(signature, expectedSignature)) {
    return null;
  }

  try {
    const session = JSON.parse(decodeBase64Url(payload));

    if (
      typeof session.userId !== "string" ||
      typeof session.exp !== "number" ||
      session.exp <= Date.now()
    ) {
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

function getOrganizerUserIdFromSocket(socket) {
  const cookies = parseCookies(socket.handshake.headers.cookie);
  const session = verifySessionToken(
    cookies[SESSION_COOKIE_NAME] ?? null,
  );

  return session?.userId ?? null;
}

async function validateOrganizerSubscription(
  socket,
  payload,
) {
  if (!isValidRecordId(payload.sessionId)) {
    throw new Error("Некорректный идентификатор сессии.");
  }

  const userId = getOrganizerUserIdFromSocket(socket);

  if (!userId) {
    throw new Error("Требуется авторизация организатора.");
  }

  const session = await getPrismaClient().quizSession.findFirst({
    where: {
      id: payload.sessionId,
      quiz: {
        ownerId: userId,
      },
    },
    select: {
      id: true,
      roomCode: true,
    },
  });

  if (!session) {
    throw new Error("Сессия организатора не найдена.");
  }

  return {
    role: "organizer",
    sessionId: session.id,
    roomCode: session.roomCode,
  };
}

async function validateParticipantSubscription(payload) {
  if (!isValidRecordId(payload.sessionId)) {
    throw new Error("Некорректный идентификатор сессии.");
  }

  if (!isValidRecordId(payload.participantId)) {
    throw new Error("Некорректный идентификатор участника.");
  }

  if (!isValidRoomCode(payload.roomCode)) {
    throw new Error("Некорректный код комнаты.");
  }

  const participant = await getPrismaClient().participant.findFirst({
    where: {
      id: payload.participantId,
      quizSessionId: payload.sessionId,
      quizSession: {
        roomCode: payload.roomCode,
      },
    },
    select: {
      id: true,
      quizSession: {
        select: {
          id: true,
          roomCode: true,
        },
      },
    },
  });

  if (!participant) {
    throw new Error("Участник не найден для этой сессии.");
  }

  return {
    role: "participant",
    sessionId: participant.quizSession.id,
    roomCode: participant.quizSession.roomCode,
  };
}

async function validateLeaderboardSubscription(payload) {
  if (!isValidRecordId(payload.sessionId)) {
    throw new Error("Некорректный идентификатор сессии.");
  }

  if (!isValidRoomCode(payload.roomCode)) {
    throw new Error("Некорректный код комнаты.");
  }

  const session = await getPrismaClient().quizSession.findUnique({
    where: {
      id: payload.sessionId,
    },
    select: {
      id: true,
      roomCode: true,
    },
  });

  if (!session || session.roomCode !== payload.roomCode) {
    throw new Error("Сессия лидерборда не найдена.");
  }

  return {
    role: "leaderboard",
    sessionId: session.id,
    roomCode: session.roomCode,
  };
}

async function validateSubscription(socket, payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Некорректный запрос на подписку.");
  }

  if (payload.role === "organizer") {
    return validateOrganizerSubscription(socket, payload);
  }

  if (payload.role === "participant") {
    return validateParticipantSubscription(payload);
  }

  if (payload.role === "leaderboard") {
    return validateLeaderboardSubscription(payload);
  }

  throw new Error("Неизвестная роль подписки.");
}

export function attachSocketServer(httpServer) {
  if (globalThis.__vkQuizSocketServer) {
    return globalThis.__vkQuizSocketServer;
  }

  const io = new Server(httpServer, {
    path: "/socket.io",
    cors: {
      origin: true,
      credentials: true,
    },
  });

  globalThis.__vkQuizSocketServer = io;

  io.on("connection", (socket) => {
    socket.on("session:subscribe", async (payload, acknowledge) => {
      const respond =
        typeof acknowledge === "function"
          ? acknowledge
          : () => undefined;

      try {
        const subscription = await validateSubscription(
          socket,
          payload,
        );
        const sessionRoom = getSessionSocketRoom(
          subscription.sessionId,
        );
        const organizerRoom = getOrganizerSocketRoom(
          subscription.sessionId,
        );

        if (
          socket.data.sessionRoom &&
          socket.data.sessionRoom !== sessionRoom
        ) {
          socket.leave(socket.data.sessionRoom);
        }

        if (
          socket.data.organizerRoom &&
          socket.data.organizerRoom !== organizerRoom
        ) {
          socket.leave(socket.data.organizerRoom);
        }

        await socket.join(sessionRoom);

        if (subscription.role === "organizer") {
          await socket.join(organizerRoom);
          socket.data.organizerRoom = organizerRoom;
        } else {
          delete socket.data.organizerRoom;
        }

        socket.data.sessionRoom = sessionRoom;
        socket.data.sessionId = subscription.sessionId;
        socket.data.roomCode = subscription.roomCode;
        socket.data.subscriptionRole = subscription.role;

        respond({
          ok: true,
          role: subscription.role,
          sessionId: subscription.sessionId,
          roomCode: subscription.roomCode,
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Не удалось подключиться к комнате.";

        socket.emit("socket:error", {
          message,
        });
        respond({
          ok: false,
          error: message,
        });
      }
    });

    socket.on(
      "session:unsubscribe",
      async (payload, acknowledge) => {
        const respond =
          typeof acknowledge === "function"
            ? acknowledge
            : () => undefined;

        if (
          !payload ||
          typeof payload !== "object" ||
          Array.isArray(payload) ||
          !isValidRecordId(payload.sessionId)
        ) {
          respond({
            ok: false,
            error: "Некорректный запрос на отписку.",
          });
          return;
        }

        const sessionRoom = getSessionSocketRoom(payload.sessionId);
        const organizerRoom = getOrganizerSocketRoom(
          payload.sessionId,
        );

        await socket.leave(sessionRoom);
        await socket.leave(organizerRoom);

        delete socket.data.sessionRoom;
        delete socket.data.organizerRoom;
        delete socket.data.sessionId;
        delete socket.data.roomCode;
        delete socket.data.subscriptionRole;

        respond({
          ok: true,
        });
      },
    );
  });

  return io;
}
