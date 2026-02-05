import { App, Modal } from "obsidian";
import { SearchPanel } from "./searchPanel";

/**
 * Search modal for block search plugin
 */
export class SearchModal extends Modal {
	private caseSensitive: boolean = false;
	private panel: SearchPanel | null = null;

	constructor(app: App, caseSensitive: boolean = false) {
		super(app);
		this.caseSensitive = caseSensitive;
	}

	async onOpen() {
		this.panel = new SearchPanel(this.app, this.contentEl, {
			caseSensitive: this.caseSensitive,
			onJump: () => this.close(),
		});
		await this.panel.mount();
	}

	onClose() {
		this.panel?.destroy();
		this.panel = null;
	}
}
