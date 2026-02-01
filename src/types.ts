/**
 * Represents a block (bullet point or line) in markdown
 */
export interface Block {
	/** The text content of the block */
	text: string;
	/** Nesting level (0 for root, 1 for first indent, etc.) */
	level: number;
	/** Line number in the source file (0-indexed) */
	lineNumber: number;
	/** Full path to the file containing this block */
	filePath: string;
	/** Name of the file containing this block */
	fileName: string;
}

/**
 * Search result containing a block and its relevance score
 */
export interface SearchResult {
	/** Blocks in the result group (parent + nested children) */
	blocks: Block[];
	/** Match score for ranking results (higher is better) */
	matchScore: number;
}
