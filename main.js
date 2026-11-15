/*
 * Life Log — an Obsidian dashboard for the people, pets, schools, jobs, homes
 * and milestones in your life.
 * Author: bearbaitdesigns — https://github.com/bearbaitdesigns/obsidian_lifelog
 * License: MIT
 *
 * Every entry is an ordinary Markdown note whose properties (frontmatter) hold
 * its details. Images are ordinary files in your vault. Nothing is hidden in
 * plugin data except your dashboard settings and banner choices.
 */
"use strict";

const {
  Plugin, ItemView, Modal, Notice, PluginSettingTab, Setting, normalizePath,
  MarkdownRenderer, MarkdownRenderChild, FuzzySuggestModal, Menu, setIcon,
  debounce, Component,
} = require("obsidian");

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const VIEW_TYPE = "life-log-dashboard";
const ICON = "book-heart";
const IMG_EXT = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif"];
const FM_RE = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const DEFAULT_SETTINGS = {
  folder: "Life Log",
  imageFolder: "Life Log/_images",
  name: "",
  subtitle: "",
  banners: {}, // tab id -> vault path of image
};

// field: [frontmatter key, label, input type, placeholder]
const CATS = {
  people: {
    label: "People", one: "Person", folder: "People", emoji: "🧑", hue: 28,
    sub: "relation", start: "met", end: null, gone: "death", place: "met_where", verb: "Met",
    fields: [
      ["relation", "Relation to you", "text", "Brother, friend, mentor…"],
      ["aliases", "Alias / nicknames", "list", "Comma-separated"],
      ["occupation", "Occupation", "text", ""],
      ["birthday", "Birthday", "date", ""],
      ["death", "Date of death", "date", ""],
      ["met", "Met", "month", ""],
      ["met_where", "Where you met", "text", ""],
    ],
  },
  pets: {
    label: "Pets", one: "Pet", folder: "Pets", emoji: "🐾", hue: 150,
    sub: "species", start: "joined", end: "rainbow_bridge", gone: "rainbow_bridge", place: "came_from", verb: "Got",
    fields: [
      ["species", "Species / breed", "text", "Dog · Border Collie"],
      ["aliases", "Alias / nicknames", "list", "Comma-separated"],
      ["birthday", "Birthday (if known)", "date", ""],
      ["joined", "Joined the family", "month", ""],
      ["rainbow_bridge", "Rainbow Bridge", "date", ""],
      ["came_from", "Came from", "text", "Shelter, breeder, a friend…"],
    ],
  },
  education: {
    label: "Education", one: "School", folder: "Education", emoji: "🎓", hue: 215,
    sub: "level", start: "started", end: "finished", gone: null, place: "location", verb: "Enrolled at",
    fields: [
      ["level", "Level / degree", "text", "High school, B.A., M.Sc.…"],
      ["major", "Major", "text", ""],
      ["minor", "Minor", "text", ""],
      ["location", "Location", "text", ""],
      ["started", "Started", "month", ""],
      ["finished", "Finished", "month", ""],
    ],
  },
  work: {
    label: "Work", one: "Job", folder: "Work", emoji: "💼", hue: 265,
    sub: "role", start: "started", end: "left", gone: null, place: "location", verb: "Began at",
    fields: [
      ["role", "Role", "text", ""],
      ["location", "Location", "text", ""],
      ["started", "Started", "month", ""],
      ["left", "Left", "month", ""],
    ],
  },
  homes: {
    label: "Homes", one: "Home", folder: "Homes", emoji: "🏠", hue: 185,
    sub: "type", start: "moved_in", end: "moved_out", gone: null, place: "location", verb: "Moved to",
    fields: [
      ["type", "Type of home", "text", "House, apartment…"],
      ["location", "City / region", "text", ""],
      ["moved_in", "Moved in", "month", ""],
      ["moved_out", "Moved out", "month", ""],
    ],
  },
  milestones: {
    label: "Milestones", one: "Milestone", folder: "Milestones", emoji: "⭐", hue: 45,
    sub: "type", start: "date", end: null, gone: null, place: "location", verb: "",
    fields: [
      ["type", "Type", "text", "Travel, achievement…"],
      ["location", "Where", "text", ""],
      ["date", "Date", "month", ""],
    ],
  },
};
const CAT_KEYS = Object.keys(CATS);
const TABS = [["overview", "Overview"], ...CAT_KEYS.map((k) => [k, CATS[k].label]), ["guide", "Guide"]];

// Reverse labels for person-to-person connections.
const INV = {
  mother: "Child", father: "Child", parent: "Child", mom: "Child", dad: "Child",
  son: "Parent", daughter: "Parent", child: "Parent",
  brother: "Sibling", sister: "Sibling", sibling: "Sibling",
  "half-brother": "Half-sibling", "half-sister": "Half-sibling",
  spouse: "Spouse", wife: "Spouse", husband: "Spouse", partner: "Partner",
  grandmother: "Grandchild", grandfather: "Grandchild", grandparent: "Grandchild",
  grandchild: "Grandparent", grandson: "Grandparent", granddaughter: "Grandparent",
  aunt: "Niece / nephew", uncle: "Niece / nephew", niece: "Aunt / uncle", nephew: "Aunt / uncle",
  cousin: "Cousin", mentor: "Mentee", mentee: "Mentor",
  stepmother: "Stepchild", stepfather: "Stepchild", "step-mother": "Stepchild", "step-father": "Stepchild",
  stepson: "Step-parent", stepdaughter: "Step-parent", stepchild: "Step-parent",
};
const REL_SUGGESTIONS = [
  "Mother", "Father", "Parent", "Brother", "Sister", "Sibling", "Son", "Daughter", "Child",
  "Spouse", "Wife", "Husband", "Partner", "Grandmother", "Grandfather", "Grandchild",
  "Aunt", "Uncle", "Niece", "Nephew", "Cousin", "Stepmother", "Stepfather",
  "Best friend", "Friend", "Mentor", "Coworker", "Classmate", "Roommate", "Neighbour",
  "Lived here", "Lives here", "Worked here", "Studied here", "Owner", "Vet", "Pet sitter",
];

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

/** Build an element: h("div", {cls:"x", onclick:fn}, child, "text", [more]) */
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "cls") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "value") el.value = v;
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

function iconBtn(icon, title, onclick, extra) {
  const b = h("button", { cls: "ll-icon-btn" + (extra ? " " + extra : ""), "aria-label": title, title, type: "button" });
  setIcon(b, icon);
  b.addEventListener("click", (ev) => { ev.stopPropagation(); onclick(ev); });
  return b;
}

function btn(text, onclick, cls) {
  return h("button", { cls: "ll-btn" + (cls ? " " + cls : ""), type: "button", onclick }, text);
}

function asList(v) {
  if (v == null || v === "") return [];
  return (Array.isArray(v) ? v : [v]).filter((x) => x != null && x !== "");
}

