import { exportFileName, exportMyData, toExportFile, type ExportPorts } from './export';

const AT = new Date(2026, 0, 5, 23, 30);

const ports = (over: Partial<ExportPorts> = {}): ExportPorts => ({
  fetchExport: async () => ({ format: 'boston-home-export', profile: { display_name: 'Anna' } }),
  deliver: jest.fn(async () => true),
  now: () => AT,
  ...over,
});

it('names the file after the local date', () => {
  expect(exportFileName(AT)).toBe('boston-home-data-2026-01-05.json');
});

it('turns the export into a readable JSON file', () => {
  const file = toExportFile({ a: 1 }, AT);
  expect(file).toEqual({ name: 'boston-home-data-2026-01-05.json', mimeType: 'application/json', content: '{\n  "a": 1\n}' });
});

describe('exportMyData', () => {
  it('fetches the export and delivers it as a file', async () => {
    const p = ports();
    await expect(exportMyData(p)).resolves.toBe('delivered');
    expect(p.deliver).toHaveBeenCalledWith(expect.objectContaining({ name: 'boston-home-data-2026-01-05.json' }));
    expect(JSON.parse((p.deliver as jest.Mock).mock.calls[0][0].content)).toEqual({
      format: 'boston-home-export',
      profile: { display_name: 'Anna' },
    });
  });

  it('reports a cancelled share sheet', async () => {
    await expect(exportMyData(ports({ deliver: async () => false }))).resolves.toBe('cancelled');
  });

  it('never throws: a failed fetch or delivery is an outcome', async () => {
    const deliver = jest.fn();
    await expect(exportMyData(ports({ fetchExport: () => Promise.reject(new Error('offline')), deliver }))).resolves.toBe('failed');
    expect(deliver).not.toHaveBeenCalled();
    await expect(exportMyData(ports({ deliver: () => Promise.reject(new Error('no share')) }))).resolves.toBe('failed');
  });
});
