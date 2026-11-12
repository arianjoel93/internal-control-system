import fs from 'node:fs';
import { parseCatalogSheets, catalogStatus } from '../../supabase/functions/_shared/shipping-catalog.ts';
const audit = JSON.parse(fs.readFileSync('tmp/product-analysis/audit.json','utf8'));
const sheets = audit.sheets.map((sheet: {sheet: string}) => ({ name: sheet.sheet, rows: audit.rows.filter((row: {sheet:string}) => row.sheet === sheet.sheet).map((row: {row:number}) => ({ row: row.row, values: row })) }));
const result = parseCatalogSheets(sheets);
fs.writeFileSync('tmp/product-analysis/catalog-preview.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({reviewed:result.reviewedCount,ready:result.rows.length,quarantined:result.invalidRows.length,states:result.rows.reduce((a:Record<string,number>,row) => {const state=catalogStatus(row,row.logistics_metadata);a[state]=(a[state]??0)+1;return a;},{}),example:result.rows.find(row=>row.sku==='051025TD011P0000C1P2K5')}));
