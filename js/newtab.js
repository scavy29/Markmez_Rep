let currentData = { boards: [] };
let currentThumbnails = {};
let currentSpaces = [];
let activeSpaceId = null;
let searchTerm = "";
let dragBookmark = null; // { boardId, bookmarkId }
let dragBoardId = null; // id of the board currently being dragged for reordering

const boardsEl = document.getElementById("boards");
const emptyStateEl = document.getElementById("emptyState");
const searchEl = document.getElementById("search");
const spaceSelectEl = document.getElementById("spaceSelect");

let currentSettings = null;

async function refresh() {
  const data = await Store.getData();
  activeSpaceId = data.activeSpaceId;
  currentSpaces = data.spaces;
  const activeSpace = Store.getActiveSpace(data);
  currentData = { boards: activeSpace.boards };
  currentThumbnails = await Store.getThumbnails();
  renderSpaceSelect();
  render();
}

function renderSpaceSelect() {
  spaceSelectEl.innerHTML = "";
  for (const s of currentSpaces) {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = `${s.name} (${s.boards.length})`;
    if (s.id === activeSpaceId) opt.selected = true;
    spaceSelectEl.appendChild(opt);
  }
}

spaceSelectEl.addEventListener("change", async () => {
  await Store.setActiveSpace(spaceSelectEl.value);
  refresh();
});

document.getElementById("addSpaceBtn").addEventListener("click", async () => {
  const name = prompt("Space name:", "New Space");
  if (name === null) return;
  await Store.addSpace(name.trim() || "New Space");
  refresh();
});

document.getElementById("renameSpaceBtn").addEventListener("click", async () => {
  const current = currentSpaces.find((s) => s.id === activeSpaceId);
  const name = prompt("Rename space:", current ? current.name : "");
  if (name === null) return;
  await Store.renameSpace(activeSpaceId, name.trim() || "Untitled space");
  refresh();
});

document.getElementById("deleteSpaceBtn").addEventListener("click", async () => {
  const current = currentSpaces.find((s) => s.id === activeSpaceId);
  if (!current) return;
  if (currentSpaces.length <= 1) {
    alert("You need at least one space — create another before deleting this one.");
    return;
  }
  const bmCount = current.boards.reduce((n, b) => n + b.bookmarks.length, 0);
  if (
    !confirm(
      `Delete space "${current.name}"? This removes ${current.boards.length} board(s) and ${bmCount} bookmark(s). This can't be undone.`
    )
  ) {
    return;
  }
  await Store.deleteSpace(activeSpaceId);
  refresh();
});

async function loadTheme() {
  currentSettings = await Store.getSettings();
  Store.applyTheme(currentSettings);
}

function matchesSearch(bm) {
  if (!searchTerm) return true;
  const t = searchTerm.toLowerCase();
  return bm.title.toLowerCase().includes(t) || bm.url.toLowerCase().includes(t);
}

let animatedBoardIds = new Set();
let lastAnimatedSpaceId = null;

