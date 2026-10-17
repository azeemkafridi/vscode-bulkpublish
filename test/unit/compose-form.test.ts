// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { initialState, reduce } from "../../src/webview/state";
import { mount } from "../../src/webview/main";

const channels = [
	{ id: 1, platform: "x", name: "Me on X", usable: true },
	{ id: 2, platform: "linkedin", name: "Me on LinkedIn", usable: true },
	{ id: 3, platform: "instagram", name: "Gram", usable: true },
];

function setup(saved?: unknown) {
	document.body.innerHTML = `<main id="app"></main>`;
	const posted: { type: string; payload?: Record<string, unknown> }[] = [];
	let stored: unknown = saved;
	const api = { postMessage: (m: never) => posted.push(m), getState: () => stored, setState: (s: unknown) => { stored = s; } };
	const form = mount(document.getElementById("app")!, api, "UTC");
	const fromHost = (data: unknown) => window.dispatchEvent(new MessageEvent("message", { data }));
	return { form, posted, fromHost, stored: () => stored as Record<string, unknown> };
}

const box = (id: number) => document.querySelector<HTMLInputElement>(`input[data-channel="${id}"]`)!;
const type = (text: string) => {
	const t = document.getElementById("caption") as HTMLTextAreaElement;
	t.value = text;
	t.dispatchEvent(new Event("input"));
};

describe("compose state", () => {
	it("a caption change keeps the selection", () => {
		let s = reduce(initialState("UTC"), { type: "channels", channels });
		s = reduce(s, { type: "toggle", id: 2, on: true });
		s = reduce(s, { type: "caption", value: "hello" });
		expect(s.selected).toEqual([2]);
	});
});

describe("compose form", () => {
	it("typing in the caption does not reset the chosen channels", () => {
		const { form, fromHost, stored } = setup();
		fromHost({ type: "channels", channels });
		box(1).click();
		box(2).click();
		const before = box(1);
		for (const ch of "Hello world, this is a post") type((document.getElementById("caption") as HTMLTextAreaElement).value + ch);
		expect(box(1)).toBe(before); // same element: the list was not rebuilt
		expect(box(1).checked).toBe(true);
		expect(box(2).checked).toBe(true);
		expect(box(3).checked).toBe(false);
		expect(form.state.selected).toEqual([1, 2]);
		expect(stored()).toMatchObject({ caption: "Hello world, this is a post", selected: [1, 2] });
	});

	it("a refreshed channel list and a prefill keep the selection too", () => {
		const { fromHost } = setup();
		fromHost({ type: "channels", channels });
		box(2).click();
		fromHost({ type: "channels", channels });
		fromHost({ type: "prefill", caption: "From a file" });
		expect(box(2).checked).toBe(true);
		expect((document.getElementById("caption") as HTMLTextAreaElement).value).toBe("From a file");
	});

	it("restores from saved state", () => {
		const { fromHost } = setup({ caption: "draft", selected: [3], mode: "draft" });
		fromHost({ type: "channels", channels });
		expect(box(3).checked).toBe(true);
		expect((document.getElementById("caption") as HTMLTextAreaElement).value).toBe("draft");
	});

	it("shows live counts, skip warnings, and blocks a too-long caption", () => {
		const { fromHost, posted } = setup();
		fromHost({ type: "channels", channels });
		box(1).click();
		box(3).click();
		type("x".repeat(281));
		expect(document.getElementById("counts")!.textContent).toContain("X 281/280");
		expect(document.getElementById("skipped")!.textContent).toContain("Gram (Instagram) will be skipped: it needs an image.");
		const send = document.getElementById("send") as HTMLButtonElement;
		expect(send.disabled).toBe(true);
		type("short and sweet");
		expect(send.disabled).toBe(false);
		send.click();
		expect(posted.at(-1)).toMatchObject({ type: "send", payload: { caption: "short and sweet", mode: "now", targetIds: [1] } });
	});
});
