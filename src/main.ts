import { Plugin, WorkspaceLeaf, Platform	 } from "obsidian";
import {
	HistoryItem,
	ImageQuality,
	ImageSize,
	ImageStyle,
	ResponseFormat,
	ViewSettings,
} from "./Types/types";

import { Assistants } from "Assistants/AssistantHandler";
import { History } from "History/HistoryHandler";
import { FAB } from "Plugin/FAB/FAB";
import { ChatModal2 } from "Plugin/Modal/ChatModal2";
import {
	LEAF_VIEW_TYPE,
	TAB_VIEW_TYPE,
	WidgetView,
} from "Plugin/Widget/Widget";
import SettingsView from "Settings/SettingsView";
import { Assistant } from "openai/resources/beta/assistants";
import { generateAssistantsList, getApiKeyValidity } from "utils/utils";
import {
	chat,
	claudeSonnetJuneModel,
	geminiModel,
	openAIModel,
	openAI,
	claude,
	gemini,
} from "utils/constants";
import { MessageStore } from "Plugin/Components/MessageStore";
import { DesktopOperatingSystem, MobileOperatingSystem, OperatingSystem } from "services/OperatingSystem";
import { DesktopFileSystem, MobileFileSystem, FileSystem } from "services/FileSystem";

export interface LLMPluginSettings {
	appName: string;
	currentIndex: number;
	modalSettings: ViewSettings;
	widgetSettings: ViewSettings;
	fabSettings: ViewSettings;
	promptHistory: HistoryItem[];
	assistants: Assistant[];
	claudeAPIKey: string;
	geminiAPIKey: string;
	openAIAPIKey: string;
	GPT4AllStreaming: boolean;
	showFAB: boolean;
	defaultModel: string;
}

const defaultSettings = {
	assistant: false,
	assistantId: "",
	model: "gpt-3.5-turbo",
	modelName: "ChatGPT-3.5 turbo",
	modelType: "openAI",
	modelEndpoint: chat,
	endpointURL: "/chat/completions",
	historyIndex: -1,
	imageSettings: {
		numberOfImages: 1,
		response_format: "url" as ResponseFormat,
		size: "1024x1024" as ImageSize,
		style: "vivid" as ImageStyle,
		quality: "standard" as ImageQuality,
	},
	chatSettings: {
		maxTokens: 300,
		temperature: 0.65,
		GPT4All: {},
		openAI: {
			frequencyPenalty: 0,
			logProbs: false,
			topLogProbs: null,
			presencePenalty: 0,
			responseFormat: "",
			topP: 1,
		},
	},
};

export const DEFAULT_SETTINGS: LLMPluginSettings = {
	appName: "Local LLM Plugin",
	currentIndex: -1,
	modalSettings: {
		...defaultSettings,
	},
	widgetSettings: {
		...defaultSettings,
	},
	fabSettings: {
		...defaultSettings,
	},
	promptHistory: [],
	assistants: [],
	openAIAPIKey: "",
	claudeAPIKey: "",
	geminiAPIKey: "",
	GPT4AllStreaming: false,
	showFAB: true,
	defaultModel: "",
};

export default class LLMPlugin extends Plugin {
	fileSystem: FileSystem;
	os: OperatingSystem;
	settings: LLMPluginSettings;
	assistants: Assistants;
	history: History;
	fab: FAB;
	messageStore: MessageStore;

	async onload() {
		this.fileSystem = Platform.isDesktop ? new DesktopFileSystem() : new MobileFileSystem(this);
		this.os = Platform.isDesktop ? new DesktopOperatingSystem() : new MobileOperatingSystem();
		await this.loadSettings();
		await this.checkForAPIKeyBasedModel();
		this.registerRibbonIcons();
		this.registerCommands();
		this.messageStore = new MessageStore();
		this.settings.currentIndex = -1;
		this.messageStore.setMessages([]);
		this.saveSettings();

		this.registerView(
			TAB_VIEW_TYPE,
			(tab) => new WidgetView(tab, this, "tab")
		);
		this.registerView(
			LEAF_VIEW_TYPE,
			(leaf) => new WidgetView(leaf, this, "leaf")
		);

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.fab = new FAB(this);
		this.addSettingTab(new SettingsView(this.app, this, this.fab));
		if (this.settings.showFAB) {
			setTimeout(() => {
				this.fab.regenerateFAB();
			}, 500);
		}
		this.history = new History(this);
		this.assistants = new Assistants(this);
	}

	onunload() {
		this.fab.removeFab();
	}

