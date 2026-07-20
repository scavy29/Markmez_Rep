// Shared storage layer. Data shape:
// { boards: [ { id, name, bookmarks: [ { id, title, url } ] } ] }

const Store = {
  async getData() {
    const res = await chrome.storage.local.get("boardmarks");
    if (!res.boardmarks) {
      const initial = { boards: [] };
      await chrome.storage.local.set({ boardmarks: initial });
      return initial;
    }
    return res.boardmarks;
  },

  async setData(data) {
    await chrome.storage.local.set({ boardmarks: data });
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

  async deleteBoard(boardId) {
    const data = await this.getData();
    data.boards = data.boards.filter((x) => x.id !== boardId);
    await this.setData(data);
  },

  async addBookmark(boardId, { title, url }) {
    const data = await this.getData();
    const b = data.boards.find((x) => x.id === boardId);
    if (!b) return;
    b.bookmarks.push({ id: this.uid(), title: title || url, url });
    await this.setData(data);
  },

  async removeBookmark(boardId, bookmarkId) {
    const data = await this.getData();
    const b = data.boards.find((x) => x.id === boardId);
    if (!b) return;
    b.bookmarks = b.bookmarks.filter((x) => x.id !== bookmarkId);
    await this.setData(data);
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
