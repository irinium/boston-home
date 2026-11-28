// Use case behind the "Export my data" button. It depends only on the ports below, so the
// screen stays thin and the flow is tested without Supabase or the native share sheet.

/** What the `export-my-data` Edge Function returns: one JSON document. */
export type DataExport = Record<string, unknown>;

export type ExportPorts = {
  fetchExport(): Promise<DataExport>;
  /** Hands the file to the user (share sheet, download). Resolves false when she cancels. */
  deliver(file: ExportFile): Promise<boolean>;
  now(): Date;
};

export type ExportFile = { name: string; mimeType: 'application/json'; content: string };

export type ExportOutcome = 'delivered' | 'cancelled' | 'failed';

/** `boston-home-data-2026-11-28.json`, in the user's local date. */
export function exportFileName(at: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `boston-home-data-${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}.json`;
}

export function toExportFile(data: DataExport, at: Date): ExportFile {
  return { name: exportFileName(at), mimeType: 'application/json', content: JSON.stringify(data, null, 2) };
}

/** Fetches the export and delivers it as a file. Never throws: the screen only shows the outcome. */
export async function exportMyData(ports: ExportPorts): Promise<ExportOutcome> {
  try {
    const data = await ports.fetchExport();
    const delivered = await ports.deliver(toExportFile(data, ports.now()));
    return delivered ? 'delivered' : 'cancelled';
  } catch {
    return 'failed';
  }
}
