import { App, TFile } from "obsidian";
import { Block, SearchResult } from "../types";
import { extractBlocksFromMarkdown } from "./parser";

/**
 * Searches blocks by query using case-insensitive partial matching
 * @param query The search query
 * @param blocks Array of blocks to search
 * @param caseSensitive Whether to perform case-sensitive matching
 * @returns Array of search results sorted by match score
 */
export function searchBlocks(
	query: string,
	blocks: Block[],
	caseSensitive: boolean = false
): SearchResult[] {
	if (!query.trim()) return [];

	const flags = (caseSensitive ? "g" : "gi");
	let regexes: RegExp[];

	if (query.includes(' ')) {
		// Multi-word AND search
		const terms = query.trim().split(/\s+/).filter(t => t.length > 0);
		regexes = terms.map(term => {
			const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			return new RegExp(escaped, flags);
		});
	} else {
		// Single regex or literal
		let regex: RegExp;
		try {
			regex = new RegExp(query, flags);
		} catch (e) {
			const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			regex = new RegExp(escaped, flags);
		}
		regexes = [regex];
	}

	// Group blocks into parent + nested children groups
	const groups: Block[][] = [];
	let currentGroup: Block[] = [];
	let currentRootLevel = Infinity;

	for (let i = 0; i < blocks.length; i++) {
		const b = blocks[i]!; // non-null assertion; index is in range
		if (currentGroup.length === 0) {
			currentGroup = [b];
			currentRootLevel = b.level;
			continue;
		}

		if (b.level > currentRootLevel) {
			// nested child of current root
			currentGroup.push(b);
		} else {
			// start new group
			groups.push(currentGroup);
			currentGroup = [b];
			currentRootLevel = b.level;
		}
	}

	if (currentGroup.length > 0) groups.push(currentGroup);

	const results: SearchResult[] = [];

	groups.forEach((group) => {
		let totalMatchCount = 0;
		let allMatched = regexes.length > 0;
		for (const regex of regexes) {
			let termMatchCount = 0;
			for (const blk of group) {
				const matches = blk.text.match(regex);
				if (matches) {
					termMatchCount += matches.length;
				}
			}
			if (termMatchCount === 0) {
				allMatched = false;
				break;
			}
			totalMatchCount += termMatchCount;
		}

		if (allMatched) {
			results.push({
				blocks: group,
				matchScore: totalMatchCount,
			});
		}
	});

	// Sort by match score (descending), then by file name, then by starting line number
	results.sort((a, b) => {
		if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
		const aFile = a.blocks[0]!.fileName;
		const bFile = b.blocks[0]!.fileName;
		if (aFile !== bFile) return aFile.localeCompare(bFile);
		return a.blocks[0]!.lineNumber - b.blocks[0]!.lineNumber;
	});

	return results;
}

/**
 * Loads all blocks from all markdown files in the vault
 * @param app The Obsidian app instance
 * @returns Promise resolving to array of all blocks in the vault
 */
export async function loadAllBlocks(app: App): Promise<Block[]> {
	const blocks: Block[] = [];
	const files = app.vault.getFiles();

	for (const file of files) {
		if (file.extension === "md") {
			try {
				const content = await app.vault.read(file);
				const fileBlocks = extractBlocksFromMarkdown(content, file.path);
				blocks.push(...fileBlocks);
			} catch (error) {
				console.error(`Error reading file ${file.path}:`, error);
			}
		}
	}

	return blocks;
}
