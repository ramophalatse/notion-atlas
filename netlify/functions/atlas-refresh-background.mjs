import {authorised, refresh} from '../../lib/sync.mjs';
export default async request => {
  if (request.method !== 'POST' || !authorised(request)) return new Response(null, {status: 401});
  // Netlify retries failed background invocations. No private response is logged.
  await refresh();
};
