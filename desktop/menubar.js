// Dreamlight menu bar companion: a live tray item with a mini player popover.
// The main window keeps playing audio; this module only reads its state and sends it commands.
const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, globalShortcut, screen } = require("electron");
const path = require("path");

const ASSETS = path.join(__dirname, "assets");

// Runs inside the player page. Everything it touches is a global of web/index.html.
const READ_STATE = `(() => {
  try {
    const t = getCurrentTrack() || {};
    const el = decks[activeDeck].el;
    return {
      ok: true,
      title: t.title || "Dreamlight", subtitle: t.subtitle || "", band: t.band || "", bpm: t.bpm || "", key: t.key || "",
      mood: t.mood || "", cover: t.cover || "", coverLoop: t.coverLoop || "", palette: t.palette || [],
      playing: !!state.isPlaying, cur: el.currentTime || 0, dur: (isFinite(el.duration) && el.duration) || t.duration || 3600,
      timerTotal: state.timerTotalSec || 0, timerRemain: state.timerRemainSec || 0,
      focusToday: state.focusSecondsToday || 0, stack: state.activeStack,
      blueprints: BLUEPRINTS.map((b) => ({ key: b.key, name: b.name, meta: b.meta, cover: b.cover })),
      upNext: (() => { const i = getNextTrackIndex(); const n = state.queue[i]; return n ? n.title : ""; })(),
    };
  } catch (e) { return { ok: false, error: String(e) }; }
})()`;

const READ_SPECTRUM = `(() => {
  try {
    if (!analyser || !state.isPlaying) return null;
    const a = new Uint8Array(analyser.frequencyBinCount); analyser.getByteFrequencyData(a);
    const out = []; const n = 28;
    for (let i = 0; i < n; i++) { const lo = Math.floor(Math.pow(i / n, 1.7) * a.length * 0.55), hi = Math.max(lo + 1, Math.floor(Math.pow((i + 1) / n, 1.7) * a.length * 0.55)); let s = 0; for (let j = lo; j < hi; j++) s += a[j]; out.push(s / (hi - lo) / 255); }
    return out;
  } catch (e) { return null; }
})()`;

const COMMANDS = {
  toggle: () => "togglePlay()",
  next: () => "playNext(true)",
  prev: () => "playPrev()",
  timer: (m) => `setFocusTimer(${parseInt(m, 10) || 0})`,
  stack: (k) => `applyStack(${JSON.stringify(String(k))}, true)`,
  zen: () => "toggleZen()",
  breath: () => "toggleBreath()",
};

