import LLMPlugin, { DEFAULT_SETTINGS } from "main";
import {
	App,
	ButtonComponent,
	DropdownComponent,
	PluginSettingTab,
	Setting,
} from "obsidian";
import { DEFAULT_DIRECTORY } from "utils/utils";
import { models, modelNames } from "utils/models";
import { claudeSonnetJuneModel, geminiModel, GPT4All } from "utils/constants";
import logo from "assets/LLMguy.svg";
import { FAB } from "Plugin/FAB/FAB";
const fs = require("fs");

export default class SettingsView extends PluginSettingTab {
	plugin: LLMPlugin;
	fab: FAB;

	constructor(app: App, plugin: LLMPlugin, fab: FAB) {
		super(app, plugin);
		this.plugin = plugin;
		this.fab = fab;
	}
	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		// Adds reset history button
		new Setting(containerEl)
			.setName("Reset Chat History")
			.setDesc("This will delete previous Prompts and Chat Contexts")
			.addButton((button: ButtonComponent) => {
				button.setButtonText("Reset History");
				button.onClick(() => {
					this.plugin.history.reset();
				});
			});

		// Add Claude API key input
		new Setting(containerEl)
			.setName("Claude API Key")
			.setDesc("Claude models require an API key for authentication.")
			.addText((text) => {
				text.setValue(`${this.plugin.settings.claudeAPIKey}`);
				text.onChange((change) => {
					this.plugin.settings.claudeAPIKey = change;
					// NOTE / Question -> We can add a prompt asking:
					// `Do you want to set this as your default model?`
					// This addresses the user flow where a user inputs this API key
					// after they already have an openai key setup.
					this.changeDefaultModel(claudeSonnetJuneModel);
				});
			})
			.addButton((button: ButtonComponent) => {
				button.setButtonText("Generate token");
				button.onClick(() => {
					window.open("https://console.anthropic.com/settings/keys");
				});
			});

		// Adds Gemini API Key input
		new Setting(containerEl)
			.setName("Gemini API Key")
			.setDesc("Gemini models require an API key for authentication.")
			.addText((text) => {
				text.setValue(`${this.plugin.settings.geminiAPIKey}`);
				text.onChange((change) => {
					this.plugin.settings.geminiAPIKey = change;
					this.changeDefaultModel(geminiModel);
				});
			})
			.addButton((button: ButtonComponent) => {
				button.setButtonText("Generate token");
				button.onClick(() => {
					window.open("https://aistudio.google.com/app/apikey");
				});
			});

		// Adds OpenAI API Key input
		new Setting(containerEl)
			.setName("OpenAI API Key")
			.setDesc("OpenAI models require an API key for authentication.")
			.addText((text) => {
				text.setValue(`${this.plugin.settings.openAIAPIKey}`);
				text.onChange((change) => {
					this.plugin.settings.openAIAPIKey = change;
					this.plugin.saveSettings();
				});
			})
			.addButton((button: ButtonComponent) => {
				button.setButtonText("Generate token");
				button.onClick((evt: MouseEvent) => {
					window.open("https://beta.openai.com/account/api-keys");
				});
			});

		// Add Default Model Selector
		new Setting(containerEl)
			.setName("Set Default Model")
			.setDesc("Sets the default LLM you want to use for the plugin")
			.addDropdown((dropdown: DropdownComponent) => {
				dropdown.addOption(
					DEFAULT_SETTINGS.modalSettings.modelName,
					"Select Default Model"
				);
				let keys = Object.keys(models);
				for (let model of keys) {
					if (models[model].type === GPT4All) {
						fs.exists(
							`${DEFAULT_DIRECTORY}/${models[model].model}`,
							(exists: boolean) => {
								if (exists) {
									dropdown.addOption(
										models[model].model,
										model
									);
								}
							}
						);
					} else {
						dropdown.addOption(models[model].model, model);
					}
				}
				dropdown.onChange((change) => {
					this.changeDefaultModel(change)
				});
				dropdown.setValue(this.plugin.settings.modalSettings.model);
			});

		// Add Toggle FAB button
		new Setting(containerEl)
			.setName("Toggle FAB")
			.setDesc("Toggles the LLM floating action button")
			.addToggle((value) => {
				value
					.setValue(this.plugin.settings.showFAB)
					.onChange(async (value) => {
						this.fab.removeFab();
						this.plugin.settings.showFAB = value;
						await this.plugin.saveSettings();
						if (value) {
							this.fab.regenerateFAB();
						}
					});
			});

		// Add donation button
		new Setting(containerEl)
			.setName("Donate")
			.setDesc("Consider donating to support development.")
			.addButton((button: ButtonComponent) => {
				button.setButtonText("Donate");
				button.onClick(() => {
					window.open("https://www.buymeacoffee.com/johnny1093");
				});
			});

		const llmGuy = containerEl.createDiv();
		llmGuy.addClass("icon-wrapper");
		llmGuy.innerHTML = logo;
		const credits = llmGuy.createDiv();
		credits.id = "settings-credits";
		credits.innerHTML =
			`<div>
			<h2 id="hero-credits">LLM Plugin</h2>\n<p class="hero-names text-muted">By Johnny✨ and Ryan Mahoney </p>
			<span class="text-muted version">v${this.plugin.manifest.version}</span>
			</div>
			`;
	}

	changeDefaultModel(model: string) {
		// Question -> why do we not update the FAB model here?
		const modelName = modelNames[model];
		// Modal settings
		DEFAULT_SETTINGS.modalSettings.model = model;
		DEFAULT_SETTINGS.modalSettings.modelName = modelName;
		DEFAULT_SETTINGS.modalSettings.modelType =
			models[modelName].type;
		DEFAULT_SETTINGS.modalSettings.endpointURL =
			models[modelName].url;
		DEFAULT_SETTINGS.modalSettings.modelEndpoint =
			models[modelName].endpoint;

		// Widget settings
		DEFAULT_SETTINGS.widgetSettings.model = model;
		DEFAULT_SETTINGS.widgetSettings.modelName = modelName;
		DEFAULT_SETTINGS.widgetSettings.modelType =
			models[modelName].type;
		DEFAULT_SETTINGS.widgetSettings.endpointURL =
			models[modelName].url;
		DEFAULT_SETTINGS.widgetSettings.modelEndpoint =
			models[modelName].endpoint;

		this.plugin.saveSettings();
	}
}
