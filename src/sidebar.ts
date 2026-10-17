import * as vscode from "vscode";
import { PostSummary } from "./lib/api";
import { Channel, platformLabel, truncate } from "./lib/core";
import { Session } from "./session";

type Node =
	| { kind: "group"; id: "channels" | "posts" }
	| { kind: "channel"; channel: Channel }
	| { kind: "post"; post: PostSummary }
	| { kind: "message"; text: string };

const STATUS_ICON: Record<string, string> = {
	published: "pass", scheduled: "clock", draft: "edit", failed: "error",
	partial: "warning", publishing: "sync", processing: "sync",
};

export class BulkPublishTree implements vscode.TreeDataProvider<Node> {
	private changed = new vscode.EventEmitter<void>();
	readonly onDidChangeTreeData = this.changed.event;
	channels: Channel[] = [];
	posts: PostSummary[] = [];
	error: string | null = null;
	private loaded = false;

	constructor(private session: Session) {}

	async refresh() {
		const client = await this.session.client();
		this.error = null;
		if (!client) {
			this.channels = [];
			this.posts = [];
		} else {
			try {
				[this.channels, this.posts] = await Promise.all([client.channels(), client.recentPosts()]);
			} catch (e) {
				this.error = (e as Error).message;
			}
		}
		this.loaded = true;
		this.changed.fire();
	}

	async getChildren(node?: Node): Promise<Node[]> {
		if (!this.loaded) await this.refresh();
		if (!node) {
			if (!(await this.session.key())) return []; // the view's welcome text takes over
			if (this.error) return [{ kind: "message", text: this.error }];
			return [{ kind: "group", id: "channels" }, { kind: "group", id: "posts" }];
		}
		if (node.kind === "group" && node.id === "channels") {
			return this.channels.length ? this.channels.map((channel) => ({ kind: "channel", channel })) : [{ kind: "message", text: "No channels connected yet" }];
		}
		if (node.kind === "group" && node.id === "posts") {
			return this.posts.length ? this.posts.map((post) => ({ kind: "post", post })) : [{ kind: "message", text: "No posts yet" }];
		}
		return [];
	}

	getTreeItem(node: Node): vscode.TreeItem {
		if (node.kind === "group") {
			const item = new vscode.TreeItem(node.id === "channels" ? "Channels" : "Recent posts", vscode.TreeItemCollapsibleState.Expanded);
			item.id = node.id;
			return item;
		}
		if (node.kind === "message") return new vscode.TreeItem(node.text);
		if (node.kind === "channel") {
			const c = node.channel;
			const item = new vscode.TreeItem(c.name);
			item.id = `channel-${c.id}`;
			item.description = platformLabel(c.platform);
			item.iconPath = new vscode.ThemeIcon(c.usable ? "account" : "warning");
			item.tooltip = c.usable ? `${c.name} on ${platformLabel(c.platform)}` : `${c.name} ${c.problem}`;
			return item;
		}
		const p = node.post;
		const item = new vscode.TreeItem(truncate(p.content || "(no caption)", 60));
		item.id = `post-${p.id}`;
		item.description = p.status;
		item.iconPath = new vscode.ThemeIcon(STATUS_ICON[p.status] ?? "circle-outline");
		item.contextValue = p.status === "failed" || p.status === "partial" ? "post.retryable" : "post";
		const when = p.publishedAt ?? p.scheduledAt;
		const lines = [p.content, "", `Status: ${p.status}${when ? ` (${new Date(when).toLocaleString()})` : ""}`];
		for (const d of p.destinations) lines.push(`${platformLabel(d.platform)}: ${d.status}${d.error ? ` — ${d.error}` : ""}`);
		item.tooltip = lines.join("\n");
		return item;
	}
}

export type TreeNode = Node;
