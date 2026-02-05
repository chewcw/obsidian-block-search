import { App, TFile, MarkdownView } from "obsidian";
import { Block, SearchResult } from "../types";
import { searchBlocks, loadAllBlocks } from "../blocks/searcher";
import { parseQuery } from "../search/queryParser";
import { QueryNode, QueryTerm } from "../search/queryTypes";
import { FileContext } from "../types";

/**
 * Search panel UI that can be mounted in a modal or a view.
 */
interface SearchPanelOptions {
	caseSensitive?: boolean;
	onJump?: () => void;
	enableVim?: boolean;
}

export class SearchPanel {
	private app: App;
	private containerEl: HTMLElement;
	private query: string = "";
	private allBlocks: Block[] = [];
	private fileContexts: Map<string, FileContext> = new Map();
	private results: SearchResult[] = [];
	private selectedIndex: number = 0;
	private caseSensitive: boolean = false;
	private onJump?: () => void;
	private enableVim: boolean = false;
	private lastSearchedQuery: string = "";
	private inputEl: HTMLInputElement | null = null;
	private searchButtonEl: HTMLButtonElement | null = null;
	private resultsContainerEl: HTMLElement | null = null;
	private vimMode: "insert" | "normal" | "visual" = "insert";
	private vimModeEl: HTMLElement | null = null;
	private vimVisualAnchor: number | null = null;

	constructor(app: App, containerEl: HTMLElement, options: SearchPanelOptions = {}) {
		this.app = app;
		this.containerEl = containerEl;
		this.caseSensitive = options.caseSensitive ?? false;
		this.onJump = options.onJump;
		this.enableVim = options.enableVim ?? false;
	}

