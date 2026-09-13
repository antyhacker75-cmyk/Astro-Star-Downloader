/**
 * app.js — AstroStar startup + download wiring
 *
 * This is a minimal, complete example. Merge the parts you need into
 * your existing app.js / index.js / main entry file.
 */

import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import {
  loadHistory,
  addHistory,
  removeHistory,
  clearHistory,
  detectType,
  dirForType,
  ensureDir
} from './history.js';

let history = [];

/* ------------------------------------------------------------------ */
/* Startup                                                             */
/* ------------------------------------------------------------------ */

async function boot() {
  history = await loadHistory();
  renderHistory(history);

  const clearBtn = document.getElementById('clear-history');
  if (clearBtn) {
    clearBtn.addEventListener('click', async () => {
      history = await clearHistory(false);
      renderHistory(history);
    });
  }

  const clearAllBtn = document.getElementById('clear-history-and-files');
  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', async () => {
      history = await clearHistory(true);
      renderHistory(history);
    });
  }
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

function renderHistory(items) {
  const list = document.getElementById('history-list');
  if (!list) return;

  list.innerHTML = '';

  if (!items.length) {
    const empty = document.createElement('li');
    empty.className = 'history-empty';
    empty.textContent = 'No downloads yet.';
    list.appendChild(empty);
    return;
  }

  for (const item of items) {
    const li = document.createElement('li');
    li.className = 'history-item';
    li.dataset.id = item.id;

    const title = document.createElement('span');
    title.className = 'history-title';
    title.textContent = item.title || item.filename || item.path;

    const meta = document.createElement('span');
    meta.className = 'history-meta';
    meta.textContent = `${item.type || 'file'} • ${formatSize(item.size)} • ${formatDate(item.date)}`;

    const del = document.createElement('button');
    del.className = 'history-delete';
    del.textContent = 'Delete';
    del.addEventListener('click', async () => {
      history = await removeHistory(item.id, false);
      renderHistory(history);
    });

    li.appendChild(title);
    li.appendChild(meta);
    li.appendChild(del);
    list.appendChild(li);
  }
}

function formatSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  return d.toLocaleString();
}

/* ------------------------------------------------------------------ */
/* Download handler                                                    */
/* ------------------------------------------------------------------ */

export async function saveDownloadedFile({ filename, data, url, thumbnail }) {
  const type = detectType(filename);
  const dir  = dirForType(type);

  await ensureDir(dir);

  const path = `${dir}/${filename}`;

  await Filesystem.writeFile({
    path,
    directory: Directory.ExternalStorage,
    data,
    recursive: true
  });

  const stat = await Filesystem.stat({
    path,
    directory: Directory.ExternalStorage
  });

  await addHistory({
    id: path,
    title: filename,
    filename,
    path,
    type,
    url: url || '',
    thumbnail: thumbnail || '',
    date: Date.now(),
    size: stat.size || 0,
    status: 'completed'
  });

  history = await loadHistory();
  renderHistory(history);

  return path;
}

/* ------------------------------------------------------------------ */

document.addEventListener('DOMContentLoaded', boot);
