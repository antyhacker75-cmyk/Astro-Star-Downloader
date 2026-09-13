// settings.js — settings UI: theme, toggles, selects, paths, language
import { translations } from "../i18n/index.js";
import {
  CapacitorHttp,
  Filesystem,
  releaseWakeLock,
  requestWakeLock,
  setUtilsState,
  showToast,
  triggerHaptic,
} from "../utils/index.js";
import { setUIState, renderHistory } from "../ui.js";
import { showConfirm } from "./modals.js";
import { onHistoryItemClick, onHistoryDeleteClick } from "./history.js";
import {
  APP_VERSION,
  autoClearHistoryToggle,
  autoClearToggle,
  clearCacheBtn,
  wipeDataBtn,
  reportBugBtn,
  platformVal,
  autoDownloadToggle,
  autoLoopToggle,
  autoPasteToggle,
  autoPlayToggle,
  changeMusicPathBtn,
  changePathBtn,
  currentLang,
  setCurrentLang,
  currentLangDisplay,
  darkModeToggle,
  dataSaverToggle,
  incognitoToggle,
  musicPathVal,
  okConfirmBtn,
  openExternalUrl,
  pathVal,
  wifiOnlyToggle,
} from "./core.js";

// ============================================================
// SYNC TO NATIVE
// ============================================================
export function syncSettingToNative(key, val) {
  if (window.AstroStarMainBridge?.saveSetting) {
    try { window.AstroStarMainBridge.saveSetting(key, String(val)); }
    catch (e) { console.error("syncSettingToNative error", e); }
  }
}

export function syncAllSettingsToNative() {
  const keys = [
    "astrostar_lang", "astrostar_theme", "astrostar_font",
    "astrostar_prefer_server", "astrostar_download_path",
    "astrostar_auto_folder", "astrostar_filename",
    "astrostar_incognito", "astrostar_auto_download", "astrostar_wifi_only",
  ];
  keys.forEach((key) => {
    const val = localStorage.getItem(key);
    if (val !== null) syncSettingToNative(key, val);
  });
}

// ============================================================
// THEME
// ============================================================
const savedTheme = localStorage.getItem("astrostar_theme") || "light";
document.documentElement.setAttribute("data-theme", savedTheme);
if (darkModeToggle) darkModeToggle.checked = savedTheme === "dark";

darkModeToggle?.addEventListener("change", (e) => {
  const theme = e.target.checked ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("astrostar_theme", theme);
  syncSettingToNative("astrostar_theme", theme);
  applyColorAccent();
  const lang = translations[currentLang] || translations.en;
  showToast(e.target.checked
    ? lang["toast-darkmode-on"] || "Dark mode enabled"
    : lang["toast-darkmode-off"] || "Light mode enabled");
});

// ============================================================
// COLOR ACCENT
// ============================================================
const accentColors = { black: { light: "#1a1917", dark: "#fffbf2" } };

export function applyColorAccent() {
  const theme = localStorage.getItem("astrostar_theme") || "light";
  const color = accentColors.black[theme] || "#1a1917";
  document.documentElement.style.setProperty("--primary", color);
}
applyColorAccent();

// ============================================================
// GLASSMORPHISM + CORNER (NEW)
// ============================================================
export function applyGlassmorphism() {
  if (!document.body) return;
  const mode = localStorage.getItem("astrostar_glassmorphism") || "subtle";
  document.body.classList.remove("glass-off", "glass-subtle", "glass-deep");
  document.body.classList.add(`glass-${mode}`);
}

export function applyUiCorner() {
  if (!document.body) return;
  const corner = localStorage.getItem("astrostar_ui_corner") || "modern";
  document.body.classList.remove("corner-sharp", "corner-modern", "corner-round");
  document.body.classList.add(`corner-${corner}`);
}

// Apply on load
applyGlassmorphism();
applyUiCorner();

// ============================================================
// INCOGNITO
// ============================================================
const isIncognito = localStorage.getItem("astrostar_incognito") === "true";
if (incognitoToggle) {
  incognitoToggle.checked = isIncognito;
  incognitoToggle.addEventListener("change", (e) => {
    localStorage.setItem("astrostar_incognito", e.target.checked);
    const lang = translations[currentLang];
    showToast(e.target.checked ? lang["toast-incognito-on"] : lang["toast-incognito-off"]);
  });
}

// ============================================================
// DATA SAVER + AUTO PASTE
// ============================================================
const isDataSaver = localStorage.getItem("astrostar_data_saver") === "true";
if (autoPasteToggle) {
  autoPasteToggle.checked = localStorage.getItem("astrostar_auto_paste") !== "false";
  autoPasteToggle.addEventListener("change", (e) => {
    localStorage.setItem("astrostar_auto_paste", e.target.checked);
    const lang = translations[currentLang] || translations.en;
    showToast(e.target.checked
      ? lang["toast-autopaste-on"] || "Auto-paste enabled"
      : lang["toast-autopaste-off"] || "Auto-paste disabled");
  });
}
if (dataSaverToggle) {
  dataSaverToggle.checked = isDataSaver;
  dataSaverToggle.addEventListener("change", (e) => {
    localStorage.setItem("astrostar_data_saver", e.target.checked);
    const lang = translations[currentLang];
    showToast(e.target.checked ? lang["toast-datasaver-on"] : lang["toast-datasaver-off"]);
    renderHistory(onHistoryItemClick, onHistoryDeleteClick);
  });
}
if (autoClearHistoryToggle) {
  autoClearHistoryToggle.checked =
    localStorage.getItem("astrostar_autoclear_history") === "true";
  autoClearHistoryToggle.addEventListener("change", (e) => {
    localStorage.setItem("astrostar_autoclear_history", e.target.checked);
    const lang = translations[currentLang];
    showToast(e.target.checked
      ? lang["toast-autoclear-history-on"]
      : lang["toast-autoclear-history-off"]);
  });
}

// ============================================================
// HIDE HAPTIC ON NON-NATIVE
// ============================================================
const isNativePlatform = window.Capacitor?.isNativePlatform?.();
if (!isNativePlatform) {
  const hapticToggle = document.getElementById("hapticToggle");
  const hapticItem = hapticToggle?.closest(".settings-item");
  if (hapticItem) hapticItem.style.display = "none";
}