/** Parse "[[path|alias]]", "![[path]]" or a bare path. */
function parseLink(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const m = /^!?\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]$/.exec(s);
  if (m) return { path: m[1].trim(), alias: (m[2] || "").trim() };
  return { path: s, alias: "" };
}

function sanitizeName(s) {
  return String(s || "").replace(/[\\/:*?"<>|#^[\]]/g, "").replace(/\s+/g, " ").trim() || "Untitled";
}

function val(e, k) {
  const v = e.fm[k];
  if (v == null) return "";
  if (Array.isArray(v)) return v.filter((x) => x != null && x !== "").join(", ");
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}
const subOf = (e) => val(e, CATS[e.cat].sub);
const startOf = (e) => val(e, CATS[e.cat].start);
const endOf = (e) => (CATS[e.cat].end ? val(e, CATS[e.cat].end) : "");
const goneOf = (e) => (CATS[e.cat].gone ? val(e, CATS[e.cat].gone) : "");
const isCurrent = (e) => !!(CATS[e.cat].end && startOf(e) && !endOf(e));

function parseD(d) {
  if (!d) return null;
  const [y, m, dd] = String(d).split("-");
  if (!/^\d{4}$/.test(y)) return null;
  return new Date(+y, (+m || 1) - 1, +dd || 1);
}
function fmt(d) {
  if (!d) return "";
  const [y, m, dd] = String(d).split("-");
  if (!/^\d{4}$/.test(y) || !m) return String(d);
  if (dd) return `${MONTHS[+m - 1]} ${+dd}, ${y}`;
  return `${MONTHS[+m - 1]} ${y}`;
}
function age(birth, end) {
  const b = parseD(birth); if (!b) return null;
  const e = parseD(end) || new Date();
  let a = e.getFullYear() - b.getFullYear();
  if (e.getMonth() < b.getMonth() || (e.getMonth() === b.getMonth() && e.getDate() < b.getDate())) a--;
  return a;
}
function dur(a, b) {
  const s = parseD(a); if (!s) return "";
  const y = ((parseD(b) || new Date()) - s) / 31557600000;
  if (y < 0) return "";
  return y < 1 ? `${Math.max(1, Math.round(y * 12))} mo` : `${y.toFixed(y < 10 ? 1 : 0)} yrs`;
}

function rng(seed) {
  let s = 0;
  for (const c of String(seed)) s = (s * 31 + c.charCodeAt(0)) >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const _phCache = new Map();
function placeholder(seed, cat) {
  const key = seed + "|" + cat;
  if (_phCache.has(key)) return _phCache.get(key);
  const c = CATS[cat] || CATS.people;
  const r = rng(seed);
  const hue = (c.hue + Math.floor(r() * 30)) % 360;
  const x = 20 + r() * 60, y = 20 + r() * 50;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><defs><radialGradient id="g" cx="${x}%" cy="${y}%" r="85%"><stop offset="0" stop-color="hsl(${hue},22%,30%)"/><stop offset="1" stop-color="hsl(${hue},12%,9%)"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><text x="50%" y="54%" font-size="104" text-anchor="middle" dominant-baseline="middle" opacity=".9">${c.emoji}</text></svg>`;
  const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  _phCache.set(key, url);
  return url;
}
const coverUrl = (e) => (e.cover ? e.cover.url : placeholder(e.title, e.cat));

function pickDeviceFiles(multiple) {
  return new Promise((resolve) => {
    const inp = h("input", { type: "file", accept: "image/*" });
    inp.multiple = !!multiple;
    inp.style.display = "none";
    document.body.append(inp);
    inp.addEventListener("change", () => { resolve(Array.from(inp.files || [])); inp.remove(); });
    inp.click();
  });
}

/* ------------------------------------------------------------------ */
/* Plugin                                                              */
/* ------------------------------------------------------------------ */

class LifeLogPlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    this.entries = [];
    this.listeners = new Set();

    this.registerView(VIEW_TYPE, (leaf) => new LifeLogView(leaf, this));
    this.addRibbonIcon(ICON, "Open Life Log", () => this.activateView());
    this.addCommand({ id: "open-dashboard", name: "Open dashboard", callback: () => this.activateView() });
    this.addCommand({ id: "new-entry", name: "New entry", callback: () => EditModal.openFor(this, null, "people") });
    for (const k of CAT_KEYS) {
      this.addCommand({ id: `new-${k}`, name: `New ${CATS[k].one.toLowerCase()}`, callback: () => EditModal.openFor(this, null, k) });
    }
    this.addSettingTab(new LifeLogSettingTab(this.app, this));
    this.registerMarkdownCodeBlockProcessor("lifelog", (src, el, ctx) => {
      ctx.addChild(new LifeLogBlock(el, this, src));
    });

    const refresh = debounce(() => this.reindex(), 200, true);
    this.app.workspace.onLayoutReady(() => {
      this.reindex();
      this.registerEvent(this.app.metadataCache.on("changed", refresh));
      this.registerEvent(this.app.metadataCache.on("resolved", refresh));
      this.registerEvent(this.app.vault.on("create", refresh));
      this.registerEvent(this.app.vault.on("delete", refresh));
      this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
        let changed = false;
        for (const [t, p] of Object.entries(this.settings.banners)) {
          if (p === oldPath) { this.settings.banners[t] = file.path; changed = true; }
        }
        if (changed) this.saveSettings();
        refresh();
      }));
    });
  }

  onunload() { this.listeners.clear(); }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.settings.banners = Object.assign({}, this.settings.banners);
  }
  async saveSettings() { await this.saveData(this.settings); }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  notify() { for (const fn of [...this.listeners]) { try { fn(); } catch (e) { console.error("Life Log:", e); } } }

  /* ---------- index ---------- */
  reindex() {
    const out = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
      if (!fm || !CATS[fm.lifelog]) continue;
      out.push(this.toEntry(file, fm));
    }
    this.entries = out;
    this.notify();
  }

  toEntry(file, fm) {
    const sp = file.path;
    const links = asList(fm.connections).map((raw) => {
      const l = parseLink(raw);
      if (!l) return null;
      return { raw: String(raw), target: this.app.metadataCache.getFirstLinkpathDest(l.path, sp), label: l.alias };
    }).filter(Boolean);
    return {
      file, fm, cat: fm.lifelog, title: file.basename,
      cover: this.resolveImage(fm.cover, sp),
      gallery: asList(fm.gallery).map((raw, i) => ({ raw: String(raw), i, img: this.resolveImage(raw, sp) })),
      links,
      tags: asList(fm.tags).map((t) => String(t).replace(/^#/, "")),
    };
  }

  resolveImage(raw, sourcePath) {
    if (!raw) return null;
    const s = String(raw).trim();
    if (/^https?:\/\//i.test(s)) return { url: s, file: null };
    const l = parseLink(s);
    const f = l && this.app.metadataCache.getFirstLinkpathDest(l.path, sourcePath || "");
    if (f && IMG_EXT.includes(f.extension.toLowerCase())) return { url: this.app.vault.getResourcePath(f), file: f };
    return null;
  }
  resolvePath(path) {
    const f = path && this.app.vault.getAbstractFileByPath(path);
    return f && f.extension ? this.app.vault.getResourcePath(f) : null;
  }

  byFile(f) { return this.entries.find((e) => e.file === f) || null; }
  byCat(c) { return this.entries.filter((e) => e.cat === c); }

  connections(e) {
    const out = [];
    const seen = new Set();
    for (const l of e.links) {
      if (!l.target) continue;
      const t = this.byFile(l.target);
      if (!t || seen.has(t.file.path) || t.file === e.file) continue;
      seen.add(t.file.path);
      out.push({ ent: t, label: l.label });
    }
    for (const o of this.entries) {
      if (o.file === e.file || seen.has(o.file.path)) continue;
      const l = o.links.find((x) => x.target === e.file);
      if (!l) continue;
      seen.add(o.file.path);
      const label = o.cat === "people" && e.cat === "people" ? (INV[l.label.toLowerCase().trim()] || l.label) : l.label;
      out.push({ ent: o, label });
    }
    return out;
  }

  /* ---------- files ---------- */
  linkText(file, sourcePath, alias) {
    const t = this.app.metadataCache.fileToLinktext(file, sourcePath || "", true);
    return `[[${t}${alias ? "|" + alias.replace(/[[\]|]/g, "") : ""}]]`;
  }

  async ensureFolder(path) {
    path = normalizePath(path || "");
    if (!path || path === "/" || this.app.vault.getAbstractFileByPath(path)) return;
    let cur = "";
    for (const part of path.split("/")) {
      cur = cur ? `${cur}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(cur)) {
        try { await this.app.vault.createFolder(cur); } catch (e) { /* created concurrently */ }
      }
    }
  }

  uniquePath(folder, name, ext, self) {
    const base = folder ? `${folder}/` : "";
    let p = normalizePath(`${base}${name}.${ext}`);
    let i = 2;
    while (true) {
      const ex = this.app.vault.getAbstractFileByPath(p);
      if (!ex || ex === self) return p;
      p = normalizePath(`${base}${name} ${i++}.${ext}`);
    }
  }

  async saveImage(file, baseName) {
    const folder = normalizePath(this.settings.imageFolder || `${this.settings.folder}/_images`);
    await this.ensureFolder(folder);
    let ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    if (!IMG_EXT.includes(ext)) ext = "jpg";
    const slug = sanitizeName(baseName).toLowerCase().replace(/\s+/g, "-").slice(0, 60) || "image";
    const path = this.uniquePath(folder, slug, ext);
    return this.app.vault.createBinary(path, await file.arrayBuffer());
  }

  /** Shows a menu (upload / pick from vault) and resolves to TFile[] */
  chooseImages(evt, multiple, baseName) {
    return new Promise((resolve) => {
      const menu = new Menu();
      menu.addItem((i) => i.setTitle(multiple ? "Upload photos…" : "Upload image…").setIcon("upload").onClick(async () => {
        const files = await pickDeviceFiles(multiple);
        const out = [];
        for (const f of files) {
          try { out.push(await this.saveImage(f, baseName)); }
          catch (e) { console.error(e); new Notice(`Life Log: couldn't save ${f.name}`); }
        }
        resolve(out);
      }));
      menu.addItem((i) => i.setTitle("Choose from vault…").setIcon("image").onClick(() => {
        new ImageSuggestModal(this.app, (f) => resolve([f])).open();
      }));
      if (evt instanceof MouseEvent) menu.showAtMouseEvent(evt);
      else menu.showAtPosition({ x: window.innerWidth / 2, y: window.innerHeight / 3 });
    });
  }

  async saveEntry(d) {
    const { vault, fileManager } = this.app;
    const c = CATS[d.cat];
    const name = sanitizeName(d.title);
    const root = normalizePath(this.settings.folder || "Life Log");
    const catFolder = normalizePath(`${root}/${c.folder}`);
    let file = d.file;

    if (!file) {
      await this.ensureFolder(catFolder);
      const body = (d.notes || "").replace(/\s+$/, "");
      file = await vault.create(this.uniquePath(catFolder, name, "md"), body ? body + "\n" : "");
    } else {
      let folder = file.parent ? file.parent.path : "";
      if (d.oldCat && d.oldCat !== d.cat && folder === normalizePath(`${root}/${CATS[d.oldCat].folder}`)) folder = catFolder;
      if (name !== file.basename || folder !== (file.parent ? file.parent.path : "")) {
        await this.ensureFolder(folder);
        await fileManager.renameFile(file, this.uniquePath(folder, name, "md", file));
      }
      const body = (d.notes || "").replace(/\s+$/, "");
      await vault.process(file, (data) => {
        const m = data.match(FM_RE);
        return (m ? m[0] : "") + (body ? body + "\n" : "");
      });
    }

    const links = d.links
      .map((l) => {
        const t = l.path && vault.getAbstractFileByPath(l.path);
        return t ? this.linkText(t, file.path, (l.label || "").trim()) : null;
      })
      .filter(Boolean)
      .concat(d.keepLinks || []);

    await fileManager.processFrontMatter(file, (fm) => {
      fm.lifelog = d.cat;
      if (d.oldCat && d.oldCat !== d.cat) {
        const keep = new Set(c.fields.map((f) => f[0]));
        for (const [k] of CATS[d.oldCat].fields) if (!keep.has(k)) delete fm[k];
      }
      for (const [k, , type] of c.fields) {
        const v = (d.values[k] || "").trim();
        if (type === "list") {
          const arr = v.split(",").map((s) => s.trim()).filter(Boolean);
          if (arr.length) fm[k] = arr; else delete fm[k];
        } else if (v) fm[k] = v;
        else delete fm[k];
      }
      if (d.tags.length) fm.tags = d.tags; else delete fm.tags;
      if (d.cover) fm.cover = d.cover; else delete fm.cover;
      if (d.gallery.length) fm.gallery = d.gallery; else delete fm.gallery;
      if (links.length) fm.connections = links; else delete fm.connections;
    });
    return file;
  }

  async deleteEntry(e) {
    const { metadataCache, fileManager, vault } = this.app;
    for (const o of this.entries) {
      if (o === e || !o.links.some((l) => l.target === e.file)) continue;
      await fileManager.processFrontMatter(o.file, (fm) => {
        const kept = asList(fm.connections).filter((raw) => {
          const l = parseLink(raw);
          return !(l && metadataCache.getFirstLinkpathDest(l.path, o.file.path) === e.file);
        });
        if (kept.length) fm.connections = kept; else delete fm.connections;
      });
    }
    if (fileManager.trashFile) await fileManager.trashFile(e.file);
    else await vault.trash(e.file, true);
  }

  async addToGallery(file, images) {
    if (!images.length) return;
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      fm.gallery = asList(fm.gallery).concat(images.map((f) => this.linkText(f, file.path)));
    });
    new Notice(`Added ${images.length} photo${images.length > 1 ? "s" : ""}`);
  }

  async removeFromGallery(file, index) {
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      const g = asList(fm.gallery);
      g.splice(index, 1);
      if (g.length) fm.gallery = g; else delete fm.gallery;
    });
  }

  /* ---------- view ---------- */
  async activateView(tab) {
    const ws = this.app.workspace;
    let leaf = ws.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      leaf = ws.getLeaf("tab");
      await leaf.setViewState({ type: VIEW_TYPE, active: true, state: tab ? { tab } : {} });
    } else if (tab && leaf.view && leaf.view.setTab) {
      leaf.view.setTab(tab);
    }
    ws.revealLeaf(leaf);
  }
}

