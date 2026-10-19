// Stands in for the extension host so the real compose form can be driven in a
// browser. It speaks the same messages as src/compose.ts and calls the same API
// code; the dev server forwards /api to the app and adds the key.
import { BulkPublishClient, send } from "../../src/lib/api";
import { mediaKindOf, planTargets, zonedToUtcIso } from "../../src/lib/core";

const client = new BulkPublishClient(location.origin, "bp_added_by_the_dev_server");
const frame = document.getElementById("form") as HTMLIFrameElement;
const log = document.getElementById("log")!;
const toForm = (m: unknown) => {
	log.textContent += `host → form ${JSON.stringify(m).slice(0, 160)}\n`;
	frame.contentWindow!.postMessage(m, "*");
};

window.addEventListener("message", async (ev) => {
	if (ev.source !== frame.contentWindow) return;
	const m = ev.data as { type: string; payload?: any };
	log.textContent += `form → host ${JSON.stringify(m).slice(0, 160)}\n`;
	if (m.type === "ready" || m.type === "refreshChannels") {
		toForm({ type: "channels", channels: await client.channels() });
		const params = new URLSearchParams(location.search);
		if (m.type === "ready" && params.get("prefill")) toForm({ type: "prefill", caption: params.get("prefill") });
	} else if (m.type === "pickFile") {
		toForm({ type: "attached", attachment: { path: "/fixture/cover.png", name: "cover.png", mimeType: "image/png" } });
	} else if (m.type === "send") {
		const p = m.payload;
		try {
			const channels = await client.channels();
			const media = mediaKindOf(p.attachment?.mimeType);
			const { targets } = planTargets(channels, p.targetIds, media);
			const iso = p.mode === "schedule" ? zonedToUtcIso(p.when, p.timezone) : null;
			if (p.mode === "schedule" && !iso) throw new Error("Pick a valid date, time and time zone.");
			const file = p.attachment
				? { bytes: new Uint8Array(await (await fetch(p.attachment.path)).arrayBuffer()), filename: p.attachment.name, mimeType: p.attachment.mimeType }
				: undefined;
			const id = await send(client, { content: p.caption, targets, file, media, mode: p.mode, schedule: iso ? { scheduledAt: iso, timezone: p.timezone } : undefined });
			toForm({ type: "result", ok: true, message: `Done. Post #${id}.` });
		} catch (e) {
			toForm({ type: "result", ok: false, message: (e as Error).message });
		}
	}
});
