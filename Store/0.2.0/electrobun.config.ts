// @ts-expect-error Electrobun does not supply data types.
import type { ElectrobunConfig } from "electrobun";

export default {
	app: {
		name: "Nivix Store",
		identifier: "store.nivixtech.com",
		version: "0.2.0",
	},
	scripts: {
		preBuild: "scripts/pre-build.ts"
	},
	build: {
		// Set bytecode to false to disable obfuscation/javascript compilation
		cottontail: {
			bytecode: true,
		},
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
			icon: "src/assets/favicon.ico"
		},
	},
} satisfies ElectrobunConfig;