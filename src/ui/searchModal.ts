import { App, Modal, TFile, MarkdownView } from "obsidian";
import { Block, SearchResult } from "../types";
import { searchBlocks, loadAllBlocks } from "../blocks/searcher";

/**
 * Search modal for block search plugin
 * Displays a search input and results list with navigation
 */
export class SearchModal extends Modal {
	private query: string = "";
	private allBlocks: Block[] = [];
	private results: SearchResult[] = [];
	private selectedIndex: number = 0;
	private caseSensitive: boolean = false;
	private enableOperators: boolean = false;
	private lastSearchedQuery: string = "";
	private searchQuery: string = "";

	constructor(app: App, caseSensitive: boolean = false, enableOperators: boolean = false) {
		super(app);
		this.caseSensitive = caseSensitive;
		this.enableOperators = enableOperators;
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("block-search-modal");

		// Load all blocks from vault
		try {
			this.allBlocks = await loadAllBlocks(this.app);
		} catch (error) {
			contentEl.createEl("div", { text: `Error loading blocks: ${error}` });
			return;
		}

		// Create search input
		const inputContainer = contentEl.createEl("div", {
			cls: "block-search-input-container",
		});

		const input = inputContainer.createEl("input", {
			type: "text",
			placeholder: "Search blocks...",
			cls: "block-search-input",
		});

		input.focus();

		// Create results container
		const resultsContainer = contentEl.createEl("div", {
			cls: "block-search-results",
		});

		// Create Search button
		const searchBtn = inputContainer.createEl("button", {
			text: "Search",
			cls: "block-search-button",
		});
		searchBtn.addEventListener("click", () => {
			this.performSearch(resultsContainer);
		});

		// Handle input (don't perform search yet; show instruction)
		input.addEventListener("input", (e) => {
			this.query = (e.target as HTMLInputElement).value;
			this.selectedIndex = 0;
			this.updateTagSuggestions(inputContainer, input);
			this.updateResults(resultsContainer); // will show prompt to press Enter or click Search
		});

		// Handle keyboard navigation
		input.addEventListener("keydown", (e) => {
			if (e.key === "ArrowDown") {
				e.preventDefault();
				this.selectedIndex = Math.min(
					this.selectedIndex + 1,
					this.results.length - 1
				);
				this.updateResults(resultsContainer);
			} else if (e.key === "ArrowUp") {
				e.preventDefault();
				this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
				this.updateResults(resultsContainer);
			} else if (e.key === "Enter") {
				e.preventDefault();
				if (!this.query.trim()) return;
				// If query changed since last search, perform search; otherwise, jump to selected result
				if (this.query !== this.lastSearchedQuery) {
					this.performSearch(resultsContainer);
				} else {
					if (this.results && this.results.length > 0) {
						const selected = this.results[this.selectedIndex];
						if (selected) {
							this.jumpToBlock(selected.blocks[0]!);
						}
					}
				}
			}
		});

		// Initial render
		this.updateResults(resultsContainer);
	}

	private updateResults(resultsContainer: HTMLElement) {
		resultsContainer.empty();

		if (!this.query.trim()) {
			resultsContainer.createEl("div", {
				text: "Enter a search query...",
				cls: "block-search-placeholder",
			});
			return;
		}

		// If user typed a query but hasn't executed the search yet, prompt them
		if (this.query.trim() && this.query !== this.lastSearchedQuery) {
			resultsContainer.createEl("div", {
				text: 'Press Enter or click "Search" to start searching blocks...',
				cls: "block-search-ready",
			});
			return;
		}

		// Perform the actual search for the last executed query
		// this.results is set in performSearch

		if (this.results.length === 0) {
			resultsContainer.createEl("div", {
				text: "No results found.",
				cls: "block-search-no-results",
			});
			return;
		}

		this.results.forEach((result, index) => {
			const resultEl = resultsContainer.createEl("div", {
				cls:
					"block-search-result" +
					(index === this.selectedIndex ? " selected" : ""),
			});

			// File and line info (first block of the group)
			const head = result.blocks[0]!; // guaranteed non-empty group
			const infoEl = resultEl.createEl("div", { cls: "block-search-info" });
			infoEl.createEl("span", {
				text: head.fileName,
				cls: "block-search-file",
			});
			infoEl.createEl("span", {
				text: `Line ${head.lineNumber + 1}`,
				cls: "block-search-line",
			});

			// Grouped block text with highlighting
			const textEl = resultEl.createEl("div", { cls: "block-search-text" });
			// Build regexes for highlighting
			const flags = (this.caseSensitive ? "g" : "gi");
			let regexes: RegExp[];
			const queryToHighlight = this.searchQuery || this.query;
			if (queryToHighlight.includes(' ')) {
				const terms = queryToHighlight.trim().split(/\s+/).filter(t => t.length > 0);
				regexes = terms.map(term => {
					const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
					return new RegExp(escaped, flags);
				});
			} else {
				let regex: RegExp;
				try {
					regex = new RegExp(queryToHighlight, flags);
				} catch (e) {
					const escaped = queryToHighlight.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
					regex = new RegExp(escaped, flags);
				}
				regexes = [regex];
			}

			result.blocks.forEach((blk) => {
				// Reconstruct a simple markdown representation with indentation
				const indent = "  ".repeat(blk.level);
				const lineStr = `${indent}- ${blk.text}`;
				const lineEl = textEl.createEl("div", { cls: "block-search-line-item" });
				this.highlightTextWithRegexes(lineEl, lineStr, regexes);
			});

			// Jump to button
			resultEl.createEl("button", {
				text: "Jump",
				cls: "block-search-jump-button",
			});

			resultEl.addEventListener("click", () => {
				this.jumpToBlock(result.blocks[0]!);
			});
		});
	}

