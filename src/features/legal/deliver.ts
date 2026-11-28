// Delivery adapter for the export file: a download on web, the system share sheet on iOS and Android
// (from there she can save it to Files, AirDrop or mail it to herself).
import { Platform, Share } from 'react-native';

import type { ExportFile } from './domain/export';

function download(file: ExportFile): boolean {
  const url = URL.createObjectURL(new Blob([file.content], { type: file.mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.click();
  URL.revokeObjectURL(url);
  return true;
}

export async function deliverExport(file: ExportFile): Promise<boolean> {
  if (Platform.OS === 'web') return download(file);
  const result = await Share.share({ title: file.name, message: file.content });
  return result.action !== Share.dismissedAction;
}