/* ------------------------------------------------------------------ */
/* Shared building blocks (used by the dashboard and code blocks)      */
/* ------------------------------------------------------------------ */

function win(title, extras, body, cls) {
  return h("section", { cls: "ll-win" + (cls ? " " + cls : "") },
    h("div", { cls: "ll-win-h" }, h("h2", { text: title }), h("span", { cls: "ll-sp" }), extras || []),
    h("div", { cls: "ll-win-b" }, body));
}

function buildSummary(plugin, goTab, openEntry) {
  const all = plugin.entries;
  const starts = all.map(startOf).filter((s) => parseD(s)).sort();
  const first = starts[0] ? starts[0].slice(0, 4) : String(new Date().getFullYear());
  const now = new Date().getFullYear();
  const stats = h("div", { cls: "ll-stat-grid" }, CAT_KEYS.map((k) =>
    h("div", { cls: "ll-stat", onclick: () => goTab(k) },
      h("div", { cls: "ll-n", text: String(plugin.byCat(k).length) }),
      h("div", { cls: "ll-l", text: CATS[k].label }))));
  const current = all.filter(isCurrent).filter((e) => e.cat !== "education")
    .sort((a, b) => CAT_KEYS.indexOf(a.cat) - CAT_KEYS.indexOf(b.cat));
  return h("div", {},
    stats,
    h("div", { cls: "ll-sub-h", text: "Years logged" }),
    h("div", { cls: "ll-lifebar-l" }, h("span", { text: first }), h("span", { text: `${Math.max(0, now - +first)} years` }), h("span", { text: String(now) })),
    h("div", { cls: "ll-bar" }, h("i")),
    h("div", { cls: "ll-sub-h", text: "Current" }),
    current.length
      ? h("div", { cls: "ll-now-list" }, current.map((e) =>
        h("div", { cls: "ll-now", onclick: () => openEntry(e) },
          h("img", { src: coverUrl(e), alt: "" }),
          h("div", {}, h("div", { cls: "ll-t", text: e.title }),
            h("div", { cls: "ll-s", text: [subOf(e), dur(startOf(e))].filter(Boolean).join(" · ") })))))
      : h("div", { cls: "ll-empty", text: "Nothing current yet." }));
}

