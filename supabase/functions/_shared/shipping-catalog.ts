export type DataOrigin = 'UNKNOWN' | 'DECLARED' | 'MEASURED' | 'ESTIMATED';
export function supportsStandardPresentation(sku: string | null | undefined, name = '', sourceSheet = '') {
  const code = (sku ?? '').trim().toUpperCase();
  const text = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  if (/RIBBON|LISTON|CINTA/.test(text)) return false;
  return /^\d{6}(?:TD|TT|BM|BB|BD|PL|NY|TV|SG|DG|BT|PT)\d{2}/.test(code) || /ETIQUETA|LABEL|TICKET|PAPEL\s+TERMICO/.test(text) || /ETIQUETA|TICKET|TERMICO/i.test(sourceSheet.normalize('NFD').replace(/[\u0300-\u036f]/g,''));
}
export type LogisticsMetadata = {
  version: 1;
  weight_origin: DataOrigin;
  dimensions_origin: DataOrigin;
  weight_method: string | null;
  dimensions_method: string | null;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  physical_unit: 'ROLLO' | 'CAJA' | 'PIEZA' | 'UNKNOWN';
  original_package?: boolean;
  standard_presentation?: {
    units_per_box: number;
    length_cm: number; width_cm: number; height_cm: number;
    gross_weight_kg: number;
    origin: DataOrigin;
    source_file_name?: string | null;
    source_sheet?: string | null;
    source_row?: number | null;
  } | null;
  source_sheet: string | null;
  source_file_name?: string | null;
  notes: string | null;
};
export type CatalogValues = {
  length_cm: number | null; width_cm: number | null; height_cm: number | null;
  unit_weight_kg: number | null;
};

