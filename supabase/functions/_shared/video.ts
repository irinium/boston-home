// Use cases behind the video Edge Functions. They depend only on the small ports below,
// so the Deno entry points stay thin and this logic is covered by Jest.
import { joinErrorCode, joinUrl, roomRequest, tokenRequest } from './daily.ts';

/** Calls the Daily REST API: a path such as `/rooms/x`, with optional method and JSON body. */
export type DailyApi = (path: string, init?: { method?: string; body?: unknown }) => Promise<{
  status: number;
  ok: boolean;
  json(): Promise<any>;
}>;

export type JoinRow = { room_name: string; starts_at: string; display_name: string };

export type JoinPorts = {
  /** `meeting_for_join` with the service role: checks participant, window, blocks and suspensions. */
  meetingForJoin(meetingId: string, userId: string): Promise<{ data: JoinRow | null; error: { message: string } | null }>;
  daily: DailyApi;
  now(): Date;
  log(message: string, detail?: unknown): void;
};

export type Reply = { status: number; body: Record<string, unknown> };

const fail = (status: number, error: string): Reply => ({ status, body: { error } });

/** Returns the room, creating it on first join. A lost creation race is resolved by reading it again. */
async function ensureRoom(daily: DailyApi, row: JoinRow): Promise<string | null> {
  const path = `/rooms/${encodeURIComponent(row.room_name)}`;
  const existing = await daily(path);
  if (existing.ok) return (await existing.json()).url;
  if (existing.status !== 404) return null;

  const created = await daily('/rooms', { method: 'POST', body: roomRequest(row.room_name, new Date(row.starts_at)) });
  if (created.ok) return (await created.json()).url;
  // The other participant may have created it at the same moment.
  const again = await daily(path);
  return again.ok ? (await again.json()).url : null;
}

/** A private join link for one participant of a meeting. */
export async function joinMeeting(ports: JoinPorts, userId: string, meetingId: unknown): Promise<Reply> {
  if (typeof meetingId !== 'string' || meetingId.length === 0) return fail(400, 'bad_request');

  const { data, error } = await ports.meetingForJoin(meetingId, userId);
  if (error) {
    const code = joinErrorCode(error.message);
    if (code) return fail(code === 'meeting_not_found' ? 404 : 403, code);
    ports.log('meeting_for_join failed', error.message);
    return fail(500, 'failed');
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return fail(404, 'meeting_not_found');

  const roomUrl = await ensureRoom(ports.daily, row).catch(() => null);
  if (!roomUrl) {
    ports.log('daily room unavailable', row.room_name);
    return fail(502, 'video_unavailable');
  }

  const token = await ports
    .daily('/meeting-tokens', { method: 'POST', body: tokenRequest(row.room_name, ports.now(), row.display_name) })
    .catch(() => null);
  if (!token?.ok) {
    ports.log('daily token failed', token?.status);
    return fail(502, 'video_unavailable');
  }
  return { status: 200, body: { url: joinUrl(roomUrl, (await token.json()).token) } };
}

export type CleanupPorts = {
  /** Up to `limit` queued rooms that are not closed yet, oldest first. */
  openClosures(limit: number): Promise<string[]>;
  markClosed(rooms: string[]): Promise<void>;
  daily: DailyApi;
  log(message: string, detail?: unknown): void;
};

/**
 * Deletes queued rooms at Daily, which ejects anyone still in the call. A room that is
 * already gone (404) counts as closed; other failures stay queued for the next run.
 */
export async function closeQueuedRooms(ports: CleanupPorts, limit = 50): Promise<{ closed: number; failed: number }> {
  const rooms = await ports.openClosures(limit);
  const closed: string[] = [];
  for (const room of rooms) {
    const res = await ports.daily(`/rooms/${encodeURIComponent(room)}`, { method: 'DELETE' }).catch(() => null);
    if (res && (res.ok || res.status === 404)) closed.push(room);
    else ports.log('daily room delete failed', { room, status: res?.status });
  }
  if (closed.length > 0) await ports.markClosed(closed);
  return { closed: closed.length, failed: rooms.length - closed.length };
}