function buildPets(plugin, openEntry) {
  const pets = plugin.byCat("pets").sort((a, b) => (!!endOf(a) - !!endOf(b)) || startOf(b).localeCompare(startOf(a)));
  if (!pets.length) return h("div", { cls: "ll-empty", text: "No pets yet." });
  return h("div", { cls: "ll-gallery" }, pets.map((e) =>
    h("div", { cls: "ll-gi", title: e.title, onclick: () => openEntry(e) }, h("img", { src: coverUrl(e), alt: e.title }))));
}

function timelineEvents(plugin) {
  const evs = [];
  for (const e of plugin.entries) {
    const c = CATS[e.cat];
    const s = startOf(e);
    if (parseD(s)) evs.push({ d: s, e, pre: c.verb, post: "", place: val(e, c.place) });
    const b = val(e, "birthday");
    if ((e.cat === "people" || e.cat === "pets") && parseD(b)) evs.push({ d: b, e, pre: "", post: "was born" });
    const g = goneOf(e);
    if (parseD(g)) evs.push({ d: g, e, pre: "", post: e.cat === "pets" ? "crossed the Rainbow Bridge" : "passed away" });
  }
  return evs.sort((a, b) => b.d.localeCompare(a.d));
}

function buildTimeline(plugin, openEntry, limit) {
  let evs = timelineEvents(plugin);
  if (limit) evs = evs.slice(0, limit);
  if (!evs.length) return h("div", { cls: "ll-empty", text: "No dated entries yet. Add a date to an entry to see it here." });
  const box = h("div", { cls: "ll-chron" });
  let lastY = "";
  for (const v of evs) {
    const y = v.d.slice(0, 4);
    if (y !== lastY) { box.append(h("div", { cls: "ll-yr", text: y })); lastY = y; }
    const e = v.e;
    box.append(h("div", { cls: "ll-ev", onclick: () => openEntry(e) },
      h("img", { src: coverUrl(e), alt: "" }),
      h("div", { cls: "ll-what" },
        v.pre ? h("span", { text: v.pre + " " }) : null, h("b", { text: e.title }), v.post ? h("span", { text: " " + v.post }) : null,
        h("br"), h("span", { text: [subOf(e), v.place].filter(Boolean).join(" · ") })),
      h("span", { cls: "ll-k", text: CATS[e.cat].label })));
  }
  return box;
}

function buildCards(list, openEntry, editEntry, addNew) {
  const grid = h("div", { cls: "ll-grid" });
  for (const e of list) {
    grid.append(h("div", { cls: "ll-card", onclick: () => openEntry(e) },
      h("div", { cls: "ll-cv" }, h("img", { src: coverUrl(e), alt: "", loading: "lazy" }),
        editEntry ? iconBtn("pencil", "Edit", () => editEntry(e), "ll-card-edit") : null),
      h("div", { cls: "ll-nm", text: e.title })));
  }
  if (addNew) grid.append(h("button", { cls: "ll-card ll-add-card", type: "button", onclick: addNew.fn },
    h("span", { cls: "ll-plus", text: "+" }), h("span", { text: addNew.label })));
  return grid;
}

/* ------------------------------------------------------------------ */
/* Dashboard view                                                      */
/* ------------------------------------------------------------------ */

