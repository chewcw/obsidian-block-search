import { Plugin } from 'obsidian';
import { DEFAULT_SETTINGS, BlockSearchSettings, BlockSearchSettingTab } from "./settings";
import { SearchModal } from "./ui/searchModal";

export default class BlockSearchPlugin extends Plugin {
	settings: BlockSearchSettings;

	async onload() {
		await this.loadSettings();

		// Register the block search command
		this.addCommand({
			id: 'block-search-open',
			name: 'Open block search',
			callback: () => {
				new SearchModal(this.app, this.settings.caseSensitive, this.settings.enableOperators).open();
			}
		});

		// Add settings tab
		this.addSettingTab(new BlockSearchSettingTab(this.app, this));
	}

	onunload() {
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<BlockSearchSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
