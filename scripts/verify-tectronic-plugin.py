"""Integration checks. Reads a local integration credential, never prints it."""
import json
from pathlib import Path
import urllib.request
import urllib.error

ROOT = Path(__file__).resolve().parents[1]
URL = 'https://sqzrvzwyvjeosuvzotja.supabase.co/functions/v1/tectronic-intelligence-mcp'
KEY = (ROOT / 'tectronic-plugin-key.local').read_text(encoding='utf-8')


def call(method, params=None, token=KEY):
    headers = {'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request(URL, data=json.dumps(dict(jsonrpc='2.0', id=1, method=method, params=params or {})).encode(), headers=headers)
    with urllib.request.urlopen(req, timeout=45) as response:
        return json.load(response)


for token in ['', 'x' * 64]:
    try:
        call('tools/list', token=token)
    except urllib.error.HTTPError as error:
        assert error.code == 401
    else:
        raise AssertionError('Unauthorized access')
assert 'result' in call('initialize', dict(protocolVersion='2025-03-26', capabilities={}, clientInfo=dict(name='verification', version='1.0')))
names = [t['name'] for t in call('tools/list')['result']['tools']]
assert set(names) == {'estado_datos', 'consultar_ventas'}
state = call('tools/call', dict(name='estado_datos', arguments={}))['result']
assert not state.get('isError'), state
args = dict(start_date='2026-10-01', end_date='2026-10-22', currency='MXN', grain='daily', dimension='seller')
response = call('tools/call', dict(name='consultar_ventas', arguments=args))['result']
assert not response.get('isError'), response
data = json.loads(response['content'][0]['text'])
assert data['complete'], 'Unexpected pagination in test period'
out = ROOT / 'output/tectronic-plugin-live-test'
out.mkdir(parents=True, exist_ok=True)
(out / 'supabase-data.json').write_text(json.dumps(data), encoding='utf-8')
bad = call('tools/call', dict(name='consultar_ventas', arguments=dict(args, start_date='2026-10-23')))['result']
assert bad.get('isError')
print(json.dumps(dict(unauthorized='401', invalid_key='401', initialize='OK', tools=names, live_rows=len(data['rows']), complete=data['complete'], invalid_range='rejected')))