	async mount() {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass("block-search-modal");

		const shell = containerEl.createEl("div", { cls: "block-search-shell" });
		const header = shell.createEl("div", { cls: "block-search-header" });
		const headerText = header.createEl("div", { cls: "block-search-header-text" });
		headerText.createEl("div", { text: "Block search", cls: "block-search-title" });
		headerText.createEl("div", {
			text: "Scan your vault by phrase, tag, or structure.",
			cls: "block-search-subtitle",
		});
		const headerMeta = header.createEl("div", { cls: "block-search-header-meta" });
		if (this.caseSensitive) {
			headerMeta.createEl("span", {
				text: "Case sensitive",
				cls: "block-search-pill",
			});
		}

		// Load all blocks from vault
		try {
			const index = await loadAllBlocks(this.app);
			this.allBlocks = index.blocks;
			this.fileContexts = index.fileContexts;
		} catch (error) {
			containerEl.createEl("div", { text: `Error loading blocks: ${error}` });
			return;
		}

		// Create search input
		const inputContainer = shell.createEl("div", {
			cls: "block-search-input-container",
		});

		const input = inputContainer.createEl("input", {
			type: "text",
			placeholder: "Search blocks...",
			cls: "block-search-input",
		});
		this.inputEl = input;

		if (this.enableVim) {
			const modeIndicator = inputContainer.createEl("span", {
				cls: "block-search-vim-mode",
			});
			this.vimModeEl = modeIndicator;
			this.setVimMode("insert");
		}

		input.focus();

		const searchHint = shell.createEl("div", { cls: "block-search-hints" });
		const hintText = searchHint.createEl("div", { cls: "block-search-hint-text" });
		hintText.createEl("span", { text: "Enter", cls: "block-search-hint-label" });
		hintText.createEl("span", { text: "to search •", cls: "block-search-hint-muted" });
		hintText.createEl("span", { text: "↑/↓", cls: "block-search-hint-label" });
		hintText.createEl("span", { text: "to navigate", cls: "block-search-hint-muted" });
		const hintChips = searchHint.createEl("div", { cls: "block-search-chips" });
		const chipValues = [
			'"exact phrase"',
			"/regex/",
			"file:meeting",
			"tag:project",
			"[priority:high]",
			"-exclude",
		];
		chipValues.forEach((chip) => {
			hintChips.createEl("span", { text: chip, cls: "block-search-chip" });
		});

		// Create results container
		const resultsContainer = shell.createEl("div", {
			cls: "block-search-results",
		});
		this.resultsContainerEl = resultsContainer;

		// Create Search button
		const searchBtn = inputContainer.createEl("button", {
			text: "Search",
			cls: "block-search-button",
		});
		searchBtn.setAttr("type", "button");
		this.searchButtonEl = searchBtn;
		searchBtn.addEventListener("click", () => {
			this.performSearch(resultsContainer);
		});

		const handleEnter = () => {
			if (!this.query.trim()) return;
			if (this.query !== this.lastSearchedQuery) {
				this.performSearch(resultsContainer);
			} else if (this.results && this.results.length > 0) {
				const selected = this.results[this.selectedIndex];
				if (selected) {
					this.jumpToBlock(selected.blocks[0]!);
				}
			}
		};

		const applyInputValue = (value: string) => {
			input.value = value;
			this.query = value;
			this.selectedIndex = 0;
			this.updateResults(resultsContainer);
		};

		const moveCursor = (delta: number, extendSelection: boolean = false) => {
			const value = input.value;
			const selectionStart = input.selectionStart ?? 0;
			const selectionEnd = input.selectionEnd ?? selectionStart;
			const selectionDirection = input.selectionDirection ?? "none";
			const activePos = selectionDirection === "backward" ? selectionStart : selectionEnd;
			const basePos = extendSelection ? activePos : selectionStart;
			const pos = basePos;
			const next = Math.max(0, Math.min(value.length, pos + delta));
			setSelection(next, extendSelection);
		};

		const moveCursorToStart = (extendSelection: boolean = false) => {
			setSelection(0, extendSelection);
		};

		const moveCursorToEnd = (extendSelection: boolean = false) => {
			const value = input.value;
			setSelection(value.length, extendSelection);
		};

		const moveCursorByWord = (direction: "forward" | "backward", extendSelection: boolean = false) => {
			const value = input.value;
			let pos = input.selectionStart ?? 0;
			const isWordChar = (ch: string) => /[A-Za-z0-9_]/.test(ch);

			if (direction === "forward") {
				while (pos < value.length && isWordChar(value[pos] ?? "")) pos++;
				while (pos < value.length && !isWordChar(value[pos] ?? "")) pos++;
			} else {
				pos = Math.max(0, pos - 1);
				while (pos > 0 && !isWordChar(value[pos] ?? "")) pos--;
				while (pos > 0 && isWordChar(value[pos - 1] ?? "")) pos--;
			}
			setSelection(pos, extendSelection);
		};

		const moveCursorToWordEnd = (extendSelection: boolean = false) => {
			const value = input.value;
			const selectionStart = input.selectionStart ?? 0;
			const selectionEnd = input.selectionEnd ?? selectionStart;
			const selectionDirection = input.selectionDirection ?? "none";
			const activePos = extendSelection
				? (selectionDirection === "backward" ? selectionStart : selectionEnd)
				: selectionStart;
			let pos = activePos;
			const isWordChar = (ch: string) => /[A-Za-z0-9_]/.test(ch);

			if (value.length === 0) {
				setSelection(0, extendSelection);
				return;
			}

			// If not on a word char, move to start of next word.
			while (pos < value.length && !isWordChar(value[pos] ?? "")) pos++;

			if (pos >= value.length) {
				setSelection(value.length, extendSelection);
				return;
			}

			// Move to end of current word (caret after last word char).
			while (pos < value.length && isWordChar(value[pos] ?? "")) pos++;

			setSelection(pos, extendSelection);
		};

		const setSelection = (cursorPos: number, extendSelection: boolean) => {
			if (extendSelection) {
				if (this.vimVisualAnchor === null) {
					this.vimVisualAnchor = input.selectionStart ?? cursorPos;
				}
				const anchor = this.vimVisualAnchor ?? cursorPos;
				const start = Math.min(anchor, cursorPos);
				const end = Math.max(anchor, cursorPos);
				const direction = cursorPos >= anchor ? "forward" : "backward";
				input.setSelectionRange(start, end, direction);
				return;
			}
			this.vimVisualAnchor = null;
			input.setSelectionRange(cursorPos, cursorPos);
		};

		const deleteCharUnderCursor = () => {
			const value = input.value;
			const pos = input.selectionStart ?? 0;
			if (pos >= value.length) return;
			const nextValue = value.slice(0, pos) + value.slice(pos + 1);
			applyInputValue(nextValue);
			input.setSelectionRange(pos, pos);
		};

		const deleteWordBackward = () => {
			const value = input.value;
			let pos = input.selectionStart ?? 0;
			const isWordChar = (ch: string) => /[A-Za-z0-9_]/.test(ch);
			if (pos === 0) return;
			let start = pos;
			while (start > 0 && !isWordChar(value[start - 1] ?? "")) start--;
			while (start > 0 && isWordChar(value[start - 1] ?? "")) start--;
			const nextValue = value.slice(0, start) + value.slice(pos);
			applyInputValue(nextValue);
			input.setSelectionRange(start, start);
		};

		const deleteSelectionOrChar = (backspace: boolean = false) => {
			const value = input.value;
			const start = input.selectionStart ?? 0;
			const end = input.selectionEnd ?? start;
			if (start !== end) {
				const nextValue = value.slice(0, start) + value.slice(end);
				applyInputValue(nextValue);
				input.setSelectionRange(start, start);
				return;
			}
			if (backspace) {
				if (start === 0) return;
				const nextValue = value.slice(0, start - 1) + value.slice(start);
				applyInputValue(nextValue);
				input.setSelectionRange(start - 1, start - 1);
				return;
			}
			if (start >= value.length) return;
			const nextValue = value.slice(0, start) + value.slice(start + 1);
			applyInputValue(nextValue);
			input.setSelectionRange(start, start);
		};

		const copySelection = async () => {
			const start = input.selectionStart ?? 0;
			const end = input.selectionEnd ?? start;
			if (start === end) return;
			const selected = input.value.slice(start, end);
			try {
				await navigator.clipboard.writeText(selected);
			} catch {
				// ignore clipboard errors
			}
		};

		const moveFocus = (delta: number, current: HTMLElement) => {
			const focusables = this.getFocusOrder();
			const index = focusables.indexOf(current);
			if (index === -1 || focusables.length === 0) return;
			const nextIndex = Math.min(
				Math.max(index + delta, 0),
				focusables.length - 1
			);
			if (nextIndex !== index) {
				focusables[nextIndex]!.focus();
			}
		};

		const handleTab = (e: KeyboardEvent, current: HTMLElement) => {
			if (e.key !== "Tab") return;
			e.preventDefault();
			moveFocus(e.shiftKey ? -1 : 1, current);
		};

		input.addEventListener("keydown", (e) => handleTab(e, input));
		searchBtn.addEventListener("keydown", (e) => handleTab(e, searchBtn));

		input.addEventListener("keydown", (e) => {
			if (!this.enableVim) return;
			if (e.key === "Tab") return;
			if (e.ctrlKey) {
				if (e.key === "[" || e.code === "BracketLeft") {
					e.preventDefault();
					this.setVimMode("normal");
					return;
				}
				if (this.vimMode === "insert") {
					if (e.key === "h") {
						e.preventDefault();
						const value = input.value;
						const pos = input.selectionStart ?? 0;
						if (pos === 0) return;
						const nextValue = value.slice(0, pos - 1) + value.slice(pos);
						applyInputValue(nextValue);
						input.setSelectionRange(pos - 1, pos - 1);
						return;
					}
					if (e.key === "w") {
						e.preventDefault();
						deleteWordBackward();
						return;
					}
					if (e.key === "m") {
						e.preventDefault();
						handleEnter();
						return;
					}
				}
				return;
			}
			if (e.metaKey || e.altKey) return;

			if (this.vimMode === "insert") {
				if (e.key === "Escape") {
					e.preventDefault();
					this.setVimMode("normal");
				}
				return;
			}

			switch (e.key) {
				case "v":
					e.preventDefault();
					this.setVimMode(this.vimMode === "visual" ? "normal" : "visual");
					break;
				case "i":
					e.preventDefault();
					this.setVimMode("insert");
					break;
				case "a":
					e.preventDefault();
					this.setVimMode("insert");
					moveCursor(1);
					break;
				case "h":
					e.preventDefault();
					moveCursor(-1, this.vimMode === "visual");
					break;
				case "l":
					e.preventDefault();
					moveCursor(1, this.vimMode === "visual");
					break;
				case "0":
					e.preventDefault();
					moveCursorToStart(this.vimMode === "visual");
					break;
				case "$":
					e.preventDefault();
					moveCursorToEnd(this.vimMode === "visual");
					break;
				case "w":
					e.preventDefault();
					moveCursorByWord("forward", this.vimMode === "visual");
					break;
				case "e":
					e.preventDefault();
					moveCursorToWordEnd(this.vimMode === "visual");
					break;
				case "b":
					e.preventDefault();
					moveCursorByWord("backward", this.vimMode === "visual");
					break;
				case "x":
					e.preventDefault();
					if (this.vimMode === "visual") {
						deleteSelectionOrChar(false);
					} else {
						deleteCharUnderCursor();
					}
					break;
				case "c":
					e.preventDefault();
					if (this.vimMode === "visual") {
						deleteSelectionOrChar(false);
					} else {
						deleteCharUnderCursor();
					}
					this.setVimMode("insert");
					break;
				case "X":
					e.preventDefault();
					deleteSelectionOrChar(true);
					break;
				case "C":
					e.preventDefault();
					const currentValue = input.value;
					const cursorPos = input.selectionStart ?? 0;
					applyInputValue(currentValue.slice(0, cursorPos));
					input.setSelectionRange(cursorPos, cursorPos);
					break;
				case "y":
					if (this.vimMode === "visual") {
						e.preventDefault();
						void copySelection();
					}
					break;
				case "d":
					if (this.vimMode === "visual") {
						e.preventDefault();
						deleteSelectionOrChar(false);
					}
					break;
				case "/":
					e.preventDefault();
					this.setVimMode("insert");
					break;
				case "Enter":
					e.preventDefault();
					handleEnter();
					break;
				case "Escape":
					e.preventDefault();
					this.setVimMode("normal");
					break;
				default:
					if (e.key.length === 1 || e.key === "Backspace" || e.key === "Delete") {
						e.preventDefault();
					}
					break;
			}
		});

		input.addEventListener("focus", () => {
			if (!this.enableVim) return;
			this.setVimMode(this.vimMode);
		});

		// Handle input (don't perform search yet; show instruction)
		input.addEventListener("input", (e) => {
			this.query = (e.target as HTMLInputElement).value;
			this.selectedIndex = 0;
			this.updateResults(resultsContainer); // will show prompt to press Enter or click Search
		});

		// Handle keyboard navigation
		input.addEventListener("keydown", (e) => {
			if (this.enableVim && this.vimMode === "normal") return;
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
				handleEnter();
			}
		});

