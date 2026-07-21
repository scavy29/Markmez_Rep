// Shared storage layer. Data shape:
// { boards: [ { id, name, bookmarks: [ { id, title, url } ] } ] }

function hexToRgba(hex, alpha) {
  const m = hex.replace("#", "");
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const r = parseInt(full.substring(0, 2), 16);
  const g = parseInt(full.substring(2, 4), 16);
  const b = parseInt(full.substring(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return `rgba(109, 106, 247, ${alpha})`;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const Store = {
  // Which storage area holds board data (local vs sync) is itself tracked in
  // local storage, since we need to know where to look *before* we know
  // where the boards live.
  META_KEY: "boardmarksMeta",

  async getMeta() {
    const res = await chrome.storage.local.get(this.META_KEY);
    return res[this.META_KEY] || { syncEnabled: false };
  },

  async setMeta(meta) {
    await chrome.storage.local.set({ [this.META_KEY]: meta });
  },

  async isSyncEnabled() {
    return (await this.getMeta()).syncEnabled;
  },

  async getData() {
    const meta = await this.getMeta();
    const area = meta.syncEnabled ? chrome.storage.sync : chrome.storage.local;
    const res = await area.get("boardmarks");
    if (!res.boardmarks) {
      const initial = { boards: [] };
      await area.set({ boardmarks: initial });
      return initial;
    }
    return res.boardmarks;
  },

  async setData(data) {
    const meta = await this.getMeta();
    const area = meta.syncEnabled ? chrome.storage.sync : chrome.storage.local;
    try {
      await area.set({ boardmarks: data });
    } catch (err) {
      if (meta.syncEnabled) {
        // Sync rejected the write (almost certainly a quota limit). Save
        // locally so the change isn't lost, and drop back to local mode.
        await chrome.storage.local.set({ boardmarks: data });
        await this.setMeta({ syncEnabled: false });
        const quotaErr = new Error(
          "Chrome's sync storage is full (it caps synced data at 100KB total, 8KB per board). " +
            "Your latest change was saved locally instead, and sync has been turned off."
        );
        quotaErr.code = "SYNC_QUOTA_EXCEEDED";
        throw quotaErr;
      }
      throw err;
    }
  },

  // Turns sync on/off. Returns { ok: true } or { ok: false, error }.
  async setSyncEnabled(enabled) {
    const meta = await this.getMeta();
    if (meta.syncEnabled === enabled) return { ok: true };

    if (enabled) {
      const localRes = await chrome.storage.local.get("boardmarks");
      const current = localRes.boardmarks || { boards: [] };
      try {
        await chrome.storage.sync.set({ boardmarks: current });
      } catch (err) {
        return {
          ok: false,
          error:
            "Your current boards are too large for Chrome sync (it caps synced data at 100KB total, 8KB per board). " +
            "Try trimming some bookmarks and try again.",
        };
      }
      await this.setMeta({ syncEnabled: true });
      return { ok: true };
    } else {
      const syncRes = await chrome.storage.sync.get("boardmarks");
      if (syncRes.boardmarks) {
        await chrome.storage.local.set({ boardmarks: syncRes.boardmarks });
      }
      await this.setMeta({ syncEnabled: false });
      return { ok: true };
    }
  },

  // Thumbnails are screenshots (data URLs), which can be large — they always
  // live in local storage only, never in sync, so they can't blow the tiny
  // Chrome sync quota. Keyed by bookmark id.
  THUMB_KEY: "boardmarksThumbnails",

  async getThumbnails() {
    const res = await chrome.storage.local.get(this.THUMB_KEY);
    return res[this.THUMB_KEY] || {};
  },

  async setThumbnail(bookmarkId, dataUrl) {
    const thumbs = await this.getThumbnails();
    thumbs[bookmarkId] = dataUrl;
    await chrome.storage.local.set({ [this.THUMB_KEY]: thumbs });
  },

  async deleteThumbnail(bookmarkId) {
    const thumbs = await this.getThumbnails();
    if (bookmarkId in thumbs) {
      delete thumbs[bookmarkId];
      await chrome.storage.local.set({ [this.THUMB_KEY]: thumbs });
    }
  },

  async deleteThumbnails(bookmarkIds) {
    const thumbs = await this.getThumbnails();
    let changed = false;
    for (const id of bookmarkIds) {
      if (id in thumbs) {
        delete thumbs[id];
        changed = true;
      }
    }
    if (changed) await chrome.storage.local.set({ [this.THUMB_KEY]: thumbs });
  },

  DEFAULT_SETTINGS: {
    accent: "#6d6af7",
    wallpaper: { type: "none", value: "" }, // type: none | color | gradient | image
  },

  async getSettings() {
    const res = await chrome.storage.local.get("boardmarksSettings");
    if (!res.boardmarksSettings) {
      await chrome.storage.local.set({ boardmarksSettings: this.DEFAULT_SETTINGS });
      return { ...this.DEFAULT_SETTINGS };
    }
    return { ...this.DEFAULT_SETTINGS, ...res.boardmarksSettings };
  },

  async setSettings(settings) {
    await chrome.storage.local.set({ boardmarksSettings: settings });
  },

  applyTheme(settings) {
    document.documentElement.style.setProperty("--accent", settings.accent);
    // Derive a soft translucent tint of the accent for hover/active states
    document.documentElement.style.setProperty("--accent-soft", hexToRgba(settings.accent, 0.15));

    const body = document.body;
    if (!body) return;
    const wp = settings.wallpaper || { type: "none" };
    if (wp.type === "none" || !wp.value) {
      body.style.backgroundImage = "";
      body.style.backgroundColor = "";
      body.classList.remove("has-wallpaper");
    } else if (wp.type === "color") {
      body.style.backgroundImage = "";
      body.style.backgroundColor = wp.value;
      body.classList.add("has-wallpaper");
    } else if (wp.type === "gradient") {
      body.style.backgroundColor = "";
      body.style.backgroundImage = wp.value;
      body.classList.add("has-wallpaper");
    } else if (wp.type === "image") {
      body.style.backgroundColor = "";
      body.style.backgroundImage = `url("${wp.value}")`;
      body.classList.add("has-wallpaper");
    }
  },

  async exportAll() {
    const data = await this.getData();
    const settings = await this.getSettings();
    const thumbnails = await this.getThumbnails();
    return {
      app: "boardmarks",
      version: 1,
      exportedAt: new Date().toISOString(),
      boards: data.boards,
      settings,
      thumbnails,
    };
  },

  // mode: 'merge' appends imported boards (with fresh ids) alongside existing ones.
  // mode: 'replace' wipes current boards (and settings, if present in the file) and uses the import as-is.
  async importAll(parsed, mode) {
    if (!parsed || !Array.isArray(parsed.boards)) {
      throw new Error("This doesn't look like a Boardmarks backup file.");
    }
    const data = await this.getData();
    const idMap = {}; // old bookmark id -> new bookmark id (only used when ids are regenerated)

    const sanitizeBoard = (b, keepIds) => ({
      id: keepIds && b.id ? b.id : this.uid(),
      name: typeof b.name === "string" && b.name.trim() ? b.name : "Untitled",
      bookmarks: Array.isArray(b.bookmarks)
        ? b.bookmarks
            .filter((bm) => bm && typeof bm.url === "string")
            .map((bm) => {
              const newId = keepIds && bm.id ? bm.id : this.uid();
              if (bm.id && newId !== bm.id) idMap[bm.id] = newId;
              return {
                id: newId,
                title: typeof bm.title === "string" && bm.title.trim() ? bm.title : bm.url,
                url: bm.url,
              };
            })
        : [],
    });

    const importedThumbs = parsed.thumbnails && typeof parsed.thumbnails === "object" ? parsed.thumbnails : {};

    if (mode === "replace") {
      data.boards = parsed.boards.map((b) => sanitizeBoard(b, true));
      await this.setData(data);
      if (parsed.settings) {
        await this.setSettings({ ...this.DEFAULT_SETTINGS, ...parsed.settings });
      }
      // Replace wipes existing boards entirely, so drop any thumbnails that
      // no longer correspond to a bookmark rather than leaving orphans.
      const validIds = new Set(data.boards.flatMap((b) => b.bookmarks.map((bm) => bm.id)));
      const nextThumbs = {};
      for (const [id, url] of Object.entries(importedThumbs)) {
        if (validIds.has(id)) nextThumbs[id] = url;
      }
      await chrome.storage.local.set({ [this.THUMB_KEY]: nextThumbs });
    } else {
      const imported = parsed.boards.map((b) => sanitizeBoard(b, false));
      data.boards = data.boards.concat(imported);
      await this.setData(data);
      // Carry thumbnails over under their newly-generated bookmark ids.
      const existingThumbs = await this.getThumbnails();
      for (const [oldId, url] of Object.entries(importedThumbs)) {
        const newId = idMap[oldId];
        if (newId) existingThumbs[newId] = url;
      }
      await chrome.storage.local.set({ [this.THUMB_KEY]: existingThumbs });
    }
  },

  uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  },

  async addBoard(name) {
    const data = await this.getData();
    const board = { id: this.uid(), name: name || "New Board", bookmarks: [] };
    data.boards.push(board);
    await this.setData(data);
    return board;
  },

  async renameBoard(boardId, name) {
    const data = await this.getData();
    const b = data.boards.find((x) => x.id === boardId);
    if (b) b.name = name;
    await this.setData(data);
  },

  async reorderBoards(draggedId, targetId) {
    const data = await this.getData();
    const fromIndex = data.boards.findIndex((x) => x.id === draggedId);
    if (fromIndex === -1) return;
    const [moved] = data.boards.splice(fromIndex, 1);
    let toIndex = targetId ? data.boards.findIndex((x) => x.id === targetId) : data.boards.length;
    if (toIndex === -1) toIndex = data.boards.length;
    data.boards.splice(toIndex, 0, moved);
    await this.setData(data);
  },

  async deleteBoard(boardId) {
    const data = await this.getData();
    const board = data.boards.find((x) => x.id === boardId);
    data.boards = data.boards.filter((x) => x.id !== boardId);
    await this.setData(data);
    if (board) await this.deleteThumbnails(board.bookmarks.map((bm) => bm.id));
  },

  async addBookmark(boardId, { title, url }) {
    const data = await this.getData();
    const b = data.boards.find((x) => x.id === boardId);
    if (!b) return null;
    const bookmark = { id: this.uid(), title: title || url, url };
    b.bookmarks.push(bookmark);
    await this.setData(data);
    return bookmark;
  },

  async moveBookmarkToPosition(fromBoardId, toBoardId, bookmarkId, toIndex) {
    const data = await this.getData();
    const from = data.boards.find((x) => x.id === fromBoardId);
    const to = data.boards.find((x) => x.id === toBoardId);
    if (!from || !to) return;
    const idx = from.bookmarks.findIndex((x) => x.id === bookmarkId);
    if (idx === -1) return;
    const [bm] = from.bookmarks.splice(idx, 1);
    let insertIndex = toIndex;
    if (from === to && idx < insertIndex) insertIndex -= 1; // account for the shift caused by removal
    if (insertIndex < 0) insertIndex = 0;
    if (insertIndex > to.bookmarks.length) insertIndex = to.bookmarks.length;
    to.bookmarks.splice(insertIndex, 0, bm);
    await this.setData(data);
  },

  async removeBookmark(boardId, bookmarkId) {
    const data = await this.getData();
    const b = data.boards.find((x) => x.id === boardId);
    if (!b) return;
    b.bookmarks = b.bookmarks.filter((x) => x.id !== bookmarkId);
    await this.setData(data);
    await this.deleteThumbnail(bookmarkId);
  },

  async moveBookmark(fromBoardId, toBoardId, bookmarkId) {
    if (fromBoardId === toBoardId) return;
    const data = await this.getData();
    const from = data.boards.find((x) => x.id === fromBoardId);
    const to = data.boards.find((x) => x.id === toBoardId);
    if (!from || !to) return;
    const idx = from.bookmarks.findIndex((x) => x.id === bookmarkId);
    if (idx === -1) return;
    const [bm] = from.bookmarks.splice(idx, 1);
    to.bookmarks.push(bm);
    await this.setData(data);
  },

  faviconFor(url) {
    try {
      const u = new URL(url);
      return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=32`;
    } catch {
      return "";
    }
  },

  // Flatten a chrome.bookmarks tree node into folders containing links only
  flattenBookmarkFolders(nodes, path = "") {
    let folders = [];
    for (const node of nodes) {
      if (node.children) {
        const links = node.children.filter((c) => c.url);
        const label = path ? `${path} / ${node.title}` : node.title;
        if (links.length) {
          folders.push({
            title: label || "Bookmarks",
            links: links.map((l) => ({ title: l.title, url: l.url })),
          });
        }
        folders = folders.concat(this.flattenBookmarkFolders(node.children, label));
      }
    }
    return folders;
  },
};
