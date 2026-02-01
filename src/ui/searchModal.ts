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
	private lastSearchedQuery: string = "";

	constructor(app: App, caseSensitive: boolean = false) {
		super(app);
		this.caseSensitive = caseSensitive;
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
		this.results = searchBlocks(this.query, this.allBlocks, this.caseSensitive);

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
			// Build regex for highlighting (reuse same logic as search)
			const flags = (this.caseSensitive ? "g" : "gi");
			let regex: RegExp;
			try {
				regex = new RegExp(this.query, flags);
			} catch (e) {
				const escaped = this.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
				regex = new RegExp(escaped, flags);
			}

			result.blocks.forEach((blk) => {
				// Reconstruct a simple markdown representation with indentation
				const indent = "  ".repeat(blk.level);
				const lineStr = `${indent}- ${blk.text}`;
				const lineEl = textEl.createEl("div", { cls: "block-search-line-item" });
				this.highlightTextWithRegex(lineEl, lineStr, regex);
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
		this.updateResults(resultsContainer);
	}

	private highlightTextWithRegex(
		container: HTMLElement,
		text: string,
		regex: RegExp
	) {
		if (!this.query.trim()) {
			container.setText(text);
			return;
		}

		let lastIndex = 0;
		// Use exec to find all matches and preserve original case
		let m: RegExpExecArray | null;
		const localRegex = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : regex.flags + "g");
		while ((m = localRegex.exec(text)) !== null) {
			const index = m.index;
			if (index > lastIndex) {
				container.appendText(text.substring(lastIndex, index));
			}
			const span = container.createEl("span", {
				text: text.substring(index, index + m[0].length),
				cls: "block-search-highlight",
			});
			lastIndex = index + m[0].length;
			// Avoid infinite loops for empty matches
			if (localRegex.lastIndex === index) localRegex.lastIndex++;
		}

		if (lastIndex < text.length) {
			container.appendText(text.substring(lastIndex));
		}
	}

	private async jumpToBlock(block: Block) {
		const file = this.app.vault.getAbstractFileByPath(
			block.filePath
		) as TFile;

		if (!file) {
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
