"""Prepare an audited, non-overwriting presentation load from the reviewed Excel extraction.

No database connection or write is performed. Run from the repository root.
"""
import collections
import hashlib
import json
import math
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'tmp/product-analysis/normalized.json'
WORKBOOK = ROOT / 'tmp/product-analysis/products.xlsx'
DEST = ROOT / 'scripts/data/shipping-standard-presentations.json'
SQL = ROOT / 'scripts/sql/load-shipping-standard-presentations.sql'


def positive(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value > 0


def prepare(rows):
    counts = collections.Counter(r['sku'].strip().upper() for r in rows)
    accepted, pending = [], []
    for row in rows:
        if row['physical_unit'] != 'ROLLO':
            continue
        sku = row['sku'].strip().upper()
        reason = None
        count = row.get('units_per_box')
        dimensions = re.fullmatch(r'\s*(\d+(?:[.,]\d+)?)\s*[xX×]\s*(\d+(?:[.,]\d+)?)\s*[xX×]\s*(\d+(?:[.,]\d+)?)\s*', str(row.get('box_dimensions_width_length_height_cm') or ''))
        if re.search(r'RIBBON|LISTON|CINTA', row.get('description', ''), re.I) or not (
            re.match(r'^\d{6}(?:TD|TT|BM|BB|BD|PL|NY|TV|SG|DG|BT|PT)\d{2}', sku) or
            re.search(r'ETIQUETA|LABEL|TICKET|PAPEL T.RMICO', row.get('description', ''), re.I) or
            re.search(r'ETIQUETA|TICKET|T.RMICO', row.get('sheet', ''), re.I)):
            reason = 'Presentación estándar reservada para etiquetas y tickets'
        elif counts[sku] != 1:
            reason = 'SKU duplicado: requiere resolver la presentación'
        elif row.get('issues'):
            reason = ', '.join(row['issues'])
        elif not positive(count) or count < 2 or int(count) != count:
            reason = 'Sin cantidad entera de rollos por caja mayor a uno'
        elif not dimensions or not all(positive(float(x.replace(',', '.'))) for x in dimensions.groups()):
            reason = 'Sin tres medidas exteriores válidas'
        elif not positive(row.get('box_gross_weight_kg')):
            reason = 'Sin peso bruto válido'
        if reason:
            pending.append(dict(sku=sku, sheet=row['sheet'], row=row['row'], reason=reason))
            continue
        width, length, height = [float(x.replace(',', '.')) for x in dimensions.groups()]
        accepted.append(dict(sku=sku, standard_presentation=dict(units_per_box=int(count), length_cm=length,
            width_cm=width, height_cm=height, gross_weight_kg=row['box_gross_weight_kg'], origin='DECLARED',
            source_file_name='TEC-ALM-Empaque Medidas y Peso.xlsx', source_sheet=row['sheet'], source_row=row['row'])))
    return accepted, pending


def make_sql(accepted):
    payload = json.dumps(accepted, ensure_ascii=False, separators=(',', ':'))
    return '''-- Run AFTER deploying shipping-quote and the frontend with standard_presentation support.
-- Data from the reviewed Excel; no individual weights/dimensions are changed.
-- Existing presentations and products marked as original closed packages are preserved.
BEGIN;
CREATE TEMP TABLE shipping_presentation_import ON COMMIT DROP AS
SELECT item->>'sku' AS sku, item->'standard_presentation' AS presentation
FROM jsonb_array_elements($presentations$''' + payload + '''$presentations$::jsonb) AS item;

WITH previous AS MATERIALIZED (
  SELECT p.id, p.logistics_metadata AS old_metadata, s.presentation
  FROM public.shipping_product_dimensions p
  JOIN shipping_presentation_import s ON p.sku = s.sku
  WHERE (p.logistics_metadata->'standard_presentation' IS NULL
    OR p.logistics_metadata->'standard_presentation' = 'null'::jsonb)
    AND COALESCE(p.logistics_metadata->>'original_package', 'false') <> 'true'
), updated AS (
  UPDATE public.shipping_product_dimensions p
  SET logistics_metadata = COALESCE(p.logistics_metadata, '{}'::jsonb)
    || jsonb_build_object('standard_presentation', previous.presentation)
  FROM previous WHERE p.id = previous.id
  RETURNING p.id, previous.old_metadata, p.logistics_metadata
)
INSERT INTO public.shipping_settings_audit(action, entity_type, entity_id, previous_value, new_value)
SELECT 'shipping.product_dimensions.standard_presentation_import', 'shipping_product_dimensions',
  id, old_metadata, logistics_metadata FROM updated;

-- Inspect the result: APPLIED_OR_ALREADY_IDENTICAL, EXISTING_PRESERVED, ORIGINAL_PACKAGE_PRESERVED, MISSING_PRODUCT.
SELECT s.sku, CASE WHEN p.id IS NULL THEN 'MISSING_PRODUCT'
  WHEN p.logistics_metadata->'standard_presentation' = s.presentation THEN 'APPLIED_OR_ALREADY_IDENTICAL'
  WHEN p.logistics_metadata->>'original_package' = 'true' THEN 'ORIGINAL_PACKAGE_PRESERVED'
  ELSE 'EXISTING_PRESERVED' END AS result
FROM shipping_presentation_import s LEFT JOIN public.shipping_product_dimensions p ON p.sku = s.sku
ORDER BY s.sku;
COMMIT;
'''


if __name__ == '__main__':
    accepted, pending = prepare(json.loads(SOURCE.read_text(encoding='utf-8')))
    snapshot = ROOT / 'tmp/product-analysis/presentation-catalog-snapshot.json'
    if snapshot.exists():
        catalog = {r['sku']: r for r in json.loads(snapshot.read_text(encoding='utf-8'))}
        ready = []
        for candidate in accepted:
            current = catalog.get(candidate['sku'])
            reason = 'Producto ausente del catálogo' if current is None else (
                'Producto configurado como empaque original cerrado' if current.get('original_package') == 'true' else (
                'Presentación existente: no sobrescribir' if current.get('standard_presentation') else None))
            if reason:
                p = candidate['standard_presentation']
                pending.append(dict(sku=candidate['sku'], sheet=p['source_sheet'], row=p['source_row'], reason=reason))
            else:
                ready.append(candidate)
        accepted = ready
    DEST.parent.mkdir(parents=True, exist_ok=True)
    SQL.parent.mkdir(parents=True, exist_ok=True)
    DEST.write_text(json.dumps(dict(source_file='TEC-ALM-Empaque Medidas y Peso.xlsx',
        source_sha256=hashlib.sha256(WORKBOOK.read_bytes()).hexdigest(),
        accepted=accepted, pending=pending), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    SQL.write_text(make_sql(accepted), encoding='utf-8')
    print(json.dumps(dict(accepted=len(accepted), pending=len(pending),
        sheets=dict(collections.Counter(x['standard_presentation']['source_sheet'] for x in accepted))), ensure_ascii=False))
