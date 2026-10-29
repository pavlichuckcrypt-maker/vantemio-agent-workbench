const generationPath = value => /\/(?:chat\/completions|responses|messages|(?:[^/]+:)?(?:streamGenerateContent|generateContent))\/?$/i.test(value);
const generationBody = body => body && typeof body === 'object' && typeof body.model === 'string' && (Array.isArray(body.messages) || Object.hasOwn(body, 'input') || Array.isArray(body.contents));

// A native request that misses its context hooks must never silently send full history.
// This guard does not authenticate a binding; the existing boundary still does that.
export async function assertGenerationBinding(input, init = {}, { headerName = 'x-native-context-binding' } = {}) {
  const request = typeof Request !== 'undefined' && input instanceof Request ? input : null;
  const method = String(init.method ?? request?.method ?? 'GET').toUpperCase();
  if (method !== 'POST') return;
  const headers = new Headers(init.headers ?? request?.headers);
  if (headers.get(headerName)?.trim()) return;
  const url = new URL(typeof input === 'string' ? input : input.url ?? input.href);
  const knownGenerationPath = generationPath(url.pathname);
  let raw = init.body;
  if (raw === undefined && request) {
    if (!knownGenerationPath && !headers.get('content-type')?.includes('application/json')) return;
    try { raw = await request.clone().text(); }
    catch { if (knownGenerationPath) throw Error('NATIVE_GENERATION_CONTEXT_BINDING_REQUIRED'); return; }
  }
  let body;
  if (typeof raw === 'string') { try { body = JSON.parse(raw); } catch {} }
  if (knownGenerationPath || generationBody(body)) throw Error('NATIVE_GENERATION_CONTEXT_BINDING_REQUIRED');
}
