export const PARTICIPANT_SESSION_STORAGE_KEY =
  "vkQuizParticipantSession";

export type ParticipantSessionRef = {
  participantId: string;
  sessionId: string;
  roomCode: string;
};

const ROOM_CODE_PATTERN = /^\d{6}$/;
const RECORD_ID_PATTERN = /^[a-z0-9]+$/i;

function isValidRecordId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 10 &&
    RECORD_ID_PATTERN.test(value.trim())
  );
}

function isParticipantSessionRef(
  value: unknown,
): value is ParticipantSessionRef {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const data = value as Record<string, unknown>;

  return (
    isValidRecordId(data.participantId) &&
    isValidRecordId(data.sessionId) &&
    typeof data.roomCode === "string" &&
    ROOM_CODE_PATTERN.test(data.roomCode.trim())
  );
}

export function readParticipantSessionRef() {
  if (typeof window === "undefined") {
    return null;
  }

  const storedValue = window.sessionStorage.getItem(
    PARTICIPANT_SESSION_STORAGE_KEY,
  );

  if (!storedValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(storedValue) as unknown;

    if (!isParticipantSessionRef(parsed)) {
      return null;
    }

    return {
      participantId: parsed.participantId.trim(),
      sessionId: parsed.sessionId.trim(),
      roomCode: parsed.roomCode.trim(),
    } satisfies ParticipantSessionRef;
  } catch {
    return null;
  }
}

export function writeParticipantSessionRef(
  value: ParticipantSessionRef,
) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(
    PARTICIPANT_SESSION_STORAGE_KEY,
    JSON.stringify(value),
  );
}

export function clearParticipantSessionRef() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(
    PARTICIPANT_SESSION_STORAGE_KEY,
  );
}
