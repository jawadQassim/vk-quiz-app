import { compare, hash } from "bcryptjs";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { publicUserSelect } from "@/lib/user";

export const SESSION_COOKIE_NAME = "vk_quiz_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const DEV_AUTH_SECRET = "vk-quiz-dev-secret";

type SessionPayload = {
  userId: string;
  exp: number;
};

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

function encodeBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(value: string) {
  return createHmac("sha256", getAuthSecret())
    .update(value)
    .digest("base64url");
}

function signaturesMatch(received: string, expected: string) {
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);

  if (receivedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(receivedBuffer, expectedBuffer);
}

export async function hashPassword(password: string) {
  return hash(password, 12);
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
) {
  return compare(password, passwordHash);
}

export function createSessionToken(userId: string) {
  const payload = encodeBase64Url(
    JSON.stringify({
      userId,
      exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
    } satisfies SessionPayload),
  );

  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token?: string | null) {
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
    const session = JSON.parse(
      decodeBase64Url(payload),
    ) as SessionPayload;

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

export function attachSessionCookie(
  response: NextResponse,
  userId: string,
) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: createSessionToken(userId),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  return response;
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return response;
}

export async function getAuthenticatedUserFromToken(
  token?: string | null,
) {
  const session = verifySessionToken(token);

  if (!session) {
    return null;
  }

  return prisma.user.findUnique({
    where: {
      id: session.userId,
    },
    select: publicUserSelect,
  });
}

export async function getAuthenticatedUser(
  request: NextRequest,
) {
  return getAuthenticatedUserFromToken(
    request.cookies.get(SESSION_COOKIE_NAME)?.value,
  );
}
