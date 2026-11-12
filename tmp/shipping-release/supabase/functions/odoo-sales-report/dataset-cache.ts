const CACHE_VERSION = 1;
const MAX_RAW_BYTES = 30 * 1024 * 1024;
const MAX_COMPRESSED_BYTES = 8 * 1024 * 1024;

type CacheIdentity = {
  odooUrl: string;
  odooDatabase: string;
  odooUser: string;
  odooApiKey: string;
  requestedDomain: string;
  reportContext: string;
  loadMode: string;
  visibilityScope: 'all' | 'own';
  forcedSalespersonId: number | null;
  forcedCompanyId: number | null;
  filters: Record<string, unknown>;
};

export async function reportDatasetCacheKey(identity: CacheIdentity): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify({ version: CACHE_VERSION, ...identity }));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function reportDatasetCacheTtlMs(_endDate: string, _loadMode: string, _now = new Date()): number {
  // Even historical periods can be corrected in Odoo; refresh them daily.
  return 20 * 60 * 60_000;
}

export async function encodeReportDataset(payload: Record<string, unknown>): Promise<{ value: string; bytes: number } | null> {
  const json = JSON.stringify(payload);
  const raw = new TextEncoder().encode(json);
  if (raw.byteLength > MAX_RAW_BYTES) return null;
  const compressed = new Uint8Array(await new Response(
    new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip')),
  ).arrayBuffer());
  if (compressed.byteLength > MAX_COMPRESSED_BYTES) return null;
  return { value: bytesToBase64(compressed), bytes: compressed.byteLength };
}

export async function encodeReportDatasetStreaming(payload: Record<string, unknown>): Promise<{ value: string; bytes: number } | null> {
  const encoder = new TextEncoder();
  const iterator = serializedChunks(payload);
  let rawBytes = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      const next = iterator.next();
      if (next.done) { controller.close(); return; }
      const bytes = encoder.encode(next.value);
      rawBytes += bytes.byteLength;
      if (rawBytes > 80 * 1024 * 1024) {
        controller.error(new Error('El conjunto unido supera el límite seguro de almacenamiento.'));
        return;
      }
      controller.enqueue(bytes);
    },
  });
  const compressed = new Uint8Array(await new Response(stream.pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  if (compressed.byteLength > MAX_COMPRESSED_BYTES) return null;
  return { value: bytesToBase64(compressed), bytes: compressed.byteLength };
}

function* serializedChunks(payload: Record<string, unknown>): Generator<string> {
  let firstField = true;
  yield '{';
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined || typeof value === 'function' || typeof value === 'symbol') continue;
    yield `${firstField ? '' : ','}${JSON.stringify(key)}:`;
    firstField = false;
    if (!Array.isArray(value)) {
      yield JSON.stringify(value) ?? 'null';
      continue;
    }
    yield '[';
    let chunk = '';
    for (let index = 0; index < value.length; index += 1) {
      const item = `${index ? ',' : ''}${JSON.stringify(value[index]) ?? 'null'}`;
      if (chunk.length + item.length > 32_768 && chunk) {
        yield chunk;
        chunk = '';
      }
      chunk += item;
    }
    if (chunk) yield chunk;
    yield ']';
  }
  yield '}';
}

export async function decodeReportDataset(value: string): Promise<Record<string, unknown>> {
  const bytes = base64ToBytes(value);
  const json = await new Response(
    new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')),
  ).text();
  const parsed: unknown = JSON.parse(json);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Cache de reportes inválida.');
  return parsed as Record<string, unknown>;
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 12_288) {
    chunks.push(btoa(String.fromCharCode(...bytes.subarray(offset, offset + 12_288))));
  }
  return chunks.join('');
}

function base64ToBytes(value: string): Uint8Array {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  const bytes = new Uint8Array(value.length / 4 * 3 - padding);
  let offset = 0;
  for (let index = 0; index < value.length; index += 16_384) {
    const chunk = atob(value.slice(index, index + 16_384));
    for (let position = 0; position < chunk.length; position += 1) bytes[offset++] = chunk.charCodeAt(position);
  }
  return bytes;
}
