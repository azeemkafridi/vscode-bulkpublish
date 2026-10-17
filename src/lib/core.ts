// Pure helpers: no vscode, no network. Everything here is unit-tested.
// Shared by the extension host and the compose webview bundle.

export const DEFAULT_API_BASE = "https://app.bulkpublish.com";
export const DEFAULT_MCP_URL = "https://mcp.bulkpublish.com/mcp";

export interface Channel {
	id: number;
	platform: string;
	name: string;
	usable: boolean;
	/** Why a channel can't be used right now, in words for the user. */
	problem?: string;
}

export interface Skipped {
	channelId: number;
	platform: string;
	name: string;
	reason: string;
}

export type MediaKind = "image" | "video" | null;

export function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

// ── Captions ──

export function truncate(s: string, max: number): string {
	const t = s.replace(/\s+/g, " ").trim();
	if ([...t].length <= max) return t;
	if (max <= 1) return "…";
	const cut = [...t].slice(0, max - 1).join("");
	const space = cut.lastIndexOf(" ");
	return (space >= max * 0.5 ? cut.slice(0, space) : cut).trimEnd() + "…";
}

/** Caption limits we check before sending, so one network can't reject the whole post. */
export const CHAR_LIMITS: Record<string, number> = {
	x: 280,
	bluesky: 300,
	threads: 500,
	mastodon: 500,
	pinterest: 500,
	snapchat: 160,
	gmb: 1500,
	discord: 2000,
	instagram: 2200,
	tiktok: 2200,
	linkedin: 3000,
	telegram: 4096,
};

const URL_RE = /https?:\/\/\S+/g;

/** Length as the network counts it: X and Mastodon count every link as 23. */
export function platformLength(text: string, platform: string): number {
	const n = [...text].length;
	if (platform !== "x" && platform !== "mastodon") return n;
	let len = n;
	for (const m of text.match(URL_RE) ?? []) len += 23 - [...m].length;
	return len;
}

export interface Count {
	platform: string;
	length: number;
	limit: number | null;
	over: boolean;
}

/** One counter per network among the chosen channels, in a stable order. */
export function countsFor(text: string, platforms: string[]): Count[] {
	return [...new Set(platforms)].sort().map((p) => {
		const limit = CHAR_LIMITS[p] ?? null;
		const length = platformLength(text, p);
		return { platform: p, length, limit, over: limit !== null && length > limit };
	});
}

// ── Channels and networks ──

/** What each network's default post needs. Networks not listed take text alone. */
const MEDIA_RULES: Record<string, "image" | "video"> = {
	instagram: "image",
	pinterest: "image",
	snapchat: "image",
	tiktok: "video",
	youtube: "video",
};

/** Post type to request when an image is attached, where the default type is text-only. */
const IMAGE_POST_TYPE: Record<string, string> = { threads: "image" };

export function needs(platform: string): "image" | "video" | null {
	return MEDIA_RULES[platform] ?? null;
}

export function parseChannel(raw: unknown): Channel | null {
	if (!isRecord(raw)) return null;
	const id = Number(raw.id);
	if (!Number.isInteger(id) || typeof raw.platform !== "string") return null;
	const name =
		(typeof raw.accountName === "string" && raw.accountName) ||
		(typeof raw.name === "string" && raw.name) ||
		`#${id}`;
	let problem: string | undefined;
	if (raw.isActive === false) problem = "is turned off in BulkPublish";
	else if (raw.needsReconnect === true || raw.tokenStatus === "expired") problem = "needs reconnecting in BulkPublish";
	else if (raw.platformAvailable === false) problem = "can't be posted to right now";
	return { id, platform: raw.platform, name, usable: !problem, problem };
}

export function platformLabel(p: string): string {
	const names: Record<string, string> = {
		x: "X", gmb: "Google Business", linkedin: "LinkedIn", tiktok: "TikTok", youtube: "YouTube",
	};
	return names[p] ?? p.charAt(0).toUpperCase() + p.slice(1);
}

export function mediaKindOf(mimeType: string | undefined | null): MediaKind {
	if (!mimeType) return null;
	if (mimeType.startsWith("image/") && mimeType !== "image/svg+xml") return "image";
	if (mimeType.startsWith("video/")) return "video";
	return null;
}

/** Decide which chosen channels this post can go to, and why the rest can't. */
export function planTargets(channels: Channel[], ids: number[], media: MediaKind) {
	const byId = new Map(channels.map((c) => [c.id, c]));
	const targets: Channel[] = [];
	const skipped: Skipped[] = [];
	for (const id of ids) {
		const c = byId.get(id);
		if (!c) {
			skipped.push({ channelId: id, platform: "unknown", name: `#${id}`, reason: "is no longer connected" });
			continue;
		}
		const skip = (reason: string) => skipped.push({ channelId: id, platform: c.platform, name: c.name, reason });
		if (!c.usable) { skip(c.problem ?? "can't be used"); continue; }
		const need = needs(c.platform);
		if (need === "video" && media !== "video") { skip("needs a video"); continue; }
		if (need === "image" && media !== "image") { skip("needs an image"); continue; }
		targets.push(c);
	}
	return { targets, skipped };
}

