import { NextResponse } from "next/server";

import { attachSessionCookie, verifyPassword } from "@/lib/auth";
import { jsonError, parseJsonRequest } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { publicUserSelect } from "@/lib/user";

export const runtime = "nodejs";

function getLoginPayload(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const body = payload as Record<string, unknown>;
  const email =
    typeof body.email === "string"
      ? body.email.trim().toLowerCase()
      : "";
  const password =
    typeof body.password === "string" ? body.password : "";

  if (!email || !email.includes("@")) {
    return {
      error: "A valid email is required.",
    };
  }

  if (!password) {
    return {
      error: "Password is required.",
    };
  }

  return {
    data: {
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

  const parsedPayload = getLoginPayload(payload);

  if (!parsedPayload || "error" in parsedPayload) {
    return jsonError(
      400,
      parsedPayload?.error ?? "Invalid login payload.",
    );
  }

  const user = await prisma.user.findUnique({
    where: {
      email: parsedPayload.data.email,
    },
    select: {
      ...publicUserSelect,
      passwordHash: true,
    },
  });

  if (
    !user ||
    !(await verifyPassword(
      parsedPayload.data.password,
      user.passwordHash,
    ))
  ) {
    return jsonError(401, "Invalid email or password.");
  }

  const safeUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
  const response = NextResponse.json({
    user: safeUser,
  });

  return attachSessionCookie(response, safeUser.id);
}
