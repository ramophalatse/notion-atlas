import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {references, buildGraph, applyTombstones, validateGraph} from '../lib/notion.mjs';
import {validSignature, recordEvent} from '../lib/sync.mjs';

const root='a'.repeat(32), child='b'.repeat(32), deleted='c'.repeat(32), database='d'.repeat(32);
const scope={workspaceId:'workspace',integrationId:'connection',botId:'bot',workspace:'Test',roots:[{id:root,group:'life',kind:'page'},{id:deleted,group:'life',kind:'page'}],groups:[{id:'life'}],reference:{}};
test('only structural tags enter the map; prose and record values cannot leak',()=>{
  const refs=references(`Private balance R50,000. [Account](https://private.example) <mention-page url="https://app.notion.com/p/${deleted}"/> <page url="https://app.notion.com/p/${child}">Child</page><database url="https://app.notion.com/p/${database}"/>`);
  assert.deepEqual(refs.map(r=>r.id),[child,database]);
});
test('full refresh removes deleted roots and references while applying live titles',async()=>{
  const responses={
    'users/me':{id:'bot',bot:{workspace_id:'workspace'}},
    [`pages/${root}`]:{properties:{title:{type:'title',title:[{plain_text:'Renamed root'}]}}},
    [`pages/${deleted}`]:{in_trash:true,properties:{title:{type:'title',title:[{plain_text:'Deleted root'}]}}},
    [`pages/${root}/markdown`]:{markdown:`secret body <page url="https://app.notion.com/p/${child}">New page</page><page url="https://app.notion.com/p/${deleted}">Stale link</page>`},
    [`pages/${child}`]:{parent:{type:'page_id',page_id:root},properties:{title:{type:'title',title:[{plain_text:'New page'}]},balance:{number:50000}}}
  };
  const {graph,parents}=await buildGraph(scope,async path=>{assert.ok(path in responses,path);return responses[path]});
  assert.deepEqual(graph.roots,[root]);assert.equal(graph.nodes.length,2);assert.equal(graph.edges.length,1);
  assert.equal(graph.nodes[0].title,'Renamed root');assert.equal(parents[child],root);
  assert.doesNotMatch(JSON.stringify(graph),/secret body|"balance"|50000/);
  assert.throws(()=>validateGraph({...graph,nodes:[{...graph.nodes[0],properties:{}}]}));
});
test('deletion immediately masks descendants and removes dangling edges and relation targets',()=>{
  const graph={nodes:[{id:root},{id:child},{id:database},{id:'outside:source',kind:'external'}],roots:[root,database],edges:[{source:root,target:child},{source:child,target:'outside:source'}]};
  const current=applyTombstones(graph,{[child]:root},{[root]:{deleted:true}});
  assert.deepEqual(current.nodes.map(n=>n.id),[database]);assert.deepEqual(current.roots,[database]);assert.equal(current.edges.length,0);
});
test('webhook signatures reject tampering and missing credentials',()=>{
  const raw='{"type":"page.deleted"}',token='test-verification';
  const sig='sha256='+createHmac('sha256',token).update(raw).digest('hex');
  assert.ok(validSignature(raw,sig,token));assert.ok(!validSignature(raw+' ',sig,token));assert.ok(!validSignature(raw,sig,''));
});
test('deleting one source keeps its live multi-source database container',()=>{
  const graph={nodes:[{id:database,sources:['collection://one','collection://two']}],roots:[database],edges:[]};
  const current=applyTombstones(graph,{}, {one:{deleted:true}});
  assert.equal(current.nodes.length,1);assert.deepEqual(current.nodes[0].sources,['collection://two']);
});
test('out-of-order deletions cannot override newer restores or cross-workspace events',async()=>{
  let data={},etag=0;
  const s={async getWithMetadata(){return etag?{data:structuredClone(data),etag:String(etag)}:null},async setJSON(key,next){if(key==='tombstones'){data=structuredClone(next);etag++;}return {modified:true,etag:String(etag)}}};
  const event={workspace_id:'workspace',integration_id:'connection',entity:{id:root},type:'page.undeleted',timestamp:'2026-11-05T10:00:00Z'};
  await recordEvent(s,event,scope);await recordEvent(s,{...event,type:'page.deleted',timestamp:'2026-11-05T09:59:00Z'},scope);
  assert.equal(data[root].deleted,false);assert.equal(await recordEvent(s,{...event,workspace_id:'other'},scope),false);
  assert.equal(await recordEvent(s,{...event,integration_id:'bot'},scope),false);
});
test('failed Notion reads and failed pagination abort publication',async()=>{
  await assert.rejects(buildGraph(scope,async path=>path==='users/me'?{id:'wrong',bot:{workspace_id:'workspace'}}:{}),/Unexpected Notion/);
  await assert.rejects(buildGraph({...scope,roots:[scope.roots[0]]},async path=>path==='users/me'?{id:'bot',bot:{workspace_id:'workspace'}}:path.endsWith('/markdown')?{truncated:true}:path.includes('/children')?{has_more:true,next_cursor:null}:{}),/Incomplete/);
});
