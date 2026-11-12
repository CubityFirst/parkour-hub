import { defineWranglerConfig } from "wrangler/experimental-config";

// Build settings for `cf build` / `cf dev` / `cf deploy` (Worker settings and bindings
// live in cloudflare.config.ts).
export default defineWranglerConfig({
	// The hub build (`npm run build`, scripts/build.mjs) writes every game and the landing page here.
	assetsDirectory: "./dist",
	// Match the previous `wrangler deploy` default (no source map upload).
	uploadSourceMaps: false,
});
