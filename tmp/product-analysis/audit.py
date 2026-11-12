import openpyxl,json,collections,re
from pathlib import Path
p=Path(__file__).parent
w=openpyxl.load_workbook(p/'products.xlsx',data_only=True)
f=openpyxl.load_workbook(p/'products.xlsx',data_only=False)
allrows=[]; summaries=[]
for s in w:
    heads=[c.value for c in s[1]]
    rows=[]
    for cells in s.iter_rows(min_row=2):
        if cells[0].value is None: continue
        vals={str(heads[i] or f'COL_{i+1}'): c.value for i,c in enumerate(cells) if c.value is not None}
        vals.update(sheet=s.title,row=cells[0].row,sku=str(cells[0].value).strip())
        rows.append(vals);allrows.append(vals)
    cols=[]
    for i,h in enumerate(heads):
        present=[r for r in rows if str(h or f'COL_{i+1}') in r]
        if not h and not present:continue
        formulas=[f[s.title].cell(r['row'],i+1).value for r in rows if f[s.title].cell(r['row'],i+1).data_type=='f']
        cols.append(dict(column=openpyxl.utils.get_column_letter(i+1),name=h,filled=len(present),formula_count=len(formulas),formula_examples=list(dict.fromkeys(formulas))[:3]))
    summaries.append(dict(sheet=s.title,rows=len(rows),unique_skus=len(set(r['sku'] for r in rows)),columns=cols))
counts=collections.Counter(r['sku'] for r in allrows)
duplicates={k:[r for r in allrows if r['sku']==k] for k,v in counts.items() if v>1}
out=dict(sheets=summaries,total_rows=len(allrows),unique_skus=len(counts),duplicates=duplicates,rows=allrows)
(p/'audit.json').write_text(json.dumps(out,ensure_ascii=False,indent=2,default=str),encoding='utf8')
print(json.dumps({k:v for k,v in out.items() if k!='rows' and k!='duplicates'},ensure_ascii=True,indent=2))
print('DUPLICATES',json.dumps(duplicates,ensure_ascii=True))
print('EXAMPLE',json.dumps([r for r in allrows if r['sku']=='051025TD011P0000C1P2K5'],ensure_ascii=True))
