// Fetch an image named by a web address, so a Markdown file's first image can be
// attached even when it isn't in the workspace. `fetch` is injectable for tests.
import { mediaKindOf } from "./core";

export const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" };

export interface Downloaded { bytes: Uint8Array; mimeType: string; filename: string }

/** The image, or a sentence saying why it couldn't be used. */
export async function downloadImage(
	address: string,
	f: typeof fetch = (...a) => fetch(...a),
	timeoutMs = 15000,
): Promise<Downloaded | string> {
	let url: URL;
	try { url = new URL(address); } catch { return "The first image's address isn't valid, so it wasn't attached."; }
	if (url.protocol !== "https:" && url.protocol !== "http:") return "The first image's address isn't a web address, so it wasn't attached.";
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), timeoutMs);
	try {
		const res = await f(url.toString(), { signal: ctrl.signal, redirect: "follow" });
		if (!res.ok) return `Couldn't download the first image (${res.status}), so it wasn't attached.`;
		const mimeType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
		if (mediaKindOf(mimeType) !== "image") return "The first image isn't a picture BulkPublish can post (PNG, JPEG, GIF or WebP), so it wasn't attached.";
		const declared = Number(res.headers.get("content-length") ?? 0);
		if (declared > MAX_DOWNLOAD_BYTES) return "The first image is larger than 20 MB, so it wasn't attached.";
		const bytes = new Uint8Array(await res.arrayBuffer());
		if (bytes.length > MAX_DOWNLOAD_BYTES) return "The first image is larger than 20 MB, so it wasn't attached.";
		const base = decodeURIComponent(url.pathname.split("/").pop() ?? "").replace(/[^\w.-]/g, "_") || "image";
		const ext = EXT[mimeType] ?? "img";
		const filename = base.toLowerCase().endsWith(`.${ext}`) || (ext === "jpg" && /\.jpe?g$/i.test(base)) ? base : `${base.replace(/\.[^.]*$/, "")}.${ext}`;
		return { bytes, mimeType, filename };
	} catch {
		return "Couldn't download the first image, so it wasn't attached. Attach a local copy if you want it in the post.";
	} finally {
		clearTimeout(timer);
	}
}
