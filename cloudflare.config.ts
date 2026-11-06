import { bindings, defineConfig } from "cf/config";

export default defineConfig({
	worker: {
		// Same worker name as the original Opus deploy, so it keeps the parkour.cubityfir.st custom domain.
		name: "rooftop-flow",
		compatibilityDate: "2026-10-01",
		entrypoint: "worker/index.ts",
		observability: {
			enabled: true,
		},
		assets: {
			htmlHandling: "auto-trailing-slash",
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
