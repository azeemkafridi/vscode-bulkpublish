import { describe, expect, it } from "vitest";
import { buildPostBody, countsFor, normalizeApiBase, parseChannel, planTargets, platformLength, zonedToUtcIso } from "../../src/lib/core";

const ch = (id: number, platform: string, extra: Record<string, unknown> = {}) => parseChannel({ id, platform, accountName: `acct${id}`, ...extra })!;

describe("channels", () => {
	it("uses accountName and flags unusable channels", () => {
		expect(ch(1, "x").name).toBe("acct1");
		expect(ch(2, "x", { isActive: false }).usable).toBe(false);
		expect(ch(3, "x", { needsReconnect: true }).problem).toMatch(/reconnect/);
		expect(ch(4, "x", { platformAvailable: false }).usable).toBe(false);
	});
	it("skips media-needing networks without the right media", () => {
		const list = [ch(1, "x"), ch(2, "instagram"), ch(3, "tiktok"), ch(4, "x", { isActive: false })];
		const none = planTargets(list, [1, 2, 3, 4, 99], null);
		expect(none.targets.map((t) => t.id)).toEqual([1]);
		expect(none.skipped.map((s) => s.reason)).toEqual(["needs an image", "needs a video", "is turned off in BulkPublish", "is no longer connected"]);
		expect(planTargets(list, [2, 3], "image").targets.map((t) => t.id)).toEqual([2]);
		expect(planTargets(list, [2, 3], "video").targets.map((t) => t.id)).toEqual([3]);
	});
});

describe("counts", () => {
	it("counts links as 23 on X and Mastodon only", () => {
		const t = "see https://example.com/a/very/long/path/that/goes/on/and/on";
		expect(platformLength(t, "x")).toBe(4 + 23);
		expect(platformLength(t, "mastodon")).toBe(4 + 23);
		expect(platformLength(t, "bluesky")).toBe([...t].length);
	});
	it("flags a caption over any chosen network's limit", () => {
		const c = countsFor("a".repeat(290), ["x", "linkedin", "x"]);
		expect(c).toEqual([
			{ platform: "linkedin", length: 290, limit: 3000, over: false },
			{ platform: "x", length: 290, limit: 280, over: true },
		]);
	});
});

describe("post body", () => {
	it("asks Threads for an image post when an image is attached", () => {
		const b = buildPostBody([ch(1, "threads"), ch(2, "x")], "hi", 7, "image");
		expect(b).toEqual({ content: "hi", status: "draft", channels: [{ channelId: 1, platform: "threads" }, { channelId: 2, platform: "x" }], mediaFiles: [7], postTypeOverrides: { threads: "image" } });
	});
	it("schedules with scheduledAt + timezone", () => {
		const b = buildPostBody([ch(1, "x")], "hi", null, null, { scheduledAt: "2030-01-01T09:00:00.000Z", timezone: "UTC" });
		expect(b.status).toBe("scheduled");
		expect(b).toMatchObject({ scheduledAt: "2030-01-01T09:00:00.000Z", timezone: "UTC" });
	});
});

describe("time and urls", () => {
	it("reads wall-clock time in a zone, across daylight saving", () => {
		expect(zonedToUtcIso("2030-01-15T09:30", "America/New_York")).toBe("2030-01-15T14:30:00.000Z");
		expect(zonedToUtcIso("2030-07-15T09:30", "America/New_York")).toBe("2030-07-15T13:30:00.000Z");
		expect(zonedToUtcIso("2030-07-15T09:30", "Asia/Karachi")).toBe("2030-07-15T04:30:00.000Z");
		expect(zonedToUtcIso("nope", "UTC")).toBeNull();
		expect(zonedToUtcIso("2030-07-15T09:30", "Not/AZone")).toBeNull();
	});
	it("allows http only for this machine", () => {
		expect(normalizeApiBase("http://localhost:4322/x")).toBe("http://localhost:4322");
		expect(normalizeApiBase("http://evil.example")).toBe("https://app.bulkpublish.com");
		expect(normalizeApiBase("https://app.bulkpublish.com/")).toBe("https://app.bulkpublish.com");
	});
});
