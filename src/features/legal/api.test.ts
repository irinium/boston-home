import { supabase } from '@/lib/supabase';

import { ExportError, fetchMyDataExport } from './api';

jest.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke: jest.fn() } } }));

const invoke = supabase.functions.invoke as jest.Mock;

it('calls the export Edge Function and returns its document', async () => {
  invoke.mockResolvedValue({ data: { format: 'boston-home-export' }, error: null });
  await expect(fetchMyDataExport()).resolves.toEqual({ format: 'boston-home-export' });
  expect(invoke).toHaveBeenCalledWith('export-my-data', { method: 'POST' });
});

it('throws on a function error or a body that is not a JSON object', async () => {
  invoke.mockResolvedValue({ data: null, error: { message: 'FunctionsHttpError' } });
  await expect(fetchMyDataExport()).rejects.toThrow(ExportError);
  invoke.mockResolvedValue({ data: 'oops', error: null });
  await expect(fetchMyDataExport()).rejects.toThrow('invalid_export');
});