class LifeLogView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.tab = "overview";
    this.q = "";
    this.sort = "newest";
  }
  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return "Life Log"; }
  getIcon() { return ICON; }

  async onOpen() {
    this.contentEl.addClass("lifelog");
    this.unsub = this.plugin.onChange(() => this.render());
    this.render();
  }
  async onClose() { if (this.unsub) this.unsub(); }

  getState() { return Object.assign(super.getState ? super.getState() : {}, { tab: this.tab }); }
  async setState(state, result) {
    if (state && state.tab && TABS.some((t) => t[0] === state.tab)) this.tab = state.tab;
    this.render();
    if (super.setState) await super.setState(state, result);
  }
  setTab(t) {
    if (this.tab === t) return;
    this.tab = t; this.q = "";
    this.render(true);
    if (this.app.workspace.requestSaveLayout) this.app.workspace.requestSaveLayout();
  }

  open(e) { new DetailModal(this.plugin, e.file).open(); }

  render(resetScroll) {
    const root = this.contentEl;
    if (!root) return;
    const scroll = root.scrollTop;
    root.replaceChildren();
    const app = h("div", { cls: "ll-app" });
    app.append(this.renderBanner(), this.renderTabs());
    const main = h("div", { cls: "ll-main" });
    if (this.tab === "overview") main.append(this.renderOverview());
    else if (this.tab === "guide") main.append(renderGuide());
    else main.append(this.renderCat(this.tab));
    app.append(main);
    root.append(app);
    root.scrollTop = resetScroll ? 0 : scroll;
  }

  renderBanner() {
    const p = this.plugin, s = p.settings, tab = this.tab;
    const own = s.banners[tab];
    const url = p.resolvePath(own) || p.resolvePath(s.banners.overview);
    const label = tab === "overview" ? "Overview" : tab === "guide" ? "Guide" : CATS[tab].label;
    const btns = h("div", { cls: "ll-banner-btns" },
      own ? iconBtn("rotate-ccw", `Remove the ${label} banner`, async () => {
        delete s.banners[tab]; await p.saveSettings(); this.render();
      }) : null,
      iconBtn("image", `Set a banner for ${label}`, async (ev) => {
        const [f] = await p.chooseImages(ev, false, `banner ${tab}`);
        if (f) { s.banners[tab] = f.path; await p.saveSettings(); this.render(); new Notice(`Banner set for ${label}`); }
      }));
    let text;
    if (tab === "overview") {
      const edit = (key, ph, cls) => {
        const el = h(cls === "h1" ? "h1" : "div", { cls: cls === "h1" ? "" : "ll-subtitle", contenteditable: "true", spellcheck: "false", "data-placeholder": ph, text: s[key] || "" });
        el.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); el.blur(); } });
        el.addEventListener("blur", async () => { const v = el.textContent.trim(); if (v !== (s[key] || "")) { s[key] = v; await p.saveSettings(); } });
        return el;
      };
      text = h("div", { cls: "ll-hero" }, edit("name", "Your name", "h1"), edit("subtitle", "A line about you", "div"));
    } else {
      text = h("div", { cls: "ll-hero" }, h("h1", { text: label }),
        h("div", { cls: "ll-subtitle", text: tab === "guide" ? "How Life Log works" : `${p.byCat(tab).length} entries` }));
    }
    return h("div", { cls: "ll-banner" },
      url ? h("img", { src: url, alt: "" }) : h("div", { cls: "ll-banner-ph" }),
      h("div", { cls: "ll-banner-shade" }), btns, text);
  }

  renderTabs() {
    return h("nav", { cls: "ll-tabs" }, TABS.map(([k, l]) =>
      h("button", { cls: "ll-tab" + (k === this.tab ? " is-active" : ""), type: "button", onclick: () => this.setTab(k) }, l)));
  }

  renderOverview() {
    const p = this.plugin;
    const open = (e) => this.open(e);
    return h("div", { cls: "ll-ov" },
      h("div", { cls: "ll-col" },
        win("Summary", null, buildSummary(p, (k) => this.setTab(k), open)),
        win("Pets", [btn("+ Add", () => EditModal.openFor(p, null, "pets"), "mod-ghost")], buildPets(p, open))),
      win("Timeline", [btn("+ New entry", () => EditModal.openFor(p, null, "people"), "mod-primary")], buildTimeline(p, open)));
  }

  renderCat(cat) {
    const p = this.plugin, c = CATS[cat];
    const gridBox = h("div");
    const draw = () => {
      const q = this.q.toLowerCase();
      let list = p.byCat(cat).filter((e) => !q || [e.title, ...c.fields.map(([k]) => val(e, k)), ...e.tags].join(" ").toLowerCase().includes(q));
      const key = (e) => startOf(e) || val(e, "birthday") || "";
      list.sort((a, b) => this.sort === "newest" ? key(b).localeCompare(key(a)) || a.title.localeCompare(b.title)
        : this.sort === "oldest" ? key(a).localeCompare(key(b)) || a.title.localeCompare(b.title)
          : a.title.localeCompare(b.title));
      gridBox.replaceChildren(buildCards(list, (e) => this.open(e), (e) => EditModal.openFor(p, e),
        { label: `Add ${c.one.toLowerCase()}`, fn: () => EditModal.openFor(p, null, cat) }));
    };
    const search = h("input", { type: "search", placeholder: `Search ${c.label.toLowerCase()}…`, value: this.q });
    search.addEventListener("input", () => { this.q = search.value; draw(); });
    const sort = h("select", {}, [["newest", "Newest"], ["oldest", "Oldest"], ["az", "A–Z"]].map(([v, l]) => h("option", { value: v, text: l })));
    sort.value = this.sort;
    sort.addEventListener("change", () => { this.sort = sort.value; draw(); });
    draw();
    return win(c.label, [h("div", { cls: "ll-toolbar" }, search, sort, btn(`+ ${c.one}`, () => EditModal.openFor(p, null, cat), "mod-primary"))], gridBox);
  }
}

function renderGuide() {
  const code = (t) => h("code", { text: t });
  const pre = (t) => h("pre", {}, h("code", { text: t }));
  return win("Guide", null, h("div", { cls: "ll-guide" },
    h("p", { text: "Life Log keeps a record of the people, pets, schools, jobs, homes and milestones in your life. Every entry is an ordinary note in your vault, so your data stays readable without the plugin." }),
    h("h3", { text: "Adding entries" }),
    h("ul", {},
      h("li", { text: "Use + New entry, or the + card on any tab. Use the pencil on a card to edit it, or click the card to open it." }),
      h("li", { text: "In an open entry you can add photos to its gallery, click any photo to view it full size, or open the underlying note." }),
      h("li", { text: "Images can be uploaded from your device (they're saved to your images folder) or chosen from images already in your vault." })),
    h("h3", { text: "Banners" }),
    h("ul", {},
      h("li", { text: "Each tab can have its own banner. Open the tab and click the image button on the banner." }),
      h("li", { text: "Tabs without their own banner use the Overview banner. The reset button removes a tab's banner." })),
    h("h3", { text: "Connections" }),
    h("ul", {},
      h("li", { text: "Any entry can link to any other entry, with a label such as Mother, Brother, Spouse, Lived here or Coworker." }),
      h("li", { text: "Links show on both entries. Between people, family labels reverse automatically: if Elliot lists Ana as Mother, Ana's page shows Elliot as Child." }),
      h("li", { text: "Connections are real Obsidian links, so they appear in backlinks and the graph, and update when you rename a note." })),
    h("h3", {}, "In your vault"),
    h("p", {}, "Entries are notes in ", code("Life Log/<Category>/"), " (configurable in settings). A person looks like this:"),
    pre(`---
lifelog: people
relation: Brother
aliases: [Eli, El]
occupation: Paramedic
birthday: 1995-02-03
cover: "[[elliot-ashdown.jpg]]"
gallery:
  - "[[elliot-ashdown-2.jpg]]"
connections:
  - "[[Ana Ashdown|Mother]]"
  - "[[The Halden House|Lived here]]"
tags: [family]
---
Notes go here, in normal Markdown.`),
    h("p", {}, "The ", code("lifelog"), " property can be ", code(CAT_KEYS.join(", ")), "."),
    h("h3", { text: "Embedding in a note" }),
    pre("```lifelog\nview: timeline     # timeline | summary | pets | cards\ncategory: people   # for view: cards\nlimit: 10          # optional\n```")));
}

