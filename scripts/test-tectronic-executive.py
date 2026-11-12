import importlib.util
from datetime import date, timedelta
from pathlib import Path

root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('executive_report',root/'plugins/tectronic-intelligence/skills/reporte-gerencial/scripts/executive_report.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
rows=[]
start=date(2026,10,5)
for i in range(15):
    day=start+timedelta(days=i)
    if day.weekday()>4:continue
    amount=100 if i<7 else 50
    rows.append(dict(source_database='SYNTHETIC',company_id=1,company_name='Demo',seller_id=1,seller_name='Demo',metric_date=str(day),currency_code='MXN',untaxed_amount=amount,margin_amount=amount*.2,source_fetched_at='2026-10-22T19:30:00Z'))
d=dict(source='supabase',dataset_kind='sales_aggregates',complete=True,grain='daily',dimension='seller',retrieved_at='2026-10-22T20:00:00Z',rows=rows)
a=m.analyze(d)
assert a['comparison']['growth']==-50
assert a['comparison']['delta']==-250
assert abs(sum(x['delta'] for x in a['comparison']['contributions'])+250)<.001
assert sum(v['sales'] for k,v in a['sellers'])==a['total']['sales']
assert a['total']['rate']==20
for bad in [dict(d,complete=False),dict(d,rows=rows+[rows[0]]),dict(d,rows=rows+[dict(rows[0],seller_id=2,currency_code='USD')])]:
    try:m.analyze(bad)
    except ValueError:pass
    else:raise AssertionError('Expected validation failure')
negative=m.group([dict(rows[0],untaxed_amount=-10,margin_amount=-12)],[])[()]
assert negative['rate'] is None
print('OK: comparable weeks, reconciliation, weighted margin, no duplicates/mixed currencies, and negative balance handling')
