import {publicSnapshot} from '../../lib/sync.mjs';
export default async request => {
  const headers = {'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store', 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff'};
  if (request.method !== 'GET') return new Response(null, {status: 405, headers});
  try {
    const data = await publicSnapshot();
    return new Response(JSON.stringify(data || {error: 'Initial sync pending'}), {status: data ? 200 : 503, headers});
  } catch { return new Response(JSON.stringify({error: 'Sync temporarily unavailable'}), {status: 503, headers}); }
};
