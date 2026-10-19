// Dev harness: the real compose form in a browser, talking to a real app.
//   BP_API_URL=http://localhost:4322 BP_TEST_KEY=bp_… node test/browser/serve.mjs
// then open http://localhost:4360. The key never reaches the page.
import { build } from "esbuild";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const api = process.env.BP_API_URL, key = process.env.BP_TEST_KEY, port = Number(process.env.PORT ?? 4360);
if (!api || !key) { console.error("Set BP_API_URL and BP_TEST_KEY"); process.exit(1); }
await build({ entryPoints: [path.join(root, "src/webview/main.ts")], outfile: path.join(root, "dist/webview.js"), bundle: true, format: "iife", platform: "browser", target: "es2022" });
const host = (await build({ entryPoints: [path.join(root, "test/browser/host.ts")], bundle: true, write: false, format: "iife", platform: "browser", target: "es2022" })).outputFiles[0].text;

// VS Code's webview theme variables, dark theme, so the form renders as it does in the editor.
const theme = `:root{--vscode-foreground:#ccc;--vscode-editor-background:#1f1f1f;--vscode-font-family:-apple-system,system-ui,sans-serif;--vscode-font-size:13px;--vscode-input-foreground:#ccc;--vscode-input-background:#313131;--vscode-input-border:#3c3c3c;--vscode-focusBorder:#0078d4;--vscode-badge-background:#616161;--vscode-badge-foreground:#f8f8f8;--vscode-inputValidation-errorBackground:#5a1d1d;--vscode-errorForeground:#f85149;--vscode-inputValidation-errorBorder:#be1100;--vscode-descriptionForeground:#9d9d9d;--vscode-editorWarning-foreground:#cca700;--vscode-button-foreground:#fff;--vscode-button-background:#0078d4;--vscode-button-hoverBackground:#026ec1;--vscode-button-secondaryForeground:#ccc;--vscode-button-secondaryBackground:#313131;--vscode-textLink-foreground:#4daafc;--vscode-testing-iconPassed:#73c991}`;
const formPage = `<!doctype html><html><head><meta charset="utf-8"><style>${theme}</style><link rel="stylesheet" href="/media/compose.css"></head><body><main id="app"></main>
<script>let s;try{s=JSON.parse(sessionStorage.getItem("bp")||"null")}catch{};window.acquireVsCodeApi=()=>({postMessage:m=>parent.postMessage(m,"*"),getState:()=>s,setState:v=>{s=v;sessionStorage.setItem("bp",JSON.stringify(v))}});</script>
<script src="/dist/webview.js"></script></body></html>`;
const shell = `<!doctype html><html><head><meta charset="utf-8"><title>Compose harness</title><style>body{margin:0;display:grid;grid-template-columns:1fr 340px;height:100vh;background:#181818;color:#ccc;font:12px ui-monospace,monospace}iframe{border:0;width:100%;height:100%}pre{margin:0;padding:8px;overflow:auto;white-space:pre-wrap;border-left:1px solid #333}</style></head>
<body><iframe id="form" src="/form${"${location.search}"}"></iframe><pre id="log"></pre><script>${host}</script></body></html>`;

const types = { ".js": "text/javascript", ".css": "text/css", ".png": "image/png" };
http.createServer((req, res) => {
	const url = new URL(req.url, "http://x");
	if (url.pathname.startsWith("/api/")) {
		const up = http.request(api + req.url, { method: req.method, headers: { ...req.headers, host: new URL(api).host, authorization: `Bearer ${key}` } }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
		return req.pipe(up);
	}
	if (url.pathname === "/") { res.writeHead(200, { "Content-Type": "text/html" }); return res.end(shell.replace("${location.search}", url.search)); }
	if (url.pathname === "/form") { res.writeHead(200, { "Content-Type": "text/html" }); return res.end(formPage); }
	const file = url.pathname === "/fixture/cover.png" ? path.join(root, "test/fixtures/workspace/img/cover.png")
		: /^\/(dist\/webview\.js|media\/compose\.css)$/.test(url.pathname) ? path.join(root, url.pathname) : null;
	if (!file) { res.writeHead(404); return res.end(); }
	res.writeHead(200, { "Content-Type": types[path.extname(file)] ?? "application/octet-stream" });
	fs.createReadStream(file).pipe(res);
}).listen(port, "127.0.0.1", () => console.log(`Compose harness on http://localhost:${port}`));
