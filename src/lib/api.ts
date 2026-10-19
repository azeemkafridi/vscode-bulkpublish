// A thin client of the public BulkPublish REST API. `fetch` is injectable for tests.
import { apiError, buildPostBody, Channel, isRecord, MediaKind, multipartFile, parseChannel } from "./core";

export interface PostSummary {
	id: number;
	content: string;
	status: string;
	scheduledAt: string | null;
	publishedAt: string | null;
	destinations: { platform: string; status: string; error?: string }[];
}

export class ApiError extends Error {
	constructor(public status: number, message: string) {
		super(message);
	}
}

type Fetch = typeof fetch;

export class BulkPublishClient {
	// Wrapped so `fetch` is never called detached from its global: browsers throw on that.
	constructor(private base: string, private key: string, private f: Fetch = (...a) => fetch(...a)) {}

	private async req(method: string, path: string, body?: unknown, raw?: { body: Uint8Array; contentType: string }) {
		const headers: Record<string, string> = { Authorization: `Bearer ${this.key}`, Accept: "application/json" };
		let payload: BodyInit | undefined;
		if (raw) {
			headers["Content-Type"] = raw.contentType;
			payload = raw.body as unknown as BodyInit;
		} else if (body !== undefined) {
			headers["Content-Type"] = "application/json";
			payload = JSON.stringify(body);
		}
		let res: Response;
		try {
			res = await this.f(`${this.base}${path}`, { method, headers, body: payload });
		} catch {
			throw new ApiError(0, "Couldn't reach BulkPublish. Check your connection and try again.");
		}
		const text = await res.text();
		let data: unknown = null;
		try { data = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
		if (!res.ok) throw new ApiError(res.status, apiError(res.status, data));
		return data;
	}

	async channels(): Promise<Channel[]> {
		const data = await this.req("GET", "/api/channels");
		const list = isRecord(data) && Array.isArray(data.channels) ? data.channels : [];
		return list.map(parseChannel).filter((c): c is Channel => c !== null);
	}

	async recentPosts(limit = 20): Promise<PostSummary[]> {
		const data = await this.req("GET", `/api/posts?limit=${limit}&order=desc`);
		const list = isRecord(data) && Array.isArray(data.posts) ? data.posts : [];
		return list.filter(isRecord).map((p) => ({
			id: Number(p.id),
			content: typeof p.content === "string" ? p.content : "",
			status: typeof p.status === "string" ? p.status : "unknown",
			scheduledAt: typeof p.scheduledAt === "string" ? p.scheduledAt : null,
			publishedAt: typeof p.publishedAt === "string" ? p.publishedAt : null,
			destinations: (Array.isArray(p.postPlatforms) ? p.postPlatforms : []).filter(isRecord).map((d) => ({
				platform: String(d.platform ?? ""),
				status: String(d.status ?? ""),
				...(typeof d.errorMessage === "string" && d.errorMessage ? { error: d.errorMessage } : {}),
			})),
		}));
	}

	async uploadMedia(file: { bytes: Uint8Array; filename: string; mimeType: string }): Promise<number> {
		const data = await this.req("POST", "/api/media", undefined, multipartFile(file));
		const id = isRecord(data) && isRecord(data.file) ? Number(data.file.id) : NaN;
		if (!Number.isInteger(id)) throw new ApiError(0, "BulkPublish didn't return the uploaded file.");
		return id;
	}

	async createPost(body: ReturnType<typeof buildPostBody>): Promise<number> {
		const data = await this.req("POST", "/api/posts", body);
		// The post comes back at the top level, not under `post`.
		const id = isRecord(data) ? Number(data.id) : NaN;
		if (!Number.isInteger(id)) throw new ApiError(0, "BulkPublish didn't return the new post.");
		return id;
	}

	publish(id: number) { return this.req("POST", `/api/posts/${id}/publish`); }
	retry(id: number) { return this.req("POST", `/api/posts/${id}/retry`, {}); }
	deletePost(id: number) { return this.req("DELETE", `/api/posts/${id}`); }
	deleteMedia(id: number) { return this.req("DELETE", `/api/media/${id}`); }
}

export type SendMode = "now" | "schedule" | "draft";

export interface SendRequest {
	content: string;
	targets: Channel[];
	file?: { bytes: Uint8Array; filename: string; mimeType: string };
	media: MediaKind;
	mode: SendMode;
	schedule?: { scheduledAt: string; timezone: string };
}

/**
 * Upload, create, and (for "now") publish. If anything after the upload fails,
 * the draft and the upload are removed so nothing half-made is left behind.
 */
export async function send(client: BulkPublishClient, r: SendRequest): Promise<number> {
	let mediaId: number | null = null;
	let postId: number | null = null;
	try {
		if (r.file) mediaId = await client.uploadMedia(r.file);
		const body = buildPostBody(r.targets, r.content, mediaId, r.media, r.mode === "schedule" ? r.schedule : undefined);
		postId = await client.createPost(body);
		if (r.mode === "now") await client.publish(postId);
		return postId;
	} catch (e) {
		if (r.mode === "now" || postId === null) {
			if (postId !== null) await client.deletePost(postId).catch(() => {});
			if (mediaId !== null) await client.deleteMedia(mediaId).catch(() => {});
		}
		throw e;
	}
}
