// Use case behind the `notify` Edge Function: send due outbox rows as push messages.
// It depends only on the ports below, so the Deno entry point stays thin and this logic is
// covered by Jest.
//
// Privacy rule: a push message is visible on a lock screen, so it carries a generic text only.
// No names, cities, message texts, times or ids ever leave the database in a push.

export const NOTIFICATION_KINDS = [
  'request_received',
  'request_accepted',
  'request_declined',
  'meeting_booked',
  'meeting_cancelled',
  'meeting_starting',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export type Locale = 'uk' | 'en';

/** One line from `claim_push_batch`: an outbox row and one device of its recipient. */
export type ClaimedPush = { outbox_id: number; kind: NotificationKind; token: string; locale: string };

/** A message in the format of the Expo push service. */
export type PushMessage = {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  priority: 'high';
  channelId: string;
  /** Where the app opens when the message is tapped. Only fixed in-app paths, never ids. */
  data: { url: string };
};

/** The Expo push service's answer for one message, in the order the messages were sent. */
export type PushTicket =
  | { status: 'ok'; id: string }
  | { status: 'error'; message?: string; details?: { error?: string } };

/** Sends up to `PUSH_CHUNK` messages; rejects when the request itself fails. */
export type PushApi = (messages: PushMessage[]) => Promise<PushTicket[]>;

export type PushOutcome = { sent: number[]; retry: number[]; deadTokens: string[] };

export type NotifyPorts = {
  claim(limit: number): Promise<ClaimedPush[]>;
  finish(outcome: PushOutcome): Promise<void>;
  push: PushApi;
  log(message: string, detail?: unknown): void;
};

/** The Expo push service accepts at most 100 messages per request. */
export const PUSH_CHUNK = 100;
export const ANDROID_CHANNEL = 'default';
const APP_NAME = 'Boston Home';

const TEXTS: Record<Locale, Record<NotificationKind, string>> = {
  en: {
    request_received: 'You have a new request.',
    request_accepted: 'Your request was accepted.',
    request_declined: 'There is an answer to your request.',
    meeting_booked: 'A video meeting was booked.',
    meeting_cancelled: 'A video meeting was cancelled.',
    meeting_starting: 'Your video meeting room is open.',
  },
  uk: {
    request_received: 'У вас новий запит.',
    request_accepted: 'Ваш запит прийняли.',
    request_declined: 'На ваш запит є відповідь.',
    meeting_booked: 'Заброньовано відеозустріч.',
    meeting_cancelled: 'Відеозустріч скасовано.',
    meeting_starting: 'Кімната відеозустрічі відкрита.',
  },
};

export const toLocale = (value: string): Locale => (value === 'uk' ? 'uk' : 'en');

/** The generic, name-free message for one device. */
export function messageFor(row: ClaimedPush): PushMessage {
  return {
    to: row.token,
    title: APP_NAME,
    body: TEXTS[toLocale(row.locale)][row.kind],
    sound: 'default',
    priority: 'high',
    channelId: ANDROID_CHANNEL,
    data: { url: '/inbox' },
  };
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size < 1) throw new RangeError('size must be positive');
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** What happened to one message: delivered to the push service, failed, or a dead device. */
export type Delivery = 'ok' | 'failed' | 'dead';

export function deliveryOf(ticket: PushTicket | undefined): Delivery {
  if (!ticket) return 'failed';
  if (ticket.status === 'ok') return 'ok';
  return ticket.details?.error === 'DeviceNotRegistered' ? 'dead' : 'failed';
}

/**
 * Folds per-device deliveries into per-row outcomes. A row counts as sent when at least one
 * of her devices got it; it is retried when none did and at least one failed for a reason
 * that may pass; a row whose devices are all dead is finished (there is nobody to send to).
 */
export function settle(rows: readonly ClaimedPush[], deliveries: readonly Delivery[]): PushOutcome {
  const byRow = new Map<number, Set<Delivery>>();
  const deadTokens = new Set<string>();
  rows.forEach((row, i) => {
    const delivery = deliveries[i] ?? 'failed';
    if (delivery === 'dead') deadTokens.add(row.token);
    const seen = byRow.get(row.outbox_id) ?? new Set<Delivery>();
    seen.add(delivery);
    byRow.set(row.outbox_id, seen);
  });

  const sent: number[] = [];
  const retry: number[] = [];
  for (const [id, seen] of byRow) {
    if (seen.has('ok') || !seen.has('failed')) sent.push(id);
    else retry.push(id);
  }
  return { sent, retry, deadTokens: [...deadTokens] };
}

/** Sends one chunk; a failed request or a malformed answer marks every message in it as failed. */
async function sendChunk(ports: NotifyPorts, rows: ClaimedPush[]): Promise<Delivery[]> {
  try {
    const tickets = await ports.push(rows.map(messageFor));
    if (!Array.isArray(tickets) || tickets.length !== rows.length) {
      ports.log('push service answered with an unexpected shape', { expected: rows.length });
      return rows.map(() => 'failed');
    }
    return tickets.map(deliveryOf);
  } catch (error) {
    ports.log('push request failed', error instanceof Error ? error.message : error);
    return rows.map(() => 'failed');
  }
}

/** Claims due notifications, sends them and reports the outcome back to the database. */
export async function sendDuePushes(
  ports: NotifyPorts,
  limit = 100,
): Promise<{ sent: number; retry: number; deadTokens: number }> {
  const rows = await ports.claim(limit);
  if (rows.length === 0) return { sent: 0, retry: 0, deadTokens: 0 };

  const deliveries: Delivery[] = [];
  for (const part of chunk(rows, PUSH_CHUNK)) deliveries.push(...(await sendChunk(ports, part)));

  const outcome = settle(rows, deliveries);
  await ports.finish(outcome);
  return { sent: outcome.sent.length, retry: outcome.retry.length, deadTokens: outcome.deadTokens.length };
}
