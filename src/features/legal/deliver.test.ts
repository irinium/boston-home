import { Platform, Share } from 'react-native';

import { deliverExport } from './deliver';

const FILE = { name: 'boston-home-data-2026-11-28.json', mimeType: 'application/json' as const, content: '{}' };

afterEach(() => {
  Platform.OS = 'ios';
  jest.restoreAllMocks();
});

it('opens the share sheet on mobile', async () => {
  const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction, activityType: undefined });
  await expect(deliverExport(FILE)).resolves.toBe(true);
  expect(share).toHaveBeenCalledWith({ title: FILE.name, message: '{}' });
});

it('reports a dismissed share sheet', async () => {
  jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.dismissedAction, activityType: undefined });
  await expect(deliverExport(FILE)).resolves.toBe(false);
});

it('downloads the file on web', async () => {
  Platform.OS = 'web';
  const link = { href: '', download: '', click: jest.fn() };
  const g = globalThis as Record<string, unknown>;
  const saved = { document: g.document, URL: g.URL, Blob: g.Blob };
  g.document = { createElement: jest.fn(() => link) };
  g.URL = { createObjectURL: jest.fn(() => 'blob:x'), revokeObjectURL: jest.fn() };
  g.Blob = jest.fn();
  try {
    await expect(deliverExport(FILE)).resolves.toBe(true);
    expect(link).toMatchObject({ href: 'blob:x', download: FILE.name });
    expect(link.click).toHaveBeenCalled();
    expect((g.URL as { revokeObjectURL: jest.Mock }).revokeObjectURL).toHaveBeenCalledWith('blob:x');
  } finally {
    Object.assign(g, saved);
  }
});
