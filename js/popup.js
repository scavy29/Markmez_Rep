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

function downscaleImage(dataUrl, maxWidth, maxHeight, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(maxWidth / img.width, maxHeight / img.height, 1);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
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

  const bookmark = await Store.addBookmark(boardId, {
    title: activeTab.title || activeTab.url,
    url: activeTab.url,
  });

  status.textContent = "Saved ✓";

  // Best-effort screenshot: some pages (chrome:// pages, the PDF viewer,
  // the Web Store, etc.) can't be captured — that's fine, we just fall
  // back to the favicon for those.
  try {
    const rawShot = await chrome.tabs.captureVisibleTab(activeTab.windowId, { format: "jpeg", quality: 70 });
    const thumb = await downscaleImage(rawShot, 320, 200, 0.6);
    if (bookmark) await Store.setThumbnail(bookmark.id, thumb);
  } catch (err) {
    /* no thumbnail for this tab — favicon will be shown instead */
  }

  setTimeout(() => window.close(), 500);
});

init();
