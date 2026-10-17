import * as path from "path";
import * as vscode from "vscode";
import { attachmentFor, ComposePanel, Prefill } from "./compose";
import { captionFromMarkdown, parseMarkdownShare } from "./lib/markdown";
import { registerAssistantServer } from "./mcp";
import { Session } from "./session";
import { BulkPublishTree, TreeNode } from "./sidebar";

/** Build a compose prefill from a Markdown document. */
export function markdownPrefill(text: string, docUri: vscode.Uri | undefined): Prefill {
	const md = parseMarkdownShare(text);
	const prefill: Prefill = { caption: captionFromMarkdown(md) };
	if (md.image) {
		if (/^[a-z]+:\/\//i.test(md.image)) {
			prefill.note = "The first image is on the web, so it wasn't attached. Attach a local copy if you want it in the post.";
		} else if (docUri) {
			const file = md.image.startsWith("/")
				? vscode.Uri.joinPath(vscode.workspace.getWorkspaceFolder(docUri)?.uri ?? docUri, md.image)
				: vscode.Uri.file(path.resolve(path.dirname(docUri.fsPath), decodeURI(md.image)));
			const a = attachmentFor(file);
			if (typeof a === "string") prefill.note = a;
			else prefill.attachment = a;
		}
	}
	return prefill;
}

export async function activate(ctx: vscode.ExtensionContext) {
	const session = new Session(ctx.secrets);
	const tree = new BulkPublishTree(session);
	const view = vscode.window.createTreeView("bulkpublish.sidebar", { treeDataProvider: tree });
	await vscode.commands.executeCommand("setContext", "bulkpublish.signedIn", !!(await session.key()));
	session.onDidChange(() => void tree.refresh());
	const compose = (prefill?: Prefill) => ComposePanel.show(ctx, session, () => void tree.refresh(), prefill);

	const cmd = (id: string, fn: (...a: never[]) => unknown) => ctx.subscriptions.push(vscode.commands.registerCommand(id, fn));

	// An argument is accepted so the command can be driven programmatically (tests, keybindings).
	cmd("bulkpublish.setApiKey", async (given?: string) => {
		const key = typeof given === "string" ? given : await vscode.window.showInputBox({
			title: "BulkPublish API key",
			prompt: "Create a key in BulkPublish under Settings → API Keys.",
			placeHolder: "bp_…",
			password: true,
			ignoreFocusOut: true,
		});
		if (!key) return false;
		const err = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Checking your API key…" }, () => session.setKey(key));
		if (err) { void vscode.window.showErrorMessage(err); return false; }
		void vscode.window.showInformationMessage("Signed in to BulkPublish.");
		return true;
	});
	cmd("bulkpublish.signOut", async () => {
		await session.signOut();
		void vscode.window.showInformationMessage("Signed out of BulkPublish. Your API key was removed from this editor.");
	});
	cmd("bulkpublish.refresh", () => tree.refresh());
	cmd("bulkpublish.compose", () => compose());
	cmd("bulkpublish.retryPost", async (node?: TreeNode) => {
		if (!node || node.kind !== "post") return;
		const client = await session.client();
		if (!client) return;
		try {
			await client.retry(node.post.id);
			void vscode.window.showInformationMessage("Trying again. Failed destinations will be published again.");
		} catch (e) {
			void vscode.window.showErrorMessage((e as Error).message);
		}
		await tree.refresh();
	});
	cmd("bulkpublish.shareSelection", () => {
		const ed = vscode.window.activeTextEditor;
		const text = ed ? ed.selections.map((s) => ed.document.getText(s)).join("\n").trim() : "";
		if (!text) { void vscode.window.showWarningMessage("Select some text to share first."); return; }
		compose({ caption: text });
	});
	cmd("bulkpublish.shareFile", async (uri?: vscode.Uri) => {
		const target = uri ?? vscode.window.activeTextEditor?.document.uri;
		if (!target) return;
		const doc = await vscode.workspace.openTextDocument(target);
		if (doc.languageId === "markdown" || /\.(md|mdx|markdown)$/i.test(target.fsPath)) {
			compose(markdownPrefill(doc.getText(), target));
		} else {
			compose({ caption: doc.getText().trim() });
		}
	});

	const assistant = registerAssistantServer(session);
	ctx.subscriptions.push(view, assistant.disposable);
	return {
		session, tree, markdownPrefill,
		composePanel: () => ComposePanel.active,
		assistantDefinitions: async () => (await assistant.provider.provideMcpServerDefinitions(new vscode.CancellationTokenSource().token)) ?? [],
	};
}

export function deactivate() {}
