import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getAuthenticatedUser } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import {
  getOwnedSessionOrThrow,
  isValidRecordId,
  serializeSessionParticipants,
  SessionApiRouteError,
} from "@/lib/session";

export const runtime = "nodejs";

type SessionParticipantsRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(
  request: NextRequest,
  context: SessionParticipantsRouteContext,
) {
  const user = await getAuthenticatedUser(request);

  if (!user) {
    return jsonError(401, "Authentication required.");
  }

  const { id } = await context.params;

  if (!isValidRecordId(id)) {
    return jsonError(400, "Session id must be a valid identifier.");
  }

  try {
    const session = await getOwnedSessionOrThrow(user.id, id);

    return NextResponse.json({
      session: serializeSessionParticipants(session),
    });
  } catch (error) {
    if (error instanceof SessionApiRouteError) {
      return jsonError(error.status, error.message);
    }

    return jsonError(500, "Unable to load session participants.");
  }
}
