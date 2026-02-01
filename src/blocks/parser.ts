import { Block } from "../types";

/**
 * Extracts blocks (bullet points) from markdown content
 * @param content The markdown content to parse
 * @param filePath The path of the file being parsed
 * @returns Array of Block objects extracted from the markdown
 */
export function extractBlocksFromMarkdown(
	content: string,
	filePath: string
): Block[] {
	const lines = content.split("\n");
	const blocks: Block[] = [];
	const fileName = filePath.split("/").pop() || filePath;

	lines.forEach((line, lineNumber) => {
		// Skip empty lines
		if (!line.trim()) return;

		// Detect bullet point with indentation
		const match = line.match(/^(\s*)[-*•]\s+(.+)$/);
		if (match && match[1] !== undefined && match[2] !== undefined) {
			const indentation = match[1];
			const text = match[2];
			// Calculate level based on indentation (4 spaces or 1 tab = 1 level)
			const level = Math.floor(indentation.length / 2);

			blocks.push({
				text: text.trim(),
				level,
				lineNumber,
				filePath,
				fileName,
			});
		}
	});

	return blocks;
}