	private registerCommands() {
		this.addCommand({
			id: "open-llm-modal",
			name: "Open modal",
			callback: () => {
				new ChatModal2(this).open();
			},
		});

		this.addCommand({
			id: "open-LLM-widget-leaf",
			name: "Open chat in sidebar",
			callback: () => {
				this.activateLeaf();
			},
		});

		this.addCommand({
			id: "open-LLM-widget-tab",
			name: "Open chat in tab",
			callback: () => {
				this.activateTab();
			},
		});

		this.addCommand({
			id: "toggle-LLM-fab",
			name: "Toggle FAB",
			callback: () => {
				const currentFABState = this.settings.showFAB;
				this.settings.showFAB = !currentFABState;
				this.saveSettings();
				this.settings.showFAB
					? this.fab.regenerateFAB()
					: this.fab.removeFab();
			},
		});
	}

	private registerRibbonIcons() {
		this.addRibbonIcon(
			"bot",
			"Ask a question",
			(evt: MouseEvent) => {
				new ChatModal2(this).open();
			}
		);
	}

	async activateLeaf() {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(LEAF_VIEW_TYPE);

		if (leaves.length > 0) {
			// A leaf with our view already exists, use that
			leaf = leaves[0];
		} else {
			// Our view could not be found in the workspace, create a new leaf
			// in the right sidebar for it
			leaf = workspace.getRightLeaf(false);
			await leaf.setViewState({ type: LEAF_VIEW_TYPE, active: true });
		}
		workspace.revealLeaf(leaf);
	}

	async activateTab() {
		const { workspace } = this.app;

		let tab: WorkspaceLeaf | null = null;
		const tabs = workspace.getLeavesOfType(TAB_VIEW_TYPE);

		if (tabs.length > 0) {
			// A leaf with our view already exists, use that
			tab = tabs[0];
		} else {
			// Our view could not be found in the workspace, create a new leaf
			// in a tab for it
			tab = workspace.getLeaf("tab");
			await tab.setViewState({ type: TAB_VIEW_TYPE, active: true });
		}
		workspace.revealLeaf(tab);
	}

	async loadSettings() {
		const dataJSON = await this.loadData();
		if (dataJSON) {
			this.settings = Object.assign({}, dataJSON);
			this.settings.fabSettings.historyIndex = -1;
			this.settings.widgetSettings.historyIndex = -1;
		} else {
			this.settings = Object.assign(
				{},
				DEFAULT_SETTINGS,
				await this.loadData()
			);
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async validateActiveModelsAPIKeys() {
		let activeClaudeModel, activeGeminiModel, activeOpenAIModel;

		const settingsObjects = [
			this.settings.modalSettings,
			this.settings.widgetSettings,
			this.settings.fabSettings,
		];

		settingsObjects.forEach((settings) => {
			const model = settings.model;
			switch (model) {
				case claudeSonnetJuneModel:
					activeClaudeModel = model === claudeSonnetJuneModel;
					break;
				case geminiModel:
					activeGeminiModel = model === geminiModel;
					break;
				case openAIModel:
					activeOpenAIModel = model === openAIModel;
					break;
			}
		});

		const providerKeyPairs = [
			{
				provider: openAI,
				key: this.settings.openAIAPIKey,
				isActive: activeOpenAIModel,
			},
			{
				provider: claude,
				key: this.settings.claudeAPIKey,
				isActive: activeClaudeModel,
			},
			{
				provider: gemini,
				key: this.settings.geminiAPIKey,
				isActive: activeGeminiModel,
			},
		];

		const filteredPairs = providerKeyPairs.filter(({ key, isActive }) => {
			// Skip providers with no keys -> this leaves us exposed to a user selecting a default model without adding a key.
			if (!key) return;
			// Only inspect pairs that are active in the application
			if (!isActive) return;
			return key;
		});

		const promises = filteredPairs.map(async (pair) => {
			const result = await getApiKeyValidity(pair);
			return result;
		});

		const results = await Promise.all(promises);
		const hasValidOpenAIAPIKey: boolean = results.some((result) => {
			if (result) {
				return result.valid && result.provider === openAI;
			}
		});

		// If the model is OpenAI and the key is valid -> generate the assistant list
		if (hasValidOpenAIAPIKey) await generateAssistantsList(this.settings);
	}

	async checkForAPIKeyBasedModel() {
		const fabModelRequiresKey =
			this.settings.fabSettings.model === openAIModel ||
			this.settings.fabSettings.model === claudeSonnetJuneModel ||
			this.settings.fabSettings.model === geminiModel;

		const widgetModelRequresKey =
			this.settings.widgetSettings.model === openAIModel ||
			this.settings.widgetSettings.model === claudeSonnetJuneModel ||
			this.settings.widgetSettings.model === geminiModel;

		const modalModelRequresKey =
			this.settings.modalSettings.model === openAIModel ||
			this.settings.modalSettings.model === claudeSonnetJuneModel ||
			this.settings.modalSettings.model === geminiModel;

		const activeModelRequiresKey =
			fabModelRequiresKey ||
			widgetModelRequresKey ||
			modalModelRequresKey;

		if (activeModelRequiresKey) await this.validateActiveModelsAPIKeys();
	}
	// end refactor into utils section
}
