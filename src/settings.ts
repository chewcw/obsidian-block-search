import { App, PluginSettingTab, Setting } from "obsidian";
import BlockSearchPlugin from "./main";

export interface BlockSearchSettings {
	caseSensitive: boolean;
}

export const DEFAULT_SETTINGS: BlockSearchSettings = {
	caseSensitive: false
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
	}
}
