let currentData = { boards: [] };
let searchTerm = "";
let dragBookmark = null; // { boardId, bookmarkId }

const boardsEl = document.getElementById("boards");
const emptyStateEl = document.getElementById("emptyState");
const searchEl = document.getElementById("search");

async function refresh() {
  currentData = await Store.getData();
  render();
}

function matchesSearch(bm) {
  if (!searchTerm) return true;
  const t = searchTerm.toLowerCase();
  return bm.title.toLowerCase().includes(t) || bm.url.toLowerCase().includes(t);
}

function render() {
  boardsEl.innerHTML = "";
  const boards = currentData.boards;
  emptyStateEl.classList.toggle("hidden", boards.length > 0);

  for (const board of boards) {
    const visibleBookmarks = board.bookmarks.filter(matchesSearch);
    if (searchTerm && visibleBookmarks.length === 0) continue;

    const boardEl = document.createElement("div");
    boardEl.className = "board";
    boardEl.dataset.boardId = board.id;

    boardEl.addEventListener("dragover", (e) => {
      e.preventDefault();
      boardEl.classList.add("drag-over");
    });
    boardEl.addEventListener("dragleave", () => boardEl.classList.remove("drag-over"));
    boardEl.addEventListener("drop", async (e) => {
      e.preventDefault();
      boardEl.classList.remove("drag-over");
      if (dragBookmark) {
        await Store.moveBookmark(dragBookmark.boardId, board.id, dragBookmark.bookmarkId);
        dragBookmark = null;
        refresh();
      }
    });

    const head = document.createElement("div");
    head.className = "board-head";

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

      const icon = document.createElement("img");
      icon.src = Store.faviconFor(bm.url);
      icon.alt = "";

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

      row.appendChild(icon);
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
      const b = data.boards.find((x) => x.id === board.id);
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

refresh();