// ============================================================
// WI-FI ONLY / AUTO DOWNLOAD
// ============================================================
if (wifiOnlyToggle) {
  wifiOnlyToggle.checked = localStorage.getItem("astrostar_wifi_only") === "true";
  wifiOnlyToggle.addEventListener("change", (e) => {
    localStorage.setItem("astrostar_wifi_only", e.target.checked);
    const lang = translations[currentLang];
    showToast(e.target.checked ? lang["toast-wifi-on"] : lang["toast-wifi-off"]);
  });
}
if (autoDownloadToggle) {
  autoDownloadToggle.checked =
    localStorage.getItem("astrostar_auto_download") === "true";
  autoDownloadToggle.addEventListener("change", (e) => {
    localStorage.setItem("astrostar_auto_download", e.target.checked);
    const lang = translations[currentLang];
    showToast(e.target.checked
      ? lang["toast-autodownload-on"]
      : lang["toast-autodownload-off"]);
  });
}

// ============================================================
// CUSTOM SELECT HANDLER
// ============================================================
function setupCustomSelect(selectId, storageKey, textId, menuId) {
  const select = document.getElementById(selectId);
  const text = document.getElementById(textId);
  const menu = document.getElementById(menuId);
  if (!select || !text || !menu) return;

  const defaultsMap = {
    astrostar_prefer_server: "ask",
    astrostar_font: "display",
    astrostar_anim_speed: "normal",
    astrostar_text_size: "medium",
    astrostar_concurrent: "1",
    astrostar_overwrite: "rename",
    astrostar_max_retry: "3",
    astrostar_doh: "off",
    astrostar_toast_dur: "3",
    astrostar_glassmorphism: "subtle",
    astrostar_ui_corner: "modern",
    astrostar_sound_pack: "default",
  };
  const defaultFallback = defaultsMap[storageKey] || "default";
  const currentVal = localStorage.getItem(storageKey) || defaultFallback;

  const item = menu.querySelector(`[data-value="${currentVal}"]`)
    || menu.querySelector(".dropdown-item");
  if (item) text.textContent = item.textContent;

  select.addEventListener("click", (e) => {
    e.stopPropagation();
    document.querySelectorAll(".dropdown-menu").forEach((m) => {
      if (m !== menu) m.classList.add("hidden");
    });
    menu.classList.toggle("hidden");
    if (!menu.classList.contains("hidden")) {
      menu.classList.remove("open-up");
      const rect = menu.getBoundingClientRect();
      if (rect.bottom > window.innerHeight - 20) menu.classList.add("open-up");
    } else {
      menu.classList.remove("open-up");
    }
  });

  menu.querySelectorAll(".dropdown-item").forEach((it) => {
    it.addEventListener("click", () => {
      const val = it.getAttribute("data-value");
      localStorage.setItem(storageKey, val);
      syncSettingToNative(storageKey, val);
      text.textContent = it.textContent;
      menu.classList.add("hidden");
      menu.classList.remove("open-up");

      if (storageKey === "astrostar_accent") applyColorAccent();
      if (storageKey === "astrostar_font") applyFont();
      if (storageKey === "astrostar_lang") switchLanguage(val);
      if (storageKey === "astrostar_anim_speed") applyAnimSpeed();
      if (storageKey === "astrostar_text_size") applyTextSize();
      if (storageKey === "astrostar_glassmorphism") applyGlassmorphism();
      if (storageKey === "astrostar_ui_corner") applyUiCorner();

      const labelText = select.closest(".settings-item")
        ?.querySelector(".settings-title span")?.textContent || "Setting";
      showToast(`${labelText}: ${it.textContent.trim()}`);
    });
  });
}

// Register all dropdowns
setupCustomSelect("languageSelect", "astrostar_lang", "currentLangDisplay", "languageMenu");
setupCustomSelect("filenameSelect", "astrostar_filename", "filenameText", "filenameMenu");
setupCustomSelect("fontSelect", "astrostar_font", "fontText", "fontMenu");
setupCustomSelect("historyLimitSelect", "astrostar_history_limit", "historyLimitText", "historyLimitMenu");
setupCustomSelect("autoClearDaysSelect", "astrostar_auto_clear_days", "autoClearDaysText", "autoClearDaysMenu");
setupCustomSelect("autoClearCacheDaysSelect", "astrostar_auto_clear_cache_days", "autoClearCacheDaysText", "autoClearCacheDaysMenu");
setupCustomSelect("preferServerSelect", "astrostar_prefer_server", "preferServerText", "preferServerMenu");
setupCustomSelect("batchPhotoModeSelect", "astrostar_batch_photo_mode", "batchPhotoModeText", "batchPhotoModeMenu");
setupCustomSelect("userAgentSelect", "astrostar_user_agent", "userAgentText", "userAgentMenu");
setupCustomSelect("requestTimeoutSelect", "astrostar_request_timeout", "requestTimeoutText", "requestTimeoutMenu");
setupCustomSelect("animSpeedSelect", "astrostar_anim_speed", "animSpeedText", "animSpeedMenu");
setupCustomSelect("textSizeSelect", "astrostar_text_size", "textSizeText", "textSizeMenu");
setupCustomSelect("concurrentSelect", "astrostar_concurrent", "concurrentText", "concurrentMenu");
setupCustomSelect("overwriteSelect", "astrostar_overwrite", "overwriteText", "overwriteMenu");
setupCustomSelect("maxRetrySelect", "astrostar_max_retry", "maxRetryText", "maxRetryMenu");
setupCustomSelect("dohSelect", "astrostar_doh", "dohText", "dohMenu");
setupCustomSelect("toastDurSelect", "astrostar_toast_dur", "toastDurText", "toastDurMenu");
// NEW:
setupCustomSelect("glassmorphismSelect", "astrostar_glassmorphism", "glassmorphismText", "glassmorphismMenu");
setupCustomSelect("uiCornerSelect", "astrostar_ui_corner", "uiCornerText", "uiCornerMenu");
setupCustomSelect("soundPackSelect", "astrostar_sound_pack", "soundPackText", "soundPackMenu");

