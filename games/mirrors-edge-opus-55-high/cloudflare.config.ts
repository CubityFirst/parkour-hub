import { bindings, defineConfig } from "cf/config";

export default defineConfig({
	worker: {
		// parkour.cubityfir.st is served by the hub (worker "rooftop-flow"); this worker has its own domain.
		name: "opus55-parkour",
		compatibilityDate: "2026-10-01",
		entrypoint: "worker/index.ts",
		observability: {
			enabled: true,
		},
		assets: {
			notFoundHandling: "single-page-application",
			runWorkerFirst: true,
		},
		domains: [
			"opus55-parkour.cubityfir.st",
		],
		env: {
			ASSETS: bindings.assets(),
		},
	},
});