	private performSearch(resultsContainer: HTMLElement) {
		this.lastSearchedQuery = this.query;
		this.selectedIndex = 0;

		let blocksToSearch = this.allBlocks;
		let queryForSearch = this.query;

		if (this.enableOperators && this.query.startsWith('tag:#')) {
			const tagMatch = this.query.match(/^tag:#([^ ]+)/);
			if (tagMatch) {
				const tag = '#' + tagMatch[1];
				blocksToSearch = this.allBlocks.filter(block => {
					const file = this.app.vault.getAbstractFileByPath(block.filePath);
					if (!(file instanceof TFile)) return false;
					const cache = this.app.metadataCache.getFileCache(file);
					const frontmatterTags = cache?.frontmatter?.tags as string[] | undefined;
					const inlineTags = cache?.tags?.map(t => t.tag) || [];
					return (frontmatterTags?.includes(tag.slice(1)) ?? false) || inlineTags.includes(tag);
				});
				queryForSearch = this.query.replace(/^tag:#[^ ]+/, '').trim();
			}
		}

		this.searchQuery = queryForSearch;
		this.results = searchBlocks(this.searchQuery, blocksToSearch, this.caseSensitive);
		this.updateResults(resultsContainer);
	}

	private updateTagSuggestions(inputContainer: HTMLElement, input: HTMLInputElement) {
		let suggEl = inputContainer.querySelector('.tag-suggestions') as HTMLElement;
		if (this.enableOperators && this.query.startsWith('tag:#')) {
			const partial = this.query.slice(6); // after 'tag:#'
			const allTags = new Set<string>();
			this.app.vault.getFiles().forEach(file => {
				const cache = this.app.metadataCache.getFileCache(file);
				const frontmatterTags = cache?.frontmatter?.tags as string[] | undefined;
				if (frontmatterTags) {
					frontmatterTags.forEach((tag: string) => allTags.add('#' + tag));
				}
				if (cache?.tags) {
					cache.tags.forEach(t => allTags.add(t.tag));
				}
			});
			const suggestions = Array.from(allTags).filter(tag => tag.toLowerCase().startsWith(('#' + partial).toLowerCase())).slice(0, 10);

			if (!suggEl) {
				suggEl = inputContainer.createEl('div', { cls: 'tag-suggestions' });
				suggEl.setCssStyles({
					position: 'absolute',
					top: '100%',
					left: '0',
					right: '0',
					background: 'var(--background-primary)',
					border: '1px solid var(--background-modifier-border)',
					zIndex: '1000',
					maxHeight: '200px',
					overflowY: 'auto',
				});
			}
			suggEl.empty();
			suggestions.forEach(sugg => {
				const item = suggEl.createEl('div', { text: sugg, cls: 'tag-suggestion-item' });
				item.setCssStyles({
					padding: '4px 8px',
					cursor: 'pointer',
				});
				item.addEventListener('click', () => {
					this.query = 'tag:' + sugg;
					input.value = this.query;
					suggEl.remove();
					input.focus();
				});
				item.addEventListener('mouseenter', () => {
					item.setCssStyles({
						background: 'var(--background-modifier-hover)',
					});
				});
				item.addEventListener('mouseleave', () => {
					item.setCssStyles({
						background: '',
					});
				});
			});
		} else {
			if (suggEl) suggEl.remove();
		}
	}

	private highlightTextWithRegexes(
		container: HTMLElement,
		text: string,
		regexes: RegExp[]
	) {
		const queryToHighlight = this.searchQuery || this.query;
		if (!queryToHighlight.trim()) {
			container.setText(text);
			return;
		}

		// Collect all matches
		const matches: { start: number; end: number; text: string }[] = [];
		for (const regex of regexes) {
			const localRegex = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : regex.flags + "g");
			let m: RegExpExecArray | null;
			while ((m = localRegex.exec(text)) !== null) {
				matches.push({
					start: m.index,
					end: m.index + m[0].length,
					text: m[0]
				});
				if (localRegex.lastIndex === m.index) localRegex.lastIndex++;
			}
		}

		// Sort matches by start position
		matches.sort((a, b) => a.start - b.start);

		// Remove overlapping matches (keep the first one)
		const filtered: typeof matches = [];
		for (const match of matches) {
			if (filtered.length === 0 || match.start >= filtered[filtered.length - 1]!.end) {
				filtered.push(match);
			}
		}

		// Now highlight
		let lastIndex = 0;
		for (const match of filtered) {
			if (match.start > lastIndex) {
				container.appendText(text.substring(lastIndex, match.start));
			}
			const span = container.createEl("span", {
				text: match.text,
				cls: "search-result-file-matched-text",
			});
			lastIndex = match.end;
		}

		if (lastIndex < text.length) {
			container.appendText(text.substring(lastIndex));
		}
	}

	private async jumpToBlock(block: Block) {
		const file = this.app.vault.getAbstractFileByPath(block.filePath);
		if (!(file instanceof TFile)) {
			console.error(`File not found: ${block.filePath}`);
			return;
		}

		// Open the file
		const leaf = this.app.workspace.getLeaf();
		await leaf.openFile(file);

		// Jump to the line (first block of group)
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (view && view.editor) {
			view.editor.setCursor({ line: block.lineNumber, ch: 0 });
			view.editor.scrollIntoView({ from: { line: block.lineNumber, ch: 0 }, to: { line: block.lineNumber, ch: 0 } }, true);
		}

		this.close();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
