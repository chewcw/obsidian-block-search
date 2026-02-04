import { Block } from "../types";

/**
 * Extracts blocks (bullet points) from markdown content
 * @param content The markdown content to parse
 * @param filePath The path of the file being parsed
 * @returns Array of Block objects extracted from the markdown
 */
export function extractBlocksFromMarkdown(
	content: string,
	filePath: string,
	lineToSectionId: string[]
): Block[] {
	const lines = content.split("\n");
	const blocks: Block[] = [];
	const fileName = filePath.split("/").pop() || filePath;

	lines.forEach((line, lineNumber) => {
		// Skip empty lines
		if (!line.trim()) return;

		// Detect list item (unordered or ordered) with indentation
		const match = line.match(/^(\s*)(?:[-*+•]|\d+[.)])\s+(.+)$/);
		if (match && match[1] !== undefined && match[2] !== undefined) {
			const indentation = match[1];
			const text = match[2];
			const normalizedIndent = indentation.replace(/\t/g, "  ");
			const level = Math.floor(normalizedIndent.length / 2);

			let isTask = false;
			let taskStatus: "todo" | "done" | null = null;
			let searchText = text.trim();

			const taskMatch = searchText.match(/^\[( |x|X)\]\s+(.*)$/);
			if (taskMatch && taskMatch[1] !== undefined && taskMatch[2] !== undefined) {
				isTask = true;
				taskStatus = taskMatch[1].toLowerCase() === "x" ? "done" : "todo";
				searchText = taskMatch[2].trim();
			}

			const sectionId = lineToSectionId[lineNumber] ?? "root";

			blocks.push({
				text: text.trim(),
				searchText,
				level,
				lineNumber,
				filePath,
				fileName,
				sectionId,
				isTask,
				taskStatus,
			});
		}
	});

	return blocks;
}
