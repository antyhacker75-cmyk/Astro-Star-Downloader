import {
  CapacitorHttp,
  Filesystem,
  showToast,
  currentLang,
} from "../utils/index.js";
import { translations } from "../i18n/index.js";

const isNativePlatform = window.Capacitor?.isNativePlatform?.() === true;

export function createVideoPlayer(dl, index, resultThumbnail) {
  const playerContainer = document.createElement("div");
  playerContainer.className = "astrostar-player-container";
  playerContainer.style.backgroundColor = "black";
  playerContainer.style.display = "flex";
  playerContainer.style.alignItems = "center";
  playerContainer.style.justifyContent = "center";
  playerContainer.style.maxHeight = "80vh";

  let videoUrl = dl.url || "";
  const isLocal =
    videoUrl.includes("_capacitor_file_") ||
    videoUrl.startsWith("file://") ||
    videoUrl.startsWith("content://") ||
    videoUrl.includes("localhost") ||
    videoUrl.includes("127.0.0.1");
  const isDouyin = /douyin|snssdk/i.test(videoUrl);

  if (videoUrl.startsWith("http://") && !isDouyin && !isLocal) {
    videoUrl = videoUrl.replace("http://", "https://");
  }

  const dlTypeLower = (dl.type || "").toLowerCase();
  const fileNameLower = (dl.filename || dl.title || videoUrl || "").toLowerCase();
  const isAudioOnly =
    dlTypeLower.includes("mp3") ||
    dlTypeLower.includes("audio") ||
    dlTypeLower.includes("m4a") ||
    fileNameLower.endsWith(".mp3") ||
    fileNameLower.endsWith(".m4a") ||
    fileNameLower.endsWith(".aac") ||
    fileNameLower.endsWith(".opus") ||
    fileNameLower.endsWith(".flac") ||
    fileNameLower.endsWith(".wav");

  // 🎵 AUDIO + Native → use Native Media Player (background + notification)
  if (isAudioOnly && isNativePlatform && window.AstroStarMainBridge?.loadMedia) {
    return createNativeAudioPlayer(playerContainer, dl, index, videoUrl, resultThumbnail);
  }

  // 🎬 VIDEO → HTML <video>
  const video = document.createElement("video");
  video.setAttribute("referrerpolicy", "no-referrer");

  const isBilibili = /bilibili|bilivideo/i.test(videoUrl);
  const isRedNote = /xiaohongshu|rednote|xhscdn/i.test(videoUrl);
  const isPixiv =
    /pixiv|ugoira/i.test(videoUrl) ||
    (dl.type || "").toLowerCase().includes("ugoira");
  const needsBypass = (isBilibili || isDouyin || isRedNote || isPixiv) && !isLocal;

  const removeFallbackImg = () => {
    const fallbackImg = playerContainer.querySelector(".fallback-img");
    if (fallbackImg) fallbackImg.remove();
  };
  const removeLoading = () => {
    playerContainer.classList.remove("astrostar-loading");
    removeFallbackImg();
  };

  const tauriInvoke =
    window.__TAURI__?.core?.invoke ||
    window.__TAURI_INTERNALS__?.invoke ||
    window.__TAURI__?.invoke;
  const tauriConvertFileSrc =
    window.__TAURI__?.core?.convertFileSrc ||
    window.__TAURI_INTERNALS__?.convertFileSrc ||
    window.__TAURI__?.convertFileSrc;

  if (isLocal && (isNativePlatform || tauriConvertFileSrc || tauriInvoke)) {
    playerContainer.classList.add("astrostar-loading");
    let cleanPath = dl.rawUri || videoUrl || dl.rawPath || "";

    if (cleanPath.startsWith("content://")) {
      const capSrc = window.Capacitor?.convertFileSrc
        ? window.Capacitor.convertFileSrc(cleanPath)
        : cleanPath;
      video.src = capSrc;
      removeLoading();
      return playerContainer;
    }
    if (cleanPath.includes("_capacitor_file_")) {
      cleanPath = cleanPath.substring(cleanPath.indexOf("_capacitor_file_") + 16);
    }
    if (cleanPath.startsWith("file://")) {
      cleanPath = cleanPath.replace(/^file:\/\//, "");
    }

    if (isNativePlatform) {
      let rawFileUrl;
      if (cleanPath.startsWith("/")) {
        rawFileUrl = "file://" + cleanPath;
      } else {
        const platform = window.Capacitor?.getPlatform?.();
        if (platform === "android") {
          rawFileUrl = "file:///storage/emulated/0/" + cleanPath.replace(/^\//, "");
        } else {
          rawFileUrl = dl.rawUri || ("file:///" + cleanPath.replace(/^\//, ""));
        }
      }
      video.src = window.Capacitor.convertFileSrc(rawFileUrl);
      removeLoading();
    } else if (tauriConvertFileSrc) {
      video.src = tauriConvertFileSrc(cleanPath);
      removeLoading();
    }
  }

  if (needsBypass) {
    playerContainer.classList.add("astrostar-loading");
    let referer = "https://www.google.com/";
    let ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1";

    if (isBilibili) {
      referer = videoUrl.includes("bilibili.tv") ? "https://www.bilibili.tv/" : "https://www.bilibili.com/";
      ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36";
    } else if (isDouyin) referer = "https://www.douyin.com/";
    else if (isRedNote) referer = "https://www.xiaohongshu.com/";
    else if (isPixiv) {
      referer = "https://www.pixiv.net/";
      ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
    }

    if (isNativePlatform && CapacitorHttp) {
      CapacitorHttp.get({
        url: videoUrl,
        responseType: "blob",
        headers: { Referer: referer, "User-Agent": ua, Range: "bytes=0-3145728" },
      })
        .then((res) => {
          if (res.status >= 200 && res.status < 300 && res.data instanceof Blob) {
            const fileUrl = URL.createObjectURL(res.data);
            playerContainer._blobUrl = fileUrl;
            video.src = fileUrl;
          } else {
            throw new Error(`Invalid response (Status ${res.status})`);
          }
        })
        .catch(() => { video.src = videoUrl; });
    } else {
      video.src = videoUrl;
    }
  } else if (!isLocal) {
    video.src = videoUrl;
  }

  const loopSetting = localStorage.getItem("astrostar_loop") !== "false";
  video.loop = loopSetting;
  video.preload = index === 0 ? "auto" : "metadata";
  const autoPlaySetting = localStorage.getItem("astrostar_autoplay") !== "false";
  video.autoplay = index === 0 && autoPlaySetting;
  video.playsInline = true;
  video.setAttribute("playsinline", "true");
  video.setAttribute("webkit-playsinline", "true");

  let posterThumb = dl.thumbnail || resultThumbnail || "";
  const isIndownPoster = posterThumb.includes("indown.io") && !posterThumb.includes("url=") && !posterThumb.includes("token=");
  const isLocalPoster = posterThumb.startsWith("data:") || posterThumb.startsWith("blob:") || posterThumb.includes("_capacitor_file_") || posterThumb.startsWith("file://");
  if (posterThumb && (posterThumb.includes("logo") || posterThumb.includes("placeholder") || posterThumb.includes("images/") || isIndownPoster || (!navigator.onLine && !isLocalPoster))) posterThumb = "";
  if (posterThumb) video.poster = posterThumb;

  playerContainer.classList.add("astrostar-loading");
  video.onwaiting = () => playerContainer.classList.add("astrostar-loading");
  video.onplaying = removeLoading;
  video.oncanplay = removeLoading;
  video.onloadeddata = removeLoading;
  video.onloadedmetadata = removeLoading;
  video.onstalled = removeLoading;
  video.onpause = removeLoading;

  video.onerror = () => {
    removeLoading();
    if (bigPlay && bigPlay.parentNode) bigPlay.remove();
    const ctrlEl = playerContainer.querySelector(".astrostar-player-controls");
    if (ctrlEl) ctrlEl.remove();
    playerContainer.dispatchEvent(new CustomEvent("astrostar_media_load_error", { bubbles: true }));
  };

  playerContainer.appendChild(video);

  const bigPlay = document.createElement("div");
  bigPlay.className = "astrostar-player-big-play visible";
  bigPlay.style.cursor = "pointer";
  bigPlay.innerHTML = `<svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
  playerContainer.appendChild(bigPlay);

  const controls = document.createElement("div");
  controls.className = "astrostar-player-controls";
  controls.innerHTML = `
    <div class="astrostar-player-progress">
      <div class="astrostar-player-progress-inner"></div>
    </div>
    <div class="astrostar-player-bottom">
      <div class="astrostar-player-actions">
        <button class="astrostar-player-btn play-toggle">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" class="play-icon"><path d="M8 5v14l11-7z"/></svg>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" class="pause-icon hidden"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
        </button>
        <span class="astrostar-player-time">0:00 / 0:00</span>
      </div>
      <div class="astrostar-player-actions">
        <button class="astrostar-player-btn mute-toggle">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" class="unmute-icon"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" class="mute-icon hidden"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.58.45-1.24.8-1.95.99v2.06c1.26-.26 2.4-.83 3.37-1.62l3.06 3.06L21 21.73l-16.73-16.73zM12 4L9.91 6.09 12 8.18V4z"/></svg>
        </button>
        <button class="astrostar-player-btn fullscreen-btn">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
        </button>
      </div>
    </div>
  `;
  playerContainer.appendChild(controls);

  const playBtn = controls.querySelector(".play-toggle");
  const playIcon = playBtn.querySelector(".play-icon");
  const pauseIcon = playBtn.querySelector(".pause-icon");
  const timeDisplay = controls.querySelector(".astrostar-player-time");
  const prog = controls.querySelector(".astrostar-player-progress");
  const progInner = controls.querySelector(".astrostar-player-progress-inner");
  const muteBtn = controls.querySelector(".mute-toggle");
  const unmuteIcon = muteBtn.querySelector(".unmute-icon");
  const muteIcon = muteBtn.querySelector(".mute-icon");

  const formatTime = (s) => {
    if (!s || isNaN(s)) return "0:00";
    const min = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${min}:${sec < 10 ? "0" : ""}${sec}`;
  };

  const updateProgress = () => {
    const p = (video.currentTime / (video.duration || 1)) * 100;
    progInner.style.width = `${p}%`;
    timeDisplay.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
  };

  video.onplay = () => {
    removeLoading();
    playIcon.classList.add("hidden");
    pauseIcon.classList.remove("hidden");
    bigPlay.classList.remove("visible");
  };

  video.onpause = () => {
    playIcon.classList.remove("hidden");
    pauseIcon.classList.add("hidden");
    bigPlay.classList.add("visible");
  };

  const togglePlay = (e) => {
    if (e) e.stopPropagation();
    if (video.paused) {
      video.loop = localStorage.getItem("astrostar_loop") !== "false";
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  };

  bigPlay.onclick = togglePlay;
  playBtn.onclick = togglePlay;
  video.onclick = togglePlay;

  video.ontimeupdate = updateProgress;
  video.onloadedmetadata = () => {
    updateProgress();
    playerContainer.style.aspectRatio = "auto";
  };

  muteBtn.onclick = (e) => {
    e.stopPropagation();
    video.muted = !video.muted;
    unmuteIcon.classList.toggle("hidden", video.muted);
    muteIcon.classList.toggle("hidden", !video.muted);
  };

  const seekToPos = (clientX) => {
    const rect = prog.getBoundingClientRect();
    let pos = (clientX - rect.left) / rect.width;
    pos = Math.max(0, Math.min(1, pos));
    video.currentTime = pos * (video.duration || 0);
  };

  let isDragging = false;
  const startDrag = (e) => { isDragging = true; seekToPos(e.clientX || e.touches[0].clientX); };
  const doDrag = (e) => { if (isDragging) seekToPos(e.clientX || e.touches[0].clientX); };
  const stopDrag = () => { isDragging = false; };

  prog.addEventListener("mousedown", startDrag);
  window.addEventListener("mousemove", doDrag);
  window.addEventListener("mouseup", stopDrag);
  prog.addEventListener("touchstart", (e) => { e.stopPropagation(); startDrag(e); }, { passive: false });
  window.addEventListener("touchmove", (e) => { if (isDragging) { e.preventDefault(); doDrag(e); } }, { passive: false });
  window.addEventListener("touchend", stopDrag);

  playerContainer._cleanup = () => {
    window.removeEventListener("mousemove", doDrag);
    window.removeEventListener("mouseup", stopDrag);
    window.removeEventListener("touchmove", doDrag);
    window.removeEventListener("touchend", stopDrag);
    if (playerContainer._blobUrl) URL.revokeObjectURL(playerContainer._blobUrl);
  };

  return playerContainer;
}

// ============================================================
// 🎵 NATIVE AUDIO PLAYER (Spotify-like: background + notification + drawer)
// The native Android MediaPlayer plays the audio; WebView is just the UI.
// ============================================================
function createNativeAudioPlayer(playerContainer, dl, index, videoUrl, resultThumbnail) {
  const title = dl.title || "AstroStar Media";
  const artist = dl.author || "AstroStar";
  const artwork = dl.thumbnail || resultThumbnail || "";

  playerContainer.style.cssText =
    "background:rgba(18,18,18,0.97);display:flex;flex-direction:column;padding:20px;gap:14px;border-radius:18px;min-height:240px;align-items:center;justify-content:center;";

  playerContainer.innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;width:100%;">
      ${artwork ? `<img src="${artwork}" style="width:80px;height:80px;border-radius:12px;object-fit:cover;flex-shrink:0;" referrerpolicy="no-referrer" onerror="this.style.display='none'">` : ""}
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700;font-size:15px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${title}</div>
        <div style="font-size:12px;color:#aaa;margin-top:4px;">${artist}</div>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:10px;width:100%;margin-top:12px;">
      <span class="nsp-current" style="font-size:11px;color:#aaa;min-width:34px;">0:00</span>
      <div class="nsp-progress-bar" style="flex:1;height:4px;background:rgba(255,255,255,0.15);border-radius:4px;overflow:hidden;position:relative;cursor:pointer;">
        <div class="nsp-progress" style="height:100%;width:0%;background:#fff;border-radius:4px;transition:width 0.25s linear;"></div>
      </div>
      <span class="nsp-duration" style="font-size:11px;color:#aaa;min-width:34px;text-align:right;">0:00</span>
    </div>
    <div style="display:flex;align-items:center;justify-content:center;gap:32px;margin-top:14px;">
      <button class="nsp-prev" style="background:none;border:none;color:#fff;font-size:26px;cursor:pointer;padding:8px;">⏮</button>
      <button class="nsp-play" style="background:none;border:none;color:#fff;font-size:36px;cursor:pointer;padding:8px;">▶️</button>
      <button class="nsp-next" style="background:none;border:none;color:#fff;font-size:26px;cursor:pointer;padding:8px;">⏭</button>
    </div>
    <div style="font-size:11px;color:#666;margin-top:8px;text-align:center;">🎵 Playing in background — check your notification drawer</div>
  `;

  const playBtn = playerContainer.querySelector(".nsp-play");
  const progressBar = playerContainer.querySelector(".nsp-progress-bar");
  const progressEl = playerContainer.querySelector(".nsp-progress");
  const currentEl = playerContainer.querySelector(".nsp-current");
  const durationEl = playerContainer.querySelector(".nsp-duration");

  let isPlaying = false;
  let durationMs = 0;
  let progressTimer = null;

  const fmt = (s) => {
    if (!s || isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec < 10 ? "0" : ""}${sec}`;
  };

  // Load and start playback natively
  try {
    window.AstroStarMainBridge.loadMedia(videoUrl, title, artist, artwork);
    isPlaying = true;
    playBtn.textContent = "⏸️";
  } catch (e) {
    console.warn("NativeMedia load failed:", e);
  }

  // Native → JS progress callback
  window.astroStarMediaProgress = (posMs, durMs) => {
    durationMs = durMs;
    if (durMs > 0) {
      progressEl.style.width = `${Math.min(100, (posMs / durMs) * 100)}%`;
    }
    currentEl.textContent = fmt(posMs / 1000);
    durationEl.textContent = fmt(durMs / 1000);
  };

  // Native → JS state callback
  window.astroStarMediaState = (state) => {
    if (!state) return;
    isPlaying = !!state.isPlaying;
    durationMs = state.duration || durationMs;
    playBtn.textContent = isPlaying ? "⏸️" : "▶️";
    durationEl.textContent = fmt(durationMs / 1000);
  };

  playBtn.addEventListener("click", () => {
    try {
      if (isPlaying) {
        window.AstroStarMainBridge.pauseMedia();
        isPlaying = false;
        playBtn.textContent = "▶️";
      } else {
        window.AstroStarMainBridge.playMedia();
        isPlaying = true;
        playBtn.textContent = "⏸️";
      }
    } catch (e) { console.warn(e); }
  });

  // Seek by tapping progress bar
  progressBar.addEventListener("click", (e) => {
    const rect = progressBar.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const seekMs = Math.round(pos * durationMs);
    try {
      window.AstroStarMainBridge.seekMedia(seekMs);
    } catch (_) {}
  });

  playerContainer.querySelector(".nsp-prev").addEventListener("click", () => {
    try { window.AstroStarMainBridge.seekMedia(0); } catch (_) {}
  });

  playerContainer.querySelector(".nsp-next").addEventListener("click", () => {
    try { window.AstroStarMainBridge.stopMedia(); } catch (_) {}
  });

  playerContainer._cleanup = () => {
    if (progressTimer) clearInterval(progressTimer);
    window.astroStarMediaProgress = null;
    window.astroStarMediaState = null;
    try { window.AstroStarMainBridge.stopMedia(); } catch (_) {}
  };

  return playerContainer;
}
