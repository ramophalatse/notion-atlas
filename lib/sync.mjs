import {getStore} from '@netlify/blobs';
import {readFile} from 'node:fs/promises';
import {createHmac, timingSafeEqual} from 'node:crypto';
import {buildGraph, notionClient, applyTombstones, compact} from './notion.mjs';

export const store = () => getStore({name: 'atlas-sync', consistency: 'strong'});
export const loadScope = async () => JSON.parse(await readFile('atlas-scope.json', 'utf8'));
export const authorised = request => safeEqual(request.headers.get('authorization'), `Bearer ${process.env.ATLAS_SYNC_SECRET}`) && !!process.env.ATLAS_SYNC_SECRET;
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const aa = Buffer.from(a), bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
export function validSignature(body, signature, token) {
  return !!token && safeEqual(signature, `sha256=${createHmac('sha256', token).update(body).digest('hex')}`);
}
export async function mutate(s, key, fn) {
  for (let i = 0; i < 12; i++) {
    const old = await s.getWithMetadata(key, {type: 'json'});
    const data = fn(old?.data || {});
    const result = await s.setJSON(key, data, old ? {onlyIfMatch: old.etag} : {onlyIfNew: true});
    if (result.modified) return data;
  }
  throw new Error('Concurrent sync state update; retry required');
}
export async function kick(baseURL) {
  const r = await fetch(new URL('/.netlify/functions/atlas-refresh-background', baseURL), {
    method: 'POST', headers: {authorization: `Bearer ${process.env.ATLAS_SYNC_SECRET}`}, signal: AbortSignal.timeout(20000)
  });
  if (!r.ok) throw new Error(`Unable to start refresh (${r.status})`);
}
export async function refresh(s = store(), get = notionClient(process.env.NOTION_TOKEN), scope) {
  const lease = await s.getWithMetadata('lease', {type: 'json'});
  if (lease?.data.expires > Date.now()) return {busy: true};
  const lock = await s.setJSON('lease', {expires: Date.now() + 12 * 60 * 1000}, lease ? {onlyIfMatch: lease.etag} : {onlyIfNew: true});
  if (!lock.modified) return {busy: true};
  try {
    const deadline = Date.now() + 10 * 60 * 1000;
    let summary;
    for (let pass = 0; pass < 3; pass++) {
      const revision = await s.get('pending', {type: 'json'});
      const started = Date.now();
      const current = await buildGraph(scope || await loadScope(), get);
      const active = new Set(current.graph.nodes.map(n => n.id));
      const tombstones = await mutate(s, 'tombstones', old => {
        for (const [id, value] of Object.entries(old)) if (value.deleted && active.has(id) && Date.parse(value.timestamp) < started) {
          old[id] = {deleted: false, timestamp: new Date(started).toISOString()};
        }
        return old;
      });
      current.graph = applyTombstones(current.graph, current.parents, tombstones);
      const checkedAt = new Date().toISOString();
      await s.setJSON('snapshot', {...current, started, checkedAt});
      await s.setJSON('health', {lastSuccessAt: checkedAt, lastAttemptAt: checkedAt, failed: false});
      summary = {nodes: current.graph.nodes.length, edges: current.graph.edges.length};
      const latest = await s.get('pending', {type: 'json'});
      if (latest?.revision === revision?.revision || Date.now() > deadline) break;
    }
    return summary;
  } catch (e) {
    await mutate(s, 'health', old => ({...old, lastAttemptAt: new Date().toISOString(), failed: true}));
    throw e;
  } finally {
    await s.setJSON('lease', {expires: 0}, {onlyIfMatch: lock.etag});
  }
}
export async function publicSnapshot(s = store()) {
  const [snapshot, tombstones, health] = await Promise.all([
    s.get('snapshot', {type: 'json'}), s.get('tombstones', {type: 'json'}), s.get('health', {type: 'json'})
  ]);
  if (!snapshot) return null;
  const graph = applyTombstones(snapshot.graph, snapshot.parents, tombstones || {});
  return {...graph, sync: {checkedAt: snapshot.checkedAt, status: health?.failed ? 'delayed' : 'connected', intervalSeconds: 15}};
}
export async function recordEvent(s, event, scope) {
  if (compact(event.workspace_id) !== compact(scope.workspaceId) || compact(event.integration_id) !== compact(scope.integrationId)) return false;
  if (!/^((page|database|data_source|view)\.)/.test(event.type || '') || !event.entity?.id || !Number.isFinite(Date.parse(event.timestamp))) return false;
  if (/\.(deleted|undeleted)$/.test(event.type)) {
    const id = compact(event.entity.id);
    await mutate(s, 'tombstones', old => {
      if (!old[id] || Date.parse(event.timestamp) > Date.parse(old[id].timestamp)) old[id] = {deleted: event.type.endsWith('.deleted'), timestamp: event.timestamp};
      return old;
    });
  }
  await s.setJSON('pending', {revision: event.id || event.timestamp});
  return true;
}
