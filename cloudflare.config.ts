import { bindings, defineConfig } from "cf/config";

export default defineConfig({
	worker: {
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