/* ------------------------------------------------------------------ */
/* Detail modal                                                        */
/* ------------------------------------------------------------------ */

function factsOf(e) {
  const c = CATS[e.cat], out = [];
  for (const [k, l, t] of c.fields) {
    if (k === c.sub || k === "aliases") continue;
    const v = val(e, k);
    if (v) out.push([l, t === "date" || t === "month" ? fmt(v) : v]);
    else if (k === c.end && c.end !== c.gone && startOf(e)) out.push([l, "Present"]);
    if (k === "birthday" && v) {
      const g = goneOf(e);
      const a = age(v, g);
      if (a != null) out.push([g ? "Age at passing" : "Age", `${a} ${a === 1 ? "year" : "years"}`]);
    }
  }
  const s = startOf(e);
  if (s && e.cat !== "milestones") {
    const d = dur(s, e.cat === "people" ? goneOf(e) : endOf(e));
    if (d) out.push([e.cat === "people" ? "Known for" : e.cat === "pets" ? "Time together" : "Duration", d]);
  }
  return out;
}

class DetailModal extends Modal {
  constructor(plugin, file) {
    super(plugin.app);
    this.plugin = plugin;
    this.file = file;
    this.tok = 0;
    this.modalEl.addClass("ll-modal", "lifelog");
  }
  onOpen() {
    this.comp = new Component();
    this.comp.load();
    this.unsub = this.plugin.onChange(() => this.draw());
    this.draw();
  }
  onClose() {
    if (this.unsub) this.unsub();
    this.comp.unload();
    this.contentEl.replaceChildren();
  }
  go(file) { this.file = file; this.draw(true); }

  async draw(top) {
    const p = this.plugin;
    const tok = ++this.tok;
    const e = p.byFile(this.file);
    const el = this.contentEl;
    if (!e) {
      if (!p.app.vault.getAbstractFileByPath(this.file.path)) { this.close(); return; }
      el.replaceChildren(h("div", { cls: "ll-loading", text: "Loading…" }));
      return; // will redraw on the next index change
    }
    let body = "";
    try { body = (await p.app.vault.cachedRead(e.file)).replace(FM_RE, "").trim(); } catch (err) { /* ignore */ }
    if (tok !== this.tok) return;

    const c = CATS[e.cat];
    const scrollBox = this.modalEl;
    const prevScroll = scrollBox.scrollTop;
    this.comp.unload(); this.comp = new Component(); this.comp.load();

    const conns = p.connections(e);
    const notes = h("div", { cls: "ll-notes markdown-rendered" });
    if (body) MarkdownRenderer.render(p.app, body, notes, e.file.path, this.comp);
    const aka = val(e, "aliases");
    const galleryItems = e.gallery.filter((g) => g.img);

    el.replaceChildren(
      h("div", { cls: "ll-detail-cover" }, h("img", { src: coverUrl(e), alt: "" })),
      h("div", { cls: "ll-detail-b" },
        h("span", { cls: "ll-pill", text: c.one }),
        h("h2", { text: e.title }),
        h("div", { cls: "ll-detail-sub" }, subOf(e), aka ? h("span", { cls: "ll-aka", text: `${subOf(e) ? " · " : ""}aka ${aka}` }) : null),
        h("div", { cls: "ll-facts" }, factsOf(e).map(([l, v]) => h("div", { cls: "ll-fact" }, h("div", { cls: "ll-l", text: l }), h("div", { cls: "ll-v", text: v })))),
        e.tags.length ? h("div", { cls: "ll-tags" }, e.tags.map((t) => h("span", { cls: "ll-tag", text: "#" + t }))) : null,
        body ? [h("div", { cls: "ll-sub-h", text: "Notes" }), notes] : null,
        h("div", { cls: "ll-sub-h", text: `Connections · ${conns.length}` }),
        h("div", { cls: "ll-conn-grid" },
          conns.map((x) => h("div", { cls: "ll-conn", onclick: () => this.go(x.ent.file) },
            h("img", { src: coverUrl(x.ent), alt: "" }),
            h("div", {}, h("div", { cls: "ll-t", text: x.ent.title }),
              h("div", { cls: "ll-s", text: `${x.label || CATS[x.ent.cat].one} · ${CATS[x.ent.cat].label}` })))),
          h("div", { cls: "ll-conn ll-conn-add", onclick: () => { this.close(); EditModal.openFor(p, e, null, true); } }, "+ Add connection")),
        h("div", { cls: "ll-sub-h", text: `Gallery · ${galleryItems.length}` }),
        h("div", { cls: "ll-gallery" },
          galleryItems.map((g, n) => h("div", { cls: "ll-gi", onclick: () => new Lightbox(p.app, galleryItems.map((x) => x.img.url), n, e.title).open() },
            h("img", { src: g.img.url, alt: "", loading: "lazy" }),
            iconBtn("x", "Remove from gallery", () => p.removeFromGallery(e.file, g.i), "ll-rm"))),
          h("div", { cls: "ll-gadd", onclick: async (ev) => { const files = await p.chooseImages(ev, true, e.title); await p.addToGallery(e.file, files); } },
            h("span", { text: "+" }), h("span", { text: "Add photos" }))),
        h("div", { cls: "ll-row-btns" },
          btn("Open note", () => { this.close(); p.app.workspace.getLeaf("tab").openFile(e.file); }, "mod-ghost"),
          btn("Edit", () => { this.close(); EditModal.openFor(p, e); }))));
    scrollBox.scrollTop = top ? 0 : prevScroll;
  }
}

/* ------------------------------------------------------------------ */
/* Edit modal                                                          */
/* ------------------------------------------------------------------ */

let _relListId = 0;

