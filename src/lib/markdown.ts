// Turn a Markdown document into a starting caption and an attachment.

export interface MarkdownShare {
	title: string;
	description: string;
	/** The first image's target as written: a relative path or a URL. */
	image: string | null;
}

function unquote(v: string): string {
	const t = v.trim();
	if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1);
	return t;
}

/** Flat `key: value` front matter. Nested YAML is ignored; we only need two strings. */
export function frontMatter(src: string): { data: Record<string, string>; body: string } {
	const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(src);
	if (!m) return { data: {}, body: src };
	const data: Record<string, string> = {};
	for (const line of m[1].split(/\r?\n/)) {
		const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
		if (kv && kv[2].trim()) data[kv[1]] = unquote(kv[2]);
	}
	return { data, body: src.slice(m[0].length) };
}

export function parseMarkdownShare(src: string): MarkdownShare {
	const { data, body } = frontMatter(src);
	const heading = /^#\s+(.+)$/m.exec(body)?.[1]?.trim() ?? "";
	const title = data.title || heading;
	const description = data.description || data.excerpt || data.summary || "";
	const fmImage = data.image || data.cover || data.cover_image || data.featured_image || "";
	const inline =
		/!\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+["'][^"']*["'])?\s*\)/.exec(body)?.[1] ??
		/<img\b[^>]*\bsrc=["']([^"']+)["']/i.exec(body)?.[1] ??
		null;
	return { title, description, image: fmImage || inline };
}

export function captionFromMarkdown(s: MarkdownShare): string {
	return [s.title, s.description].filter(Boolean).join("\n\n");
}
