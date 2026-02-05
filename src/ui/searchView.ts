import { ItemView, WorkspaceLeaf } from "obsidian";
import { SearchPanel } from "./searchPanel";

export const VIEW_TYPE_BLOCK_SEARCH = "block-search-view";

export class BlockSearchView extends ItemView {
	private panel: SearchPanel | null = null;
	private caseSensitive: boolean;
	private enableVim: boolean;

	constructor(leaf: WorkspaceLeaf, caseSensitive: boolean, enableVim: boolean) {
		super(leaf);
		this.caseSensitive = caseSensitive;
		this.enableVim = enableVim;
	}

	getViewType() {
		return VIEW_TYPE_BLOCK_SEARCH;
	}

	getDisplayText() {
		return "Block search";
	}

	async onOpen() {
		this.panel = new SearchPanel(this.app, this.contentEl, {
			caseSensitive: this.caseSensitive,
			enableVim: this.enableVim,
		});
		await this.panel.mount();
	}

	async onClose() {
		this.panel?.destroy();
		this.panel = null;
	}
}
