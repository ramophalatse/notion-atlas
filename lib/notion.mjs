// All Notion requests are read-only. Bodies are processed in memory, never stored.
export const compact = value => String(value || '').replace(/-/g, '');
export const titleText = rich => (rich || []).map(t => t.plain_text ?? t.text?.content ?? '').join('');
export const removed = obj => !!(obj?.in_trash || obj?.archived || obj?.is_archived);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

export function notionClient(token, transport = fetch, interval = 350) {
  let last = 0;
  return async function get(path, optional = false) {
    for (let attempt = 0; attempt < 5; attempt++) {
      await wait(Math.max(0, last + interval - Date.now()));
      last = Date.now();
      const r = await transport(`https://api.notion.com/v1/${path}`, {
        headers: {Authorization: `Bearer ${token}`, 'Notion-Version': '2026-03-11'},
        signal: AbortSignal.timeout(25000)
      });
      if (optional && (r.status === 404 || r.status === 403)) return null;
      if (r.status === 429 || r.status >= 500) {
        await wait(Math.max(Number(r.headers.get('retry-after') || 0) * 1000, 1000 * 2 ** attempt));
        continue;
      }
      if (!r.ok) throw new Error(`Notion read failed (${r.status})`);
      return r.json();
    }
    throw new Error('Notion read retries exhausted');
  };
}

