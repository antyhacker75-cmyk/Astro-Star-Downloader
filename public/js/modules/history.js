// history.js — history CRUD, callbacks, auto-clear, PERSISTENT PUBLIC FILE
import { translations } from "../i18n/index.js";
import { getVideoThumbnail, Filesystem, cleanUrl } from "../utils/index.js";
import { showModal, renderHistory, setUIState } from "../ui.js";
import { showConfirm } from "./modals.js";
import {
  currentLang,
  downloadBtn,
  editHistoryBtn,
  doneEditBtn,
  clearAllBtn,
  setIsEditingHistory,
  clearCacheSilently,
  updateGreeting,
  updateStorageInfo,
  switchToSingleMode,
} from "./core.js";

/* ================================================================
   PERSISTENT HISTORY FILE (survives uninstall / reinstall)
   Public path on Android: /storage/emulated/0/Documents/AstroStar/history.json
   ================================================================ */

const HISTORY_KEY         = "astrostar_history";
const HISTORY_FILE_DIR    = "Documents/AstroStar";
const HISTORY_FILE_NAME   = "history.json";
const HISTORY_FILE_PATH   = `${HISTORY_FILE_DIR}/${HISTORY_FILE_NAME}`;

/** Read the persistent history file. Returns [] if missing/unreadable. */
async function readHistoryFile() {
  try {
    const res = await Filesystem.readFile({
      path: HISTORY_FILE_PATH,
      directory: "EXTERNAL_STORAGE",
      encoding: "utf8",
    });
    const parsed = JSON.parse(res.data);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

/** Write the persistent history file. Creates the folder if needed. */
async function writeHistoryFile(history) {
  try {
    await Filesystem.mkdir({
      path: HISTORY_FILE_DIR,
      directory: "EXTERNAL_STORAGE",
      recursive: true,
    }).catch(() => {});
    await Filesystem.writeFile({
      path: HISTORY_FILE_PATH,
      directory: "EXTERNAL_STORAGE",
      encoding: "utf8",
      data: JSON.stringify(history, null, 2),
      recursive: true,
    });
  } catch (e) {
    console.warn("[AstroStar] Could not write persistent history file:", e);
  }
}

/** Read localStorage mirror. */
function readHistoryLocal() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

/** Write localStorage mirror. */
function writeHistoryLocal(history) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch (e) {
    console.warn("[AstroStar] Could not write localStorage:", e);
  }
}

/**
 * Load + merge everything. Call once on startup.
 * Priority: persistent file → localStorage → folder scan.
 */
export async function loadPersistentHistory() {
  const fromFile = await readHistoryFile();
  const local    = readHistoryLocal();

  const map = new Map();
  for (const item of [...fromFile, ...local]) {
    const key = item.url || item.id || item.path;
    if (!key) continue;
    map.set(key, { ...(map.get(key) || {}), ...item });
  }

  let history = Array.from(map.values());
  history.sort((a, b) => (b.date || 0) - (a.date || 0));

  writeHistoryLocal(history);
  await writeHistoryFile(history);
  return history;
}

/** Add or update one entry. */
export async function addHistoryEntry(entry) {
  const history = readHistoryLocal();
  const key = entry.url || entry.id || entry.path;
  const idx = history.findIndex(h => (h.url || h.id || h.path) === key);

  if (idx >= 0) history[idx] = { ...history[idx], ...entry };
  else history.unshift(entry);

  history.sort((a, b) => (b.date || 0) - (a.date || 0));
  writeHistoryLocal(history);
  await writeHistoryFile(history);
  return history;
}

/** Remove one entry. */
export async function removeHistoryEntry(id) {
  let history = readHistoryLocal();
  history = history.filter(h => h.url !== id && h.id !== id && h.path !== id);
  writeHistoryLocal(history);
  await writeHistoryFile(history);
  return history;
}

/* ================================================================
   EXISTING UI HANDLERS (kept, but now also write the persistent file)
   ================================================================ */

editHistoryBtn?.addEventListener("click", () => {
  setIsEditingHistory(true);
  setUIState({ isEditingHistory: true });
  renderHistory(onHistoryItemClick, onHistoryDeleteClick);
});

doneEditBtn?.addEventListener("click", () => {
  setIsEditingHistory(false);
  setUIState({ isEditingHistory: false });
  renderHistory(onHistoryItemClick, onHistoryDeleteClick);
});

clearAllBtn?.addEventListener("click", () => {
  showConfirm(
    translations[currentLang]["btn-clear-all"] || "Clear All",
    translations[currentLang]["msg-clear-all-confirm"] ||
      "Are you sure you want to delete all download history?",
    async () => {
      const history = readHistoryLocal();
      const thumbs = [];
      for (const item of history) {
        thumbs.push(item.thumbnail, item.localThumbnail);
        for (const f of item.localFiles || []) thumbs.push(f.thumbnail);
      }
      for (const t of thumbs) {
        if (t && t.startsWith("thumb_") && Filesystem) {
          try {
            await Filesystem.deleteFile({ path: t, directory: "CACHE" });
          } catch (e) {}
        }
      }
      localStorage.removeItem(HISTORY_KEY);
      await writeHistoryFile([]);
      setIsEditingHistory(false);
      setUIState({ isEditingHistory: false });
      renderHistory(onHistoryItemClick, onHistoryDeleteClick);
    }
  );
});

export function onHistoryItemClick(item) {
  showModal(item, (url) => {
    switchToSingleMode(url);
    document.querySelector('.nav-item[data-page="home"]')?.click();
    downloadBtn.click();
  });
}

export async function onHistoryDeleteClick(url) {
  showConfirm(
    translations[currentLang]["btn-delete"] || "Delete Item",
    translations[currentLang]["msg-delete-item-confirm"] ||
      "Remove this item from history?",
    async () => {
      let history = readHistoryLocal();
      const index = history.findIndex(h => h.url === url);
      if (index === -1) return;

      const itemToDelete = history[index];
      const thumbs = [
        itemToDelete.thumbnail,
        itemToDelete.localThumbnail,
        ...(itemToDelete.localFiles || []).map(f => f.thumbnail),
      ];
      for (const t of thumbs) {
        if (t && t.startsWith("thumb_") && Filesystem) {
          try {
            await Filesystem.deleteFile({ path: t, directory: "CACHE" });
          } catch (e) {}
        }
      }

      history.splice(index, 1);
      writeHistoryLocal(history);
      await writeHistoryFile(history);
      renderHistory(onHistoryItemClick, onHistoryDeleteClick);
    }
  );
}

/* ================================================================
   FILE SAVED EVENT — now also updates the persistent file
   ================================================================ */

window.addEventListener("astrostar_file_saved", async (e) => {
  if (localStorage.getItem("astrostar_incognito") === "true") return;

  const { url, path, uri } = e.detail;
  const target = cleanUrl(url);
  let history = readHistoryLocal();
  const isVideo = /\.(mp4|mkv|webm|mov|avi|m4v|3gp|flv)$/i.test(path || "");
  const isAudio = /\.(mp3|m4a|aac|wav|ogg|opus|flac)$/i.test(path || "");
  const isImage = /\.(jpg|jpeg|png|gif|webp|bmp|svg|avif)$/i.test(path || "");

  const entry = {
    id: path || uri || target,
    url: target,
    title: path ? path.split("/").pop() : target,
    path: path || "",
    uri: uri || "",
    type: isVideo ? "video" : isAudio ? "audio" : isImage ? "image" : "file",
    date: Date.now(),
    size: 0,
    status: "completed",
  };

  const idx = history.findIndex(h => h.url === target && h.path === (path || ""));
  if (idx >= 0) history[idx] = { ...history[idx], ...entry };
  else history.unshift(entry);

  history.sort((a, b) => (b.date || 0) - (a.date || 0));
  writeHistoryLocal(history);
  await writeHistoryFile(history);
});