function render() {
  boardsEl.innerHTML = "";
  const boards = currentData.boards;
  emptyStateEl.classList.toggle("hidden", boards.length > 0);

  if (activeSpaceId !== lastAnimatedSpaceId) {
    animatedBoardIds = new Set();
    lastAnimatedSpaceId = activeSpaceId;
  }
  let renderIndex = 0;

  for (const board of boards) {
    const visibleBookmarks = board.bookmarks.filter(matchesSearch);
    if (searchTerm && visibleBookmarks.length === 0) continue;

    const boardEl = document.createElement("div");
    boardEl.className = "board";
    boardEl.dataset.boardId = board.id;

    if (!animatedBoardIds.has(board.id)) {
      boardEl.classList.add("board-enter");
      boardEl.style.animationDelay = `${renderIndex * 40}ms`;
      animatedBoardIds.add(board.id);
    }
    renderIndex += 1;

    boardEl.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (dragBoardId && dragBoardId !== board.id) {
        boardEl.classList.add("drag-over-board");
      } else if (dragBookmark) {
        boardEl.classList.add("drag-over");
      }
    });
    boardEl.addEventListener("dragleave", () => {
      boardEl.classList.remove("drag-over", "drag-over-board");
    });
    boardEl.addEventListener("drop", async (e) => {
      e.preventDefault();
      boardEl.classList.remove("drag-over", "drag-over-board");
      if (dragBoardId && dragBoardId !== board.id) {
        const draggedId = dragBoardId;
        dragBoardId = null;
        await Store.reorderBoards(draggedId, board.id);
        refresh();
      } else if (dragBookmark) {
        await Store.moveBookmark(dragBookmark.boardId, board.id, dragBookmark.bookmarkId);
        dragBookmark = null;
        refresh();
      }
    });

    const head = document.createElement("div");
    head.className = "board-head";

    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "board-chip";
    chip.title = "Board icon & color";
    chip.style.background = board.color || "var(--bg-elev-2)";
    chip.textContent = board.icon || (board.name.trim().charAt(0).toUpperCase() || "#");
    chip.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openBoardAppearance(board);
    });
    head.appendChild(chip);

    const dragHandle = document.createElement("span");
    dragHandle.className = "board-drag-handle";
    dragHandle.title = "Drag to reorder";
    dragHandle.innerHTML = "⠿";
    dragHandle.draggable = true;
    dragHandle.addEventListener("dragstart", (e) => {
      dragBoardId = board.id;
      dragBookmark = null;
      e.stopPropagation();
      boardEl.classList.add("dragging");
    });
    dragHandle.addEventListener("dragend", () => {
      boardEl.classList.remove("dragging");
      dragBoardId = null;
    });
    head.appendChild(dragHandle);

    const titleInput = document.createElement("input");
    titleInput.className = "board-title";
    titleInput.value = board.name;
    titleInput.addEventListener("change", async () => {
      await Store.renameBoard(board.id, titleInput.value.trim() || "Untitled");
    });

    const menuBtn = document.createElement("button");
    menuBtn.className = "board-menu-btn";
    menuBtn.innerHTML = "✕";
    menuBtn.title = "Delete board";
    menuBtn.addEventListener("click", async () => {
      if (confirm(`Delete board "${board.name}"? This removes its saved bookmarks.`)) {
        await Store.deleteBoard(board.id);
        refresh();
      }
    });

    head.appendChild(titleInput);
    head.appendChild(menuBtn);
    boardEl.appendChild(head);

    const list = document.createElement("div");
    list.className = "bm-list";

    for (const bm of visibleBookmarks) {
      const row = document.createElement("a");
      row.className = "bm-row";
      row.href = bm.url;
      row.draggable = true;
      row.addEventListener("dragstart", () => {
        dragBookmark = { boardId: board.id, bookmarkId: bm.id };
      });
      row.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!dragBookmark || dragBookmark.bookmarkId === bm.id) return;
        const rect = row.getBoundingClientRect();
        const before = e.clientY - rect.top < rect.height / 2;
        row.classList.toggle("drop-above", before);
        row.classList.toggle("drop-below", !before);
      });
      row.addEventListener("dragleave", () => {
        row.classList.remove("drop-above", "drop-below");
      });
      row.addEventListener("drop", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const before = row.classList.contains("drop-above");
        row.classList.remove("drop-above", "drop-below");
        if (!dragBookmark || dragBookmark.bookmarkId === bm.id) return;
        const targetIdx = board.bookmarks.findIndex((x) => x.id === bm.id);
        const insertIndex = targetIdx === -1 ? board.bookmarks.length : before ? targetIdx : targetIdx + 1;
        const { boardId: fromBoardId, bookmarkId } = dragBookmark;
        dragBookmark = null;
        await Store.moveBookmarkToPosition(fromBoardId, board.id, bookmarkId, insertIndex);
        refresh();
      });
      row.addEventListener("dragend", () => {
        row.classList.remove("drop-above", "drop-below");
      });

      const thumb = document.createElement("div");
      thumb.className = "bm-thumb";
      const shot = currentThumbnails[bm.id];
      const icon = document.createElement("img");
      if (shot) {
        icon.className = "bm-thumb-shot";
        icon.src = shot;
      } else {
        icon.className = "bm-thumb-favicon";
        icon.src = Store.faviconFor(bm.url);
      }
      icon.alt = "";
      thumb.appendChild(icon);

      const label = document.createElement("span");
      label.textContent = bm.title;

      const removeBtn = document.createElement("button");
      removeBtn.className = "bm-remove";
      removeBtn.innerHTML = "✕";
      removeBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await Store.removeBookmark(board.id, bm.id);
        refresh();
      });

      row.appendChild(thumb);
      row.appendChild(label);
      row.appendChild(removeBtn);
      list.appendChild(row);
    }
    boardEl.appendChild(list);

    // Quick-add row
    const addRow = document.createElement("div");
    addRow.className = "board-add-row";
    const urlInput = document.createElement("input");
    urlInput.placeholder = "Paste a URL and press Enter";
    addRow.appendChild(urlInput);
    urlInput.addEventListener("keydown", async (e) => {
      if (e.key === "Enter" && urlInput.value.trim()) {
        let url = urlInput.value.trim();
        if (!/^https?:\/\//i.test(url)) url = "https://" + url;
        let title = url;
        try {
          title = new URL(url).hostname.replace(/^www\./, "");
        } catch {}
        await Store.addBookmark(board.id, { title, url });
        urlInput.value = "";
        refresh();
      }
    });
    boardEl.appendChild(addRow);

    boardsEl.appendChild(boardEl);
  }
}

