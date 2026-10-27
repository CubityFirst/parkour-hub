/**
 * Cloudflare Worker for ROOFTOP FLOW.
 *
 * The game is a fully static Vite build served from Workers Static Assets.
 * This worker only adds caching and security headers on top.
 */
interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const res = await env.ASSETS.fetch(request);
    const url = new URL(request.url);
    const headers = new Headers(res.headers);
    if (url.pathname.startsWith('/assets/')) {
      // Vite emits content-hashed filenames - safe to cache forever.
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
