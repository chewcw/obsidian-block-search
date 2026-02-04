/**
 * Represents a block (bullet point or line) in markdown
 */
export interface Block {
	/** The text content of the block */
	text: string;
	/** The text used for searching (checkboxes stripped from tasks) */
	searchText: string;
	/** Nesting level (0 for root, 1 for first indent, etc.) */
	level: number;
	/** Line number in the source file (0-indexed) */
	lineNumber: number;
	/** Full path to the file containing this block */
	filePath: string;
	/** Name of the file containing this block */
	fileName: string;
	/** Section id (heading path) that contains this block */
	sectionId: string;
	/** Whether this block is a task */
	isTask: boolean;
	/** Task status, if any */
	taskStatus: "todo" | "done" | null;
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

export interface Section {
	id: string;
	heading: string;
	level: number;
	startLine: number;
	endLine: number;
	text: string;
}

export interface FileContext {
	filePath: string;
	fileName: string;
	extension: string;
	content: string;
	lines: string[];
	tags: string[];
	frontmatter: Record<string, unknown> | null;
	sections: Section[];
	lineToSectionId: string[];
}
