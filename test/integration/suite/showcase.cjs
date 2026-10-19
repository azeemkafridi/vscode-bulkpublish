// Not a test: sets up each surface in a real editor window, signed in to a local
// app, and leaves the window open for a person to look at and use. With
// SHOWCASE_DIR set it also tries to screenshot each step (macOS needs Screen
// Recording permission for that; without it the steps simply run).
// BP_API_URL=… BP_TEST_KEY=… npm run showcase   (close the window to finish)
const { execFileSync } = require("child_process");
const path = require("path");
const vscode = require("vscode");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (name) => {
	if (!process.env.SHOWCASE_DIR) return;
	try { execFileSync("screencapture", ["-x", "-o", path.join(process.env.SHOWCASE_DIR, `${name}.png`)]); } catch { /* no permission */ }
};

exports.run = async () => {
	await vscode.workspace.getConfiguration("bulkpublish").update("apiUrl", process.env.BP_API_URL, vscode.ConfigurationTarget.Global);
	const ext = vscode.extensions.all.find((e) => e.packageJSON.name === "bulkpublish");
	const api = await ext.activate();
	await vscode.commands.executeCommand("bulkpublish.signOut");
	await vscode.commands.executeCommand("workbench.view.extension.bulkpublish");
	await wait(1500); shot("1-signed-out");
	await vscode.commands.executeCommand("bulkpublish.setApiKey", process.env.BP_TEST_KEY);
	await api.tree.refresh(); await wait(1500); shot("2-sidebar");
	const md = vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, "post.md");
	await vscode.window.showTextDocument(md, { viewColumn: vscode.ViewColumn.One });
	await vscode.commands.executeCommand("bulkpublish.shareFile", md);
	await wait(3000); shot("3-compose-from-markdown");
	const ed = vscode.window.activeTextEditor ?? (await vscode.window.showTextDocument(md, { viewColumn: vscode.ViewColumn.One }));
	ed.selection = new vscode.Selection(1, 0, 2, 0);
	await vscode.commands.executeCommand("editor.action.showContextMenu");
	await wait(1500); shot("4-editor-context-menu");
	await vscode.commands.executeCommand("workbench.action.closeAllEditors");
	await vscode.commands.executeCommand("workbench.action.showCommands");
	await wait(800);
	await vscode.commands.executeCommand("workbench.action.quickOpen", ">BulkPublish");
	await wait(1500); shot("5-command-palette");
	await vscode.commands.executeCommand("workbench.action.closeQuickOpen");
	// End in a useful state: sidebar showing, compose open beside the Markdown file.
	await vscode.window.showTextDocument(md, { viewColumn: vscode.ViewColumn.One });
	await vscode.commands.executeCommand("bulkpublish.shareFile", md);
	await vscode.commands.executeCommand("workbench.view.extension.bulkpublish");
	await new Promise(() => {}); // stays open until the window is closed
};