boardsEl.addEventListener("dragover", (e) => {
  if (dragBoardId && e.target === boardsEl) e.preventDefault();
});
boardsEl.addEventListener("drop", async (e) => {
  if (dragBoardId && e.target === boardsEl) {
    e.preventDefault();
    const draggedId = dragBoardId;
    dragBoardId = null;
    await Store.reorderBoards(draggedId, null);
    refresh();
  }
});

document.getElementById("addBoardBtn").addEventListener("click", async () => {
  const name = prompt("Board name:", "New Board");
  if (name === null) return;
  await Store.addBoard(name.trim() || "New Board");
  refresh();
});

searchEl.addEventListener("input", () => {
  searchTerm = searchEl.value.trim();
  render();
});

// ---------- Import from Chrome bookmarks ----------
const importOverlay = document.getElementById("importOverlay");
const importList = document.getElementById("importList");

document.getElementById("importBtn").addEventListener("click", async () => {
  const tree = await chrome.bookmarks.getTree();
  const folders = Store.flattenBookmarkFolders(tree);
  importList.innerHTML = "";

  if (folders.length === 0) {
    importList.innerHTML = `<div class="empty-state">No Chrome bookmark folders found.</div>`;
  }

  for (const folder of folders) {
    const item = document.createElement("div");
    item.className = "import-item";
    item.innerHTML = `<span>${escapeHtml(folder.title)}</span><small>${folder.links.length} links</small>`;
    item.style.cursor = "pointer";
    item.addEventListener("click", async () => {
      const board = await Store.addBoard(folder.title);
      const data = await Store.getData();
      const space = Store.getActiveSpace(data);
      const b = space.boards.find((x) => x.id === board.id);
      b.bookmarks = folder.links.map((l) => ({ id: Store.uid(), title: l.title, url: l.url }));
      await Store.setData(data);
      importOverlay.classList.add("hidden");
      refresh();
    });
    importList.appendChild(item);
  }

  importOverlay.classList.remove("hidden");
});

document.getElementById("importCancel").addEventListener("click", () => {
  importOverlay.classList.add("hidden");
});

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Theme & wallpaper settings ----------
const ACCENT_PRESETS = ["#6d6af7", "#3b82f6", "#22c55e", "#ec4899", "#f97316", "#ef4444", "#14b8a6", "#eab308"];
const WALLPAPER_PRESETS = [
  { type: "gradient", value: "linear-gradient(135deg,#1f2937,#111827)", label: "Mono" },
  { type: "gradient", value: "linear-gradient(135deg,#312e81,#7c3aed)", label: "Dusk" },
  { type: "gradient", value: "linear-gradient(135deg,#0ea5e9,#6366f1)", label: "Ocean" },
  { type: "gradient", value: "linear-gradient(135deg,#065f46,#10b981)", label: "Forest" },
  { type: "gradient", value: "linear-gradient(135deg,#f97316,#db2777)", label: "Sunset" },
  { type: "color", value: "#0b0c12", label: "Black" },
];

