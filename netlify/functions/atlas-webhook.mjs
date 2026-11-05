import {store, safeEqual, validSignature, loadScope, recordEvent, kick} from '../../lib/sync.mjs';
export default async request => {
  if (request.method !== 'POST') return new Response(null, {status: 405});
  const body = await request.text();
  if (body.length > 100000) return new Response(null, {status: 413});
  let event;
  try { event = JSON.parse(body); } catch { return new Response(null, {status: 400}); }
  const s = store();
  if (event.verification_token) {
    if (!process.env.ATLAS_SETUP_SECRET || !safeEqual(new URL(request.url).searchParams.get('setup'), process.env.ATLAS_SETUP_SECRET)) {
      console.warn('Atlas webhook verification rejected: invalid setup challenge');
      return new Response(null, {status: 401});
    }
    // Never replace an established signing token through an unauthenticated body.
    await s.setJSON('verification', {token: event.verification_token}, {onlyIfNew: true});
    console.info('Atlas webhook verification challenge received');
    return new Response(null, {status: 200});
  }
  const verification = await s.get('verification', {type: 'json'});
  const signatureOK = validSignature(body, request.headers.get('x-notion-signature'), verification?.token);
  const scope = await loadScope();
  // Only routing metadata, never content, authors, request bodies or signatures.
  await s.setJSON('last-delivery', {receivedAt: new Date().toISOString(), type: event.type,
    workspaceId: event.workspace_id, integrationId: event.integration_id, signatureOK});
  if (!signatureOK) return new Response(null, {status: 401});
  if (await recordEvent(s, event, scope)) {
    console.info('Atlas structural update received:', event.type);
    await kick(request.url);
  }
  return new Response(null, {status: 200});
};
