const assert = require("assert");
const http = require("http");
const vscode = require("vscode");

const LIVE = !!process.env.BP_API_URL && !!process.env.BP_TEST_KEY;

// A stand-in for the API when not running live. It records what it was sent.
function standIn() {
	const seen = [];
	let nextPost = 100;
	const posts = [{ id: 1, content: "An older post", status: "failed", postPlatforms: [{ platform: "x", status: "failed", errorMessage: "Rejected" }] }];
	const channels = [
		{ id: 1, platform: "x", accountName: "Fake X", isActive: true },
		{ id: 2, platform: "linkedin", accountName: "Fake LinkedIn", isActive: true },
		{ id: 3, platform: "instagram", accountName: "Fake Instagram", isActive: true },
		{ id: 4, platform: "threads", accountName: "Fake Threads", isActive: true },
		{ id: 5, platform: "mastodon", accountName: "Fake Mastodon", isActive: true, needsReconnect: true },
	];
	const server = http.createServer((req, res) => {
		const chunks = [];
		req.on("data", (c) => chunks.push(c));
		req.on("end", () => {
			const raw = Buffer.concat(chunks);
			const url = new URL(req.url, "http://x");
			const key = `${req.method} ${url.pathname}`;
			seen.push({ key, auth: req.headers.authorization, body: req.headers["content-type"]?.startsWith("application/json") ? JSON.parse(raw.toString() || "{}") : raw.length });
			const send = (s, b) => { res.writeHead(s, { "Content-Type": "application/json" }); res.end(JSON.stringify(b)); };
			if (req.headers.authorization !== "Bearer bp_standin_key_0123456789") return send(401, { error: "Unauthorized" });
			if (key === "GET /api/channels") return send(200, { channels });
			if (key === "GET /api/posts") return send(200, { posts });
			if (key === "POST /api/media") return send(201, { file: { id: 77 } });
			if (key === "POST /api/posts") { const p = JSON.parse(raw.toString()); const id = nextPost++; posts.unshift({ id, content: p.content, status: p.status, postPlatforms: [] }); return send(201, { id }); }
			if (/^POST \/api\/posts\/\d+\/(publish|retry)$/.test(key)) return send(200, { ok: true });
			send(404, { error: "Not found" });
		});
	});
	return new Promise((r) => server.listen(0, "127.0.0.1", () => r({ server, seen, url: `http://localhost:${server.address().port}`, key: "bp_standin_key_0123456789" })));
}

