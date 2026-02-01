import { App, PluginSettingTab, Setting } from "obsidian";
import BlockSearchPlugin from "./main";

export interface BlockSearchSettings {
	caseSensitive: boolean;
	enableOperators: boolean;
}

export const DEFAULT_SETTINGS: BlockSearchSettings = {
	caseSensitive: false,
	enableOperators: false
}

export class BlockSearchSettingTab extends PluginSettingTab {
	plugin: BlockSearchPlugin;

	constructor(app: App, plugin: BlockSearchPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Case sensitive search')
			.setDesc('Perform case-sensitive matching when searching blocks')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.caseSensitive)
				.onChange(async (value) => {
					this.plugin.settings.caseSensitive = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Enable search operators')
			.setDesc('Enable support for search operators like tag: (requires reload)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableOperators)
				.onChange(async (value) => {
					this.plugin.settings.enableOperators = value;
					await this.plugin.saveSettings();
				}));
	}
}
