// history.js — history CRUD, callbacks, auto-clear, PERSISTENT PUBLIC FILE
import { translations } from "../i18n/index.js";
import { getVideoThumbnail, Filesystem, cleanUrl } from "../utils/index.js";
import { Directory, Encoding } from "@capacitor/filesystem";
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
   PERSISTENT HISTORY FILE
   Public path: /storage/emulated/0/Documents/AstroStar/history.json
   ================================================================ */

const HISTORY_KEY       = "astrostar_history";
const HISTORY_FILE_DIR  = "Documents/AstroStar";
const HISTORY_FILE_NAME = "history.json";
const HISTORY_FILE_PATH = `${HISTORY_FILE_DIR}/${HISTORY_FILE_NAME}`;

async function readHistoryFile() {
  try {
    const res = await Filesystem.readFile({
      path: HISTORY_FILE_PATH,
      directory: Directory.ExternalStorage,
      encoding: Encoding.UTF8,
    });
    const parsed = JSON.parse(res.data);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

async function writeHistoryFile(history) {
  try {
    await Filesystem.mkdir({
      path: HISTORY_FILE_DIR,
      directory: Directory.ExternalStorage,
      recursive: true,
    }).catch(() => {});
    await Filesystem.writeFile({
      path: HISTORY_FILE_PATH,
      directory: Directory.ExternalStorage,
      encoding: Encoding.UTF8,
      data: JSON.stringify(history, null, 2),
      recursive: true,
    });
  } catch (e) {
    console.warn("[AstroStar] Could not write persistent history file:", e);
  }
}

function readHistoryLocal() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function writeHistoryLocal(history) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch (e) {
    console.warn("[AstroStar] Could not write localStorage:", e);
  }
}

/* ================================================================
   SILENT BOOTSTRAP
   Runs once when this module is imported. Merges the persistent
   file into localStorage so app.js's existing readHistory() sees it.
   app.js does NOT need to be changed.
   ================================================================ */

let bootstrapPromise = (async () => {
  const fromFile = await readHistoryFile();
  if (!fromFile.length) return;

  const local = readHistoryLocal();
  const map = new Map();

  for (const item of [...fromFile, ...local]) {
    const key = item.url || item.sourceUrl || item.id;
    if (!key) continue;
    map.set(key, { ...(map.get(key) || {}), ...item });
  }

  const merged = Array.from(map.values());
  merged.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  writeHistoryLocal(merged);
})();

/** Optional export if you ever want to await the bootstrap manually. */
export function historyReady() {
  return bootstrapPromise;
}

/* ================================================================
   EXISTING UI HANDLERS (unchanged, now also write persistent file)
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
      const index = history.findIndex((h) => h.url === url);
      if (index === -1) return;

      const itemToDelete = history[index];
      const thumbs = [
        itemToDelete.thumbnail,
        itemToDelete.localThumbnail,
        ...(itemToDelete.localFiles || []).map((f) => f.thumbnail),
      ];
      for (const t of thumbs) {
        if (t && t.startsWith("thumb_") && Filesystem) {
          try {
            await Filesystem.deleteFile({
              path: t,
              directory: "CACHE",
            });
          } catch (e) {
            console.warn("Could not delete thumbnail file:", e);
          }
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
   FILE SAVED EVENT — unchanged behaviour, plus persistent write
   ================================================================ */

window.addEventListener("astrostar_file_saved", async (e) => {
  if (localStorage.getItem("astrostar_incognito") === "true") return;

  const { url, path, uri } = e.detail;
  const target = cleanUrl(url);
  let history = readHistoryLocal();
  const isVideo = path.toLowerCase().endsWith(".mp4");
  const isAudio = path.toLowerCase().endsWith(".mp3");
  const isImage = /\.(jpg|jpeg|png|webp)/i.test(path);
  const fileUri = uri || path;
  let matched = false;

  history = history.map((item) => {
    const itemClean = cleanUrl(item.url);
    const sourceClean = item.sourceUrl ? cleanUrl(item.sourceUrl) : "";
    const isUrlMatch =
      (itemClean && itemClean === target) ||
      (sourceClean && sourceClean === target) ||
      (item.url && item.url.includes(url)) ||
      (url && url.includes(item.url)) ||
      (item.sourceUrl &&
        (item.sourceUrl.includes(url) || url.includes(item.sourceUrl)));

    if (!matched && isUrlMatch) {
      matched = true;
      const localFiles = item.localFiles || [];
      const trackTitle = e.detail.title;
      if (!localFiles.find((f) => f.path === path)) {
        localFiles.push({
          path,
          uri: fileUri,
          type: isVideo ? "VIDEO" : isAudio ? "MP3" : "IMAGE",
          thumbnail: null,
          title: trackTitle || item.title,
        });
      }
      return { ...item, localFiles, localUri: fileUri };
    }
    return item;
  });

  const limitVal = localStorage.getItem("astrostar_history_limit") || "unlimited";
  if (limitVal !== "unlimited") {
    const maxItems = parseInt(limitVal, 10);
    if (!isNaN(maxItems) && history.length > maxItems) {
      history = history.slice(0, maxItems);
    }
  }

  writeHistoryLocal(history);
  await writeHistoryFile(history);
  renderHistory(onHistoryItemClick, onHistoryDeleteClick);

  if (isVideo && window.Capacitor) {
    try {
      const videoSrc = window.Capacitor.convertFileSrc(fileUri);
      const localThumbnail = await getVideoThumbnail(videoSrc);
      if (localThumbnail) {
        history = readHistoryLocal();
        history = history.map((item) => {
          if (cleanUrl(item.url) === target) {
            const localFiles = item.localFiles || [];
            localFiles.forEach((f) => {
              if (f.path === path) f.thumbnail = localThumbnail;
            });
            return {
              ...item,
              localFiles,
              localThumbnail: localThumbnail || item.localThumbnail,
              versionCode: 16,
              versionName: "4.3.0",
            };
          }
          return item;
        });
        writeHistoryLocal(history);
        await writeHistoryFile(history);
        renderHistory(onHistoryItemClick, onHistoryDeleteClick);
      }
    } catch (err) {
      console.warn("Failed to generate video thumbnail", err);
    }
  }

  updateGreeting();
  updateStorageInfo();
});

/* ================================================================
   History Storage Helper
   ================================================================ */

export function saveToHistory(result, url) {
  if (localStorage.getItem("astrostar_incognito") === "true") return;

  let history = readHistoryLocal();
  let cleanTitle = (result.title || "Content")
    .replace(/#[^\s#]+/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  const targetUrl = cleanUrl(url);
  const existingIndex = history.findIndex((h) => cleanUrl(h.url) === targetUrl);
  const existingItem = existingIndex !== -1 ? history[existingIndex] : null;

  const newItem = {
    title: cleanTitle,
    thumbnail: result.thumbnail,
    url: url,
    sourceUrl: result.sourceUrl || url,
    timestamp: Date.now(),
    downloads:
      result.downloads ||
      (existingItem ? existingItem.downloads || [] : []),
    localFiles: existingItem ? existingItem.localFiles || [] : [],
    localUri: existingItem ? existingItem.localUri : null,
    localThumbnail: existingItem ? existingItem.localThumbnail : null,
  };

  if (existingIndex !== -1) {
    history.splice(existingIndex, 1);
  }
  history.unshift(newItem);

  const limitVal = localStorage.getItem("astrostar_history_limit") || "unlimited";
  if (limitVal !== "unlimited") {
    let maxItems = 100;
    const parsed = parseInt(limitVal, 10);
    if (!isNaN(parsed) && parsed > 0) maxItems = parsed;
    history = history.slice(0, maxItems);
  }

  writeHistoryLocal(history);
  writeHistoryFile(history);

  if (typeof renderHistory === "function") {
    renderHistory(onHistoryItemClick, onHistoryDeleteClick);
  }
  if (typeof updateGreeting === "function") {
    updateGreeting();
  }
}

/* ================================================================
   Auto-Clear (unchanged)
   ================================================================ */

export async function autoClearOldHistory() {
  const daysVal = localStorage.getItem("astrostar_auto_clear_days") || "off";
  if (daysVal === "off") return;
  const days = parseInt(daysVal, 10);
  if (isNaN(days) || days <= 0) return;

  let history = readHistoryLocal();
  const cutoffTime = days * 24 * 60 * 60 * 1000;
  const now = Date.now();

  const filtered = history.filter((item) => {
    return now - (item.timestamp || 0) < cutoffTime;
  });

  if (filtered.length !== history.length) {
    console.log(
      `[CLEANUP] Removed ${history.length - filtered.length} old history items older than ${days} days`
    );
    writeHistoryLocal(filtered);
    writeHistoryFile(filtered);
    renderHistory(onHistoryItemClick, onHistoryDeleteClick);

    if (Filesystem) {
      const removed = history.filter((item) => !filtered.includes(item));
      for (const item of removed) {
        const thumbs = [
          item.thumbnail,
          item.localThumbnail,
          ...(item.localFiles || []).map((f) => f.thumbnail),
        ];
        for (const t of thumbs) {
          if (t && t.startsWith("thumb_") && Filesystem) {
            try {
              await Filesystem.deleteFile({ path: t, directory: "CACHE" });
            } catch (e) {}
          }
        }
      }
    }
  }
}

export function autoClearOldCache() {
  const cacheDaysVal =
    localStorage.getItem("astrostar_auto_clear_cache_days") || "off";
  if (cacheDaysVal === "off") return;
  const days = parseInt(cacheDaysVal, 10);
  if (isNaN(days) || days <= 0) return;

  const lastCleanup = parseInt(
    localStorage.getItem("astrostar_last_cache_cleanup_ts") || "0",
    10
  );
  const cutoffTime = days * 24 * 60 * 60 * 1000;
  const now = Date.now();

  if (now - lastCleanup >= cutoffTime) {
    console.log(
      `[CLEANUP] Executing auto clear cache (retention: ${days} days)`
    );
    clearCacheSilently();
    localStorage.setItem("astrostar_last_cache_cleanup_ts", String(now));
  }
}
