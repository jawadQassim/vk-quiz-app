import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import {
  isValidRecordId,
  isValidRoomCode,
  serializeRoomSession,
  sessionWithQuizInclude,
} from "@/lib/session";

export const runtime = "nodejs";

type SessionRoomRouteContext = {
  params: Promise<{
    roomCode: string;
  }>;
};

export async function GET(
  request: NextRequest,
  context: SessionRoomRouteContext,
) {
  const { roomCode } = await context.params;

  if (!isValidRoomCode(roomCode)) {
    return jsonError(400, "roomCode must be a 6-digit string.");
  }

  const participantId =
    request.nextUrl.searchParams.get("participantId");

  if (participantId && !isValidRecordId(participantId)) {
    return jsonError(
      400,
      "participantId must be a valid identifier.",
    );
  }

  const session = await prisma.quizSession.findUnique({
    where: {
      roomCode,
    },
    include: sessionWithQuizInclude,
  });

  if (!session) {
    return jsonError(404, "Session not found.");
  }

  return NextResponse.json({
    session: serializeRoomSession(
      session,
      participantId ?? undefined,
    ),
  });
}
