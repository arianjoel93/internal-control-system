import assert from 'node:assert/strict';
import fs from 'node:fs';
const { PGlite } = await import('@electric-sql/pglite').catch(() =>
  import('../tmp/catalog-sql-check/node_modules/@electric-sql/pglite/dist/index.js'));

const data = JSON.parse(fs.readFileSync('scripts/data/shipping-standard-presentations.json', 'utf8'));
const sql = fs.readFileSync('scripts/sql/load-shipping-standard-presentations.sql', 'utf8');
const db = new PGlite();
await db.exec(`CREATE TABLE shipping_product_dimensions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY, sku text UNIQUE,
  logistics_metadata jsonb, unit_weight_kg numeric DEFAULT 0.123);
  CREATE TABLE shipping_settings_audit(action text, entity_type text, entity_id uuid, previous_value jsonb, new_value jsonb);`);
for (const row of data.accepted) await db.query('INSERT INTO shipping_product_dimensions(sku,logistics_metadata) VALUES ($1,$2)',
  [row.sku, JSON.stringify({ version: 1, physical_unit: 'ROLLO', weight_origin: 'ESTIMATED', notes: 'Preservar' })]);
const preserved = data.accepted[0].sku;
const closed = data.accepted[1].sku;
await db.query(`UPDATE shipping_product_dimensions SET logistics_metadata = logistics_metadata || '{"standard_presentation":{"units_per_box":99}}'::jsonb WHERE sku=$1`, [preserved]);
await db.query(`UPDATE shipping_product_dimensions SET logistics_metadata = logistics_metadata || '{"original_package":true}'::jsonb WHERE sku=$1`, [closed]);
await db.exec(sql);
const expected = data.accepted.length - 2;
assert.equal((await db.query('SELECT count(*)::int AS n FROM shipping_settings_audit')).rows[0].n, expected);
assert.equal((await db.query(`SELECT logistics_metadata->'standard_presentation'->>'units_per_box' AS n FROM shipping_product_dimensions WHERE sku=$1`, [preserved])).rows[0].n, '99');
assert.equal((await db.query(`SELECT count(*)::int AS n FROM shipping_product_dimensions WHERE logistics_metadata->>'notes'='Preservar' AND unit_weight_kg=0.123`)).rows[0].n, data.accepted.length);
const pilot = (await db.query(`SELECT logistics_metadata->'standard_presentation' AS p FROM shipping_product_dimensions WHERE sku='051025TD011P0000C1P2K5'`)).rows[0].p;
assert.equal(pilot.units_per_box, 36);
assert.equal(pilot.gross_weight_kg, 18);
assert.equal(pilot.source_row, 51);
await db.exec(sql);
assert.equal((await db.query('SELECT count(*)::int AS n FROM shipping_settings_audit')).rows[0].n, expected);
await db.close();
console.log(`Carga SQL validada: ${expected} altas de prueba; preserva presentación existente, caja cerrada, peso y metadatos; segunda ejecución sin cambios.`);
