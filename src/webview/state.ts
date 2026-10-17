// The compose form's single state object, and the pure transitions on it.
// Every change goes through `reduce`, so typing can never touch the selection.
import { Channel, countsFor, mediaKindOf, planTargets } from "../lib/core";

export interface Attachment { path: string; name: string; mimeType: string }

export interface ComposeState {
	caption: string;
	selected: number[];
	attachment: Attachment | null;
	mode: "now" | "schedule" | "draft";
	when: string;
	timezone: string;
	channels: Channel[];
	busy: boolean;
	notice: { kind: "ok" | "error"; text: string } | null;
}

export type Action =
	| { type: "caption"; value: string }
	| { type: "toggle"; id: number; on: boolean }
	| { type: "mode"; value: ComposeState["mode"] }
	| { type: "when"; value: string }
	| { type: "timezone"; value: string }
	| { type: "channels"; channels: Channel[] }
	| { type: "prefill"; caption?: string; attachment?: Attachment | null }
	| { type: "attach"; attachment: Attachment | null }
	| { type: "busy"; value: boolean }
	| { type: "notice"; notice: ComposeState["notice"] }
	| { type: "sent" };

export function initialState(timezone: string): ComposeState {
	return { caption: "", selected: [], attachment: null, mode: "now", when: "", timezone, channels: [], busy: false, notice: null };
}

export function reduce(s: ComposeState, a: Action): ComposeState {
	switch (a.type) {
		case "caption": return { ...s, caption: a.value, notice: null };
		case "toggle": {
			const rest = s.selected.filter((id) => id !== a.id);
			return { ...s, selected: a.on ? [...rest, a.id] : rest };
		}
		case "mode": return { ...s, mode: a.value };
		case "when": return { ...s, when: a.value };
		case "timezone": return { ...s, timezone: a.value };
		// A fresh channel list keeps every choice that still exists.
		case "channels": {
			const ids = new Set(a.channels.map((c) => c.id));
			return { ...s, channels: a.channels, selected: s.selected.filter((id) => ids.has(id)) };
		}
		case "prefill": return {
			...s,
			caption: a.caption ?? s.caption,
			attachment: a.attachment === undefined ? s.attachment : a.attachment,
			notice: null,
		};
		case "attach": return { ...s, attachment: a.attachment };
		case "busy": return { ...s, busy: a.value };
		case "notice": return { ...s, notice: a.notice };
		case "sent": return { ...s, caption: "", attachment: null, when: "", busy: false };
	}
}

/** Everything the form shows that is computed from state rather than typed. */
export function derive(s: ComposeState) {
	const media = mediaKindOf(s.attachment?.mimeType);
	const { targets, skipped } = planTargets(s.channels, s.selected, media);
	const counts = countsFor(s.caption, targets.map((t) => t.platform));
	const problems: string[] = [];
	if (!s.selected.length) problems.push("Choose at least one channel.");
	else if (!targets.length) problems.push("None of the chosen channels can take this post.");
	if (!s.caption.trim() && !s.attachment) problems.push("Write a caption or attach a file.");
	for (const c of counts) if (c.over) problems.push(`The caption is too long for ${c.platform === "x" ? "X" : c.platform}.`);
	if (s.mode === "schedule" && !s.when) problems.push("Pick a date and time.");
	return { media, targets, skipped, counts, problems, canSend: !s.busy && problems.length === 0 };
}

/** What gets persisted with vscode.setState: the user's input, not server data. */
export function persistable(s: ComposeState) {
	const { caption, selected, attachment, mode, when, timezone } = s;
	return { caption, selected, attachment, mode, when, timezone };
}
