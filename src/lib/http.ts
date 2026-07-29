import { NextResponse } from "next/server";

export function jsonError(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

export async function parseJsonRequest(request: Request) {
  try {
    return (await request.json()) as unknown;
  } catch {
    return null;
  }
}
