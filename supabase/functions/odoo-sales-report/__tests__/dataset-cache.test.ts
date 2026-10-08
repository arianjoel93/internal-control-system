import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeReportDataset, encodeReportDatasetStreaming, reportDatasetCacheTtlMs } from '../dataset-cache.ts';

test('comprime el histórico por fragmentos y conserva caracteres, arreglos y campos opcionales', async () => {
  const payload = {
    database: 'tectronic',
    orders: Array.from({ length: 1_000 }, (_, index) => ({
      id: index + 1,
      name: `Orden ${index}, "México"`,
      note: 'Etiqueta\nRibete'.repeat(8),
    })),
    invoices: [{ id: 1, amount: 0 }, null],
    optional: undefined,
  };
  const encoded = await encodeReportDatasetStreaming(payload);
  assert.ok(encoded?.bytes);
  assert.deepEqual(await decodeReportDataset(encoded.value), JSON.parse(JSON.stringify(payload)));
});

test('el caché compartido no vence durante las aperturas normales del mismo día', () => {
  const now = new Date('2026-10-07T15:00:00Z');
  assert.equal(reportDatasetCacheTtlMs('2026-10-07', 'fast', now), 20 * 60 * 60_000);
  assert.equal(reportDatasetCacheTtlMs('2026-10-07', 'full', now), 20 * 60 * 60_000);
  assert.equal(reportDatasetCacheTtlMs('2025-09-30', 'full', now), 20 * 60 * 60_000);
});
