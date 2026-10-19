import { describe, expect, it } from "vitest";
import { downloadImage } from "../../src/lib/download";

const res = (body: Uint8Array | string, headers: Record<string, string>, status = 200) =>
	(async () => new Response(body as BodyInit, { status, headers })) as unknown as typeof fetch;

describe("downloadImage", () => {
	it("returns the bytes, type and a filename with the right extension", async () => {
		const got = await downloadImage("https://example.com/img/cover%20shot?w=800", res(new Uint8Array([1, 2, 3]), { "content-type": "image/jpeg" }));
		expect(got).toEqual({ bytes: new Uint8Array([1, 2, 3]), mimeType: "image/jpeg", filename: "cover_shot.jpg" });
		const png = await downloadImage("https://example.com/a.png", res("x", { "content-type": "image/png; charset=binary" }));
		expect(typeof png !== "string" && png.filename).toBe("a.png");
	});
	it("refuses what can't be posted, with a sentence", async () => {
		expect(await downloadImage("ftp://x/a.png", res("", {}))).toMatch(/isn't a web address/);
		expect(await downloadImage("https://x/a.svg", res("<svg/>", { "content-type": "image/svg+xml" }))).toMatch(/isn't a picture/);
		expect(await downloadImage("https://x/a.png", res("", { "content-type": "image/png" }, 404))).toMatch(/\(404\)/);
		expect(await downloadImage("https://x/a.png", res("", { "content-type": "image/png", "content-length": String(30 * 1024 * 1024) }))).toMatch(/20 MB/);
		expect(await downloadImage("https://x/a.png", (async () => { throw new Error("offline"); }) as unknown as typeof fetch)).toMatch(/Couldn't download/);
	});
});
