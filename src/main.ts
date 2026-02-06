import { Plugin } from 'obsidian';
import { DEFAULT_SETTINGS, BlockSearchSettings, BlockSearchSettingTab } from "./settings";
import { SearchModal } from "./ui/searchModal";
import { BlockSearchView, VIEW_TYPE_BLOCK_SEARCH } from "./ui/searchView";

export default class BlockSearchPlugin extends Plugin {
	settings: BlockSearchSettings;

	async onload() {
		await this.loadSettings();

		this.registerHoverLinkSource("block-search", {
			display: "Block search",
			defaultMod: this.settings.hoverPreviewRequireCtrl,
		});

		this.registerView(
			VIEW_TYPE_BLOCK_SEARCH,
			(leaf) => new BlockSearchView(
				leaf,
				this.settings.caseSensitive,
				this.settings.enableVimKeybindings,
				this.settings.hoverPreviewRequireCtrl
			)
		);

		// Register the block search command
		this.addCommand({
			id: 'block-search-open',
			name: 'Open block search',
			callback: () => {
				if (this.settings.openInNewTab) {
					const leaf = this.app.workspace.getLeaf(true);
					void leaf.setViewState({ type: VIEW_TYPE_BLOCK_SEARCH, active: true });
					return;
				}
				new SearchModal(
					this.app,
					this.settings.caseSensitive,
					this.settings.enableVimKeybindings,
					this.settings.hoverPreviewRequireCtrl
				).open();
			}
		});

		// Add settings tab
		this.addSettingTab(new BlockSearchSettingTab(this.app, this));
	}

	onunload() {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_BLOCK_SEARCH);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<BlockSearchSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