// ============================================================
// HIDE PROGRESS BAR
// ============================================================
const hideProgressToggle = document.getElementById("hideProgressToggle");
if (hideProgressToggle) {
  hideProgressToggle.checked = localStorage.getItem("astrostar_hide_progress") === "true";
  hideProgressToggle.addEventListener("change", (e) => {
    localStorage.setItem("astrostar_hide_progress", e.target.checked);
    const lang = translations[currentLang] || translations.en;
    showToast(e.target.checked
      ? lang["toast-hide-progress-on"] || "Download progress bar hidden"
      : lang["toast-hide-progress-off"] || "Download progress bar shown");
  });
}

// ============================================================
// DOWNLOAD STATS
// ============================================================
export function updateDlStatsDisplay() {
  const el = document.getElementById("historyDlStatsVal");
  if (!el) return;
  const history = JSON.parse(localStorage.getItem("astrostar_history") || "[]");
  const storedCount = parseInt(localStorage.getItem("astrostar_dl_count") || "0", 10);
  const count = Math.max(storedCount, history.length);
  el.textContent = count.toLocaleString();
}
updateDlStatsDisplay();
window.addEventListener("astrostar_file_saved", () => {
  const history = JSON.parse(localStorage.getItem("astrostar_history") || "[]");
  const storedCount = parseInt(localStorage.getItem("astrostar_dl_count") || "0", 10);
  const newCount = Math.max(storedCount, history.length) + 1;
  localStorage.setItem("astrostar_dl_count", newCount);
  updateDlStatsDisplay();
});

// ============================================================
// RESET SETTINGS
// ============================================================
const resetSettingsBtn = document.getElementById("resetSettingsBtn");
if (resetSettingsBtn) {
  resetSettingsBtn.addEventListener("click", () => {
    const lang = translations[currentLang] || translations.en;
    showConfirm(
      lang["label-reset-settings"] || "Reset Settings",
      lang["confirm-reset-settings"] || "Reset all settings to their defaults?",
      () => {
        const preserve = ["astrostar_history", "astrostar_dl_count", "astrostar_incognito"];
        const preserved = {};
        preserve.forEach((k) => {
          const v = localStorage.getItem(k);
          if (v !== null) preserved[k] = v;
        });
        Object.keys(localStorage)
          .filter((k) => k.startsWith("astrostar_"))
          .forEach((k) => localStorage.removeItem(k));
        Object.entries(preserved).forEach(([k, v]) => localStorage.setItem(k, v));
        showToast(lang["toast-reset-settings"] || "Settings reset to default");
        setTimeout(() => location.reload(), 800);
      }
    );
  });
}

// ============================================================
// ANIMATION SPEED / TEXT SIZE / FONT / COMPACT
// ============================================================
export function applyAnimSpeed() {
  if (!document.body) return;
  const speed = localStorage.getItem("astrostar_anim_speed") || "normal";
  document.body.classList.remove("anim-off", "anim-slow", "anim-normal", "anim-fast");
  document.body.classList.add(`anim-${speed}`);
}
applyAnimSpeed();

export function applyTextSize() {
  const size = localStorage.getItem("astrostar_text_size") || "medium";
  const fontSizeMap = { small: "14px", medium: "16px", large: "18px" };
  document.documentElement.style.fontSize = fontSizeMap[size] || "16px";
  document.body.classList.remove("text-small", "text-medium", "text-large");
  document.body.classList.add(`text-${size}`);
}
applyTextSize();

const compactModeToggle = document.getElementById("compactModeToggle");
if (compactModeToggle) {
  compactModeToggle.checked = localStorage.getItem("astrostar_compact_mode") === "true";
  if (compactModeToggle.checked) document.body.classList.add("compact-mode");
  compactModeToggle.addEventListener("change", (e) => {
    localStorage.setItem("astrostar_compact_mode", e.target.checked);
    document.body.classList.toggle("compact-mode", e.target.checked);
    const lang = translations[currentLang] || translations.en;
    showToast(e.target.checked
      ? lang["toast-compact-on"] || "Compact mode enabled"
      : lang["toast-compact-off"] || "Compact mode disabled");
  });
}

const autoAnalyzeToggle = document.getElementById("autoAnalyzeToggle");
if (autoAnalyzeToggle) {
  autoAnalyzeToggle.checked = localStorage.getItem("astrostar_auto_analyze") === "true";
  autoAnalyzeToggle.addEventListener("change", (e) => {
    localStorage.setItem("astrostar_auto_analyze", e.target.checked);
    const lang = translations[currentLang] || translations.en;
    showToast(e.target.checked
      ? lang["toast-autoanalyze-on"] || "Auto-analyze enabled"
      : lang["toast-autoanalyze-off"] || "Auto-analyze disabled");
  });
}

const autoClearInputToggle = document.getElementById("autoClearInputToggle");
if (autoClearInputToggle) {
  autoClearInputToggle.checked = localStorage.getItem("astrostar_auto_clear_input") === "true";
  autoClearInputToggle.addEventListener("change", (e) => {
    localStorage.setItem("astrostar_auto_clear_input", e.target.checked);
    const lang = translations[currentLang] || translations.en;
    showToast(e.target.checked
      ? lang["toast-autoclearinput-on"] || "Auto-clear input enabled"
      : lang["toast-autoclearinput-off"] || "Auto-clear input disabled");
  });
}

// ============================================================
// COMPLETION SOUND + SOUND PACK (NEW)
// ============================================================
const downloadSoundToggle = document.getElementById("downloadSoundToggle");
const soundPackItem = document.getElementById("soundPackItem");
const updateSoundPackVisibility = () => {
  if (!soundPackItem) return;
  const isSoundEnabled = localStorage.getItem("astrostar_download_sound") !== "false";
  soundPackItem.classList.toggle("hidden-by-toggle", !isSoundEnabled);
};
updateSoundPackVisibility();

