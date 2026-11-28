// Supabase calls of the legal feature (kept out of the shared src/lib/api.ts).
import { supabase } from '@/lib/supabase';

import type { DataExport } from './domain/export';

export class ExportError extends Error {}

/** Everything stored about the signed-in user (Edge Function `export-my-data`). */
export async function fetchMyDataExport(): Promise<DataExport> {
  const { data, error } = await supabase.functions.invoke('export-my-data', { method: 'POST' });
  if (error) throw new ExportError(error.message);
  if (!data || typeof data !== 'object') throw new ExportError('invalid_export');
  return data as DataExport;
}
