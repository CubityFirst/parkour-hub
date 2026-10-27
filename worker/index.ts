/**
 * Cloudflare Worker for the parkour hub.
 *
 * Everything is a static build served from Workers Static Assets; this worker
 * only adds caching and security headers on top.
 */
interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

// Games that were replaced keep their old URL working.
const MOVED: [RegExp, string][] = [
  [/^\/haiku(\/.*)?$/, '/haiku-high/'], // original Haiku 5.5 build, replaced by the bench runs
  [/^\/sonnet(\/.*)?$/, '/sonnet-high/'], // original Sonnet 5.5 build, replaced by the bench runs
];

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    for (const [from, to] of MOVED) {
      if (from.test(url.pathname)) return Response.redirect(new URL(to, url).toString(), 301);
    }
    const res = await env.ASSETS.fetch(request);
    const headers = new Headers(res.headers);
    if (/^\/[^/]+\/assets\//.test(url.pathname)) {
      // Vite emits content-hashed filenames under each game's assets/ - safe to cache forever.
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (res.headers.get('Content-Type')?.includes('text/html')) {
      headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
    }
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  },
};
