import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import {
  publicRoomSessionInclude,
  serializePublicRoomSession,
} from "@/lib/quiz";

export const runtime = "nodejs";

type RoomRouteContext = {
  params: Promise<{
    roomCode: string;
  }>;
};

export async function GET(
  _request: NextRequest,
  context: RoomRouteContext,
) {
  const { roomCode } = await context.params;

  if (!/^\d{6}$/.test(roomCode)) {
    return jsonError(400, "roomCode must be a 6-digit string.");
  }

  const session = await prisma.quizSession.findUnique({
    where: {
      roomCode,
    },
    include: publicRoomSessionInclude,
  });

  if (!session) {
    return jsonError(404, "Quiz room not found.");
  }

  return NextResponse.json({
    room: serializePublicRoomSession(session),
  });
}
