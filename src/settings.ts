import { App, PluginSettingTab, Setting } from "obsidian";
import BlockSearchPlugin from "./main";

export interface BlockSearchSettings {
	caseSensitive: boolean;
	openInNewTab: boolean;
	openInModal: boolean;
	enableVimKeybindings: boolean;
	hoverPreviewRequireCtrl: boolean;
}

export const DEFAULT_SETTINGS: BlockSearchSettings = {
	caseSensitive: false,
	openInNewTab: false,
	openInModal: true,
	enableVimKeybindings: false,
	hoverPreviewRequireCtrl: false,
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
			.setName('Open in new tab')
			.setDesc('Open block search in a new workspace tab')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.openInNewTab)
				.onChange(async (value) => {
					this.plugin.settings.openInNewTab = value;
					if (value) {
						this.plugin.settings.openInModal = false;
					} else if (!this.plugin.settings.openInModal) {
						this.plugin.settings.openInModal = true;
					}
					await this.plugin.saveSettings();
					this.display();
				}));

		new Setting(containerEl)
			.setName('Open in modal')
			.setDesc('Open block search in a modal window')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.openInModal)
				.onChange(async (value) => {
					this.plugin.settings.openInModal = value;
					if (value) {
						this.plugin.settings.openInNewTab = false;
					} else if (!this.plugin.settings.openInNewTab) {
						this.plugin.settings.openInNewTab = true;
					}
					await this.plugin.saveSettings();
					this.display();
				}));

		new Setting(containerEl)
			.setName('Enable Vim keybindings')
			.setDesc('Use basic Vim NORMAL/INSERT keybindings in the search input')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableVimKeybindings)
				.onChange(async (value) => {
					this.plugin.settings.enableVimKeybindings = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Require Ctrl for hover preview')
			.setDesc('Only show result previews when Ctrl is pressed while hovering')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.hoverPreviewRequireCtrl)
				.onChange(async (value) => {
					this.plugin.settings.hoverPreviewRequireCtrl = value;
					await this.plugin.saveSettings();
				}));
	}
}
