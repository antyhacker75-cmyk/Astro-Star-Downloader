/**
 * history.js — AstroStar Download History Manager
 *
 * Persists history in TWO places so it survives uninstall/reinstall:
 *   1. localStorage                       (fast, wiped on uninstall)
 *   2. Documents/AstroStar/history.json   (public, survives uninstall)
 *
 * On startup it also re-scans the media folders and recovers any
 * files that exist on disk but are missing from the history.
 */

import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */

const HISTORY_KEY = 'astrostar_history';

export const MEDIA_DIRS = {
  video:    'Movies/AstroStar',
  audio:    'Music/AstroStar',
  image:    'Pictures/AstroStar',
  document: 'Documents/AstroStar',
  other:    'Download/AstroStar'
};

export const HISTORY_FILE_DIR  = 'Documents/AstroStar';
export const HISTORY_FILE_NAME = 'history.json';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export function detectType(filename) {
  const ext = (filename.split('.').pop() || '').toLowerCase();

  if (['mp4','mkv','webm','mov','avi','m4v','3gp','flv'].includes(ext)) return 'video';
  if (['mp3','m4a','aac','wav','ogg','opus','flac'].includes(ext))      return 'audio';
  if (['jpg','jpeg','png','gif','webp','bmp','svg','avif'].includes(ext)) return 'image';
  if (['pdf','doc','docx','txt','zip','apk'].includes(ext))             return 'document';

  return 'other';
}

export function dirForType(type) {
  return MEDIA_DIRS[type] || MEDIA_DIRS.other;
}

export async function ensureDir(path) {
  try {
    await Filesystem.mkdir({
      path,
      directory: Directory.ExternalStorage,
      recursive: true
    });
  } catch (e) {
    // already exists — ignore
  }
}

/* ------------------------------------------------------------------ */
/* Persistent JSON file (survives uninstall)                           */
/* ------------------------------------------------------------------ */

export async function readHistoryFile() {
  try {
    const res = await Filesystem.readFile({
      path: `${HISTORY_FILE_DIR}/${HISTORY_FILE_NAME}`,
      directory: Directory.ExternalStorage,
      encoding: Encoding.UTF8
    });

    const parsed = JSON.parse(res.data);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

export async function writeHistoryFile(history) {
  try {
    await ensureDir(HISTORY_FILE_DIR);

    await Filesystem.writeFile({
      path: `${HISTORY_FILE_DIR}/${HISTORY_FILE_NAME}`,
      directory: Directory.ExternalStorage,
      encoding: Encoding.UTF8,
      data: JSON.stringify(history, null, 2),
      recursive: true
    });
  } catch (e) {
    console.warn('[AstroStar] Could not write history file:', e);
  }
}

/* ------------------------------------------------------------------ */
/* localStorage mirror                                                 */
/* ------------------------------------------------------------------ */

export function readHistoryLocal() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

export function writeHistoryLocal(history) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch (e) {
    console.warn('[AstroStar] Could not write localStorage:', e);
  }
}

/* ------------------------------------------------------------------ */
/* Folder scan — recovers files not present in history                 */
/* ------------------------------------------------------------------ */

export async function scanFolders(existingHistory = []) {
  const found = [];
  const knownPaths = new Set(existingHistory.map(h => h.path).filter(Boolean));

  for (const [type, dir] of Object.entries(MEDIA_DIRS)) {
    let listing;

    try {
      listing = await Filesystem.readdir({
        path: dir,
        directory: Directory.ExternalStorage
      });
    } catch (e) {
      continue;
    }

    for (const entry of listing.files) {
      const name = entry.name;
      const path = `${dir}/${name}`;

      if (knownPaths.has(path)) continue;

      const fileType = detectType(name);

      let size = 0;
      let mtime = Date.now();

      try {
        const stat = await Filesystem.stat({
          path,
          directory: Directory.ExternalStorage
        });
        size  = stat.size  || 0;
        mtime = stat.mtime || mtime;
      } catch (e) {
        // stat failed — still record it with defaults
      }

      found.push({
        id: path,
        title: name,
        filename: name,
        path,
        type: fileType,
        size,
        date: mtime,
        url: '',
        thumbnail: '',
        status: 'completed',
        recovered: true
      });

      knownPaths.add(path);
    }
  }

  return found;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export async function loadHistory() {
  const fromFile = await readHistoryFile();
  const local    = readHistoryLocal();

  const map = new Map();

  for (const item of [...fromFile, ...local]) {
    const key = item.path || item.id;
    if (!key) continue;

    const prev = map.get(key);
    map.set(key, prev ? { ...prev, ...item } : item);
  }

  let history = Array.from(map.values());

  const recovered = await scanFolders(history);
  history = history.concat(recovered);

  const verified = [];
  for (const item of history) {
    if (!item.path) {
      verified.push(item);
      continue;
    }
    try {
      await Filesystem.stat({
        path: item.path,
        directory: Directory.ExternalStorage
      });
      verified.push(item);
    } catch (e) {
      // file no longer on disk — drop it from history
    }
  }
  history = verified;

  history.sort((a, b) => (b.date || 0) - (a.date || 0));

  writeHistoryLocal(history);
  await writeHistoryFile(history);

  return history;
}

export async function addHistory(entry) {
  const history = readHistoryLocal();
  const key = entry.path || entry.id;
  const idx = history.findIndex(h => (h.path || h.id) === key);

  if (idx >= 0) history[idx] = { ...history[idx], ...entry };
  else history.unshift(entry);

  history.sort((a, b) => (b.date || 0) - (a.date || 0));

  writeHistoryLocal(history);
  await writeHistoryFile(history);

  return history;
}

export async function removeHistory(id, deleteFile = false) {
  let history = readHistoryLocal();
  const target = history.find(h => h.id === id || h.path === id);

  if (deleteFile && target && target.path) {
    try {
      await Filesystem.deleteFile({
        path: target.path,
        directory: Directory.ExternalStorage
      });
    } catch (e) {
      // file may already be gone — ignore
    }
  }

  history = history.filter(h => h.id !== id && h.path !== id);

  writeHistoryLocal(history);
  await writeHistoryFile(history);

  return history;
}

export async function clearHistory(deleteFiles = false) {
  if (deleteFiles) {
    const history = readHistoryLocal();

    for (const item of history) {
      if (!item.path) continue;
      try {
        await Filesystem.deleteFile({
          path: item.path,
          directory: Directory.ExternalStorage
        });
      } catch (e) {
        // ignore
      }
    }
  }

  localStorage.removeItem(HISTORY_KEY);
  await writeHistoryFile([]);

  return [];
}