if (downloadSoundToggle) {
  downloadSoundToggle.checked = localStorage.getItem("astrostar_download_sound") !== "false";
  downloadSoundToggle.addEventListener("change", (e) => {
    localStorage.setItem("astrostar_download_sound", e.target.checked);
    updateSoundPackVisibility();
    const lang = translations[currentLang] || translations.en;
    showToast(e.target.checked
      ? lang["toast-sound-on"] || "Completion sound enabled"
      : lang["toast-sound-off"] || "Completion sound disabled");
  });
}

// ============================================================
// OTHER TOGGLES
// ============================================================
const autoRetryToggle = document.getElementById("autoRetryToggle");
if (autoRetryToggle) {
  autoRetryToggle.checked = localStorage.getItem("astrostar_auto_retry") !== "false";
  autoRetryToggle.addEventListener("change", (e) => {
    localStorage.setItem("astrostar_auto_retry", e.target.checked);
    const lang = translations[currentLang] || translations.en;
    showToast(e.target.checked
      ? lang["toast-autoretry-on"] || "Auto-retry engine enabled"
      : lang["toast-autoretry-off"] || "Auto-retry engine disabled");
  });
}

const hapticToggle = document.getElementById("hapticToggle");
if (hapticToggle) {
  hapticToggle.checked = localStorage.getItem("astrostar_haptic") === "true";
  hapticToggle.addEventListener("change", (e) => {
    localStorage.setItem("astrostar_haptic", e.target.checked);
    const lang = translations[currentLang] || translations.en;
    showToast(e.target.checked
      ? lang["toast-haptic-on"] || "Haptic vibration enabled"
      : lang["toast-haptic-off"] || "Haptic vibration disabled");
  });
}

const autoFolderToggle = document.getElementById("autoFolderToggle");
if (autoFolderToggle) {
  autoFolderToggle.checked = localStorage.getItem("astrostar_auto_folder") !== "false";
  autoFolderToggle.addEventListener("change", (e) => {
    localStorage.setItem("astrostar_auto_folder", e.target.checked);
    const lang = translations[currentLang] || translations.en;
    showToast(e.target.checked
      ? lang["toast-autofolder-on"] || "Platform subfolders enabled"
      : lang["toast-autofolder-off"] || "Platform subfolders disabled");
  });
}

const keepAwakeToggle = document.getElementById("keepAwakeToggle");
if (keepAwakeToggle) {
  keepAwakeToggle.checked = localStorage.getItem("astrostar_keep_awake") === "true";
  keepAwakeToggle.addEventListener("change", (e) => {
    localStorage.setItem("astrostar_keep_awake", e.target.checked);
    if (e.target.checked) requestWakeLock();
    else releaseWakeLock();
    const lang = translations[currentLang] || translations.en;
    showToast(e.target.checked
      ? lang["toast-keepawake-on"] || "Keep screen awake enabled"
      : lang["toast-keepawake-off"] || "Keep screen awake disabled");
  });
}

const autoUpdateToggle = document.getElementById("autoUpdateToggle");
if (autoUpdateToggle) {
  autoUpdateToggle.checked = localStorage.getItem("astrostar_auto_update") !== "false";
  autoUpdateToggle.addEventListener("change", (e) => {
    localStorage.setItem("astrostar_auto_update", e.target.checked);
    const lang = translations[currentLang] || translations.en;
    showToast(e.target.checked
      ? lang["toast-autoupdate-on"] || "Auto check updates enabled"
      : lang["toast-autoupdate-off"] || "Auto check updates disabled");
  });
}

const forceIpv4Toggle = document.getElementById("forceIpv4Toggle");
if (forceIpv4Toggle) {
  forceIpv4Toggle.checked = localStorage.getItem("astrostar_force_ipv4") === "true";
  forceIpv4Toggle.addEventListener("change", (e) => {
    localStorage.setItem("astrostar_force_ipv4", e.target.checked);
    const lang = translations[currentLang] || translations.en;
    showToast(e.target.checked
      ? lang["toast-forceipv4-on"] || "Force IPv4 enabled"
      : lang["toast-forceipv4-off"] || "Force IPv4 disabled");
  });
}

const headerSpoofingToggle = document.getElementById("headerSpoofingToggle");
if (headerSpoofingToggle) {
  headerSpoofingToggle.checked = localStorage.getItem("astrostar_header_spoofing") !== "false";
  headerSpoofingToggle.addEventListener("change", (e) => {
    localStorage.setItem("astrostar_header_spoofing", e.target.checked);
    const lang = translations[currentLang] || translations.en;
    showToast(e.target.checked
      ? lang["toast-anti403-on"] || "Anti-403 header guard enabled"
      : lang["toast-anti403-off"] || "Anti-403 header guard disabled");
  });
}

const cellularWarningToggle = document.getElementById("cellularWarningToggle");
if (cellularWarningToggle) {
  cellularWarningToggle.checked = localStorage.getItem("astrostar_cellular_warning") === "true";
  cellularWarningToggle.addEventListener("change", (e) => {
    localStorage.setItem("astrostar_cellular_warning", e.target.checked);
    const lang = translations[currentLang] || translations.en;
    showToast(e.target.checked
      ? lang["toast-cellularwarning-on"] || "Cellular data warning enabled"
      : lang["toast-cellularwarning-off"] || "Cellular data warning disabled");
  });
}

const bypassSslToggle = document.getElementById("bypassSslToggle");
if (bypassSslToggle) {
  bypassSslToggle.checked = localStorage.getItem("astrostar_bypass_ssl") === "true";
  bypassSslToggle.addEventListener("change", (e) => {
    localStorage.setItem("astrostar_bypass_ssl", e.target.checked);
    const lang = translations[currentLang] || translations.en;
    showToast(e.target.checked
      ? lang["toast-bypassssl-on"] || "Bypass SSL errors enabled"
      : lang["toast-bypassssl-off"] || "Bypass SSL errors disabled");
  });
}

