import { NextResponse } from "next/server";

import { attachSessionCookie, hashPassword } from "@/lib/auth";
import { jsonError, parseJsonRequest } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { publicUserSelect } from "@/lib/user";

export const runtime = "nodejs";

function getRegisterPayload(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const body = payload as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email =
    typeof body.email === "string"
      ? body.email.trim().toLowerCase()
      : "";
  const password =
    typeof body.password === "string" ? body.password : "";

  if (!name) {
    return {
      error: "Name is required.",
    };
  }

  if (!email || !email.includes("@")) {
    return {
      error: "A valid email is required.",
    };
  }

  if (password.length < 8) {
    return {
      error: "Password must be at least 8 characters long.",
    };
  }

  return {
    data: {
      name,
      email,
      password,
    },
  };
}

export async function POST(request: Request) {
  const payload = await parseJsonRequest(request);

  if (!payload) {
    return jsonError(400, "Request body must be valid JSON.");
  }

  const parsedPayload = getRegisterPayload(payload);

  if (!parsedPayload || "error" in parsedPayload) {
    return jsonError(
      400,
      parsedPayload?.error ?? "Invalid register payload.",
    );
  }

  const existingUser = await prisma.user.findUnique({
    where: {
      email: parsedPayload.data.email,
    },
    select: {
      id: true,
    },
  });

  if (existingUser) {
    return jsonError(409, "An account with that email already exists.");
  }

  const user = await prisma.user.create({
    data: {
      name: parsedPayload.data.name,
      email: parsedPayload.data.email,
      passwordHash: await hashPassword(parsedPayload.data.password),
    },
    select: publicUserSelect,
  });

  const response = NextResponse.json(
    {
      user,
    },
    {
      status: 201,
    },
  );

  return attachSessionCookie(response, user.id);
}