// A partial catalog entry must not hide individual measurements already known in Odoo.
// Callers supply only per-unit fields, never presentation/carton dimensions.
export function resolveIndividualLogistics(catalog: Partial<CatalogValues>, fallback: CatalogValues): CatalogValues {
  const pick = (value: unknown, other: number | null) => {
    if (value !== null && value !== undefined && value !== '') {
      const n = Number(value);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return other;
  };
  return { length_cm: pick(catalog.length_cm, fallback.length_cm), width_cm: pick(catalog.width_cm, fallback.width_cm),
    height_cm: pick(catalog.height_cm, fallback.height_cm), unit_weight_kg: pick(catalog.unit_weight_kg, fallback.unit_weight_kg) };
}

export function bracketedProductReference(value: unknown): string | null {
  return typeof value === 'string' ? value.match(/^\s*\[([^\]]+)\]/)?.[1]?.trim() || null : null;
}
export type CatalogImportRow = CatalogValues & {
  sku: string; product_name: string | null; source_row: number;
  volumetric_weight_kg: number | null; billable_weight_kg: number | null;
  logistics_metadata?: LogisticsMetadata;
};
export type CatalogSheet = { name: string; rows: Array<{ row: number; values: Record<string, unknown> }> };
const text = (v: unknown) => typeof v === 'string' && v.trim() ? v.trim() : null;
const key = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const positive = (v: unknown) => {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const round = (v: number, places = 3) => Math.round((v + Number.EPSILON) * 10 ** places) / 10 ** places;

export function normalizeCatalogValues(body: Record<string, unknown>): CatalogValues {
  const result = {} as CatalogValues;
  for (const field of ['length_cm', 'width_cm', 'height_cm', 'unit_weight_kg'] as const) {
    const value = body[field];
    if (value === undefined || value === null || value === '') result[field] = null;
    else {
      const parsed = positive(value);
      if (parsed === null) throw new Error(`${field}: usa un valor mayor a cero o deja el dato pendiente.`);
      result[field] = round(parsed, field === 'unit_weight_kg' ? 3 : 2);
      if (result[field] === 0) throw new Error(`${field}: el valor es menor que la precisión admitida.`);
    }
  }
  return result;
}

export function normalizeLogisticsMetadata(input: unknown, values: CatalogValues): LogisticsMetadata {
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const origin = (value: unknown): DataOrigin => {
    if (value === undefined || value === null) return 'UNKNOWN';
    if (!['UNKNOWN', 'DECLARED', 'MEASURED', 'ESTIMATED'].includes(String(value))) throw new Error('Origen de datos no válido.');
    return value as DataOrigin;
  };
  const result: LogisticsMetadata = {
    version: 1, weight_origin: values.unit_weight_kg === null ? 'UNKNOWN' : origin(raw.weight_origin),
    dimensions_origin: [values.length_cm, values.width_cm, values.height_cm].some(v => v === null) ? 'UNKNOWN' : origin(raw.dimensions_origin),
    weight_method: text(raw.weight_method), dimensions_method: text(raw.dimensions_method),
    confidence: raw.confidence === 'HIGH' || raw.confidence === 'MEDIUM' ? raw.confidence : 'LOW',
    physical_unit: ['ROLLO', 'CAJA', 'PIEZA'].includes(String(raw.physical_unit)) ? raw.physical_unit as LogisticsMetadata['physical_unit'] : 'UNKNOWN',
    original_package: raw.original_package === true,
    source_sheet: text(raw.source_sheet), source_file_name: text(raw.source_file_name), notes: text(raw.notes),
  };
  if (raw.standard_presentation != null) {
    const p = raw.standard_presentation as NonNullable<LogisticsMetadata['standard_presentation']>;
    if (!Number.isSafeInteger(p.units_per_box) || p.units_per_box < 2 ||
      ![p.length_cm, p.width_cm, p.height_cm, p.gross_weight_kg].every(v => typeof v === 'number' && Number.isFinite(v) && v > 0)) {
      throw new Error('Completa la presentación: unidades enteras por caja, medidas exteriores y peso bruto mayores a cero.');
    }
    result.standard_presentation = { units_per_box: p.units_per_box, length_cm: p.length_cm,
      width_cm: p.width_cm, height_cm: p.height_cm, gross_weight_kg: p.gross_weight_kg, origin: origin(p.origin),
      source_file_name: text(p.source_file_name), source_sheet: text(p.source_sheet),
      source_row: Number.isSafeInteger(p.source_row) && Number(p.source_row) > 0 ? p.source_row : null };
  }
  if (result.weight_origin === 'ESTIMATED' && !result.weight_method) throw new Error('Indica el método del peso estimado.');
  if (result.dimensions_origin === 'ESTIMATED' && !result.dimensions_method) throw new Error('Indica el método de las medidas estimadas.');
  return result;
}

export function catalogComputedWeights(values: CatalogValues) {
  const { length_cm: l, width_cm: w, height_cm: h, unit_weight_kg: weight } = values;
  const volumetric = l && w && h ? round(Math.ceil(l) * Math.ceil(w) * Math.ceil(h) / 5000) : null;
  return { volumetric_weight_kg: volumetric, billable_weight_kg: weight !== null && volumetric !== null ? Math.max(weight, volumetric) : null };
}

export function catalogStatus(values: CatalogValues, metadata?: LogisticsMetadata | null) {
  if ([values.length_cm, values.width_cm, values.height_cm, values.unit_weight_kg].some(value => value === null)) return 'INCOMPLETE';
  if (metadata?.weight_origin === 'ESTIMATED' || metadata?.dimensions_origin === 'ESTIMATED') return 'ESTIMATED';
  return metadata?.weight_origin === 'MEASURED' && metadata?.dimensions_origin === 'MEASURED' ? 'MEASURED' : 'DECLARED';
}

export function catalogMetadataEqual(left: unknown, right: unknown) {
  const canonical = (value: unknown) => JSON.stringify(Object.entries(value && typeof value === 'object' ? value : {}).sort(([a], [b]) => a.localeCompare(b)));
  return canonical(left) === canonical(right);
}

export function mergeCatalogCandidate(existing: Record<string, unknown> | undefined, incoming: CatalogImportRow): CatalogImportRow {
  if (!existing) return incoming;
  const previous = normalizeCatalogValues({ ...existing, unit_weight_kg: Number(existing.unit_weight_kg) === 0 ? null : existing.unit_weight_kg });
  const oldMeta = normalizeLogisticsMetadata(existing.logistics_metadata, previous);
  const nextMeta = normalizeLogisticsMetadata(incoming.logistics_metadata, incoming);
  // An import cannot silently downgrade a known value to a guess or blank.
  const rank = (origin: DataOrigin) => ({ UNKNOWN: 0, ESTIMATED: 1, DECLARED: 2, MEASURED: 3 })[origin];
  const keepWeight = previous.unit_weight_kg !== null && (incoming.unit_weight_kg === null || rank(oldMeta.weight_origin) > rank(nextMeta.weight_origin) || (oldMeta.weight_origin === 'UNKNOWN' && nextMeta.weight_origin === 'ESTIMATED'));
  const keepDimensions = [previous.length_cm, previous.width_cm, previous.height_cm].every(v => v !== null) &&
    ([incoming.length_cm, incoming.width_cm, incoming.height_cm].some(v => v === null) || rank(oldMeta.dimensions_origin) > rank(nextMeta.dimensions_origin) || (oldMeta.dimensions_origin === 'UNKNOWN' && nextMeta.dimensions_origin === 'ESTIMATED'));
  const values = { ...incoming,
    ...(keepWeight ? { unit_weight_kg: previous.unit_weight_kg } : {}),
    ...(keepDimensions ? { length_cm: previous.length_cm, width_cm: previous.width_cm, height_cm: previous.height_cm } : {}),
  };
  return { ...values, ...catalogComputedWeights(values), logistics_metadata: {
    ...nextMeta,
    ...((oldMeta.standard_presentation || nextMeta.standard_presentation) ? { standard_presentation: supportsStandardPresentation(incoming.sku, incoming.product_name ?? '', nextMeta.source_sheet ?? oldMeta.source_sheet ?? '') ? nextMeta.standard_presentation ?? oldMeta.standard_presentation : null } : {}),
    ...(keepWeight ? { weight_origin: oldMeta.weight_origin, weight_method: oldMeta.weight_method } : {}),
    ...(keepDimensions ? { dimensions_origin: oldMeta.dimensions_origin, dimensions_method: oldMeta.dimensions_method } : {}),
    notes: [nextMeta.notes, keepWeight || keepDimensions ? `Se conservaron campos anteriores de mayor certeza. Fuente previa: ${String(existing.source_file_name ?? 'catálogo')}, ${oldMeta.source_sheet ?? 'hoja no indicada'}, fila ${String(existing.source_row ?? 'no indicada')}.` : null].filter(Boolean).join(' ') || null,
  } };
}

export function parseCatalogSheets(sheets: CatalogSheet[]) {
  const candidates: CatalogImportRow[] = [];
  const invalidRows: Array<{ row: number; sheet: string; sku?: string; reason: string }> = [];
  for (const sheet of sheets) for (const entry of sheet.rows) {
    const raw = Object.fromEntries(Object.entries(entry.values).map(([name, value]) => [key(name), value]));
    const sku = text(raw.equipo ?? raw.sku ?? raw.codigo ?? raw.codigointerno ?? raw.producto);
    // Ignore template-only rows, formulas and checkboxes without a SKU.
    if (!sku) continue;
    const get = (...names: string[]) => names.map(name => raw[key(name)]).find(v => v !== null && v !== undefined && v !== '');
    const description = text(get('Descripcion', 'Description', 'Nombre'));
    const equipment = key(sheet.name) === 'equipos';
    const thermalBox = (/^\d{6}PT\d{2}/i.test(sku) || /PAPEL\s+TICKET/i.test(description ?? '')) && /CAJA\s*\/\s*\d+\s*ROLLOS?\b/i.test(description ?? '');
    const dimensionsText = text(get('Caja de Empaque (ancho x largo x alto cm)', 'Caja de Empaque'));
    const match = dimensionsText?.match(/^\s*(\d+(?:[.,]\d+)?)\s*[X×]\s*(\d+(?:[.,]\d+)?)\s*[X×]\s*(\d+(?:[.,]\d+)?)\s*$/i);
    const outer = match ? { width_cm: positive(match[1]), length_cm: positive(match[2]), height_cm: positive(match[3]) } : null;
    const closed = equipment || thermalBox;
    const values: CatalogValues = {
      width_cm: positive(get('Ancho', 'Width', 'width_cm')) ?? (closed ? outer?.width_cm ?? null : null),
      length_cm: positive(get('Largo', 'Length', 'length_cm')) ?? (closed ? outer?.length_cm ?? null : null),
      height_cm: positive(get('Alto', 'Height', 'height_cm')) ?? (closed ? outer?.height_cm ?? null : null),
      unit_weight_kg: positive(get('Peso Real', 'Peso', 'Weight', 'weight_kg')),
    };
    const gross = positive(get('Peso Real x Caja'));
    const count = positive(get('Total Rollos x Caja', 'Total Piezas x Caja'));
    const measured = positive(get('Peso Real x Rollo', 'Peso Real x Pieza'));
    const calculated = positive(get('Calculo Peso x Rollo', 'Calculo Peso x Pieza'));
    let weightMethod: string | null = values.unit_weight_kg ? 'Dato individual declarado en Excel' : null;
    let weightOrigin: DataOrigin = values.unit_weight_kg ? 'DECLARED' : 'UNKNOWN';
    if (closed && gross) { values.unit_weight_kg = gross; weightOrigin = 'DECLARED'; weightMethod = 'Peso bruto de la presentación original cerrada'; }
    else if (measured) { values.unit_weight_kg = measured; weightOrigin = 'DECLARED'; weightMethod = 'Columna Peso Real individual; medición no verificada'; }
    else if (calculated) { values.unit_weight_kg = calculated; weightOrigin = 'ESTIMATED'; weightMethod = 'Valor calculado guardado en Excel; tara supuesta según familia'; }
    const metadata: LogisticsMetadata = {
      version: 1, weight_origin: weightOrigin,
      dimensions_origin: values.length_cm && values.width_cm && values.height_cm ? 'DECLARED' : 'UNKNOWN',
      weight_method: weightMethod, dimensions_method: closed && outer ? 'Medidas exteriores del empaque original' : null,
      physical_unit: thermalBox ? 'CAJA' : equipment ? 'PIEZA' : /etiquetas|ribbon|termico/i.test(key(sheet.name)) ? 'ROLLO' : 'UNKNOWN',
      confidence: 'LOW', source_sheet: sheet.name, notes: text(get('Observaciones')),
      original_package: false,
    };
    // Estimate only when the workbook explicitly defines a stack of rolls per tube.
    // Assumption: tubes stand vertically in a rectangular grid; never call this measured.
    const stack = positive(get('Rollos por Tubo'));
    const tubes = positive(get('Cantidad de Tubos x Caja', 'Cantidad de Tubos'));
    if (!closed && !values.length_cm && !values.width_cm && !values.height_cm && outer?.length_cm && outer.width_cm && outer.height_cm && stack && tubes && Number.isInteger(stack) && Number.isInteger(tubes) && count === stack * tubes) {
      const options: number[] = [];
      for (let x = 1; x <= tubes; x++) if (tubes % x === 0) options.push(Math.min(outer.length_cm / x, outer.width_cm / (tubes / x)));
      const diameter = Math.max(...options);
      const axial = outer.height_cm / stack;
      const core = sku.match(/C([123])(?:[A-Z])/i);
      const labelWidth = /^\d{6}/.test(sku) ? Number(sku.slice(0, 3)) / 10 : null;
      if (diameter > Number(core?.[1] ?? 0) * 2.54 && (!labelWidth || axial >= labelWidth)) {
        values.length_cm = round(diameter, 2); values.width_cm = round(diameter, 2); values.height_cm = round(axial, 2);
        metadata.dimensions_origin = 'ESTIMATED';
        metadata.dimensions_method = `Hipótesis: ${tubes} tubos verticales en cuadrícula, ${stack} rollos apilados/tubo; envolvente desde caja exterior, sin descontar holguras. Requiere revisión de almacén.`;
      }
    }
    const skuCapacity = sku.toUpperCase().match(/(\d+)K(\d*)$/);
    const shortCapacity = sku.toUpperCase().match(/LG(\d+)$/);
    const descriptionCapacity = description?.match(/\bR\s*(\d+(?:[.,]\d+)?)\s*K\b|\bR\s*(\d+[.,]\d+)(?![\d.,])/i);
    const capacity = skuCapacity ? Number(`${skuCapacity[1]}.${skuCapacity[2] || 0}`) : shortCapacity ? Number(shortCapacity[1])/1000 : null;
    if (capacity !== null && descriptionCapacity && Math.abs(capacity - Number((descriptionCapacity[1] ?? descriptionCapacity[2]).replace(',', '.'))) > 1e-7) {
      invalidRows.push({ row: entry.row, sheet: sheet.name, sku, reason: 'Capacidad contradictoria entre código y descripción; no se importará.' });
      continue;
    }
    const normalized = normalizeCatalogValues(values);
    candidates.push({ sku: sku.toUpperCase(), product_name: description, ...normalized, ...catalogComputedWeights(normalized), source_row: entry.row, logistics_metadata: normalizeLogisticsMetadata(metadata, normalized) });
  }
  const counts = new Map<string, number>();
  const normalizedSku = (sku: string) => sku.replace(/\s/g, '').toUpperCase();
  for (const row of candidates) counts.set(normalizedSku(row.sku), (counts.get(normalizedSku(row.sku)) ?? 0) + 1);
  const rows = candidates.filter(row => {
    if (counts.get(normalizedSku(row.sku)) === 1) return true;
    invalidRows.push({ row: row.source_row, sheet: row.logistics_metadata?.source_sheet ?? '', sku: row.sku, reason: 'SKU con varias presentaciones: elige una variante antes de importar. No se sobrescribirá automáticamente.' });
    return false;
  });
  return { rows, invalidRows, reviewedCount: candidates.length + invalidRows.filter(row => row.reason.startsWith('Capacidad')).length };
}
