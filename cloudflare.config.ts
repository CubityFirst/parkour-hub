import { bindings, defineConfig } from "cf/config";

// Worker settings for the parkour hub (read by the `cf` CLI). The assets directory
// (./dist, written by `npm run build`) is a build setting and lives in wrangler.config.ts.

export default defineConfig({
	accountId: "d843ae90cab33e54f4d284bc65d2fd6a",
	worker: {
		// Same worker name as the original Opus deploy, so it keeps the parkour.cubityfir.st custom domain.
		name: "rooftop-flow",
		compatibilityDate: "2026-10-01",
		entrypoint: "worker/index.ts",
		// Served only on the custom domain below; the workers.dev URL stays off.
		workersDev: false,
		observability: {
			enabled: true,
		},
		assets: {
			htmlHandling: "auto-trailing-slash",
			// The worker sees every request first: it redirects moved games and adds cache/security headers.
			runWorkerFirst: true,
		},
		domains: [
			"parkour.cubityfir.st",
		],
		env: {
			ASSETS: bindings.assets(),
		},
	},
});