		// Initial render
		this.updateResults(resultsContainer);
	}

	destroy() {
		this.containerEl.empty();
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
		const searchResult = searchBlocks(
			this.query,
			this.allBlocks,
			this.fileContexts,
			this.caseSensitive
		);
		if (searchResult.errors.length > 0) {
			resultsContainer.createEl("div", {
				text: `Search query error: ${searchResult.errors[0]}`,
				cls: "block-search-no-results",
			});
			return;
		}
		this.results = searchResult.results;

		if (this.results.length === 0) {
			resultsContainer.createEl("div", {
				text: "No results found.",
				cls: "block-search-no-results",
			});
			return;
		}

		const resultsHeader = resultsContainer.createEl("div", {
			cls: "block-search-results-header",
		});
		resultsHeader.createEl("div", {
			text: `${this.results.length} result${this.results.length === 1 ? "" : "s"}`,
			cls: "block-search-results-count",
		});
		resultsHeader.createEl("div", {
			text: `for "${this.lastSearchedQuery}"`,
			cls: "block-search-results-query",
		});

		this.results.forEach((result, index) => {
			const resultEl = resultsContainer.createEl("div", {
				cls:
					"block-search-result" +
					(index === this.selectedIndex ? " selected" : ""),
			});
			resultEl.setAttr("tabindex", "0");
			resultEl.setAttr("role", "button");
			resultEl.setAttr("aria-label", `Jump to result ${index + 1}`);

			const resultHead = resultEl.createEl("div", {
				cls: "block-search-result-head",
			});
			resultHead.createEl("div", {
				text: `${String(index + 1).padStart(2, "0")}`,
				cls: "block-search-result-index",
			});

			// File and line info (first block of the group)
			const head = result.blocks[0]!; // guaranteed non-empty group
			const infoEl = resultHead.createEl("div", { cls: "block-search-info" });
			infoEl.createEl("span", {
				text: head.fileName,
				cls: "block-search-file",
			});
			infoEl.createEl("span", {
				text: `Line ${head.lineNumber + 1}`,
				cls: "block-search-line",
			});

			const actions = resultHead.createEl("div", { cls: "block-search-actions" });
			const jumpBtn = actions.createEl("button", {
				text: "Jump",
				cls: "block-search-jump-button",
			});
			jumpBtn.setAttr("type", "button");

			// Grouped block text with highlighting
			const textEl = resultEl.createEl("div", { cls: "block-search-text" });
			// Build regexes for highlighting
			const regexes = this.buildHighlightRegexes();

			result.blocks.forEach((blk) => {
				// Reconstruct a simple markdown representation with indentation
				const indent = "  ".repeat(blk.level);
				const lineStr = `${indent}- ${blk.text}`;
				const lineEl = textEl.createEl("div", { cls: "block-search-line-item" });
				this.highlightTextWithRegexes(lineEl, lineStr, regexes);
			});

			const jumpTo = () => this.jumpToBlock(result.blocks[0]!);

			resultEl.addEventListener("focus", () => {
				this.selectedIndex = index;
				this.updateResultSelection();
			});

			resultEl.addEventListener("click", () => {
				jumpTo();
			});

			resultEl.addEventListener("keydown", (e) => {
				if (this.enableVim && this.vimMode === "normal") {
					if (e.key === "j") {
						e.preventDefault();
						const results = this.getResultElements();
						const currentIndex = results.indexOf(resultEl);
						if (currentIndex !== -1) {
							const nextIndex = Math.min(currentIndex + 1, results.length - 1);
							if (nextIndex !== currentIndex) {
								results[nextIndex]!.focus();
							}
						}
						return;
					}
					if (e.key === "k") {
						e.preventDefault();
						const results = this.getResultElements();
						const currentIndex = results.indexOf(resultEl);
						if (currentIndex !== -1) {
							const nextIndex = Math.max(currentIndex - 1, 0);
							if (nextIndex !== currentIndex) {
								results[nextIndex]!.focus();
							}
						}
						return;
					}
					if (e.key === "g") {
						e.preventDefault();
						const results = this.getResultElements();
						if (results.length > 0) {
							results[0]!.focus();
						}
						return;
					}
					if (e.key === "G") {
						e.preventDefault();
						const results = this.getResultElements();
						if (results.length > 0) {
							results[results.length - 1]!.focus();
						}
						return;
					}
				}
				if (e.key === "ArrowDown" || e.key === "ArrowUp") {
					e.preventDefault();
					const results = this.getResultElements();
					const currentIndex = results.indexOf(resultEl);
					if (currentIndex !== -1) {
						const nextIndex =
							e.key === "ArrowDown"
								? Math.min(currentIndex + 1, results.length - 1)
								: Math.max(currentIndex - 1, 0);
						if (nextIndex !== currentIndex) {
							results[nextIndex]!.focus();
						}
					}
					return;
				}
				if (e.key === "Tab") {
					e.preventDefault();
					const focusables = this.getFocusOrder();
					const index = focusables.indexOf(resultEl);
					if (index !== -1) {
						const nextIndex = Math.min(
							Math.max(index + (e.shiftKey ? -1 : 1), 0),
							focusables.length - 1
						);
						if (nextIndex !== index) {
							focusables[nextIndex]!.focus();
						}
					}
					return;
				}
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					jumpTo();
				}
			});

			jumpBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				this.jumpToBlock(result.blocks[0]!);
			});
		});
	}

	private buildHighlightRegexes(): RegExp[] {
		const parsed = parseQuery(this.query, { allowOperators: true });
		const terms = new Set<string>();
		const regexTerms: RegExp[] = [];

		const collect = (node: QueryNode) => {
			if (node.type === "term") {
				this.collectTerm(node.term, terms, regexTerms);
				return;
			}
			if (node.type === "and" || node.type === "or") {
				node.terms.forEach(collect);
			} else if (node.type === "not") {
				collect(node.term);
			}
		};

		collect(parsed.root);

		const flags = this.caseSensitive ? "g" : "gi";
		const regexes = [...regexTerms];
		for (const term of terms) {
			const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			regexes.push(new RegExp(escaped, flags));
		}
		return regexes;
	}

	private collectTerm(term: QueryTerm, textTerms: Set<string>, regexTerms: RegExp[]) {
		if (term.kind === "text") {
			if (term.isRegex) {
				try {
					const flags = this.caseSensitive
						? term.regexFlags ?? ""
						: `${term.regexFlags ?? ""}i`;
					regexTerms.push(new RegExp(term.value, flags.includes("g") ? flags : `${flags}g`));
				} catch {
					// ignore invalid regex for highlighting
				}
			} else if (term.value.trim().length > 0) {
				textTerms.add(term.value);
			}
			return;
		}
		if (term.kind === "operator") {
			this.collectTermFromQuery(term.operand, textTerms, regexTerms);
			return;
		}
		if (term.kind === "property") {
			if (term.nameQuery) this.collectTermFromQuery(term.nameQuery, textTerms, regexTerms);
			if (term.valueQuery) this.collectTermFromQuery(term.valueQuery, textTerms, regexTerms);
		}
	}

	private collectTermFromQuery(node: QueryNode, textTerms: Set<string>, regexTerms: RegExp[]) {
		if (node.type === "term") {
			this.collectTerm(node.term, textTerms, regexTerms);
			return;
		}
		if (node.type === "and" || node.type === "or") {
			node.terms.forEach((t) => this.collectTermFromQuery(t, textTerms, regexTerms));
		} else if (node.type === "not") {
			this.collectTermFromQuery(node.term, textTerms, regexTerms);
		}
	}

	private performSearch(resultsContainer: HTMLElement) {
		this.lastSearchedQuery = this.query;
		this.selectedIndex = 0;
		this.updateResults(resultsContainer);
	}

	private highlightTextWithRegexes(
		container: HTMLElement,
		text: string,
		regexes: RegExp[]
	) {
		if (!this.query.trim()) {
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
			container.createEl("span", {
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

		this.onJump?.();
	}

	private getFocusOrder(): HTMLElement[] {
		const focusables: HTMLElement[] = [];
		if (this.inputEl) focusables.push(this.inputEl);
		if (this.searchButtonEl) focusables.push(this.searchButtonEl);
		focusables.push(...this.getResultElements());
		return focusables;
	}

	private getResultElements(): HTMLElement[] {
		if (!this.resultsContainerEl) return [];
		return Array.from(
			this.resultsContainerEl.querySelectorAll<HTMLElement>(".block-search-result")
		);
	}

	private updateResultSelection() {
		const results = this.getResultElements();
		results.forEach((el, idx) => {
			if (idx === this.selectedIndex) {
				el.addClass("selected");
			} else {
				el.removeClass("selected");
			}
		});
	}

	private setVimMode(mode: "insert" | "normal" | "visual") {
		this.vimMode = mode;
		if (mode !== "visual") {
			this.vimVisualAnchor = null;
			if (this.inputEl) {
				const pos = this.inputEl.selectionStart ?? 0;
				this.inputEl.setSelectionRange(pos, pos);
			}
		} else if (this.inputEl) {
			this.vimVisualAnchor = this.inputEl.selectionStart ?? 0;
		}
		if (this.vimModeEl) {
			const label = mode === "insert" ? "INSERT" : mode === "visual" ? "VISUAL" : "NORMAL";
			this.vimModeEl.setText(label);
			this.vimModeEl.setAttr("data-mode", mode);
		}
	}
}
