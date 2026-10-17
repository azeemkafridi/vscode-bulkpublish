// Runs the suite in an Extension Development Host.
// Default: against a small stand-in server started by the suite.
// Live:    BP_API_URL=http://localhost:4322 BP_TEST_KEY=bp_… npm run test:host
import { runTests } from "@vscode/test-electron";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
// The editor's socket path must stay under 104 characters, so its profile lives in a short temp dir.
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "bpvsc-"));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
await runTests({
	extensionDevelopmentPath: root,
	extensionTestsPath: path.join(root, "test/integration/suite/index.cjs"),
	launchArgs: [path.join(root, "test/fixtures/workspace"), "--disable-extensions", `--user-data-dir=${path.join(profile, "u")}`, `--extensions-dir=${path.join(profile, "e")}`],
	extensionTestsEnv: { BP_API_URL: process.env.BP_API_URL ?? "", BP_TEST_KEY: process.env.BP_TEST_KEY ?? "" },
});
