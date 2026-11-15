#!/usr/bin/env node
// Usage: node scripts/check-overrides.js [main.js]
// Fails if a Life Log class accidentally overrides an Obsidian base-class member.
const path = process.argv[2] || "main.js";
const base = (n) => class { };
const stub = { Plugin: base(), ItemView: base(), Modal: base(), PluginSettingTab: base(), MarkdownRenderChild: base(),
  FuzzySuggestModal: base(), Component: base(), Notice: base(), Setting: base(), Menu: base(),
  normalizePath: (x) => x, MarkdownRenderer: {}, setIcon() {}, debounce: (f) => f };
const Module = require("module"); const orig = Module._load;
Module._load = function (req, ...a) { return req === "obsidian" ? stub : orig.call(this, req, ...a); };
const vm = require("vm"); const fs = require("fs");
const src = fs.readFileSync(path, "utf8") + "\n;return {LifeLogPlugin, LifeLogView, DetailModal, EditModal, Lightbox, ImageSuggestModal, LifeLogBlock, LifeLogSettingTab};";
const classes = vm.runInThisContext("(function(require, module){" + src + "})")(require, { exports: {} });
const COMPONENT = ["load","onload","unload","onunload","addChild","removeChild","register","registerEvent","registerDomEvent","registerScopeEvent","registerInterval","_loaded","_children","_events"];
const VIEW = ["app","icon","navigation","leaf","containerEl","scope","open","close","onOpen","onClose","getViewType","getState","setState","getEphemeralState","setEphemeralState","getIcon","onResize","getDisplayText","onPaneMenu","contentEl","addAction","headerEl","titleEl","titleContainerEl","actionsEl","iconEl","backButtonEl","forwardButtonEl","moreOptionsButtonEl","onHeaderMenu","handleDrop","onTabMenu"];
const MODAL = ["app","scope","containerEl","modalEl","titleEl","contentEl","headerEl","shouldRestoreSelection","open","close","onOpen","onClose","setTitle","setContent","setCloseCallback","bgEl","bgOpacity","dimBackground","selection","win","onWindowClose"];
const SUGGEST = [...MODAL,"inputEl","resultContainerEl","limit","emptyStateText","setPlaceholder","setInstructions","onNoSuggestion","selectSuggestion","getSuggestions","renderSuggestion","onChooseSuggestion","getItems","getItemText","onChooseItem","chooser"];
const PLUGIN = ["app","manifest","onload","onunload","addRibbonIcon","addStatusBarItem","addCommand","addSettingTab","registerView","registerHoverLinkSource","registerExtensions","registerMarkdownPostProcessor","registerMarkdownCodeBlockProcessor","registerEditorExtension","registerObsidianProtocolHandler","registerEditorSuggest","loadData","saveData","onExternalSettingsChange","removeCommand",...COMPONENT];
const RENDERCHILD = ["containerEl",...COMPONENT];
const SETTINGTAB = ["app","plugin","containerEl","display","hide","icon"];
const allowed = new Set(["constructor","onOpen","onClose","onload","onunload","getViewType","getDisplayText","getIcon","getState","setState","getItems","getItemText","onChooseItem","display"]);
const check = { LifeLogPlugin: PLUGIN, LifeLogView: [...VIEW,...COMPONENT], DetailModal: MODAL, EditModal: MODAL, Lightbox: MODAL, ImageSuggestModal: SUGGEST, LifeLogBlock: RENDERCHILD, LifeLogSettingTab: SETTINGTAB };
let bad = 0;
for (const [name, reserved] of Object.entries(check)) {
  const own = Object.getOwnPropertyNames(classes[name].prototype);
  for (const m of own) if (reserved.includes(m) && !allowed.has(m)) { console.log(`CLASH: ${name}.${m} overrides an Obsidian member`); bad++; }
}
// Also scan instance fields assigned in constructors: this.X =
const fields = [...fs.readFileSync(path, "utf8").matchAll(/this\.(\w+)\s*=/g)].map((m) => m[1]);
const allReserved = new Set([...VIEW, ...MODAL, ...SUGGEST, ...PLUGIN].filter((x) => !["app","plugin","settings"].includes(x)));
for (const f of new Set(fields)) if (allReserved.has(f)) { console.log(`CLASH: field this.${f} matches an Obsidian member`); bad++; }
console.log(bad ? `${bad} clash(es)` : "No clashes with Obsidian base classes.");
process.exit(bad ? 1 : 0);
