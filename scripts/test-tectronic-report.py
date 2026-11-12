import importlib.util
from pathlib import Path

root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('report', root / 'plugins/tectronic-intelligence/skills/reporte-gerencial/scripts/report.py')
report = importlib.util.module_from_spec(spec)
spec.loader.exec_module(report)
row = dict(source_database='SYNTHETIC', company_id=1, seller_id=1, seller_name='Demo', metric_date='2026-10-01', currency_code='MXN', untaxed_amount='100', margin_amount='20', invoice_count=3, source_fetched_at='2026-10-22T19:30:00Z')
data = dict(source='supabase', complete=True, retrieved_at='2026-10-22T20:00:00Z', dataset_kind='sales_aggregates', grain='daily', dimension='seller', rows=[row, dict(row, metric_date='2026-10-02', untaxed_amount='-10', margin_amount='-2')])
result = report.analyze(data)
assert result['net_sales'] == 90 and result['margin'] == 18 and result['margin_pct'] == 20
assert result['invoices'] is None and result['daily_mean'] == 45
for bad in [dict(data, complete=False), dict(data, rows=[row, row]), dict(data, rows=[row, dict(row, seller_id=2, currency_code='USD')])]:
    try:
        report.analyze(bad)
    except ValueError:
        pass
    else:
        raise AssertionError('Expected rejection')
zero = report.analyze(dict(data, rows=[dict(row, untaxed_amount=0)]))
assert zero['margin_pct'] is None
print('OK: credit signs, weighted margin, no inflated document count, duplicates, incomplete data, currencies and zero denominator')
