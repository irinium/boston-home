import type { ZodType } from 'zod';

import { errorCodeFromMessage, type ModerationErrorCode } from '../domain/errors';
import { fail, ok, type Result } from '../domain/result';

export interface RpcError {
  readonly message: string;
}

export interface RpcResponse {
  readonly data: unknown;
  readonly error: RpcError | null;
}

/** The one Supabase capability the gateways need, so tests can stand in for it with a plain object. */
export interface RpcClient {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<RpcResponse>;
}

const NETWORK_HINTS = ['failed to fetch', 'networkerror', 'network request failed', 'load failed'];

export function toErrorCode(error: RpcError): ModerationErrorCode {
  const message = error.message.toLowerCase();
  if (NETWORK_HINTS.some((hint) => message.includes(hint))) return 'network';
  return errorCodeFromMessage(message);
}

/** Calls an RPC and validates its payload, turning every failure (thrown or returned) into a code. */
export async function callRpc<T>(
  client: RpcClient,
  fn: string,
  args: Record<string, unknown>,
  schema: ZodType<T>,
): Promise<Result<T, ModerationErrorCode>> {
  let response: RpcResponse;
  try {
    response = await client.rpc(fn, args);
  } catch (thrown) {
    return fail(toErrorCode({ message: thrown instanceof Error ? thrown.message : String(thrown) }));
  }
  if (response.error) return fail(toErrorCode(response.error));
  const parsed = schema.safeParse(response.data);
  return parsed.success ? ok(parsed.data) : fail('unexpected');
}
