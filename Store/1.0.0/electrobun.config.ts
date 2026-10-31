// @ts-expect-error Electrobun does not supply data types.
import type { ElectrobunConfig } from "electrobun";

export default {
	app: {
		name: "Playpen Store",
		identifier: "store.playpensoftware.com",
		version: "1.0.0",
	},
	build: {
		bun: {
			entrypoint: "src/bun/index.ts"
		},
		views: {
			store: {
				entrypoint: "src/store/modules/index.ts",
				allowed_protocols: ["appdata"],
			},
			updater: {
				entrypoint: "src/updater/modules/index.ts"
			}
		},
		copy: {
			"src/store": "views/store",
			"src/updater": "views/updater"
		},
		// Set bundleCEF to bundle the Crome Embeded Framework in the app
		// which will use CEF instead of the installed WebView.
		mac: {
			bundleCEF: false,
		},
		linux: {
			bundleCEF: false,
		},
		win: {
			bundleCEF: false,
			icon: "src/build/favicon.ico"
		},
	},
} satisfies ElectrobunConfig;