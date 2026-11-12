from pathlib import Path
p=Path('supabase/functions/shipping-quote/index.ts')
s=p.read_text(encoding='utf8')
s=s.replace('catalogComputedWeights, parseCatalogSheets, type CatalogImportRow','catalogComputedWeights, parseCatalogSheets, mergeCatalogCandidate, type CatalogImportRow')
start=s.index('function parseProductDimensionsWorkbook(')
end=s.index('function productDimensionChanged(',start)
s=s[:start]+'''function parseProductDimensionsWorkbook(fileBase64: string) {
  const workbook = XLSX.read(decodeBase64(fileBase64), { type: 'array' });
  const sheets = workbook.SheetNames.map(name => {
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, defval: null, raw: true, blankrows: true });
    const headers = matrix[0] ?? [];
    return { name, rows: matrix.slice(1).map((cells, index) => ({ row: index + 2,
      values: Object.fromEntries(headers.map((header, column) => [String(header ?? `column_${column}`), cells[column] ?? null])) })) };
  });
  const parsed = parseCatalogSheets(sheets);
  if (!parsed.rows.length && !parsed.invalidRows.length) throw new Error('El Excel no contiene productos con código.');
  return parsed;
}

function normalizeProductDimensionImportRow(value: unknown): ProductDimensionImportRow | null {
  if (!isRecord(value)) return null;
  const sku = readText(value.sku);
  if (!sku) throw new Error('Cada producto importado necesita un código.');
  const values = normalizeCatalogValues(value);
  return { sku: sku.toUpperCase(), product_name: readText(value.product_name), ...values, ...catalogComputedWeights(values),
    source_row: Math.max(1, Number(value.source_row) || 1),
    logistics_metadata: normalizeLogisticsMetadata(value.logistics_metadata, values) };
}

''' + s[end:]
s=s.replace('compareNumber(existing.billable_weight_kg, incoming.billable_weight_kg, 3);','compareNumber(existing.billable_weight_kg, incoming.billable_weight_kg, 3) ||\n    JSON.stringify(existing.logistics_metadata ?? {}) !== JSON.stringify(incoming.logistics_metadata ?? {});')
s=s.replace('  let newCount = 0;','  parsed.rows = parsed.rows.map(row => mergeCatalogCandidate(existingBySku.get(normalizeSku(row.sku)), row));\n  let newCount = 0;',1)
s=s.replace('  const rows = Array.isArray(body.rows)','  let rows = Array.isArray(body.rows)',1)
s=s.replace("  const changedExisting = rows.filter((row) => {", "  const keys = rows.map(row => normalizeSku(row.sku));\n  if (new Set(keys).size !== keys.length) throw new Error('No se pueden importar varias presentaciones del mismo SKU en una sola carga.');\n  rows = rows.map(row => mergeCatalogCandidate(existingBySku.get(normalizeSku(row.sku)), row));\n  const changedExisting = rows.filter((row) => {",1)
s=s.replace('    source_file_name: fileName,\n    source_row: row.source_row,', '    source_file_name: fileName,\n    source_row: row.source_row,\n    logistics_metadata: { ...row.logistics_metadata, source_file_name: fileName },',1)
s=s.replace('    rows: parsed.rows,','    rows: parsed.rows,\n    reviewedCount: parsed.reviewedCount,',1)
p.write_text(s,encoding='utf8')
