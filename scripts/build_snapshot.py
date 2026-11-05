import json,re,pathlib,datetime,argparse
parser=argparse.ArgumentParser(description="Build the public graph from a private connector-fetch bundle.")
parser.add_argument("source",type=pathlib.Path)
args=parser.parse_args()
src=json.loads(args.source.read_text())
out=pathlib.Path(__file__).resolve().parent.parent
groups=[('life','Life OS',158),('personal','Personal',300),('travel','Travel',145),('collections','Collections',50),('work','Nedbank',28),('systems','Open Engine',320),('business','Maru',340),('finance','Finance',130)]
scope=json.loads((out/'atlas-scope.json').read_text())
root_groups={r['id']:r['group'] for r in scope['roots']}
nodes={}; edges=[]; sources={}; dbstates={}; rootset=set(src['roots'])
def clean(s): return re.sub(r'<[^>]*>','',s).replace('\\|','|').strip()
def add(id,title,group,kind='page',**kw):
    if id not in nodes: nodes[id]={'id':id,'title':clean(title) or 'Untitled database view','group':group,'kind':kind,'url':'https://app.notion.com/p/'+id,**kw}
    return nodes[id]
for id in src['roots']:
    group=root_groups[id]
    s=src['fetched'][id]; add(id,s['title'],group,'entry',edited=s.get('page_last_edited_at'),evidence='Fetched entry point')
for root in src['roots']:
    for ref in src['refs'][root]:
        id=ref['url'].split('/')[-1].split('?')[0].replace('-',''); s=src['fetched'].get(id) or {}
        title=s.get('title') or ref['title']; kind='view' if ref['type']=='database' and ('View of ' in title or title in ('Untitled','')) else ref['type']
        add(id,title,nodes[root]['group'],kind,evidence='Fetched structure' if s else 'Reference on entry page',edited=s.get('page_last_edited_at'))
        edges.append({'source':root,'target':id,'type':'reference','label':'Database embedded or referenced' if ref['type']=='database' else 'Page reference'})
for url in src['fetched']:
    s=src['fetched'][url]
    if not s: continue
    text=s.get('text','')
    states=[]
    for m in re.finditer(r'<data-source\s+url="\{?\{?(collection://[^"]+?)\}?\}?">([\s\S]*?)(?=</data-source>)',text):
        uri=m[1].rstrip('}'); body=m[2]; st=re.search(r'<data-source-state>([\s\S]*?)</data-source-state>',body)
        if not st: continue
        try: state=json.loads(st[1])
        except ValueError: continue
        states.append((uri,state))
    dbstates[url]=states
    if url not in nodes and states:
        group='travel' if url in ['318f0852f6f783c7844b81ec9e20284b','1edf0852f6f782dfa3ee8188b6e27549','db7f0852f6f782168ea78171580edb46','234f0852f6f78236a2c681b71e637771','a52f0852f6f782119e8601791ca5b742','ef3f0852f6f783b7908381d8dc172a0b','a33f0852f6f7827c93828198742a310b','1a3f0852f6f783adaba601375c71a836'] else 'personal'
        add(url,s['title'],group,'database',evidence='Fetched database schema')
    if url not in nodes: continue
    nodes[url]['sources']=[u for u,_ in states]
    if nodes[url]['kind'] in ('database','view'):
        nodes[url]['status']='Schema available' if states else 'No connected source returned'
    for uri,st in states:
        if uri not in sources or nodes[url]['kind']=='database' and nodes[sources[uri]]['kind']=='view': sources[uri]=url
for id,states in dbstates.items():
    if id not in nodes: continue
    for uri,st in states:
        for name,p in st.get('schema',{}).items():
            if p.get('type')!='relation' or not p.get('dataSourceUrl'): continue
            target=p['dataSourceUrl']; tid=sources.get(target)
            if not tid:
                tid='outside:'+target.split('://')[-1]
                if tid not in nodes: nodes[tid]={'id':tid,'title':clean(name)+' (outside snapshot)','group':nodes[id]['group'],'kind':'external','url':None,'evidence':'Relation target named by property; target not fetched','status':'Outside snapshot'}
            edges.append({'source':id,'target':tid,'type':'relation','label':clean(name)})
seen=set(); dedup=[]
for e in edges:
    key=tuple(e[k] for k in ('source','target','type','label'))
    if key not in seen: seen.add(key);dedup.append(e)
data={'version':1,'capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'workspace':'Ramo Phalatsi\u2019s Notion','coverage':f"Saved structure of {len(src['roots'])} active selected entry points, their direct references, and available relation schemas. Database records and page bodies are excluded. The live feed is checked automatically when connected.",'groups':[{'id':i,'title':t,'hue':h} for i,t,h in groups],'roots':src['roots'],'nodes':list(nodes.values()),'edges':dedup,'reference':{'title':'Turn Claude Code Into Your AI Operating System (4 Layers)','author':'Pav Rusovs | Automation Orbit','url':'https://www.youtube.com/watch?v=Zs3faMCDYNs&t=8s'},'notes':['Group assignments and entry-point selection are editorial navigation choices. Reference edges mean a page embeds or links another object, not necessarily its parent.','Relation edges describe database schemas, not populated record relationships. An outside-snapshot target is not proven broken.','Deleted entries are excluded. Separate active systems retain their identities; no migration signoff is implied.','Timeline uses available last-edited metadata. Missing dates remain undated. There is no activity log.','No credentials, page bodies, record values, signed asset URLs, emails or financial balances are included. Notion access controls apply when opening a source link.']}
(out/'data.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
(out/'data.js').write_text('window.ATLAS_DATA = '+json.dumps(data,ensure_ascii=False).replace('\u2028','\\u2028').replace('\u2029','\\u2029')+';\n')
print(json.dumps({'nodes':len(nodes),'edges':len(dedup),'outside':sum(n['kind']=='external' for n in nodes.values()),'schemas':sum(bool(v) for v in dbstates.values()),'groups':len(groups)}))