class EditModal extends Modal {
  static async openFor(plugin, entry, cat, addLink) {
    let d;
    if (entry) {
      let notes = "";
      try { notes = (await plugin.app.vault.read(entry.file)).replace(FM_RE, "").replace(/^\s*\n/, "").replace(/\s+$/, ""); } catch (e) { /* ignore */ }
      d = {
        file: entry.file, oldCat: entry.cat, cat: entry.cat, title: entry.title, values: {}, notes,
        tags: [...entry.tags],
        cover: entry.fm.cover ? String(entry.fm.cover) : "",
        gallery: asList(entry.fm.gallery).map(String),
        links: entry.links.filter((l) => l.target).map((l) => ({ path: l.target.path, label: l.label })),
        keepLinks: entry.links.filter((l) => !l.target).map((l) => l.raw),
      };
      for (const c of Object.values(CATS)) for (const [k] of c.fields) { const v = val(entry, k); if (v) d.values[k] = v; }
    } else {
      d = { file: null, cat: CAT_KEYS.includes(cat) ? cat : "people", title: "", values: {}, notes: "", tags: [], cover: "", gallery: [], links: [], keepLinks: [] };
    }
    if (addLink) d.links.push({ path: "", label: "" });
    new EditModal(plugin, d, addLink).open();
  }

  constructor(plugin, draft, focusLinks) {
    super(plugin.app);
    this.plugin = plugin;
    this.d = draft;
    this.focusLinks = focusLinks;
    this.relListId = `ll-rel-list-${++_relListId}`;
    this.modalEl.addClass("ll-modal", "lifelog");
  }
  onOpen() {
    this.draw();
    if (this.focusLinks) {
      const rows = this.contentEl.querySelectorAll(".ll-lk-row");
      const last = rows[rows.length - 1];
      if (last) { last.scrollIntoView({ block: "center" }); last.querySelector("select").focus(); }
    } else {
      const t = this.contentEl.querySelector('input[name="title"]');
      if (t && !this.d.file) t.focus();
    }
  }
  onClose() { this.contentEl.replaceChildren(); }

  sync() {
    const f = this.form; if (!f) return;
    const d = this.d, el = f.elements;
    d.title = el.namedItem("title").value.trim();
    for (const [k] of CATS[d.cat].fields) { const i = el.namedItem("f_" + k); if (i) d.values[k] = i.value.trim(); }
    d.notes = el.namedItem("notes").value;
    d.tags = el.namedItem("tags").value.split(",").map((s) => s.trim().replace(/^#/, "")).filter(Boolean);
    d.links = [...f.querySelectorAll(".ll-lk-row")].map((r) => ({ path: r.querySelector("select").value, label: r.querySelector("input").value.trim() }));
  }
  // Callers sync() the form into the draft *before* changing the draft.
  redraw() { const s = this.modalEl.scrollTop; this.draw(); this.modalEl.scrollTop = s; }

  linkRow(l, i) {
    const p = this.plugin, d = this.d;
    const sel = h("select", {}, h("option", { value: "", text: "Choose an entry…" }),
      CAT_KEYS.map((k) => {
        const items = p.byCat(k).filter((x) => x.file !== d.file).sort((a, b) => a.title.localeCompare(b.title));
        return items.length ? h("optgroup", { label: CATS[k].label }, items.map((x) => h("option", { value: x.file.path, text: x.title }))) : null;
      }));
    sel.value = l.path || "";
    return h("div", { cls: "ll-lk-row" }, sel,
      h("input", { type: "text", list: this.relListId, placeholder: "Relationship, e.g. Brother, Lived here", value: l.label || "" }),
      iconBtn("x", "Remove connection", () => { this.sync(); this.d.links.splice(i, 1); this.redraw(); }));
  }

  draw() {
    const p = this.plugin, d = this.d, c = CATS[d.cat];
    const isEdit = !!d.file;
    const field = ([k, label, type, ph]) => h("label", { cls: "ll-f" }, label,
      h("input", { name: "f_" + k, type: type === "list" ? "text" : type, value: d.values[k] || "", placeholder: ph || "" }));
    const coverImg = d.cover ? p.resolveImage(d.cover, d.file ? d.file.path : "") : null;
    const thumb = (raw) => { const r = p.resolveImage(raw, d.file ? d.file.path : ""); return r ? r.url : placeholder(raw, d.cat); };

    let delArmed = false;
    const delBtn = isEdit ? btn("Delete", async () => {
      if (!delArmed) { delArmed = true; delBtn.textContent = "Click again to delete"; setTimeout(() => { delArmed = false; delBtn.textContent = "Delete"; }, 3000); return; }
      const e = p.byFile(d.file);
      this.close();
      if (e) { await p.deleteEntry(e); new Notice(`Deleted ${e.title}`); }
    }, "mod-danger") : null;

    this.form = h("form", { cls: "ll-ed" },
      h("h2", { text: isEdit ? `Edit ${c.one.toLowerCase()}` : "New entry" }),
      h("div", { cls: "ll-fg" },
        h("label", { cls: "ll-f" }, "Category",
          (() => {
            const s = h("select", {}, CAT_KEYS.map((k) => h("option", { value: k, text: CATS[k].one })));
            s.value = d.cat;
            s.addEventListener("change", () => { this.sync(); d.cat = s.value; this.redraw(); });
            return s;
          })()),
        h("label", { cls: "ll-f" }, "Name", h("input", { name: "title", type: "text", required: true, value: d.title })),
        c.fields.map(field),
        h("label", { cls: "ll-f ll-full" }, "Tags", h("input", { name: "tags", type: "text", value: d.tags.join(", "), placeholder: "family, university" })),
        h("label", { cls: "ll-f ll-full" }, "Notes", h("textarea", { name: "notes", value: d.notes, placeholder: "Memories, stories, details… (Markdown)" })),
        h("div", { cls: "ll-f ll-full" },
          h("div", { cls: "ll-f-label", text: "Connections" }),
          h("div", { cls: "ll-hint", text: "Link to people, pets, schools, jobs, homes or milestones. Family labels (Mother, Brother, Spouse…) show the reverse on the other person." }),
          d.links.map((l, i) => this.linkRow(l, i)),
          h("div", {}, btn("+ Add connection", () => { this.sync(); d.links.push({ path: "", label: "" }); this.redraw(); }))),
        h("div", { cls: "ll-f ll-full" },
          h("div", { cls: "ll-f-label", text: "Cover image" }),
          h("div", { cls: "ll-img-pick" },
            coverImg ? h("img", { src: coverImg.url, alt: "" }) : null,
            btn(d.cover ? "Replace…" : "Choose…", async (ev) => {
              this.sync();
              const [f] = await p.chooseImages(ev, false, d.title || c.one);
              if (f) { d.cover = p.linkText(f, d.file ? d.file.path : ""); this.redraw(); }
            }),
            d.cover ? btn("Remove", () => { this.sync(); d.cover = ""; this.redraw(); }, "mod-ghost") : null)),
        h("div", { cls: "ll-f ll-full" },
          h("div", { cls: "ll-f-label", text: `Gallery · ${d.gallery.length}` }),
          h("div", { cls: "ll-ed-gal" },
            d.gallery.map((raw, i) => h("div", { cls: "ll-gi" }, h("img", { src: thumb(raw), alt: "" }),
              iconBtn("x", "Remove", () => { this.sync(); d.gallery.splice(i, 1); this.redraw(); }))),
            btn("+ Photos", async (ev) => {
              this.sync();
              const files = await p.chooseImages(ev, true, d.title || c.one);
              d.gallery.push(...files.map((f) => p.linkText(f, d.file ? d.file.path : "")));
              this.redraw();
            }, "ll-add-photos")))),
      h("div", { cls: "ll-row-btns" },
        delBtn, delBtn ? h("span", { cls: "ll-sp" }) : null,
        btn("Cancel", () => this.close(), "mod-ghost"),
        h("button", { cls: "ll-btn mod-primary", type: "submit" }, isEdit ? "Save" : "Add entry")),
      h("datalist", { id: this.relListId }, REL_SUGGESTIONS.map((r) => h("option", { value: r }))));

    this.form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      this.sync();
      if (!d.title) { new Notice("Please give the entry a name."); return; }
      try {
        const file = await p.saveEntry(d);
        this.close();
        new DetailModal(p, file).open();
        new Notice(isEdit ? "Saved" : "Entry added");
      } catch (err) {
        console.error(err);
        new Notice("Life Log: couldn't save — " + (err && err.message ? err.message : err));
      }
    });
    this.contentEl.replaceChildren(this.form);
  }
}