// ============================================================
// LATENCY TEST
// ============================================================
const testLatencyBtn = document.getElementById("testLatencyBtn");
if (testLatencyBtn) {
  testLatencyBtn.addEventListener("click", async () => {
    const resultVal = document.getElementById("latencyResultVal");
    if (resultVal) resultVal.textContent = "...";
    showToast("Testing server latency...");
    const start = Date.now();
    try {
      if (CapacitorHttp) {
        await CapacitorHttp.get({
          url: "https://api.github.com/zen",
          headers: { "User-Agent": "AstroStar-App" },
        });
      } else {
        await fetch("https://api.github.com/zen");
      }
      const duration = Date.now() - start;
      if (resultVal) resultVal.textContent = `${duration} ms`;
      showToast(`Server latency: ${duration} ms (Online)`);
    } catch (err) {
      if (resultVal) resultVal.textContent = "Error";
      showToast("Latency check failed. Offline?");
    }
  });
}

// ============================================================
// FONT
// ============================================================
export function applyFont() {
  if (!document.body) return;
  const font = localStorage.getItem("astrostar_font") || "display";
  document.body.className = (document.body.className || "").replace(/\bfont-\S+/g, "");
  document.body.classList.add(`font-${font}`);
}
applyFont();

// ============================================================
// AUTO PLAY / AUTO LOOP
// ============================================================
if (autoPlayToggle) {
  autoPlayToggle.checked = localStorage.getItem("astrostar_autoplay") !== "false";
  autoPlayToggle.addEventListener("change", (e) => {
    localStorage.setItem("astrostar_autoplay", e.target.checked);
    const lang = translations[currentLang] || translations.en;
    showToast(e.target.checked
      ? lang["toast-autoplay-on"] || "Auto-play media enabled"
      : lang["toast-autoplay-off"] || "Auto-play media disabled");
  });
}
if (autoLoopToggle) {
  autoLoopToggle.checked = localStorage.getItem("astrostar_loop") !== "false";
  autoLoopToggle.addEventListener("change", (e) => {
    localStorage.setItem("astrostar_loop", e.target.checked);
    const lang = translations[currentLang] || translations.en;
    showToast(e.target.checked
      ? lang["toast-autoloop-on"] || "Auto-loop video enabled"
      : lang["toast-autoloop-off"] || "Auto-loop video disabled");
  });
}

// ============================================================
// GLOBAL CLICK (close dropdowns + haptic)
// ============================================================
document.addEventListener("click", (e) => {
  document.querySelectorAll(".dropdown-menu").forEach((m) => m.classList.add("hidden"));
  const interactive = e.target.closest(
    "button, .nav-item, .settings-item, .toggle-switch, .dropdown-item, .paste-btn, .clear-btn, .chip"
  );
  if (interactive) triggerHaptic("medium");
});

// ============================================================
// PATH PICKER — VIDEO
// ============================================================
export let customPath = localStorage.getItem("astrostar_download_path") || "AstroStar";
if (pathVal) pathVal.textContent = `/Download/${customPath}`;

changePathBtn?.addEventListener("click", () => {
  const lang = translations[currentLang];
  showConfirm(
    lang["label-path-video"],
    `<div class="path-picker-ui">
       <div class="path-input-wrapper">
         <span class="path-label-sm">${lang["label-subfolder-downloads"]}</span>
         <div class="astrostar-input-with-icon">
           <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
           <input type="text" id="customPathInput" class="astrostar-input-noborder" value="${customPath}" placeholder="e.g. AstroStar">
         </div>
       </div>
       <span class="path-label-sm">${lang["label-path-presets"]}</span>
       <div class="path-presets-container">
         <button class="path-preset-chip" data-path="AstroStar">AstroStar</button>
         <button class="path-preset-chip" data-path="AstroStar/Videos">AstroStar/Videos</button>
       </div>
       <button id="resetPathBtn" class="reset-path-btn">${lang["btn-reset-default"]}</button>
     </div>`,
    () => {
      const input = document.getElementById("customPathInput");
      if (input && input.value.trim()) {
        const newPath = input.value.trim().replace(/[\\:*?"<>|]/g, "");
        customPath = newPath;
        localStorage.setItem("astrostar_download_path", newPath);
        if (pathVal) pathVal.textContent = `/Download/${newPath}`;
        showToast(lang["toast-path-updated"]);
      }
    }
  );
  setTimeout(() => {
    const input = document.getElementById("customPathInput");
    document.querySelectorAll(".path-preset-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        if (input) input.value = chip.getAttribute("data-path");
      });
    });
    document.getElementById("resetPathBtn")?.addEventListener("click", () => {
      if (input) input.value = "AstroStar";
    });
  }, 100);
  okConfirmBtn.textContent = "SAVE";
});

// ============================================================
// PATH PICKER — MUSIC
// ============================================================
export let customMusicPath =
  localStorage.getItem("astrostar_music_path") || "AstroStar/Music";
if (musicPathVal) musicPathVal.textContent = `/Download/${customMusicPath}`;

changeMusicPathBtn?.addEventListener("click", () => {
  const lang = translations[currentLang];
  showConfirm(
    lang["label-path-music"],
    `<div class="path-picker-ui">
       <div class="path-input-wrapper">
         <span class="path-label-sm">${lang["label-subfolder-downloads"]}</span>
         <div class="astrostar-input-with-icon">
           <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
           <input type="text" id="customMusicPathInput" class="astrostar-input-noborder" value="${customMusicPath}" placeholder="e.g. AstroStar/Music">
         </div>
       </div>
       <span class="path-label-sm">${lang["label-path-presets"]}</span>
       <div class="path-presets-container">
         <button class="path-preset-chip" data-path="AstroStar/Music">AstroStar/Music</button>
         <button class="path-preset-chip" data-path="Music">Music</button>
       </div>
       <button id="resetMusicPathBtn" class="reset-path-btn">${lang["btn-reset-default"]}</button>
     </div>`,
    () => {
      const input = document.getElementById("customMusicPathInput");
      if (input && input.value.trim()) {
        const newPath = input.value.trim().replace(/[\\:*?"<>|]/g, "");
        customMusicPath = newPath;
        localStorage.setItem("astrostar_music_path", newPath);
        if (musicPathVal) musicPathVal.textContent = `/Download/${newPath}`;
        showToast(lang["toast-path-updated"]);
      }
    }
  );
  setTimeout(() => {
    const input = document.getElementById("customMusicPathInput");
    document.querySelectorAll(".path-preset-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        if (input) input.value = chip.getAttribute("data-path");
      });
    });
    document.getElementById("resetMusicPathBtn")?.addEventListener("click", () => {
      if (input) input.value = "AstroStar/Music";
    });
  }, 100);
  okConfirmBtn.textContent = "SAVE";
});

