import * as path from "path";
import * as vscode from "vscode";
import { send } from "./lib/api";
import { mediaKindOf, mimeFromName, planTargets, zonedToUtcIso } from "./lib/core";
import { Session } from "./session";
import type { Attachment } from "./webview/state";

export interface Prefill { caption?: string; attachment?: Attachment | null; note?: string }

interface SendPayload {
	caption: string;
	attachment: Attachment | null;
	mode: "now" | "schedule" | "draft";
	when: string;
	timezone: string;
	targetIds: number[];
}

/** Turn a file on disk into an attachment, or explain why it can't be one. */
export function attachmentFor(uri: vscode.Uri): Attachment | string {
	const name = path.basename(uri.fsPath);
	const mimeType = mimeFromName(name);
	if (!mimeType || !mediaKindOf(mimeType)) return `${name} isn't an image or video BulkPublish can post.`;
	return { path: uri.fsPath, name, mimeType };
}

export class ComposePanel {
	private static current: ComposePanel | undefined;
	private ready = false;
	private queued: unknown[] = [];

	static show(ctx: vscode.ExtensionContext, session: Session, onSent: () => void, prefill?: Prefill): ComposePanel {
		if (!ComposePanel.current) ComposePanel.current = new ComposePanel(ctx, session, onSent);
		const p = ComposePanel.current;
		p.panel.reveal(vscode.ViewColumn.Beside);
		if (prefill) p.post({ type: "prefill", caption: prefill.caption, attachment: prefill.attachment });
		if (prefill?.note) void vscode.window.showWarningMessage(prefill.note);
		return p;
	}

	static get active() { return ComposePanel.current; }

	readonly panel: vscode.WebviewPanel;
	/** Messages the host sent to the form, kept for tests. */
	readonly sent: unknown[] = [];

	private constructor(private ctx: vscode.ExtensionContext, private session: Session, private onSent: () => void) {
		this.panel = vscode.window.createWebviewPanel("bulkpublish.compose", "New post", vscode.ViewColumn.Beside, {
			enableScripts: true,
			retainContextWhenHidden: true,
			localResourceRoots: [vscode.Uri.joinPath(ctx.extensionUri, "dist"), vscode.Uri.joinPath(ctx.extensionUri, "media")],
		});
		this.panel.iconPath = vscode.Uri.joinPath(ctx.extensionUri, "media", "icon.png");
		this.panel.webview.html = this.html();
		this.panel.onDidDispose(() => { ComposePanel.current = undefined; });
		this.panel.webview.onDidReceiveMessage((m) => this.handle(m));
	}

	post(m: unknown) {
		if (!this.ready) { this.queued.push(m); return; }
		this.sent.push(m);
		void this.panel.webview.postMessage(m);
	}

	async handle(m: { type: string; payload?: SendPayload }) {
		if (m.type === "ready") {
			this.ready = true;
			await this.pushChannels();
			for (const q of this.queued.splice(0)) this.post(q);
		} else if (m.type === "refreshChannels") {
			await this.pushChannels();
		} else if (m.type === "pickFile") {
			const picked = await vscode.window.showOpenDialog({
				canSelectMany: false,
				defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
				filters: { "Images and videos": ["png", "jpg", "jpeg", "gif", "webp", "mp4", "mov", "webm", "m4v"] },
			});
			if (!picked?.[0]) return;
			const a = attachmentFor(picked[0]);
			if (typeof a === "string") void vscode.window.showWarningMessage(a);
			else this.post({ type: "attached", attachment: a });
		} else if (m.type === "send" && m.payload) {
			const message = await this.send(m.payload);
			this.post({ type: "result", ok: message.ok, message: message.text });
		}
	}

	private async pushChannels() {
		const client = await this.session.client();
		if (!client) {
			this.post({ type: "channels", channels: [] });
			this.post({ type: "result", ok: false, message: "Set your BulkPublish API key first (BulkPublish: Set API key)." });
			return;
		}
		try {
			this.post({ type: "channels", channels: await client.channels() });
		} catch (e) {
			this.post({ type: "result", ok: false, message: (e as Error).message });
		}
	}

	async send(p: SendPayload): Promise<{ ok: boolean; text: string }> {
		const client = await this.session.client();
		if (!client) return { ok: false, text: "Set your BulkPublish API key first." };
		try {
			// Re-check against the live channel list: one may have been disconnected since the form loaded.
			const channels = await client.channels();
			const media = mediaKindOf(p.attachment?.mimeType);
			const { targets, skipped } = planTargets(channels, p.targetIds, media);
			if (!targets.length) return { ok: false, text: "None of the chosen channels can take this post." };
			let schedule: { scheduledAt: string; timezone: string } | undefined;
			if (p.mode === "schedule") {
				const iso = zonedToUtcIso(p.when, p.timezone);
				if (!iso) return { ok: false, text: "Pick a valid date, time and time zone (for example Europe/London)." };
				if (Date.parse(iso) <= Date.now()) return { ok: false, text: "Pick a time in the future." };
				schedule = { scheduledAt: iso, timezone: p.timezone };
			}
			let file: { bytes: Uint8Array; filename: string; mimeType: string } | undefined;
			if (p.attachment) {
				try {
					file = { bytes: await vscode.workspace.fs.readFile(vscode.Uri.file(p.attachment.path)), filename: p.attachment.name, mimeType: p.attachment.mimeType };
				} catch {
					return { ok: false, text: `Couldn't read ${p.attachment.name}.` };
				}
			}
			const id = await send(client, { content: p.caption, targets, file, media, mode: p.mode, schedule });
			this.onSent();
			const where = targets.map((t) => t.name).join(", ");
			const done = p.mode === "now" ? `Publishing to ${where}.` : p.mode === "schedule" ? `Scheduled for ${where}.` : `Draft saved for ${where}.`;
			const skip = skipped.length ? ` Skipped: ${skipped.map((s) => `${s.name} (${s.reason})`).join(", ")}.` : "";
			return { ok: true, text: `${done}${skip} Post #${id}.` };
		} catch (e) {
			return { ok: false, text: (e as Error).message };
		}
	}

	private html(): string {
		const w = this.panel.webview;
		const script = w.asWebviewUri(vscode.Uri.joinPath(this.ctx.extensionUri, "dist", "webview.js"));
		const css = w.asWebviewUri(vscode.Uri.joinPath(this.ctx.extensionUri, "media", "compose.css"));
		const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
		return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${w.cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="${css}"><title>New post</title></head>
<body><main id="app"></main><script nonce="${nonce}" src="${script}"></script></body></html>`;
	}
}