const settingsOverlay = document.getElementById("settingsOverlay");
const accentSwatchesEl = document.getElementById("accentSwatches");
const wallpaperSwatchesEl = document.getElementById("wallpaperSwatches");
const accentCustomEl = document.getElementById("accentCustom");
const syncToggleEl = document.getElementById("syncToggle");
const grainToggleEl = document.getElementById("grainToggle");

function renderSettingsModal() {
  Store.isSyncEnabled().then((enabled) => {
    syncToggleEl.checked = enabled;
  });
  grainToggleEl.checked = currentSettings.grain !== false;

  accentSwatchesEl.innerHTML = "";
  for (const color of ACCENT_PRESETS) {
    const sw = document.createElement("div");
    sw.className = "swatch" + (currentSettings.accent === color ? " selected" : "");
    sw.style.background = color;
    sw.addEventListener("click", async () => {
      currentSettings.accent = color;
      await Store.setSettings(currentSettings);
      Store.applyTheme(currentSettings);
      renderSettingsModal();
    });
    accentSwatchesEl.appendChild(sw);
  }
  accentCustomEl.value = currentSettings.accent;

  wallpaperSwatchesEl.innerHTML = "";
  const noneSw = document.createElement("div");
  noneSw.className = "swatch wallpaper-none" + (currentSettings.wallpaper.type === "none" ? " selected" : "");
  noneSw.textContent = "None";
  noneSw.addEventListener("click", () => applyWallpaper({ type: "none", value: "" }));
  wallpaperSwatchesEl.appendChild(noneSw);

  const liveSw = document.createElement("div");
  liveSw.className = "swatch swatch-live" + (currentSettings.wallpaper.type === "live" ? " selected" : "");
  liveSw.textContent = "Live";
  liveSw.title = "Animated gradient tied to your accent color";
  liveSw.addEventListener("click", () => applyWallpaper({ type: "live", value: "live" }));
  wallpaperSwatchesEl.appendChild(liveSw);

  for (const preset of WALLPAPER_PRESETS) {
    const sw = document.createElement("div");
    const isSelected = currentSettings.wallpaper.type === preset.type && currentSettings.wallpaper.value === preset.value;
    sw.className = "swatch" + (isSelected ? " selected" : "");
    sw.style.background = preset.value;
    sw.title = preset.label;
    sw.addEventListener("click", () => applyWallpaper({ type: preset.type, value: preset.value }));
    wallpaperSwatchesEl.appendChild(sw);
  }

  // If current wallpaper is a custom uploaded image, show it as a selected thumbnail swatch
  if (currentSettings.wallpaper.type === "image") {
    const sw = document.createElement("div");
    sw.className = "swatch selected";
    sw.style.backgroundImage = `url("${currentSettings.wallpaper.value}")`;
    sw.style.backgroundSize = "cover";
    sw.style.backgroundPosition = "center";
    sw.title = "Your uploaded image";
    wallpaperSwatchesEl.appendChild(sw);
  }
}

async function applyWallpaper(wallpaper) {
  currentSettings.wallpaper = wallpaper;
  await Store.setSettings(currentSettings);
  Store.applyTheme(currentSettings);
  renderSettingsModal();
}

accentCustomEl.addEventListener("input", async () => {
  currentSettings.accent = accentCustomEl.value;
  await Store.setSettings(currentSettings);
  Store.applyTheme(currentSettings);
  renderSettingsModal();
});

syncToggleEl.addEventListener("change", async () => {
  const wantEnabled = syncToggleEl.checked;
  syncToggleEl.disabled = true;
  const result = await Store.setSyncEnabled(wantEnabled);
  syncToggleEl.disabled = false;
  if (!result.ok) {
    syncToggleEl.checked = !wantEnabled;
    alert(result.error);
    return;
  }
  await refresh();
});

grainToggleEl.addEventListener("change", async () => {
  currentSettings.grain = grainToggleEl.checked;
  await Store.setSettings(currentSettings);
  Store.applyTheme(currentSettings);
});