function fmt(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

module.exports = function setupMenuBar({ getMainWindow, showMainWindow, baseUrl }) {
  const icon = nativeImage.createFromPath(path.join(ASSETS, "trayTemplate.png"));
  icon.setTemplateImage(true);
  const tray = new Tray(icon);
  tray.setToolTip("Dreamlight");

  const pop = new BrowserWindow({
    width: 340, height: 628, show: false, frame: false, resizable: false, movable: false,
    fullscreenable: false, skipTaskbar: true, alwaysOnTop: true, transparent: true,
    vibrancy: "popover", visualEffectState: "active", hasShadow: true,
    webPreferences: { preload: path.join(__dirname, "tray-preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  });
  pop.loadFile(path.join(__dirname, "tray.html"), { query: { base: baseUrl } });
  pop.on("blur", () => { if (!pop.webContents.isDevToolsOpened()) pop.hide(); });

  let last = null;
  const run = async (js) => {
    const w = getMainWindow();
    if (!w || w.isDestroyed()) return null;
    try { return await w.webContents.executeJavaScript(js, true); } catch { return null; }
  };

  function updateTitle(s) {
    if (!s || !s.ok) { tray.setTitle(""); return; }
    let title = "";
    if (s.timerTotal > 0) title = `${s.playing ? "" : "❚❚ "}${fmt(s.timerRemain)}`;
    else if (s.playing) title = s.title.length > 18 ? s.title.slice(0, 17) + "…" : s.title;
    tray.setTitle(title ? ` ${title}` : "", { fontType: "monospacedDigit" });
    tray.setToolTip(s.playing ? `Dreamlight · ${s.title} · ${s.band}` : "Dreamlight (paused)");
  }

  // State loop: once a second for the menu bar title, faster spectrum only while the popover is open.
  setInterval(async () => {
    const s = await run(READ_STATE);
    if (s) { last = s; updateTitle(s); if (pop.isVisible()) pop.webContents.send("dl:state", s); }
  }, 1000);
  setInterval(async () => {
    if (!pop.isVisible()) return;
    const sp = await run(READ_SPECTRUM);
    pop.webContents.send("dl:spectrum", sp);
  }, 50);

  function positionPopover() {
    const b = tray.getBounds();
    const d = screen.getDisplayNearestPoint({ x: b.x, y: b.y }).workArea;
    const [w] = pop.getSize();
    let x = Math.round(b.x + b.width / 2 - w / 2);
    x = Math.min(Math.max(x, d.x + 8), d.x + d.width - w - 8);
    pop.setPosition(x, Math.round(d.y + 6), false);
  }

  function togglePopover() {
    if (pop.isVisible()) { pop.hide(); return; }
    positionPopover();
    pop.show(); pop.focus();
    if (last) pop.webContents.send("dl:state", last);
  }

  function contextMenu() {
    const s = last || {};
    const stacks = (s.blueprints || []).map((b) => ({ label: `${b.name}  ·  ${b.meta}`, type: "radio", checked: s.stack === b.key, click: () => run(COMMANDS.stack(b.key)) }));
    const timers = [0, 25, 45, 60, 90].map((m) => ({ label: m ? `${m} min focus` : "Endless", type: "radio", checked: (s.timerTotal || 0) === m * 60, click: () => run(COMMANDS.timer(m)) }));
    return Menu.buildFromTemplate([
      { label: s.title ? `${s.playing ? "▶" : "❚❚"}  ${s.title}` : "Dreamlight", enabled: false },
      { label: s.band ? `${s.band} · ${s.bpm} BPM · ${s.key}` : "", enabled: false, visible: !!s.band },
      { type: "separator" },
      { label: s.playing ? "Pause" : "Play", accelerator: "CommandOrControl+Shift+Space", click: () => run(COMMANDS.toggle()) },
      { label: "Next session", click: () => run(COMMANDS.next()) },
      { label: "Previous session", click: () => run(COMMANDS.prev()) },
      { type: "separator" },
      { label: "Focus blueprint", submenu: stacks },
      { label: "Focus timer", submenu: timers },
      { label: "Breath pacer", click: () => { showMainWindow(); run(COMMANDS.breath()); } },
      { label: "Cinema Zen", click: () => { showMainWindow(); run(COMMANDS.zen()); } },
      { type: "separator" },
      { label: "Open Dreamlight", click: showMainWindow },
      { label: "Open at login", type: "checkbox", checked: app.getLoginItemSettings().openAtLogin, click: (i) => app.setLoginItemSettings({ openAtLogin: i.checked, openAsHidden: true }) },
      { type: "separator" },
      { label: "Quit Dreamlight", accelerator: "CommandOrControl+Q", click: () => { app.isQuitting = true; app.quit(); } },
    ]);
  }

  tray.on("click", togglePopover);
  tray.on("right-click", () => tray.popUpContextMenu(contextMenu()));

  ipcMain.on("dl:cmd", (_e, name, arg) => {
    if (name === "open") { pop.hide(); showMainWindow(); return; }
    if (name === "menu") { tray.popUpContextMenu(contextMenu()); return; }
    const f = COMMANDS[name];
    if (f) run(f(arg)).then(() => run(READ_STATE)).then((s) => { if (s) { last = s; updateTitle(s); pop.webContents.send("dl:state", s); } });
  });

  // Play/pause from anywhere, even with the window hidden.
  globalShortcut.register("CommandOrControl+Shift+Space", () => run(COMMANDS.toggle()));
  app.on("will-quit", () => globalShortcut.unregisterAll());

  return tray;
};
