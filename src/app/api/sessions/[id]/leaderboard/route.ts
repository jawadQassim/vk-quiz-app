import { NextResponse } from "next/server";

import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import {
  isValidRecordId,
  serializeSessionLeaderboard,
  sessionWithQuizInclude,
} from "@/lib/session";

export const runtime = "nodejs";

type SessionLeaderboardRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(
  _request: Request,
  context: SessionLeaderboardRouteContext,
) {
  const { id } = await context.params;

  if (!isValidRecordId(id)) {
    return jsonError(400, "Session id must be a valid identifier.");
  }

  const session = await prisma.quizSession.findUnique({
    where: {
      id,
    },
    include: sessionWithQuizInclude,
  });

  if (!session) {
    return jsonError(404, "Session not found.");
  }

  return NextResponse.json({
    leaderboard: serializeSessionLeaderboard(session),
  });
}