// ============================================================
// AUTO CLEAR CACHE
// ============================================================
const isAutoClear = localStorage.getItem("astrostar_auto_clear_cache") === "true";
if (autoClearToggle) {
  autoClearToggle.checked = isAutoClear;
  autoClearToggle.addEventListener("change", (e) => {
    localStorage.setItem("astrostar_auto_clear_cache", e.target.checked);
    const lang = translations[currentLang];
    showToast(e.target.checked
      ? lang["toast-autoclear-cache-on"]
      : lang["toast-autoclear-cache-off"]);
    if (e.target.checked) clearCacheSilently();
  });
}
if (isAutoClear) setTimeout(() => clearCacheSilently(), 2000);

export async function clearCacheSilently() {
  if (!Filesystem) return;
  try {
    const history = JSON.parse(localStorage.getItem("astrostar_history") || "[]");
    const activeThumbs = new Set(
      history.map((item) => item.thumbnail).filter((t) => t && t.startsWith("thumb_"))
    );
    history.forEach((item) => {
      if (item.localThumbnail && item.localThumbnail.startsWith("thumb_")) {
        activeThumbs.add(item.localThumbnail);
      }
    });
    const cacheSize = await getFolderSize("", "CACHE");
    const sizeInMB = cacheSize / (1024 * 1024);
    if (sizeInMB > 50) {
      const files = await Filesystem.readdir({ path: "", directory: "CACHE" });
      let clearedCount = 0;
      for (const file of files.files) {
        const isThumb = file.name.startsWith("thumb_");
        if (!isThumb || !activeThumbs.has(file.name)) {
          try {
            if (file.type === "directory") {
              await Filesystem.rmdir({
                path: file.name, directory: "CACHE", recursive: true,
              });
            } else {
              await Filesystem.deleteFile({ path: file.name, directory: "CACHE" });
            }
            clearedCount++;
          } catch (err) {}
        }
      }
      if (clearedCount > 0) {
        updateStorageInfo();
        console.log(`Auto-cleared ${clearedCount} items from cache.`);
      }
    }
  } catch (e) {
    console.error("Silent cache clear failed:", e);
  }
}

// ============================================================
// CUSTOM SELECTS UI UPDATE
// ============================================================
export function updateCustomSelectsUI() {
  const lang = translations[currentLang] || translations.en;

  const currentFilename = localStorage.getItem("astrostar_filename") || "title";
  const filenameText = document.getElementById("filenameText");
  if (filenameText)
    filenameText.textContent = lang[`filename-${currentFilename}`] || currentFilename;

  const currentUA = localStorage.getItem("astrostar_user_agent") || "default";
  const userAgentText = document.getElementById("userAgentText");
  if (userAgentText)
    userAgentText.textContent = lang[`ua-${currentUA}`] || currentUA;

  const currentTimeout = localStorage.getItem("astrostar_request_timeout") || "30";
  const requestTimeoutText = document.getElementById("requestTimeoutText");
  if (requestTimeoutText)
    requestTimeoutText.textContent = lang[`timeout-${currentTimeout}`] || `${currentTimeout}s`;

  const currentServer = localStorage.getItem("astrostar_prefer_server") || "ask";
  const preferServerText = document.getElementById("preferServerText");
  if (preferServerText)
    preferServerText.textContent = lang[`server-${currentServer}`] || currentServer;

  const currentFont = localStorage.getItem("astrostar_font") || "display";
  const fontText = document.getElementById("fontText");
  if (fontText)
    fontText.textContent = lang[`font-${currentFont}`] ||
      (currentFont === "default" ? lang["font-default"] || "Default" : currentFont);

  const currentLimit = localStorage.getItem("astrostar_history_limit") || "unlimited";
  const historyLimitText = document.getElementById("historyLimitText");
  if (historyLimitText)
    historyLimitText.textContent = lang[`history-${currentLimit}`] || currentLimit;

  const currentClearDays = localStorage.getItem("astrostar_auto_clear_days") || "off";
  const autoClearDaysText = document.getElementById("autoClearDaysText");
  if (autoClearDaysText)
    autoClearDaysText.textContent = lang[`days-${currentClearDays}`] || currentClearDays;

  const currentCacheDays = localStorage.getItem("astrostar_auto_clear_cache_days") || "off";
  const autoClearCacheDaysText = document.getElementById("autoClearCacheDaysText");
  if (autoClearCacheDaysText)
    autoClearCacheDaysText.textContent = lang[`days-${currentCacheDays}`] || currentCacheDays;

  const currentLock = localStorage.getItem("astrostar_lock_type") || "none";
  const lockTypeText = document.getElementById("lockTypeText");
  if (lockTypeText)
    lockTypeText.textContent = lang[`lock-type-${currentLock}`] || currentLock;

  const currentBatchPhoto = localStorage.getItem("astrostar_batch_photo_mode") || "all";
  const batchPhotoModeText = document.getElementById("batchPhotoModeText");
  if (batchPhotoModeText)
    batchPhotoModeText.textContent = lang[`batch-photo-${currentBatchPhoto}`] || currentBatchPhoto;

  const currentAnimSpeed = localStorage.getItem("astrostar_anim_speed") || "normal";
  const animSpeedText = document.getElementById("animSpeedText");
  if (animSpeedText)
    animSpeedText.textContent = lang[`anim-${currentAnimSpeed}`] || currentAnimSpeed;

  const currentTextSize = localStorage.getItem("astrostar_text_size") || "medium";
  const textSizeText = document.getElementById("textSizeText");
  if (textSizeText)
    textSizeText.textContent = lang[`text-${currentTextSize}`] || currentTextSize;

  const currentConcurrent = localStorage.getItem("astrostar_concurrent") || "1";
  const concurrentText = document.getElementById("concurrentText");
  if (concurrentText)
    concurrentText.textContent = lang[`concurrent-${currentConcurrent}`] || currentConcurrent;

  const currentOverwrite = localStorage.getItem("astrostar_overwrite") || "rename";
  const overwriteText = document.getElementById("overwriteText");
  if (overwriteText)
    overwriteText.textContent = lang[`overwrite-${currentOverwrite}`] || currentOverwrite;

  const currentMaxRetry = localStorage.getItem("astrostar_max_retry") || "3";
  const maxRetryText = document.getElementById("maxRetryText");
  if (maxRetryText)
    maxRetryText.textContent = lang[`retry-${currentMaxRetry}`] || `${currentMaxRetry} Attempts`;

  const currentDoh = localStorage.getItem("astrostar_doh") || "off";
  const dohText = document.getElementById("dohText");
  if (dohText) dohText.textContent = lang[`doh-${currentDoh}`] || currentDoh;

  const currentToastDur = localStorage.getItem("astrostar_toast_dur") || "3";
  const toastDurText = document.getElementById("toastDurText");
  if (toastDurText)
    toastDurText.textContent = lang[`toast-dur-${currentToastDur}`] || `${currentToastDur}s`;

  // NEW
  const currentGlass = localStorage.getItem("astrostar_glassmorphism") || "subtle";
  const glassText = document.getElementById("glassmorphismText");
  if (glassText)
    glassText.textContent = lang[`glass-${currentGlass}`] || currentGlass;

  const currentCorner = localStorage.getItem("astrostar_ui_corner") || "modern";
  const cornerText = document.getElementById("uiCornerText");
  if (cornerText)
    cornerText.textContent = lang[`corner-${currentCorner}`] || currentCorner;

  const currentSound = localStorage.getItem("astrostar_sound_pack") || "default";
  const soundText = document.getElementById("soundPackText");
  if (soundText)
    soundText.textContent = lang[`sound-${currentSound}`] || currentSound;

  updateDlStatsDisplay();
}

