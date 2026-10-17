// Offers the hosted BulkPublish tools to Copilot agent mode, signed in with the
// same API key as the rest of the extension, so nobody has to edit mcp.json.
import * as vscode from "vscode";
import { Session } from "./session";

export const PROVIDER_ID = "bulkpublish.assistant";

export function registerAssistantServer(session: Session) {
	const changed = new vscode.EventEmitter<void>();
	const provider: vscode.McpServerDefinitionProvider<vscode.McpHttpServerDefinition> = {
			onDidChangeMcpServerDefinitions: changed.event,
			async provideMcpServerDefinitions() {
				const key = await session.key();
				if (!key) return [];
				return [new vscode.McpHttpServerDefinition("BulkPublish", vscode.Uri.parse(session.mcpUrl), { Authorization: `Bearer ${key}` })];
			},
			async resolveMcpServerDefinition(server) {
				// The key may have been removed since the list was offered.
				const key = await session.key();
				if (!key) {
					void vscode.window.showWarningMessage("Set your BulkPublish API key to use BulkPublish in chat.", "Set API key")
						.then((c) => c && vscode.commands.executeCommand("bulkpublish.setApiKey"));
					return undefined;
				}
				server.headers = { ...server.headers, Authorization: `Bearer ${key}` };
				return server;
			},
	};
	const subs: vscode.Disposable[] = [
		changed,
		session.onDidChange(() => changed.fire()),
		vscode.workspace.onDidChangeConfiguration((e) => { if (e.affectsConfiguration("bulkpublish")) changed.fire(); }),
	];
	// Editors older than the provider API simply go without it.
	if (typeof vscode.lm?.registerMcpServerDefinitionProvider === "function") {
		subs.push(vscode.lm.registerMcpServerDefinitionProvider(PROVIDER_ID, provider));
	}
	return { disposable: vscode.Disposable.from(...subs), provider };
}
