"""Check the public graph, field boundary, and duplicate browser payload."""
import json,pathlib

root=pathlib.Path(__file__).resolve().parent.parent
data=json.loads((root/'data.json').read_text())
script=(root/'data.js').read_text()
assert script.startswith('window.ATLAS_DATA = ') and script.endswith(';\n')
assert json.loads(script[len('window.ATLAS_DATA = '):-2])==data
allowed={'id','title','group','kind','url','edited','evidence','sources','status'}
ids={n['id'] for n in data['nodes']}
assert len(ids)==len(data['nodes'])
assert all(r in ids for r in data['roots'])
groups={g['id'] for g in data['groups']}
for n in data['nodes']:
    assert not set(n)-allowed,(n['id'],set(n)-allowed)
    assert n['group'] in groups
    assert isinstance(n['title'],str) and n['title']
    assert not n['url'] or n['url'].startswith('https://app.notion.com/p/')
for e in data['edges']:
    assert e['source'] in ids and e['target'] in ids
    assert e['type'] in {'reference','relation'}
assert all('token' not in n and 'content' not in n and 'properties' not in n for n in data['nodes'])
print(f"PASS: {len(ids)} unique graph nodes; {len(data['edges'])} valid edges; public fields allowlisted; browser payload identical.")