/** Body for POST /api/posts. The caption is sent as written; the caller blocks it if too long. */
export function buildPostBody(
	targets: Channel[],
	content: string,
	mediaId: number | null,
	media: MediaKind,
	schedule?: { scheduledAt: string; timezone: string },
) {
	const postTypeOverrides: Record<string, string> = {};
	if (mediaId !== null && media === "image") {
		for (const t of targets) if (IMAGE_POST_TYPE[t.platform]) postTypeOverrides[t.platform] = IMAGE_POST_TYPE[t.platform];
	}
	return {
		content,
		status: schedule ? ("scheduled" as const) : ("draft" as const),
		channels: targets.map((t) => ({ channelId: t.id, platform: t.platform })),
		...(schedule ? schedule : {}),
		...(mediaId !== null ? { mediaFiles: [mediaId] } : {}),
		...(Object.keys(postTypeOverrides).length ? { postTypeOverrides } : {}),
	};
}

// ── Time ──

/** Offset of `tz` from UTC at instant `d`, in minutes. */
function tzOffsetMinutes(d: Date, tz: string): number {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone: tz, hourCycle: "h23",
		year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
	}).formatToParts(d);
	const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
	const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
	return (asUtc - d.getTime()) / 60000;
}

export function isValidTimeZone(tz: string): boolean {
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: tz });
		return true;
	} catch {
		return false;
	}
}

/** "2026-10-20T09:30" read as wall-clock time in `tz` → ISO instant. Null if unparseable. */
export function zonedToUtcIso(local: string, tz: string): string | null {
	const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local.trim());
	if (!m || !isValidTimeZone(tz)) return null;
	const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
	let t = guess - tzOffsetMinutes(new Date(guess), tz) * 60000;
	// A second pass settles times near a daylight-saving change.
	t = guess - tzOffsetMinutes(new Date(t), tz) * 60000;
	return new Date(t).toISOString();
}

// ── HTTP ──

/** Turn an API error body into one sentence the user can act on. */
export function apiError(status: number, body: unknown): string {
	let msg = "";
	if (isRecord(body)) {
		if (typeof body.error === "string") msg = body.error;
		else if (isRecord(body.error) && typeof body.error.message === "string") {
			msg = body.error.message;
			if (typeof body.error.hint === "string") msg += ` ${body.error.hint}`;
		} else if (typeof body.message === "string") msg = body.message;
	}
	if (status === 401) return "BulkPublish didn't accept the API key. Check it, or create a new one in BulkPublish.";
	if (status === 403 && !msg) return "This API key isn't allowed to do that.";
	if (status === 402 || status === 429) return msg || "You've reached your BulkPublish plan's limit.";
	if (status >= 500) return "BulkPublish is having trouble right now. Try again in a few minutes.";
	return msg || `BulkPublish returned an error (${status}).`;
}

export function normalizeApiBase(v: unknown): string {
	if (typeof v !== "string" || !v.trim()) return DEFAULT_API_BASE;
	try {
		const u = new URL(v.trim());
		// Plain http only for this machine (local testing); everything else must be https.
		const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
		if (u.protocol !== "https:" && !(u.protocol === "http:" && local)) return DEFAULT_API_BASE;
		return u.origin;
	} catch {
		return DEFAULT_API_BASE;
	}
}

export function looksLikeKey(v: string): boolean {
	return /^bp_[A-Za-z0-9_-]{16,}$/.test(v.trim());
}

/** A multipart/form-data body with one field, "file". */
export function multipartFile(file: { bytes: Uint8Array; filename: string; mimeType: string }) {
	const boundary = `----bp${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
	const safeName = file.filename.replace(/["\r\n\\]/g, "_");
	const head = new TextEncoder().encode(
		`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${safeName}"\r\nContent-Type: ${file.mimeType}\r\n\r\n`,
	);
	const tail = new TextEncoder().encode(`\r\n--${boundary}--\r\n`);
	const body = new Uint8Array(new ArrayBuffer(head.length + file.bytes.length + tail.length));
	body.set(head, 0);
	body.set(file.bytes, head.length);
	body.set(tail, head.length + file.bytes.length);
	return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

const MIME: Record<string, string> = {
	png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
	mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", m4v: "video/mp4",
};

export function mimeFromName(name: string): string | null {
	const ext = name.split(".").pop()?.toLowerCase() ?? "";
	return MIME[ext] ?? null;
}
