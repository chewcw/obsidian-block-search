import { App, TFile } from "obsidian";
import { FileContext, Section } from "../types";

function parseSections(lines: string[]): { sections: Section[]; lineToSectionId: string[] } {
	const sections: Section[] = [];
	const lineToSectionId: string[] = new Array(lines.length).fill("root");
	const headingStack: { level: number; title: string }[] = [];

	let currentStart = 0;
	let currentId = "root";
	let currentHeading = "";
	let currentLevel = 0;

	const closeSection = (endLine: number) => {
		const startLine = currentStart;
		const text = lines.slice(startLine, endLine + 1).join("\n");
		sections.push({
			id: currentId,
			heading: currentHeading,
			level: currentLevel,
			startLine,
			endLine,
			text,
		});
		for (let i = startLine; i <= endLine && i < lineToSectionId.length; i++) {
			lineToSectionId[i] = currentId;
		}
	};

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] ?? "";
		const match = line.match(/^(#{1,6})\s+(.*)$/);
		if (!match || match[1] === undefined || match[2] === undefined) continue;

		if (i > currentStart) {
			closeSection(i - 1);
		}

		const level = match[1].length;
		const title = match[2].trim();

		while (headingStack.length > 0 && headingStack[headingStack.length - 1]!.level >= level) {
			headingStack.pop();
		}
		headingStack.push({ level, title });

		currentStart = i;
		currentHeading = title;
		currentLevel = level;
		currentId = headingStack.map((h) => h.title).join(" > ") || "root";
	}

	if (lines.length > 0) {
		closeSection(lines.length - 1);
	}

	return { sections, lineToSectionId };
}

function normalizeTags(rawTags: { tag: string }[] | undefined): string[] {
	if (!rawTags) return [];
	return rawTags.map((t) => t.tag);
}

export function buildFileContext(app: App, file: TFile, content: string): FileContext {
	const lines = content.split("\n");
	const { sections, lineToSectionId } = parseSections(lines);
	const cache = app.metadataCache.getFileCache(file);
	const tags = normalizeTags(cache?.tags);
	const frontmatter = cache?.frontmatter ? { ...cache.frontmatter } : null;

	return {
		filePath: file.path,
		fileName: file.name,
		extension: file.extension,
		content,
		lines,
		tags,
		frontmatter,
		sections,
		lineToSectionId,
	};
}
