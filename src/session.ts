// The API key lives in SecretStorage only. Settings hold nothing secret.
import * as vscode from "vscode";
import { BulkPublishClient } from "./lib/api";
import { DEFAULT_MCP_URL, looksLikeKey, normalizeApiBase } from "./lib/core";

const SECRET = "bulkpublish.apiKey";

export class Session {
	private changed = new vscode.EventEmitter<void>();
	readonly onDidChange = this.changed.event;

	constructor(private secrets: vscode.SecretStorage) {
		secrets.onDidChange((e) => { if (e.key === SECRET) this.changed.fire(); });
	}

	get apiBase(): string {
		return normalizeApiBase(vscode.workspace.getConfiguration("bulkpublish").get("apiUrl"));
	}

	get mcpUrl(): string {
		const v = vscode.workspace.getConfiguration("bulkpublish").get<string>("assistantServerUrl");
		try { return v && new URL(v).protocol === "https:" ? v : DEFAULT_MCP_URL; } catch { return DEFAULT_MCP_URL; }
	}

	key(): Thenable<string | undefined> { return this.secrets.get(SECRET); }

	async client(): Promise<BulkPublishClient | null> {
		const k = await this.key();
		return k ? new BulkPublishClient(this.apiBase, k) : null;
	}

	/** Checks the key against the account before keeping it. Returns an error sentence, or null. */
	async setKey(raw: string): Promise<string | null> {
		const k = raw.trim();
		if (!looksLikeKey(k)) return "That doesn't look like a BulkPublish API key. Keys start with bp_.";
		try {
			await new BulkPublishClient(this.apiBase, k).channels();
		} catch (e) {
			return (e as Error).message;
		}
		await this.secrets.store(SECRET, k);
		await vscode.commands.executeCommand("setContext", "bulkpublish.signedIn", true);
		return null;
	}

	async signOut() {
		await this.secrets.delete(SECRET);
		await vscode.commands.executeCommand("setContext", "bulkpublish.signedIn", false);
	}
}
