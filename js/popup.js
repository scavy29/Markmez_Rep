let activeTab = null;

async function init() {
  const settings = await Store.getSettings();
  document.documentElement.style.setProperty("--accent", settings.accent);

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTab = tab;

  document.getElementById("ctTitle").textContent = tab.title || tab.url;
  document.getElementById("ctUrl").textContent = tab.url;
  document.getElementById("ctIcon").src = Store.faviconFor(tab.url);

  const data = await Store.getData();
  const select = document.getElementById("boardSelect");
  select.innerHTML = "";

  if (data.boards.length === 0) {
    const opt = document.createElement("option");
    opt.textContent = "No boards yet — creating 'General'";
    select.appendChild(opt);
  } else {
    for (const b of data.boards) {
      const opt = document.createElement("option");
      opt.value = b.id;
      opt.textContent = `${b.name} (${b.bookmarks.length})`;
      select.appendChild(opt);
    }
  }
}

document.getElementById("saveBtn").addEventListener("click", async () => {
  const status = document.getElementById("status");
  const select = document.getElementById("boardSelect");
  let data = await Store.getData();

  let boardId = select.value;
  if (data.boards.length === 0) {
    const board = await Store.addBoard("General");
    boardId = board.id;
  }

  await Store.addBookmark(boardId, {
    title: activeTab.title || activeTab.url,
    url: activeTab.url,
  });

  status.textContent = "Saved ✓";
  setTimeout(() => window.close(), 500);
});

init();
