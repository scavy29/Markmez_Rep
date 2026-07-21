# Boardmarks

A free, local, open-source-style Chrome extension you own outright. It replaces
your new tab page with boards of bookmarks, and adds a popup for quickly
saving the current tab.

## Features
- **Spaces**: separate named collections of boards (e.g. "Work" vs
  "Personal") — switch between them from the dropdown under the top bar,
  or create, rename, and delete spaces there. Every board, bookmark, and
  thumbnail belongs to exactly one space; deleting a space removes its
  boards too (with a confirmation showing exactly how much that is).
- **Boards**: create, rename, delete, and drag to reorder (grab the ⠿ handle)
- **Board icon & color**: click the small chip next to a board's title to
  give it an emoji icon and/or a color, so boards are easier to tell apart
  at a glance.
- **Import**: pull in your existing Chrome bookmark folders as boards
- **Search**: filter across all boards instantly
- **Drag & drop**: reorder bookmarks within a board, or drag one onto another
  board to move it there
- **Quick save**: click the toolbar icon to save the current tab to any board
- **Thumbnails**: bookmarks saved via the toolbar popup get a real screenshot
  of the tab at the moment you save it (captured locally, never sent
  anywhere). Bookmarks added by pasting a URL or importing from Chrome show
  a favicon instead, since there's no live tab to screenshot for those.
  Thumbnails are stored locally only (excluded from sync, cleaned up
  automatically when a bookmark or board is deleted, and carried along in
  export/restore backups).
- **Theme & wallpaper** (⚙ button): pick an accent color (presets or a custom
  swatch) and a wallpaper — gradient presets, a solid color, or upload your
  own image. Boards get a frosted-glass look automatically when a wallpaper
  is active, so text stays readable.
- **Export / restore backup**: download all your spaces, boards, bookmarks,
  and theme settings as a JSON file, and restore from one later — add its
  spaces alongside your current ones, or replace everything outright (with
  a confirmation either way). Old backups from before Spaces existed still
  import fine.
- **Live wallpaper**: an animated, softly drifting gradient tied to your
  accent color (pick "Live" under Wallpaper in Settings) — pure CSS, no
  JS animation loop, respects "reduce motion" system settings.
- **Subtle grain texture**: a faint film-grain overlay for a less sterile,
  more premium feel (toggle under Settings → Effects).
- **Motion polish**: boards fade in with a gentle stagger when a space
  loads or a new board appears, plus smoother hover lift/slide on boards
  and bookmark rows.
- **Command palette** (Ctrl+K / Cmd+K): a spotlight-style search that jumps
  straight to any space, board, or bookmark across your whole extension —
  arrow keys to navigate, Enter to open, Esc to close.
- **Sync across devices** (Settings → Sync across devices): toggle on to
  store your boards & bookmarks in `chrome.storage.sync` instead of
  `chrome.storage.local`, so Chrome copies them to your other signed-in
  devices automatically — no account or server of ours involved. Chrome
  caps sync storage at ~100KB total / ~8KB per board, so wallpaper and
  theme intentionally stay local-only. If your data ever outgrows that
  cap, the latest change is saved locally instead and sync turns off
  automatically, with an explanation — nothing is lost.
- Everything is stored locally by default via `chrome.storage.local` — no
  account, no server, no tracking. (Wallpaper images use the
  `unlimitedStorage` permission so a photo won't hit the default quota.)

## Install it (Load unpacked)
1. Unzip this folder somewhere permanent (don't delete it after installing —
   Chrome loads the extension from this folder).
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the unzipped `bookmark-boards` folder.
5. Open a new tab — you should see Boardmarks. Pin the extension icon to your
   toolbar for the quick-save popup.

## Ideas for more
- Keyboard shortcuts (e.g. a hotkey to open the quick-add row)
- Dead-link checker for stale bookmarks
- Right-click "Add to Boardmarks" context menu on any page/link

This is your codebase — feel free to rip anything out or extend it.
