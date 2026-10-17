import { describe, expect, it } from "vitest";
import { captionFromMarkdown, parseMarkdownShare } from "../../src/lib/markdown";

describe("markdown share", () => {
	it("uses front matter title/description and the first image", () => {
		const s = parseMarkdownShare(`---\ntitle: "Launch day"\ndescription: We shipped it.\ntags: [a, b]\n---\n\n# Other\n\nText ![shot](./img/one.png "t") and ![two](two.jpg)\n`);
		expect(s).toEqual({ title: "Launch day", description: "We shipped it.", image: "./img/one.png" });
		expect(captionFromMarkdown(s)).toBe("Launch day\n\nWe shipped it.");
	});
	it("falls back to the first heading, an html img, and a front matter image", () => {
		expect(parseMarkdownShare(`# Hello\n<img src="a.webp">`)).toEqual({ title: "Hello", description: "", image: "a.webp" });
		expect(parseMarkdownShare(`---\ntitle: T\nimage: cover.png\n---\n![x](b.png)`).image).toBe("cover.png");
	});
});
