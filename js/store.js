// Shared storage layer. Data shape:
// {
//   spaces: [ { id, name, boards: [ { id, name, icon, color, bookmarks: [ { id, title, url } ] } ] } ],
//   activeSpaceId
// }
// Older installs may have the legacy flat shape { boards: [...] } — getData()
// migrates that into a single "My Boards" space the first time it's read.

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
    let data = res.boardmarks;

    if (!data) {
      const space = { id: this.uid(), name: "My Boards", boards: [] };
      data = { spaces: [space], activeSpaceId: space.id };
      await area.set({ boardmarks: data });
      return data;
    }

    // Migrate legacy flat-boards shape into a single default space.
    if (!Array.isArray(data.spaces)) {
      const legacyBoards = Array.isArray(data.boards) ? data.boards : [];
      const space = { id: this.uid(), name: "My Boards", boards: legacyBoards };
      data = { spaces: [space], activeSpaceId: space.id };
      await area.set({ boardmarks: data });
      return data;
    }

    if (data.spaces.length === 0) {
      const space = { id: this.uid(), name: "My Boards", boards: [] };
      data.spaces = [space];
      data.activeSpaceId = space.id;
      await area.set({ boardmarks: data });
      return data;
    }

    if (!data.activeSpaceId || !data.spaces.find((s) => s.id === data.activeSpaceId)) {
      data.activeSpaceId = data.spaces[0].id;
      await area.set({ boardmarks: data });
    }

    return data;
  },

  // Pure lookup: returns the active space object from an already-fetched
  // data object (falls back to the first space if the id is somehow stale).
  getActiveSpace(data) {
    let space = data.spaces.find((s) => s.id === data.activeSpaceId);
    if (!space) {
      space = data.spaces[0];
      data.activeSpaceId = space.id;
    }
    return space;
  },

  async getActiveSpaceBoards() {
    const data = await this.getData();
    return this.getActiveSpace(data).boards;
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
          "Chrome's sync storage is full (it caps synced data at 100KB total, 8KB per item). " +
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
      const current = localRes.boardmarks || { spaces: [], activeSpaceId: null };
      try {
        await chrome.storage.sync.set({ boardmarks: current });
      } catch (err) {
        return {
          ok: false,
          error:
            "Your current boards are too large for Chrome sync (it caps synced data at 100KB total, 8KB per item). " +
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

  // ---------- Spaces ----------

  async listSpaces() {
    const data = await this.getData();
    return data.spaces.map((s) => ({
      id: s.id,
      name: s.name,
      boardCount: s.boards.length,
      active: s.id === data.activeSpaceId,
    }));
  },

  async addSpace(name) {
    const data = await this.getData();
    const space = { id: this.uid(), name: name || "New Space", boards: [] };
    data.spaces.push(space);
    data.activeSpaceId = space.id;
    await this.setData(data);
    return space;
  },

  async renameSpace(spaceId, name) {
    const data = await this.getData();
    const s = data.spaces.find((x) => x.id === spaceId);
    if (s) s.name = name || "Untitled space";
    await this.setData(data);
  },

  async deleteSpace(spaceId) {
    const data = await this.getData();
    if (data.spaces.length <= 1) {
      throw new Error("You need at least one space — create another before deleting this one.");
    }
    const target = data.spaces.find((s) => s.id === spaceId);
    data.spaces = data.spaces.filter((s) => s.id !== spaceId);
    if (data.activeSpaceId === spaceId) data.activeSpaceId = data.spaces[0].id;
    await this.setData(data);
    if (target) {
      const ids = target.boards.flatMap((b) => b.bookmarks.map((bm) => bm.id));
      await this.deleteThumbnails(ids);
    }
  },

  async setActiveSpace(spaceId) {
    const data = await this.getData();
    if (data.spaces.find((s) => s.id === spaceId)) {
      data.activeSpaceId = spaceId;
      await this.setData(data);
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
    wallpaper: { type: "none", value: "" }, // type: none | color | gradient | image | live
    grain: true,
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

    document.body.classList.toggle("grain-off", settings.grain === false);

    const liveLayer = document.getElementById("liveWallpaperLayer");
    const wp = settings.wallpaper || { type: "none" };

    if (liveLayer) liveLayer.classList.toggle("hidden", wp.type !== "live");

    if (wp.type === "none" || !wp.value) {
      body.style.backgroundImage = "";
      body.style.backgroundColor = "";
      body.classList.remove("has-wallpaper");
    } else if (wp.type === "live") {
      body.style.backgroundImage = "";
      body.style.backgroundColor = "";
      body.classList.add("has-wallpaper");
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
      version: 2,
      exportedAt: new Date().toISOString(),
      spaces: data.spaces,
      activeSpaceId: data.activeSpaceId,
      settings,
      thumbnails,
    };
  },

  // mode: 'merge' adds each imported space as a brand-new space (fresh ids) alongside existing ones.
  // mode: 'replace' wipes all current spaces (and settings, if present in the file) and uses the import as-is.
  // Understands both the current { spaces: [...] } backup shape and the older { boards: [...] } shape.
  async importAll(parsed, mode) {
    if (!parsed || (!Array.isArray(parsed.spaces) && !Array.isArray(parsed.boards))) {
      throw new Error("This doesn't look like a Boardmarks backup file.");
    }
    const data = await this.getData();
    const idMap = {}; // old bookmark id -> new bookmark id (only used when ids are regenerated)
    const isSpaceShaped = Array.isArray(parsed.spaces);

    const sanitizeBoard = (b, keepIds) => ({
      id: keepIds && b.id ? b.id : this.uid(),
      name: typeof b.name === "string" && b.name.trim() ? b.name : "Untitled",
      icon: typeof b.icon === "string" ? b.icon : "",
      color: typeof b.color === "string" ? b.color : "",
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

    const sanitizeSpace = (s, keepIds) => ({
      id: keepIds && s.id ? s.id : this.uid(),
      name: typeof s.name === "string" && s.name.trim() ? s.name : "Imported",
      boards: Array.isArray(s.boards) ? s.boards.map((b) => sanitizeBoard(b, keepIds)) : [],
    });

    const incomingSpaces = isSpaceShaped
      ? parsed.spaces
      : [{ id: null, name: "Imported backup", boards: parsed.boards }];
    const importedThumbs = parsed.thumbnails && typeof parsed.thumbnails === "object" ? parsed.thumbnails : {};

    if (mode === "replace") {
      const keepIds = isSpaceShaped; // a synthetic wrapper for legacy backups always gets fresh ids
      data.spaces = incomingSpaces.map((s) => sanitizeSpace(s, keepIds));
      if (data.spaces.length === 0) {
        data.spaces = [{ id: this.uid(), name: "My Boards", boards: [] }];
      }
      data.activeSpaceId =
        keepIds && parsed.activeSpaceId && data.spaces.find((s) => s.id === parsed.activeSpaceId)
          ? parsed.activeSpaceId
          : data.spaces[0].id;
      await this.setData(data);
      if (parsed.settings) {
        await this.setSettings({ ...this.DEFAULT_SETTINGS, ...parsed.settings });
      }
      // Replace wipes existing spaces entirely, so drop any thumbnails that
      // no longer correspond to a bookmark rather than leaving orphans.
      const validIds = new Set(data.spaces.flatMap((s) => s.boards.flatMap((b) => b.bookmarks.map((bm) => bm.id))));
      const nextThumbs = {};
      for (const [id, url] of Object.entries(importedThumbs)) {
        if (validIds.has(id)) nextThumbs[id] = url;
      }
      await chrome.storage.local.set({ [this.THUMB_KEY]: nextThumbs });
    } else {
      const newSpaces = incomingSpaces.map((s) => sanitizeSpace(s, false));
      data.spaces = data.spaces.concat(newSpaces);
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
    const space = this.getActiveSpace(data);
    const board = { id: this.uid(), name: name || "New Board", icon: "", color: "", bookmarks: [] };
    space.boards.push(board);
    await this.setData(data);
    return board;
  },

  async renameBoard(boardId, name) {
    const data = await this.getData();
    const space = this.getActiveSpace(data);
    const b = space.boards.find((x) => x.id === boardId);
    if (b) b.name = name;
    await this.setData(data);
  },

  async setBoardAppearance(boardId, { icon, color } = {}) {
    const data = await this.getData();
    const space = this.getActiveSpace(data);
    const b = space.boards.find((x) => x.id === boardId);
    if (!b) return;
    if (icon !== undefined) b.icon = icon;
    if (color !== undefined) b.color = color;
    await this.setData(data);
  },

  async reorderBoards(draggedId, targetId) {
    const data = await this.getData();
    const space = this.getActiveSpace(data);
    const fromIndex = space.boards.findIndex((x) => x.id === draggedId);
    if (fromIndex === -1) return;
    const [moved] = space.boards.splice(fromIndex, 1);
    let toIndex = targetId ? space.boards.findIndex((x) => x.id === targetId) : space.boards.length;
    if (toIndex === -1) toIndex = space.boards.length;
    space.boards.splice(toIndex, 0, moved);
    await this.setData(data);
  },

  async deleteBoard(boardId) {
    const data = await this.getData();
    const space = this.getActiveSpace(data);
    const board = space.boards.find((x) => x.id === boardId);
    space.boards = space.boards.filter((x) => x.id !== boardId);
    await this.setData(data);
    if (board) await this.deleteThumbnails(board.bookmarks.map((bm) => bm.id));
  },

  async addBookmark(boardId, { title, url }) {
    const data = await this.getData();
    const space = this.getActiveSpace(data);
    const b = space.boards.find((x) => x.id === boardId);
    if (!b) return null;
    const bookmark = { id: this.uid(), title: title || url, url };
    b.bookmarks.push(bookmark);
    await this.setData(data);
    return bookmark;
  },

  async moveBookmarkToPosition(fromBoardId, toBoardId, bookmarkId, toIndex) {
    const data = await this.getData();
    const space = this.getActiveSpace(data);
    const from = space.boards.find((x) => x.id === fromBoardId);
    const to = space.boards.find((x) => x.id === toBoardId);
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
    const space = this.getActiveSpace(data);
    const b = space.boards.find((x) => x.id === boardId);
    if (!b) return;
    b.bookmarks = b.bookmarks.filter((x) => x.id !== bookmarkId);
    await this.setData(data);
    await this.deleteThumbnail(bookmarkId);
  },

  async moveBookmark(fromBoardId, toBoardId, bookmarkId) {
    if (fromBoardId === toBoardId) return;
    const data = await this.getData();
    const space = this.getActiveSpace(data);
    const from = space.boards.find((x) => x.id === fromBoardId);
    const to = space.boards.find((x) => x.id === toBoardId);
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
