import fs from 'node:fs';
import { catalogStatus } from '../../supabase/functions/_shared/shipping-catalog.ts';
const root='tmp/product-analysis/';
const preview=JSON.parse(fs.readFileSync(root+'catalog-preview.json','utf8'));
const existing=JSON.parse(fs.readFileSync(root+'existing-catalog-before-full-import.json','utf8'));
const normalize=(sku:string)=>sku.replace(/\s/g,'').toUpperCase();
const previous=new Map(existing.map((row:{sku:string})=>[normalize(row.sku),row]));
const remaining=preview.rows.filter((row:{sku:string})=>!previous.has(normalize(row.sku))).map((row:{logistics_metadata:Record<string,unknown>})=>({...row,
  source_file_name:'TEC-ALM-Empaque Medidas y Peso.xlsx',
  logistics_metadata:{...row.logistics_metadata,source_file_name:'TEC-ALM-Empaque Medidas y Peso.xlsx',notes:[row.logistics_metadata.notes,'Carga de catálogo autorizada por Joe; 12 de noviembre de 2026.'].filter(Boolean).join(' ')},
}));
const stats=remaining.reduce((counts:Record<string,number>,row:Parameters<typeof catalogStatus>[0]&{logistics_metadata?:Parameters<typeof catalogStatus>[1]})=>{const state=catalogStatus(row,row.logistics_metadata);counts[state]=(counts[state]??0)+1;return counts;},{});
const plan={sourceRows:preview.reviewedCount,candidates:preview.rows.length,existingPreserved:preview.rows.length-remaining.length,newProducts:remaining.length,expectedTotal:existing.length+remaining.length,quarantinedRows:preview.invalidRows.length,stats,rows:remaining,invalidRows:preview.invalidRows};
fs.writeFileSync(root+'full-import-plan.json',JSON.stringify(plan,null,2));
console.log(JSON.stringify({...plan,rows:undefined,invalidRows:undefined}));