document.getElementById("settingsBtn").addEventListener("click", () => {
  renderSettingsModal();
  settingsOverlay.classList.remove("hidden");
});
document.getElementById("settingsDone").addEventListener("click", () => {
  settingsOverlay.classList.add("hidden");
});

document.getElementById("uploadWallpaperBtn").addEventListener("click", () => {
  document.getElementById("wallpaperFile").click();
});
document.getElementById("wallpaperFile").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 4 * 1024 * 1024) {
    alert("Please choose an image under 4MB.");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => applyWallpaper({ type: "image", value: reader.result });
  reader.readAsDataURL(file);
  e.target.value = "";
});
document.getElementById("clearWallpaperBtn").addEventListener("click", () => {
  applyWallpaper({ type: "none", value: "" });
});

// ---------- Export / restore JSON backup ----------
document.getElementById("exportBtn").addEventListener("click", async () => {
  const payload = await Store.exportAll();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0, 10);
  const a = document.createElement("a");
  a.href = url;
  a.download = `boardmarks-backup-${date}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

const importJsonOverlay = document.getElementById("importJsonOverlay");
const importJsonSummary = document.getElementById("importJsonSummary");
let pendingImport = null;

document.getElementById("importJsonBtn").addEventListener("click", () => {
  document.getElementById("importJsonFile").click();
});

document.getElementById("importJsonFile").addEventListener("change", (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let parsed;
    try {
      parsed = JSON.parse(reader.result);
    } catch {
      alert("That file isn't valid JSON.");
      return;
    }
    if (!parsed || (!Array.isArray(parsed.boards) && !Array.isArray(parsed.spaces))) {
      alert("This doesn't look like a Boardmarks backup file.");
      return;
    }
    pendingImport = parsed;
    const allBoards = Array.isArray(parsed.spaces) ? parsed.spaces.flatMap((s) => s.boards || []) : parsed.boards;
    const spaceCount = Array.isArray(parsed.spaces) ? parsed.spaces.length : 1;
    const boardCount = allBoards.length;
    const bmCount = allBoards.reduce((n, b) => n + (Array.isArray(b.bookmarks) ? b.bookmarks.length : 0), 0);
    const spacePart = Array.isArray(parsed.spaces) ? `${spaceCount} space${spaceCount === 1 ? "" : "s"} with ` : "";
    importJsonSummary.textContent = `Found ${spacePart}${boardCount} board${boardCount === 1 ? "" : "s"} and ${bmCount} bookmark${bmCount === 1 ? "" : "s"} in this file. How would you like to restore it?`;
    importJsonOverlay.classList.remove("hidden");
  };
  reader.readAsText(file);
});

document.getElementById("importJsonMerge").addEventListener("click", async () => {
  if (!pendingImport) return;
  await Store.importAll(pendingImport, "merge");
  pendingImport = null;
  importJsonOverlay.classList.add("hidden");
  refresh();
});

document.getElementById("importJsonReplace").addEventListener("click", async () => {
  if (!pendingImport) return;
  if (!confirm("This will delete all current boards and replace them with the backup. Continue?")) return;
  await Store.importAll(pendingImport, "replace");
  pendingImport = null;
  importJsonOverlay.classList.add("hidden");
  loadTheme();
  refresh();
});

document.getElementById("importJsonCancel").addEventListener("click", () => {
  pendingImport = null;
  importJsonOverlay.classList.add("hidden");
});

// Keep this tab live: if boards change from another tab, another device
// (via Chrome sync), or the sync/local switch itself, reload the view.
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (!changes.boardmarks) return;
  Store.getMeta().then((meta) => {
    const activeArea = meta.syncEnabled ? "sync" : "local";
    if (areaName === activeArea) refresh();
  });
});

// A sync write can fail if it exceeds Chrome's sync quota. Store.setData
// already saves the change locally as a fallback and turns sync off — this
// just lets the person know what happened instead of failing silently.
window.addEventListener("unhandledrejection", (e) => {
  if (e.reason && e.reason.code === "SYNC_QUOTA_EXCEEDED") {
    e.preventDefault();
    alert(e.reason.message);
    if (!settingsOverlay.classList.contains("hidden")) renderSettingsModal();
    refresh();
  }
});

// ---------- Board icon & color ----------
const BOARD_ICON_PRESETS = ["📁", "💼", "📚", "🎮", "🎨", "✈️", "🍔", "💡", "⭐", "❤️", "🛠️", "🎵", "🏠", "💻", "📷", "🌱"];
const BOARD_COLOR_PRESETS = ["#6d6af7", "#3b82f6", "#22c55e", "#ec4899", "#f97316", "#ef4444", "#14b8a6", "#eab308"];

const boardAppearanceOverlay = document.getElementById("boardAppearanceOverlay");
const boardIconPresetsEl = document.getElementById("boardIconPresets");
const boardColorPresetsEl = document.getElementById("boardColorPresets");
const boardIconCustomEl = document.getElementById("boardIconCustom");
let editingBoardId = null;
let editingAppearance = { icon: "", color: "" };

function openBoardAppearance(board) {
  editingBoardId = board.id;
  editingAppearance = { icon: board.icon || "", color: board.color || "" };
  renderBoardAppearanceModal();
  boardAppearanceOverlay.classList.remove("hidden");
}

function renderBoardAppearanceModal() {
  boardIconPresetsEl.innerHTML = "";

  const noneIcon = document.createElement("div");
  noneIcon.className = "swatch emoji wallpaper-none" + (!editingAppearance.icon ? " selected" : "");
  noneIcon.textContent = "Aa";
  noneIcon.title = "Use first letter";
  noneIcon.addEventListener("click", () => updateAppearance({ icon: "" }));
  boardIconPresetsEl.appendChild(noneIcon);

  for (const emoji of BOARD_ICON_PRESETS) {
    const sw = document.createElement("div");
    sw.className = "swatch emoji" + (editingAppearance.icon === emoji ? " selected" : "");
    sw.textContent = emoji;
    sw.addEventListener("click", () => updateAppearance({ icon: emoji }));
    boardIconPresetsEl.appendChild(sw);
  }
  boardIconCustomEl.value =
    editingAppearance.icon && !BOARD_ICON_PRESETS.includes(editingAppearance.icon) ? editingAppearance.icon : "";

  boardColorPresetsEl.innerHTML = "";
  const noneColor = document.createElement("div");
  noneColor.className = "swatch wallpaper-none" + (!editingAppearance.color ? " selected" : "");
  noneColor.textContent = "None";
  noneColor.addEventListener("click", () => updateAppearance({ color: "" }));
  boardColorPresetsEl.appendChild(noneColor);

  for (const color of BOARD_COLOR_PRESETS) {
    const sw = document.createElement("div");
    sw.className = "swatch" + (editingAppearance.color === color ? " selected" : "");
    sw.style.background = color;
    sw.addEventListener("click", () => updateAppearance({ color }));
    boardColorPresetsEl.appendChild(sw);
  }
}

async function updateAppearance(partial) {
  Object.assign(editingAppearance, partial);
  await Store.setBoardAppearance(editingBoardId, partial);
  renderBoardAppearanceModal();
  refresh();
}

boardIconCustomEl.addEventListener("input", async () => {
  editingAppearance.icon = boardIconCustomEl.value;
  await Store.setBoardAppearance(editingBoardId, { icon: boardIconCustomEl.value });
  refresh();
});

document.getElementById("boardAppearanceDone").addEventListener("click", () => {
  boardAppearanceOverlay.classList.add("hidden");
  editingBoardId = null;
});

// ---------- Command palette (Ctrl/Cmd+K) ----------
const paletteOverlay = document.getElementById("paletteOverlay");
const paletteInputEl = document.getElementById("paletteInput");
const paletteResultsEl = document.getElementById("paletteResults");
let paletteMatches = [];
let paletteIndex = [];
let paletteActiveIdx = 0;

function buildPaletteIndex(spaces) {
  const items = [];
  for (const space of spaces) {
    items.push({ type: "space", label: space.name, sub: `Space · ${space.boards.length} boards`, spaceId: space.id, icon: "🗂️" });
    for (const board of space.boards) {
      items.push({
        type: "board",
        label: board.name,
        sub: `Board in ${space.name}`,
        spaceId: space.id,
        boardId: board.id,
        icon: board.icon || "📋",
      });
      for (const bm of board.bookmarks) {
        let host = bm.url;
        try {
          host = new URL(bm.url).hostname.replace(/^www\./, "");
        } catch {
          /* keep raw url as fallback label */
        }
        items.push({
          type: "bookmark",
          label: bm.title,
          sub: host,
          spaceId: space.id,
          boardId: board.id,
          url: bm.url,
          icon: "🔗",
        });
      }
    }
  }
  return items;
}

async function openPalette() {
  const data = await Store.getData();
  paletteIndex = buildPaletteIndex(data.spaces);
  paletteInputEl.value = "";
  renderPaletteResults("");
  paletteOverlay.classList.remove("hidden");
  requestAnimationFrame(() => paletteInputEl.focus());
}

function closePalette() {
  paletteOverlay.classList.add("hidden");
}

function renderPaletteResults(query) {
  const q = query.trim().toLowerCase();
  paletteMatches = !q
    ? paletteIndex.slice(0, 40)
    : paletteIndex.filter((it) => it.label.toLowerCase().includes(q) || (it.sub || "").toLowerCase().includes(q)).slice(0, 40);
  paletteActiveIdx = 0;
  paletteResultsEl.innerHTML = "";

  if (paletteMatches.length === 0) {
    paletteResultsEl.innerHTML = `<div class="palette-empty">No matches</div>`;
    return;
  }

  paletteMatches.forEach((item, i) => {
    const row = document.createElement("div");
    row.className = "palette-item" + (i === 0 ? " active" : "");
    const iconSpan = document.createElement("span");
    iconSpan.className = "p-icon";
    iconSpan.textContent = item.icon;
    const mainSpan = document.createElement("span");
    mainSpan.className = "p-main";
    mainSpan.textContent = item.label;
    const subSpan = document.createElement("span");
    subSpan.className = "p-sub";
    subSpan.textContent = item.sub || "";
    row.appendChild(iconSpan);
    row.appendChild(mainSpan);
    row.appendChild(subSpan);
    row.addEventListener("click", () => activatePaletteItem(item));
    paletteResultsEl.appendChild(row);
  });
}

function updatePaletteActive() {
  const items = Array.from(paletteResultsEl.querySelectorAll(".palette-item"));
  items.forEach((el, i) => el.classList.toggle("active", i === paletteActiveIdx));
  if (items[paletteActiveIdx]) items[paletteActiveIdx].scrollIntoView({ block: "nearest" });
}

async function activatePaletteItem(item) {
  if (item.type === "space") {
    await Store.setActiveSpace(item.spaceId);
    closePalette();
    refresh();
  } else if (item.type === "board") {
    if (item.spaceId !== activeSpaceId) await Store.setActiveSpace(item.spaceId);
    closePalette();
    await refresh();
    highlightBoard(item.boardId);
  } else if (item.type === "bookmark") {
    window.open(item.url, "_blank");
    closePalette();
  }
}

function highlightBoard(boardId) {
  const el = boardsEl.querySelector(`[data-board-id="${boardId}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("board-highlight");
  setTimeout(() => el.classList.remove("board-highlight"), 1600);
}

paletteInputEl.addEventListener("input", (e) => renderPaletteResults(e.target.value));
paletteInputEl.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    paletteActiveIdx = Math.min(paletteActiveIdx + 1, paletteMatches.length - 1);
    updatePaletteActive();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    paletteActiveIdx = Math.max(paletteActiveIdx - 1, 0);
    updatePaletteActive();
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (paletteMatches[paletteActiveIdx]) activatePaletteItem(paletteMatches[paletteActiveIdx]);
  } else if (e.key === "Escape") {
    closePalette();
  }
});

paletteOverlay.addEventListener("click", (e) => {
  if (e.target === paletteOverlay) closePalette();
});

window.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();
  if ((e.metaKey || e.ctrlKey) && key === "k") {
    e.preventDefault();
    openPalette();
  }
});

loadTheme();
refresh();
