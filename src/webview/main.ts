// The compose form. The form is built once; after that, only the parts that
// depend on what changed are updated, so typing never rebuilds the channel list.
import { Channel, platformLabel } from "../lib/core";
import { Action, ComposeState, derive, initialState, persistable, reduce } from "./state";

interface VsApi { postMessage(m: unknown): void; getState(): unknown; setState(s: unknown): void }

export function mount(root: HTMLElement, vscode: VsApi, defaultTz: string) {
	const saved = vscode.getState() as Partial<ComposeState> | undefined;
	let state: ComposeState = { ...initialState(defaultTz), ...(saved ?? {}), channels: [], busy: false, notice: null };

	const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] => {
		const n = Object.assign(document.createElement(tag), props) as HTMLElementTagNameMap[K];
		n.append(...kids);
		return n;
	};

	const caption = el("textarea", { id: "caption", rows: 7, placeholder: "What do you want to share?" });
	const counts = el("div", { id: "counts", className: "counts" });
	const channelList = el("div", { id: "channels", className: "channels" });
	const skipped = el("ul", { id: "skipped", className: "warn" });
	const attachName = el("span", { id: "attachment" });
	const attachBtn = el("button", { id: "attach", type: "button", className: "secondary", textContent: "Attach file…" });
	const clearBtn = el("button", { id: "clear-attachment", type: "button", className: "link", textContent: "Remove" });
	const modeSel = el("select", { id: "mode" });
	for (const [v, t] of [["now", "Publish now"], ["schedule", "Schedule"], ["draft", "Save as draft"]]) modeSel.append(el("option", { value: v, textContent: t }));
	const when = el("input", { id: "when", type: "datetime-local" });
	const tz = el("input", { id: "timezone", type: "text", spellcheck: false });
	// Each field gets the same heading as the form's sections, so the two read as part of it.
	const field = (label: string, input: HTMLElement) => el("label", { className: "field" }, el("span", { className: "head", textContent: label }), input);
	const scheduleRow = el("div", { className: "row fields", id: "schedule-row" }, field("Date and time", when), field("Time zone", tz));
	const problems = el("ul", { id: "problems", className: "muted" });
	const sendBtn = el("button", { id: "send", type: "button" });
	const notice = el("div", { id: "notice", role: "status" });
	const refresh = el("button", { id: "refresh-channels", type: "button", className: "link", textContent: "Refresh" });

	root.append(
		el("label", { htmlFor: "caption", className: "head" }, "Caption"), caption, counts,
		el("div", { className: "head" }, "Channels ", refresh), channelList, skipped,
		el("div", { className: "head" }, "Attachment"), el("div", { className: "row" }, attachBtn, attachName, clearBtn),
		el("div", { className: "head" }, "When to post"), modeSel, scheduleRow,
		problems, sendBtn, notice,
	);

	function renderChannels() {
		channelList.replaceChildren();
		if (!state.channels.length) channelList.append(el("p", { className: "muted", textContent: "No channels yet. Connect accounts in BulkPublish, then refresh." }));
		for (const c of state.channels) {
			const box = el("input", { type: "checkbox", value: String(c.id), checked: state.selected.includes(c.id) });
			box.dataset.channel = String(c.id);
			box.addEventListener("change", () => dispatch({ type: "toggle", id: c.id, on: box.checked }));
			channelList.append(el("label", { className: c.usable ? "chan" : "chan off" }, box, ` ${c.name} `, el("span", { className: "muted", textContent: platformLabel(c.platform) })));
		}
	}

	function renderDerived() {
		const d = derive(state);
		counts.replaceChildren(...d.counts.map((c) => el("span", { className: c.over ? "count over" : "count", textContent: `${platformLabel(c.platform)} ${c.length}${c.limit ? `/${c.limit}` : ""}` })));
		skipped.replaceChildren(...d.skipped.map((s) => el("li", { textContent: `${s.name} (${platformLabel(s.platform)}) will be skipped: it ${s.reason}.` })));
		problems.replaceChildren(...d.problems.map((p) => el("li", { textContent: p })));
		attachName.textContent = state.attachment ? state.attachment.name : "None";
		clearBtn.hidden = !state.attachment;
		scheduleRow.hidden = state.mode !== "schedule";
		sendBtn.textContent = state.busy ? "Sending…" : state.mode === "now" ? "Publish now" : state.mode === "schedule" ? "Schedule" : "Save draft";
		sendBtn.disabled = !d.canSend;
		notice.textContent = state.notice?.text ?? "";
		notice.className = state.notice ? `notice ${state.notice.kind}` : "";
	}

	/** Write state into inputs, but only where they differ, so the caret never jumps. */
	function syncInputs() {
		if (caption.value !== state.caption) caption.value = state.caption;
		if (modeSel.value !== state.mode) modeSel.value = state.mode;
		if (when.value !== state.when) when.value = state.when;
		if (tz.value !== state.timezone) tz.value = state.timezone;
	}

	function dispatch(a: Action) {
		state = reduce(state, a);
		vscode.setState(persistable(state));
		if (a.type === "channels") renderChannels();
		if (a.type === "prefill" || a.type === "sent") syncInputs();
		renderDerived();
	}

	caption.addEventListener("input", () => dispatch({ type: "caption", value: caption.value }));
	modeSel.addEventListener("change", () => dispatch({ type: "mode", value: modeSel.value as ComposeState["mode"] }));
	when.addEventListener("input", () => dispatch({ type: "when", value: when.value }));
	tz.addEventListener("input", () => dispatch({ type: "timezone", value: tz.value.trim() }));
	attachBtn.addEventListener("click", () => vscode.postMessage({ type: "pickFile" }));
	clearBtn.addEventListener("click", () => dispatch({ type: "attach", attachment: null }));
	refresh.addEventListener("click", () => vscode.postMessage({ type: "refreshChannels" }));
	sendBtn.addEventListener("click", () => {
		const d = derive(state);
		if (!d.canSend) return;
		dispatch({ type: "busy", value: true });
		vscode.postMessage({
			type: "send",
			payload: {
				caption: state.caption, attachment: state.attachment, mode: state.mode, when: state.when, timezone: state.timezone,
				targetIds: d.targets.map((t) => t.id),
			},
		});
	});

	window.addEventListener("message", (ev: MessageEvent) => {
		const m = ev.data as { type: string; [k: string]: unknown };
		if (m.type === "channels") dispatch({ type: "channels", channels: m.channels as Channel[] });
		else if (m.type === "prefill") dispatch({ type: "prefill", caption: m.caption as string | undefined, attachment: m.attachment as never });
		else if (m.type === "attached") dispatch({ type: "attach", attachment: m.attachment as never });
		else if (m.type === "result") {
			if (m.ok) dispatch({ type: "sent" });
			else dispatch({ type: "busy", value: false });
			dispatch({ type: "notice", notice: { kind: m.ok ? "ok" : "error", text: String(m.message) } });
		}
	});

	syncInputs();
	renderChannels();
	renderDerived();
	vscode.postMessage({ type: "ready" });
	return { get state() { return state; } };
}

declare function acquireVsCodeApi(): VsApi;
if (typeof acquireVsCodeApi === "function") {
	mount(document.getElementById("app")!, acquireVsCodeApi(), Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
}
