import { build, context } from "esbuild";
const watch = process.argv.includes("--watch");
const production = process.argv.includes("--production");
const common = { bundle: true, minify: production, sourcemap: !production, logLevel: "info" };
const configs = [
	{ ...common, entryPoints: ["src/extension.ts"], outfile: "dist/extension.js", platform: "node", format: "cjs", target: "node20", external: ["vscode"] },
	{ ...common, entryPoints: ["src/webview/main.ts"], outfile: "dist/webview.js", platform: "browser", format: "iife", target: "es2022" },
];
if (watch) for (const c of configs) await (await context(c)).watch();
else await Promise.all(configs.map((c) => build(c)));
