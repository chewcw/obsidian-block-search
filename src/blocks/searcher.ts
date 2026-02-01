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

	// Build regex from query; fallback to escaped literal if invalid
	const flags = (caseSensitive ? "g" : "gi");
	let regex: RegExp;
	try {
		regex = new RegExp(query, flags);
	} catch (e) {
		const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		regex = new RegExp(escaped, flags);
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
		let matchCount = 0;
		let anyMatch = false;
		for (const blk of group) {
			const matches = blk.text.match(regex);
			if (matches && matches.length > 0) {
				anyMatch = true;
				matchCount += matches.length;
			}
		}

		if (anyMatch) {
			results.push({
				blocks: group,
				matchScore: matchCount,
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
