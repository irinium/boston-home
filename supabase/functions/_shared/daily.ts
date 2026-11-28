// Pure helpers for the Daily.co REST API, shared by Edge Functions and covered by Jest.

const HOUR = 3_600_000;
/** A join token is only for entering the room; it is not needed once inside. */
export const TOKEN_TTL_MS = 15 * 60_000;

/** Seconds since the epoch, as Daily expects. */
const epoch = (ms: number) => Math.floor(ms / 1000);

/**
 * A private room that only token holders can enter. It expires 24 hours after the start
 * for cleanup, but nobody is ejected at expiry: the call itself has no time limit.
 */
export function roomRequest(name: string, startsAt: Date) {
  return {
    name,
    privacy: 'private',
    properties: {
      exp: epoch(startsAt.getTime() + 24 * HOUR),
      eject_at_room_exp: false,
      max_participants: 2,
      enable_chat: true,
      enable_prejoin_ui: true,
      enable_knocking: false,
      enable_screenshare: false,
      enable_recording: false,
      start_video_off: false,
      start_audio_off: false,
    },
  };
}

/**
 * A personal token that must be used within 15 minutes of issue. It never ejects from a
 * running call; ending access is done by deleting the room (see video.ts closeQueuedRooms).
 */
export function tokenRequest(roomName: string, issuedAt: Date, userName: string) {
  return {
    properties: {
      room_name: roomName,
      exp: epoch(issuedAt.getTime() + TOKEN_TTL_MS),
      eject_at_token_exp: false,
      is_owner: false,
      user_name: userName.trim().slice(0, 40) || 'Boston Home',
      enable_recording: false,
      enable_screenshare: false,
    },
  };
}

export function joinUrl(roomUrl: string, token: string): string {
  return `${roomUrl}?t=${encodeURIComponent(token)}`;
}

/** Database error codes that the app explains to the user. */
export const JOIN_ERRORS = ['meeting_not_found', 'meeting_not_active', 'too_early', 'meeting_over'] as const;

export function joinErrorCode(message: string): (typeof JOIN_ERRORS)[number] | null {
  return JOIN_ERRORS.find((code) => message.includes(code)) ?? null;
}