// Parse structural tags only. Ordinary prose, URLs, property values and mentions
// are deliberately excluded, matching the original selected-entry-point scope.
export function references(markdown) {
  const refs = new Map();
  for (const m of markdown.matchAll(/<(page|database)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/g)) {
    const url = /\burl="([^"]+)"/.exec(m[2])?.[1];
    const id = compact(url?.match(/([a-f0-9-]{32,36})(?:[?/#]|$)/i)?.[1]);
    if (!/^[a-f0-9]{32}$/i.test(id)) continue;
    refs.set(id, {id, kind: m[1], title: (m[3] || '').replace(/<[^>]*>/g, '').trim()});
  }
  return [...refs.values()];
}

export async function buildGraph(scope, get, now = new Date().toISOString()) {
  const identity = await get('users/me');
  if (compact(identity.bot?.workspace_id) !== compact(scope.workspaceId) ||
      compact(identity.id) !== compact(scope.botId)) throw new Error('Unexpected Notion connection');
  const nodes = new Map(), edges = [], parents = {}, objects = new Map(), sources = new Map(), relations = [];
  const rootIds = new Set(scope.roots.map(r => r.id));
  const blocked = new Set(), omittedBlocks = new Set();
  async function read(id, kind) {
    if (objects.has(id)) return objects.get(id);
    // The API exposes linked database containers through the database endpoint.
    let obj = await get(`${kind === 'page' ? 'pages' : ['view','block'].includes(kind) ? 'blocks' : 'databases'}/${id}`, true);
    if (!obj && kind !== 'page') obj = await get(`blocks/${id}`, true);
    if (obj && removed(obj)) obj = null;
    objects.set(id, obj);
    if (!obj) blocked.add(id);
    return obj;
  }
  async function add(id, group, kind, fallback = '') {
    if (nodes.has(id)) return nodes.get(id);
    const obj = await read(id, kind);
    if (!obj) return null;
    const p = obj.parent;
    if (p && p.type !== 'workspace') parents[id] = compact(p[p.type]);
    const title = titleText(obj.title) || titleText(Object.values(obj.properties || {}).find(p => p.type === 'title')?.title) ||
      obj.child_database?.title || fallback || 'Untitled database view';
    const node = {id, title, group, kind: rootIds.has(id) ? 'entry' : kind, url: `https://app.notion.com/p/${id}`,
      edited: obj.last_edited_time || null, evidence: ['view','block'].includes(kind) ? 'Block checked; Notion API does not expose this view or block in full' : 'Checked with Notion API', sources: []};
    nodes.set(id, node);
    if (kind === 'database') {
      // Database properties contain schemas, never database records.
      for (const ds of obj.data_sources || []) {
        const schema = await get(`data_sources/${ds.id}`, true);
        if (!schema || removed(schema)) continue;
        const sid = compact(ds.id);
        node.sources.push(`collection://${ds.id}`);
        sources.set(sid, id);
        for (const [name, prop] of Object.entries(schema.properties || {})) {
          if (prop.type === 'relation' && prop.relation?.data_source_id) relations.push({source: id, targetSource: compact(prop.relation.data_source_id), label: name});
        }
      }
      node.status = node.sources.length ? 'Schema available' : 'No connected source returned';
    }
    return node;
  }
  async function blockReferences(id, seen = new Set()) {
    if (seen.has(id)) return [];
    if (seen.size > 1000) throw new Error('Entry-point structure exceeds crawl limit');
    seen.add(id);
    const refs = [];
    let cursor;
    do {
      const result = await get(`blocks/${id}/children?page_size=100${cursor ? '&start_cursor='+encodeURIComponent(cursor) : ''}`);
      for (const block of result.results || []) {
        if (removed(block)) continue;
        const bid = compact(block.id);
        if (block.type === 'child_page') refs.push({id: bid, kind: 'page', title: block.child_page.title});
        else if (block.type === 'child_database') refs.push({id: bid, kind: 'database', title: block.child_database.title});
        else if (block.type === 'link_to_page') {
          const link = block.link_to_page;
          if (['page_id','database_id'].includes(link.type)) refs.push({id: compact(link[link.type]), kind: link.type === 'page_id' ? 'page' : 'database', title: ''});
        } else if (block.type === 'unsupported') {
          if (scope.viewHints?.[bid]) refs.push({id: bid, kind: 'view', title: scope.viewHints[bid]});
          else omittedBlocks.add(bid);
        }
        else if (block.has_children) refs.push(...await blockReferences(compact(block.synced_block?.synced_from?.block_id || block.id), seen));
      }
      cursor = result.has_more ? result.next_cursor : null;
      if (result.has_more && !cursor) throw new Error('Incomplete block pagination');
    } while (cursor);
    return refs;
  }
  const roots = [];
  for (const root of scope.roots) {
    const n = await add(root.id, root.group, root.kind);
    if (!n) continue;
    roots.push(root.id);
    if (root.kind === 'database') continue;
    const md = await get(`pages/${root.id}/markdown`);
    const refs = md.truncated || md.unknown_block_ids?.length ? await blockReferences(root.id) : references(md.markdown || '');
    for (const ref of refs) {
      const dest = await add(ref.id, root.group, ref.kind, ref.title);
      if (dest) edges.push({source: root.id, target: dest.id, type: 'reference', label: ref.kind === 'page' ? 'Page reference' : 'Database embedded or referenced'});
    }
  }
  for (const extra of scope.supplemental || []) await add(extra.id, extra.group, extra.kind);
  // Remove children whose archived/missing parent is known in this crawl, even
  // when a different active page still contains a stale link to the child.
  let changed = true;
  while (changed) {
    changed = false;
    for (const [id, parent] of Object.entries(parents)) if (blocked.has(parent) && !blocked.has(id)) {blocked.add(id); changed = true;}
  }
  for (const id of blocked) nodes.delete(id);
  for (const rel of relations) {
    if (!nodes.has(rel.source)) continue;
    let target = sources.get(rel.targetSource);
    if (target && !nodes.has(target)) continue;
    if (!target) {
      target = `outside:${rel.targetSource}`;
      if (!nodes.has(target)) nodes.set(target, {id: target, title: `${rel.label} (outside snapshot)`, group: nodes.get(rel.source).group,
        kind: 'external', url: null, evidence: 'Relation target named by schema; target outside mapped scope', status: 'Outside snapshot'});
    }
    edges.push({source: rel.source, target, type: 'relation', label: rel.label});
  }
  const unique = new Map(edges.filter(e => nodes.has(e.source) && nodes.has(e.target)).map(e => [JSON.stringify(e), e]));
  const graph = {version: 1, capturedAt: now, workspace: scope.workspace, groups: scope.groups,
    roots: roots.filter(id => nodes.has(id)), nodes: [...nodes.values()], edges: [...unique.values()], reference: scope.reference,
    coverage: 'Automatically refreshed structure of the selected entry points, their direct page/database references and available relation schemas. Database records and page bodies are excluded.',
    notes: ['The selected entry points and area assignments define the public map; this is not a crawl of every workspace page or database record.',
      'Reference edges mean linked or embedded objects. Relation edges describe schemas, not populated record relationships.',
      `Notion does not expose ${omittedBlocks.size} non-page blocks in full through its API. These are omitted; known linked views retain their last observed title with an explicit evidence label.`,
      'Updates follow Notion webhook delivery, with a five-minute recovery check. Open maps check for new data every 15 seconds.',
      'No credentials, page bodies, record values, signed asset URLs, emails or balances are published. Source links retain Notion permissions.']};
  validateGraph(graph);
  return {graph, parents};
}

export function validateGraph(graph) {
  const allowed = new Set(['id', 'title', 'group', 'kind', 'url', 'edited', 'evidence', 'sources', 'status']);
  const ids = new Set(graph.nodes.map(n => n.id)), groups = new Set(graph.groups.map(g => g.id));
  if (ids.size !== graph.nodes.length) throw new Error('Duplicate graph nodes');
  for (const n of graph.nodes) if (Object.keys(n).some(k => !allowed.has(k)) || !groups.has(n.group) ||
      !n.title || (n.url && !/^https:\/\/app\.notion\.com\/p\/[a-f0-9]{32}$/.test(n.url))) throw new Error('Invalid public metadata');
  if (graph.roots.some(id => !ids.has(id)) || graph.edges.some(e => !ids.has(e.source) || !ids.has(e.target) || !['reference', 'relation'].includes(e.type))) throw new Error('Invalid graph references');
}

export function applyTombstones(graph, parents, tombstones) {
  const blocked = new Set(Object.entries(tombstones).filter(([, v]) => v.deleted).map(([id]) => id));
  let changed = true;
  while (changed) {
    changed = false;
    for (const [id, parent] of Object.entries(parents)) if (blocked.has(parent) && !blocked.has(id)) {blocked.add(id); changed = true;}
  }
  const nodes = graph.nodes.filter(n => !blocked.has(n.id)).map(n => n.sources ? {...n, sources: n.sources.filter(s => !blocked.has(compact(s.split('://')[1])))} : n);
  const ids = new Set(nodes.map(n => n.id));
  const edges = graph.edges.filter(e => ids.has(e.source) && ids.has(e.target) && !blocked.has(e.target.replace('outside:', '')));
  const connected = new Set(edges.flatMap(e => [e.source, e.target]));
  return {...graph, nodes: nodes.filter(n => n.kind !== 'external' || connected.has(n.id)), edges, roots: graph.roots.filter(id => ids.has(id))};
}