// ============================================================
// LANGUAGE UI UPDATE
// ============================================================
export function updateLanguageUI() {
  const lang = translations[currentLang];
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (lang[key]) el.textContent = lang[key];
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (lang[key]) el.placeholder = lang[key];
  });
  if (currentLangDisplay) {
    const langNames = {
      en: "English", id: "Indonesia", ja: "日本語", ko: "한국어",
      zh: "中文 (简体)", ar: "العربية", ru: "Русский",
      tl: "Tagalog", hi: "हिन्दी",
    };
    currentLangDisplay.textContent = langNames[currentLang] || "English";
  }
  document.documentElement.lang = currentLang;
  document.documentElement.setAttribute("dir", currentLang === "ar" ? "rtl" : "ltr");
  updateCustomSelectsUI();
  updateGreeting();
  setUtilsState({ currentLang });
}

export function updateGreeting() {}

// Initial calls
checkAutoClearDays();
updateLanguageUI();
updateStorageInfo();

export function checkAutoClearDays() {
  const daysVal = localStorage.getItem("astrostar_auto_clear_days") || "off";
  if (daysVal === "off") return;
  const days = parseInt(daysVal, 10);
  if (isNaN(days) || days <= 0) return;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  let history = JSON.parse(localStorage.getItem("astrostar_history") || "[]");
  const initialCount = history.length;
  const filtered = history.filter((item) => {
    const time = item.timestamp || (item.date ? new Date(item.date).getTime() : 0);
    return time === 0 || time >= cutoff;
  });
  if (filtered.length !== initialCount) {
    localStorage.setItem("astrostar_history", JSON.stringify(filtered));
  }
}

export async function getFolderSize(path, directory) {
  let size = 0;
  try {
    const readdir = await Filesystem.readdir({ path, directory });
    for (const file of readdir.files) {
      const filePath = path ? `${path}/${file.name}` : file.name;
      if (file.type === "file") {
        const stats = await Filesystem.stat({ path: filePath, directory });
        size += stats.size;
      } else if (file.type === "directory") {
        size += await getFolderSize(filePath, directory);
      }
    }
  } catch (e) {}
  return size;
}

export async function updateStorageInfo() {
  const storageVal = document.getElementById("storageSizeVal");
  if (!storageVal) return;
  try {
    let totalSize = 0;
    const tauriInvoke = window.__TAURI__?.core?.invoke
      || window.__TAURI_INTERNALS__?.invoke || window.__TAURI__?.invoke;
    if (tauriInvoke) {
      try {
        const desktopSize = await tauriInvoke("tauri_get_folder_size", { folder: "AstroStar" });
        if (typeof desktopSize === "number") totalSize = desktopSize;
      } catch (err) { console.warn("Tauri folder size error:", err); }
    } else if (Filesystem) {
      totalSize += await getFolderSize("", "CACHE");
      const primary = await getFolderSize("Download/AstroStar", "EXTERNAL_STORAGE");
      const legacy = await getFolderSize("Download/AstroStar", "EXTERNAL");
      totalSize += Math.max(primary, legacy);
    }
    const sizeInMB = (totalSize / (1024 * 1024)).toFixed(2);
    storageVal.textContent = `${sizeInMB} MB`;
  } catch (e) {
    console.error("Storage size error:", e);
    storageVal.textContent = "0.00 MB";
  }
}

export function switchLanguage(lang) {
  setCurrentLang(lang);
  localStorage.setItem("astrostar_lang", lang);
  syncSettingToNative("astrostar_lang", lang);
  setUIState({ currentLang });
  setUtilsState({ currentLang });
  updateLanguageUI();
  updateGreeting();
  renderHistory(onHistoryItemClick, onHistoryDeleteClick);
  let msg = "Language updated";
  if (currentLang === "id") msg = "Bahasa diperbarui";
  else if (currentLang === "ja") msg = "言語を更新しました";
  else if (currentLang === "ko") msg = "언어가 변경되었습니다";
  else if (currentLang === "zh") msg = "语言已更新";
  else if (currentLang === "ar") msg = "تم تحديث اللغة";
  else if (currentLang === "ru") msg = "Язык обновлен";
  else if (currentLang === "tl") msg = "Na-update ang wika";
  else if (currentLang === "hi") msg = "भाषा अपडेट हो गई";
  showToast(msg);
}

