import { describe, expect, it } from "vitest";
import { BulkPublishClient, send } from "../../src/lib/api";
import { parseChannel } from "../../src/lib/core";

function fake(routes: Record<string, (body: unknown) => [number, unknown]>) {
	const calls: string[] = [];
	const f = (async (url: string, init: RequestInit) => {
		const key = `${init.method} ${new URL(url).pathname}`;
		calls.push(key);
		const h = routes[key] ?? (() => [404, { error: "nope" }]);
		const [status, body] = h(typeof init.body === "string" ? JSON.parse(init.body) : init.body);
		return new Response(JSON.stringify(body), { status });
	}) as unknown as typeof fetch;
	return { f, calls };
}

const x = parseChannel({ id: 1, platform: "x", accountName: "me" })!;
const file = { bytes: new Uint8Array([1, 2]), filename: "a.png", mimeType: "image/png" };

describe("send", () => {
	it("publish now = upload, draft, publish; reads id at the top level", async () => {
		const { f, calls } = fake({
			"POST /api/media": () => [201, { file: { id: 9 } }],
			"POST /api/posts": (b) => { expect(b).toMatchObject({ status: "draft", mediaFiles: [9] }); return [201, { id: 5 }]; },
			"POST /api/posts/5/publish": () => [200, { ok: true }],
		});
		expect(await send(new BulkPublishClient("http://h", "bp_k", f), { content: "hi", targets: [x], file, media: "image", mode: "now" })).toBe(5);
		expect(calls).toEqual(["POST /api/media", "POST /api/posts", "POST /api/posts/5/publish"]);
	});
	it("removes the draft and the upload when publishing fails", async () => {
		const { f, calls } = fake({
			"POST /api/media": () => [201, { file: { id: 9 } }],
			"POST /api/posts": () => [201, { id: 5 }],
			"POST /api/posts/5/publish": () => [402, { error: { message: "Monthly post limit reached." } }],
			"DELETE /api/posts/5": () => [200, {}],
			"DELETE /api/media/9": () => [200, {}],
		});
		await expect(send(new BulkPublishClient("http://h", "bp_k", f), { content: "hi", targets: [x], file, media: "image", mode: "now" })).rejects.toThrow("Monthly post limit reached.");
		expect(calls.slice(-2)).toEqual(["DELETE /api/posts/5", "DELETE /api/media/9"]);
	});
	it("turns a 401 into a sentence about the key", async () => {
		const { f } = fake({ "GET /api/channels": () => [401, { error: "Unauthorized" }] });
		await expect(new BulkPublishClient("http://h", "bp_k", f).channels()).rejects.toThrow(/didn't accept the API key/);
	});
});
