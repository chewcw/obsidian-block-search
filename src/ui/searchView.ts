import { ItemView, WorkspaceLeaf } from "obsidian";
import { SearchPanel } from "./searchPanel";

export const VIEW_TYPE_BLOCK_SEARCH = "block-search-view";

export class BlockSearchView extends ItemView {
	private panel: SearchPanel | null = null;
	private caseSensitive: boolean;
	private enableVim: boolean;
	private hoverPreviewRequireCtrl: boolean;

	constructor(leaf: WorkspaceLeaf, caseSensitive: boolean, enableVim: boolean, hoverPreviewRequireCtrl: boolean) {
		super(leaf);
		this.caseSensitive = caseSensitive;
		this.enableVim = enableVim;
		this.hoverPreviewRequireCtrl = hoverPreviewRequireCtrl;
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
			hoverPreviewRequireCtrl: this.hoverPreviewRequireCtrl,
		});
		await this.panel.mount();
	}

	async onClose() {
		this.panel?.destroy();
		this.panel = null;
	}
}
