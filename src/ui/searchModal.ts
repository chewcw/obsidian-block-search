import { App, Modal } from "obsidian";
import { SearchPanel } from "./searchPanel";

/**
 * Search modal for block search plugin
 */
export class SearchModal extends Modal {
	private caseSensitive: boolean = false;
	private enableVim: boolean = false;
	private panel: SearchPanel | null = null;

	constructor(app: App, caseSensitive: boolean = false, enableVim: boolean = false) {
		super(app);
		this.caseSensitive = caseSensitive;
		this.enableVim = enableVim;
	}

	async onOpen() {
		this.panel = new SearchPanel(this.app, this.contentEl, {
			caseSensitive: this.caseSensitive,
			onJump: () => this.close(),
			enableVim: this.enableVim,
		});
		await this.panel.mount();
	}

	onClose() {
		this.panel?.destroy();
		this.panel = null;
	}
}
