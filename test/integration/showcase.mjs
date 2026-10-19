import { runTests } from "@vscode/test-electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "bpvsc-"));
if (process.env.SHOWCASE_DIR) fs.mkdirSync(process.env.SHOWCASE_DIR, { recursive: true });
await runTests({
	extensionDevelopmentPath: root,
	extensionTestsPath: path.join(root, "test/integration/suite/showcase.cjs"),
	launchArgs: [path.join(root, "test/fixtures/workspace"), "--disable-extensions", `--user-data-dir=${path.join(profile, "u")}`, `--extensions-dir=${path.join(profile, "e")}`],
	extensionTestsEnv: { BP_API_URL: process.env.BP_API_URL, BP_TEST_KEY: process.env.BP_TEST_KEY, SHOWCASE_DIR: process.env.SHOWCASE_DIR ?? "" },
});
