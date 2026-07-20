# Boardmarks

A free, local, open-source-style Chrome extension you own outright. It replaces
your new tab page with boards of bookmarks, and adds a popup for quickly
saving the current tab.

## Features
- **Boards**: create, rename, delete, and drag to reorder (grab the ⠿ handle)
- **Import**: pull in your existing Chrome bookmark folders as boards
- **Search**: filter across all boards instantly
- **Drag & drop**: move a bookmark from one board to another
- **Quick save**: click the toolbar icon to save the current tab to any board
- **Theme & wallpaper** (⚙ button): pick an accent color (presets or a custom
  swatch) and a wallpaper — gradient presets, a solid color, or upload your
  own image. Boards get a frosted-glass look automatically when a wallpaper
  is active, so text stays readable.
- Everything is stored locally via `chrome.storage.local` — no account, no
  server, no tracking. (Wallpaper images use the `unlimitedStorage`
  permission so a photo won't hit the default quota.)

## Install it (Load unpacked)
1. Unzip this folder somewhere permanent (don't delete it after installing —
   Chrome loads the extension from this folder).
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the unzipped `bookmark-boards` folder.
5. Open a new tab — you should see Boardmarks. Pin the extension icon to your
   toolbar for the quick-save popup.

## Notes / next steps you could add yourself
- Bookmark reordering within a board
- Export/backup to JSON
- Sync via `chrome.storage.sync` instead of `local` (Chrome will sync it
  across your own signed-in devices automatically — no backend needed)

This is your codebase — feel free to rip anything out or extend it.
