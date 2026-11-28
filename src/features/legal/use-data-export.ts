import { useCallback, useState } from 'react';

import { fetchMyDataExport } from './api';
import { deliverExport } from './deliver';
import { exportMyData, type ExportOutcome, type ExportPorts } from './domain/export';

const defaultPorts: ExportPorts = { fetchExport: fetchMyDataExport, deliver: deliverExport, now: () => new Date() };

/** State for the "Export my data" button: one export at a time, and the last outcome. */
export function useDataExport(ports: ExportPorts = defaultPorts) {
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<ExportOutcome | null>(null);

  const run = useCallback(async () => {
    setBusy(true);
    setOutcome(null);
    setOutcome(await exportMyData(ports));
    setBusy(false);
  }, [ports]);

  return { run, busy, outcome };
}
