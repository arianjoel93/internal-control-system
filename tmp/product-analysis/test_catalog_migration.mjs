import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '../catalog-sql-check/node_modules/@electric-sql/pglite/dist/index.js';
const db = new PGlite();
await db.exec(`create table public.shipping_product_dimensions (
  sku text primary key, width_cm numeric(12,2) not null, length_cm numeric(12,2) not null, height_cm numeric(12,2) not null,
  constraint shipping_product_dimensions_positive_dimensions_check check (width_cm > 0 and length_cm > 0 and height_cm > 0)
);
insert into public.shipping_product_dimensions values ('EXISTING', 10, 20, 30);`);
await db.exec(fs.readFileSync('supabase/migrations/20261111233428_shipping_catalog_quality.sql','utf8'));
await db.query(`insert into public.shipping_product_dimensions (sku, width_cm, length_cm, height_cm, logistics_metadata) values ('PARTIAL',null,null,null,$1)`, [JSON.stringify({version:1, weight_origin:'ESTIMATED'})]);
assert.equal((await db.query(`select count(*)::int as count from public.shipping_product_dimensions`)).rows[0].count,2);
assert.equal((await db.query(`select width_cm from public.shipping_product_dimensions where sku='PARTIAL'`)).rows[0].width_cm,null);
await assert.rejects(db.exec(`insert into public.shipping_product_dimensions (sku,width_cm,length_cm,height_cm) values ('ZERO',0,1,1)`));
await assert.rejects(db.exec(`insert into public.shipping_product_dimensions (sku,logistics_metadata) values ('BAD','[]')`));
await db.close();
console.log('Migración PostgreSQL: conserva registros, acepta medidas pendientes, rechaza cero y metadatos inválidos.');