describe("BulkPublish extension", function () {
	let api, env, stub;

	before(async () => {
		stub = LIVE ? null : await standIn();
		env = LIVE ? { url: process.env.BP_API_URL, key: process.env.BP_TEST_KEY } : stub;
		await vscode.workspace.getConfiguration("bulkpublish").update("apiUrl", env.url, vscode.ConfigurationTarget.Global);
		const ext = vscode.extensions.all.find((e) => e.packageJSON.name === "bulkpublish");
		api = await ext.activate();
		await vscode.commands.executeCommand("bulkpublish.signOut");
	});
	after(() => stub?.server.close());

	it("registers every command", async () => {
		const all = await vscode.commands.getCommands(true);
		for (const c of ["setApiKey", "signOut", "compose", "refresh", "retryPost", "shareSelection", "shareFile"]) assert.ok(all.includes(`bulkpublish.${c}`), c);
	});

	it("rejects a bad key and keeps nothing", async () => {
		assert.strictEqual(await vscode.commands.executeCommand("bulkpublish.setApiKey", "bp_wrong_key_0000000000000"), false);
		assert.strictEqual(await api.session.key(), undefined);
	});

	it("stores a good key in secret storage, not settings", async () => {
		assert.strictEqual(await vscode.commands.executeCommand("bulkpublish.setApiKey", env.key), true);
		assert.strictEqual(await api.session.key(), env.key);
		const cfg = JSON.stringify(vscode.workspace.getConfiguration("bulkpublish"));
		assert.ok(!cfg.includes(env.key), "key must not appear in settings");
	});

	it("lists channels and recent posts in the sidebar", async () => {
		await api.tree.refresh();
		const groups = await api.tree.getChildren();
		assert.deepStrictEqual(groups.map((g) => g.id), ["channels", "posts"]);
		const chans = await api.tree.getChildren(groups[0]);
		const names = chans.map((n) => api.tree.getTreeItem(n).label);
		assert.ok(names.includes("Fake X") && names.includes("Fake Mastodon" + (LIVE ? " (reconnect)" : "")), names.join(","));
		const md = chans.find((n) => String(api.tree.getTreeItem(n).label).startsWith("Fake Mastodon"));
		assert.match(String(api.tree.getTreeItem(md).tooltip), /needs reconnecting/);
	});

	it("opens compose, receives channels, and saves a draft with skip warnings", async () => {
		await vscode.commands.executeCommand("bulkpublish.compose");
		const panel = api.composePanel();
		await waitFor(() => panel.sent.some((m) => m.type === "channels"));
		const ids = api.tree.channels.map((c) => c.id);
		const byName = (n) => api.tree.channels.find((c) => c.name.startsWith(n)).id;
		const res = await panel.send({ caption: "Draft from the editor test", attachment: null, mode: "draft", when: "", timezone: "UTC", targetIds: [byName("Fake X"), byName("Fake Instagram"), byName("Fake Mastodon")] });
		assert.ok(res.ok, res.text);
		assert.match(res.text, /Draft saved for Fake X\. Skipped: Fake Instagram \(needs an image or a video\), Fake Mastodon.*\(needs reconnecting in BulkPublish\)/);
		assert.ok(ids.length >= 5);
	});

	it("schedules in a time zone", async () => {
		const panel = api.composePanel();
		const x = api.tree.channels.find((c) => c.platform === "x").id;
		const res = await panel.send({ caption: "Scheduled from the editor test", attachment: null, mode: "schedule", when: "2030-06-01T09:30", timezone: "Europe/London", targetIds: [x] });
		assert.ok(res.ok, res.text);
		if (stub) {
			const body = stub.seen.filter((s) => s.key === "POST /api/posts").at(-1).body;
			assert.strictEqual(body.scheduledAt, "2030-06-01T08:30:00.000Z");
			assert.strictEqual(body.status, "scheduled");
		}
		const past = await panel.send({ caption: "x", attachment: null, mode: "schedule", when: "2001-01-01T00:00", timezone: "UTC", targetIds: [x] });
		assert.strictEqual(past.ok, false);
	});

	it("shares a Markdown file: front matter caption and first image attached", async () => {
		const file = vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, "post.md");
		await vscode.commands.executeCommand("bulkpublish.shareFile", file);
		const panel = api.composePanel();
		const pre = panel.sent.filter((m) => m.type === "prefill").at(-1);
		assert.strictEqual(pre.caption, "Shipping the editor extension\n\nShare posts without leaving your editor.");
		assert.strictEqual(pre.attachment.name, "cover.png");
		assert.strictEqual(pre.attachment.mimeType, "image/png");
		const th = api.tree.channels.find((c) => c.platform === "threads").id;
		const ig = api.tree.channels.find((c) => c.platform === "instagram").id;
		const res = await panel.send({ caption: pre.caption, attachment: pre.attachment, mode: "now", when: "", timezone: "UTC", targetIds: [th, ig] });
		assert.ok(res.ok, res.text);
		assert.match(res.text, /Publishing to Fake Threads, Fake Instagram\./);
		if (stub) {
			const body = stub.seen.filter((s) => s.key === "POST /api/posts").at(-1).body;
			assert.deepStrictEqual(body.postTypeOverrides, { threads: "image" });
			assert.deepStrictEqual(body.mediaFiles, [77]);
			assert.ok(stub.seen.some((s) => /\/publish$/.test(s.key)));
		}
	});

	it("shares a selection", async () => {
		const doc = await vscode.workspace.openTextDocument({ content: "line one\nshare me please\nline three" });
		const ed = await vscode.window.showTextDocument(doc);
		ed.selection = new vscode.Selection(1, 0, 1, 15);
		await vscode.commands.executeCommand("bulkpublish.shareSelection");
		const pre = api.composePanel().sent.filter((m) => m.type === "prefill").at(-1);
		assert.strictEqual(pre.caption, "share me please");
	});

	it("retries a failed post from the sidebar", async function () {
		await api.tree.refresh();
		const groups = await api.tree.getChildren();
		const posts = await api.tree.getChildren(groups[1]);
		const failed = posts.find((n) => n.post && (n.post.status === "failed" || n.post.status === "partial"));
		if (!failed) return this.skip();
		assert.strictEqual(api.tree.getTreeItem(failed).contextValue, "post.retryable");
		await vscode.commands.executeCommand("bulkpublish.retryPost", failed);
		if (stub) assert.ok(stub.seen.some((s) => s.key === `POST /api/posts/${failed.post.id}/retry`));
	});

	it("offers BulkPublish to chat while signed in", async () => {
		assert.ok(vscode.extensions.all.find((e) => e.packageJSON.name === "bulkpublish").packageJSON.contributes.mcpServerDefinitionProviders[0].id === "bulkpublish.assistant");
		const defs = await api.assistantDefinitions();
		assert.strictEqual(defs.length, 1);
		assert.strictEqual(defs[0].uri.toString(), "https://mcp.bulkpublish.com/mcp");
		assert.strictEqual(defs[0].headers.Authorization, `Bearer ${env.key}`);
	});

	it("signs out", async () => {
		await vscode.commands.executeCommand("bulkpublish.signOut");
		assert.strictEqual(await api.session.key(), undefined);
		assert.deepStrictEqual(await api.assistantDefinitions(), []);
	});
});

async function waitFor(fn, ms = 10000) {
	const end = Date.now() + ms;
	while (Date.now() < end) { if (fn()) return; await new Promise((r) => setTimeout(r, 100)); }
	throw new Error("timed out");
}