// ============================================================
// PLATFORM DETECT
// ============================================================
if (platformVal) {
  const tauriInvoke = window.__TAURI__?.core?.invoke
    || window.__TAURI_INTERNALS__?.invoke || window.__TAURI__?.invoke;
  const isDesktop = !!tauriInvoke && !window.Capacitor?.isNativePlatform?.();
  if (isDesktop) {
    const ua = (navigator.userAgent || "").toLowerCase();
    if (ua.includes("mac")) platformVal.textContent = "macOS";
    else if (ua.includes("win")) platformVal.textContent = "Windows";
    else if (ua.includes("linux")) platformVal.textContent = "Linux";
    else platformVal.textContent = "Desktop";
  } else {
    const capPlatform = window.Capacitor?.getPlatform?.();
    if (capPlatform === "ios") platformVal.textContent = "iOS";
    else if (capPlatform === "android") platformVal.textContent = "Android";
    else platformVal.textContent = "Web Browser";
  }
}

// ============================================================
// CLEAR CACHE / WIPE DATA / REPORT BUG
// ============================================================
clearCacheBtn?.addEventListener("click", () => {
  showConfirm(
    translations[currentLang]["label-clearcache"],
    translations[currentLang]["desc-clearcache"],
    async () => {
      try {
        if (Filesystem) {
          try {
            const files = await Filesystem.readdir({ path: "", directory: "CACHE" });
            for (const file of files.files) {
              if (file.type === "directory") {
                await Filesystem.rmdir({ path: file.name, directory: "CACHE", recursive: true });
              } else {
                await Filesystem.deleteFile({ path: file.name, directory: "CACHE" });
              }
            }
          } catch (e) {}
        }
        await updateStorageInfo();
        showToast(translations[currentLang]["label-cache-cleared"]);
      } catch (e) {
        showToast(translations[currentLang]["toast-cache-error"]);
      }
    }
  );
});

wipeDataBtn?.addEventListener("click", () => {
  showConfirm(
    translations[currentLang]["label-wipedata"],
    translations[currentLang]["desc-wipedata"],
    async () => {
      try {
        const lang = localStorage.getItem("astrostar_lang");
        const theme = localStorage.getItem("astrostar_theme");
        const vPath = localStorage.getItem("astrostar_download_path");
        const mPath = localStorage.getItem("astrostar_music_path");
        localStorage.clear();
        if (lang) localStorage.setItem("astrostar_lang", lang);
        if (theme) localStorage.setItem("astrostar_theme", theme);
        if (vPath) localStorage.setItem("astrostar_download_path", vPath);
        if (mPath) localStorage.setItem("astrostar_music_path", mPath);
        if (Filesystem) {
          try {
            const cacheFiles = await Filesystem.readdir({ path: "", directory: "CACHE" });
            for (const file of cacheFiles.files) {
              await Filesystem.deleteFile({ path: file.name, directory: "CACHE" });
            }
          } catch (e) {}
        }
        await updateStorageInfo();
        renderHistory(onHistoryItemClick, onHistoryDeleteClick);
        showToast(translations[currentLang]["label-data-wiped"]);
        setTimeout(() => location.reload(), 1500);
      } catch (e) {
        localStorage.clear();
        location.reload();
      }
    }
  );
});

reportBugBtn?.addEventListener("click", () => {
  const deviceInfo = `Model: ${navigator.userAgent}\nPlatform: ${platformVal?.textContent || "Unknown"}\nVersion: ${APP_VERSION}`;
  const text = encodeURIComponent(
    `Hi, I found a bug in AstroStar App:\n\n[BUG DESCRIPTION HERE]\n\n---\nDevice Info:\n${deviceInfo}`
  );
  const telegramUrl = `https://t.me/r3nz75?text=${text}`;
  showToast(translations[currentLang]["label-opening-tg"] || "Opening Telegram...");
  openExternalUrl(telegramUrl);
});

// ============================================================
// SUB-PAGE NAVIGATION
// ============================================================
document.addEventListener("click", (e) => {
  const menuItem = e.target.closest(".settings-menu-item, [data-target]");
  if (menuItem) {
    const targetId = menuItem.getAttribute("data-target");
    if (targetId) {
      document.querySelectorAll(".settings-sub-page").forEach((p) => p.classList.add("hidden"));
      const mainMenu = document.getElementById("settingsMainMenu");
      if (mainMenu) mainMenu.classList.add("hidden");
      const targetPage = document.getElementById(targetId);
      if (targetPage) targetPage.classList.remove("hidden");
    }
    return;
  }
  const backBtn = e.target.closest(".back-btn-settings");
  if (backBtn) {
    const backTarget = backBtn.getAttribute("data-back-target");
    document.querySelectorAll(".settings-sub-page").forEach((p) => p.classList.add("hidden"));
    if (backTarget) {
      const targetPage = document.getElementById(backTarget);
      if (targetPage) targetPage.classList.remove("hidden");
    } else {
      const mainMenu = document.getElementById("settingsMainMenu");
      if (mainMenu) mainMenu.classList.remove("hidden");
    }
  }
});

// ============================================================
// SOUND PACK PREVIEW
// ============================================================
const soundPackMenuEl = document.getElementById("soundPackMenu");
if (soundPackMenuEl) {
  soundPackMenuEl.querySelectorAll(".dropdown-item").forEach((item) => {
    item.addEventListener("click", () => {
      const pack = item.getAttribute("data-value");
      let file = "./chime-default.wav";
      if (pack === "soft") file = "./chime-soft.wav";
      else if (pack === "arcade") file = "./chime-arcade.wav";

      try {
        const a = new Audio(file);
        a.volume = 1.0;
        a.play().catch(() => {
          const fallback = new Audio("./chime.wav");
          fallback.volume = 1.0;
          fallback.play().catch(() => {});
        });
      } catch (e) {
        console.warn("Sound preview failed:", e);
      }
    });
  });
}

syncAllSettingsToNative();