/* ------------------------------------------------------------------ */
/* Lightbox, image picker                                              */
/* ------------------------------------------------------------------ */

class Lightbox extends Modal {
  constructor(app, urls, i, title) {
    super(app);
    this.urls = urls; this.i = i; this.title = title;
    this.modalEl.addClass("ll-lightbox");
    this.containerEl.addClass("ll-lightbox-container");
  }
  onOpen() {
    this.scope.register([], "ArrowLeft", () => { this.step(-1); return false; });
    this.scope.register([], "ArrowRight", () => { this.step(1); return false; });
    this.draw();
  }
  onClose() { this.contentEl.replaceChildren(); }
  step(n) { this.i = (this.i + n + this.urls.length) % this.urls.length; this.draw(); }
  draw() {
    const many = this.urls.length > 1;
    this.contentEl.replaceChildren(
      h("img", { src: this.urls[this.i], alt: "" }),
      many ? iconBtn("chevron-left", "Previous", () => this.step(-1), "ll-lb-prev") : null,
      many ? iconBtn("chevron-right", "Next", () => this.step(1), "ll-lb-next") : null,
      h("div", { cls: "ll-lb-cap", text: `${this.title} · ${this.i + 1} / ${this.urls.length}` }));
  }
}

class ImageSuggestModal extends FuzzySuggestModal {
  constructor(app, onChoose) {
    super(app);
    this.onChoose = onChoose;
    this.setPlaceholder("Choose an image from your vault");
  }
  getItems() { return this.app.vault.getFiles().filter((f) => IMG_EXT.includes(f.extension.toLowerCase())); }
  getItemText(f) { return f.path; }
  onChooseItem(f) { this.onChoose(f); }
}

/* ------------------------------------------------------------------ */
/* ```lifelog code block                                               */
/* ------------------------------------------------------------------ */

class LifeLogBlock extends MarkdownRenderChild {
  constructor(el, plugin, src) {
    super(el);
    this.plugin = plugin;
    this.opts = {};
    for (const line of String(src).split("\n")) {
      const m = /^\s*([\w-]+)\s*:\s*([^#]*?)\s*(?:#.*)?$/.exec(line);
      if (m) this.opts[m[1].toLowerCase()] = m[2].toLowerCase();
    }
  }
  onload() { this.unsub = this.plugin.onChange(() => this.draw()); this.draw(); }
  onunload() { if (this.unsub) this.unsub(); }
  draw() {
    const p = this.plugin, o = this.opts, el = this.containerEl;
    el.replaceChildren();
    el.addClass("lifelog", "ll-embed");
    const open = (e) => new DetailModal(p, e.file).open();
    const limit = parseInt(o.limit, 10) || 0;
    const view = o.view || o.window || "timeline";
    try {
      if (view === "timeline") el.append(win("Timeline", null, buildTimeline(p, open, limit)));
      else if (view === "summary") el.append(win("Summary", null, buildSummary(p, (k) => p.activateView(k), open)));
      else if (view === "pets") el.append(win("Pets", null, buildPets(p, open)));
      else if (view === "cards" || view === "category") {
        const cat = o.category || o.cat;
        if (!CATS[cat]) { el.append(h("div", { cls: "ll-empty", text: `Life Log: set category to one of ${CAT_KEYS.join(", ")}.` })); return; }
        let list = p.byCat(cat).sort((a, b) => a.title.localeCompare(b.title));
        if (limit) list = list.slice(0, limit);
        el.append(win(CATS[cat].label, null, buildCards(list, open, null, null)));
      } else el.append(h("div", { cls: "ll-empty", text: "Life Log: view can be timeline, summary, pets or cards." }));
    } catch (err) {
      console.error(err);
      el.append(h("div", { cls: "ll-empty", text: "Life Log: couldn't render this block." }));
    }
  }
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

class LifeLogSettingTab extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    const { containerEl } = this;
    const p = this.plugin, s = p.settings;
    containerEl.empty();
    new Setting(containerEl).setName("Entries folder")
      .setDesc("New entries are created in sub-folders here (People, Pets, Education, Work, Homes, Milestones). Existing notes anywhere in the vault with a lifelog property are always included.")
      .addText((t) => t.setPlaceholder("Life Log").setValue(s.folder).onChange(async (v) => { s.folder = v.trim() || "Life Log"; await p.saveSettings(); }));
    new Setting(containerEl).setName("Images folder")
      .setDesc("Where uploaded photos, covers and banners are saved.")
      .addText((t) => t.setPlaceholder("Life Log/_images").setValue(s.imageFolder).onChange(async (v) => { s.imageFolder = v.trim() || "Life Log/_images"; await p.saveSettings(); }));
    new Setting(containerEl).setName("Name").setDesc("Shown on the Overview banner.")
      .addText((t) => t.setValue(s.name).onChange(async (v) => { s.name = v; await p.saveSettings(); p.notify(); }));
    new Setting(containerEl).setName("Subtitle").setDesc("The line under your name on the Overview banner.")
      .addText((t) => t.setValue(s.subtitle).onChange(async (v) => { s.subtitle = v; await p.saveSettings(); p.notify(); }));

    new Setting(containerEl).setName("Banners").setHeading();
    const tabs = Object.keys(s.banners);
    if (!tabs.length) containerEl.createEl("p", { text: "No banners set yet. Open the dashboard and use the image button on the banner of any tab.", cls: "setting-item-description" });
    for (const t of tabs) {
      const label = (TABS.find((x) => x[0] === t) || [t, t])[1];
      new Setting(containerEl).setName(label).setDesc(s.banners[t])
        .addButton((b) => b.setButtonText("Remove").onClick(async () => { delete s.banners[t]; await p.saveSettings(); p.notify(); this.display(); }));
    }
  }
}

module.exports = LifeLogPlugin;
