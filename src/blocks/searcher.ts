import { App } from "obsidian";
import { Block, FileContext, SearchResult } from "../types";
import { buildFileContext } from "./fileIndex";
import { extractBlocksFromMarkdown } from "./parser";
import { parseQuery } from "../search/queryParser";
import { evaluateQuery, EvalContext, GroupContext } from "../search/queryEvaluator";

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
	fileContexts: Map<string, FileContext>,
	caseSensitive: boolean = false
): { results: SearchResult[]; errors: string[] } {
	if (!query.trim()) return { results: [], errors: [] };

	const parsed = parseQuery(query, { allowOperators: true });
	if (parsed.errors.length > 0) return { results: [], errors: parsed.errors };

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
		const root = group[0];
		if (!root) return;
		const fileContext = fileContexts.get(root.filePath);
		if (!fileContext) return;

		const groupText = group.map((blk) => blk.searchText).join("\n");
		const groupContext: GroupContext = { blocks: group, root, groupText };
		const evalContext: EvalContext = {
			file: fileContext,
			group: groupContext,
			caseSensitive,
		};

		const result = evaluateQuery(parsed.root, evalContext);
		if (!result.matched) return;

		results.push({
			blocks: group,
			matchScore: result.score,
		});
	});

	// Sort by match score (descending), then by file name, then by starting line number
	results.sort((a, b) => {
		if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
		const aFile = a.blocks[0]!.fileName;
		const bFile = b.blocks[0]!.fileName;
		if (aFile !== bFile) return aFile.localeCompare(bFile);
		return a.blocks[0]!.lineNumber - b.blocks[0]!.lineNumber;
	});

	return { results, errors: [] };
}

/**
 * Loads all blocks from all markdown files in the vault
 * @param app The Obsidian app instance
 * @returns Promise resolving to array of all blocks in the vault
 */
export async function loadAllBlocks(app: App): Promise<{
	blocks: Block[];
	fileContexts: Map<string, FileContext>;
}> {
	const blocks: Block[] = [];
	const fileContexts = new Map<string, FileContext>();
	const files = app.vault.getFiles();

	for (const file of files) {
		if (file.extension === "md") {
			try {
				const content = await app.vault.read(file);
				const fileContext = buildFileContext(app, file, content);
				fileContexts.set(file.path, fileContext);
				const fileBlocks = extractBlocksFromMarkdown(
					content,
					file.path,
					fileContext.lineToSectionId
				);
				blocks.push(...fileBlocks);
			} catch (error) {
				console.error(`Error reading file ${file.path}:`, error);
			}
		}
	}

	return { blocks, fileContexts };
}
