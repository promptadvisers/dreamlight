const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const STORE_KEY = "dreamlight_studio_v5";
const saved = (() => {
  try { return JSON.parse(window.desktopPrefs?.read() || localStorage.getItem(STORE_KEY) || "{}") || {}; }
  catch { return {}; }
})();

const state = {
  allTracks: [],
  queue: [],
  currentIdx: 0,
  activity: null,
  sessionName: "",
  lastActivity: saved.lastActivity || null,
  timerPresets: saved.timerPresets || {},
  timer: null,
  isPlaying: false,
  starting: false,
  failure: null,
  completedUntil: 0,
  autoNext: saved.autoNext ?? true,
  shuffle: saved.shuffle ?? false,
  loopMode: saved.loopMode || "all",
  crossfadeSec: saved.crossfadeSec ?? 4,
  vizMode: saved.vizMode || "signature",
  glowIntensity: saved.glowIntensity ?? 1,
  volume: saved.volume ?? 0.85,
  muted: false,
  rainLevel: saved.rainLevel ?? 0,
  oceanLevel: saved.oceanLevel ?? 0,
  vinylLevel: saved.vinylLevel ?? 0,
  breathOn: false,
  breathStartTs: 0,
};

function savePrefs() {
  const { autoNext, shuffle, loopMode, crossfadeSec, vizMode, glowIntensity, volume,
    rainLevel, oceanLevel, vinylLevel, lastActivity, timerPresets } = state;
  try {
    const payload = JSON.stringify({ autoNext, shuffle, loopMode, crossfadeSec,
      vizMode, glowIntensity, volume, rainLevel, oceanLevel, vinylLevel, lastActivity, timerPresets,
      lastFilename: getCurrentTrack()?.filename });
    if (window.desktopPrefs) window.desktopPrefs.write(payload);
    else localStorage.setItem(STORE_KEY, payload);
  } catch {}
}

let audioCtx = null, masterGain = null, sessionGain = null, analyser = null;
let rainGain = null, oceanGain = null, vinylGain = null;
const decks = [0, 1].map(() => {
  const el = new Audio();
  if (location.protocol !== "file:") el.crossOrigin = "anonymous";
  el.preload = "metadata";
  el.setAttribute("playsinline", "");
  return { el, gain: null };
});
let activeDeck = 0;
let startAttempt = null, fadeEnd = null, nativeRamp = null;

function createPinkBuffer(ctx, sec) {
  const len = ctx.sampleRate * sec, buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const out = buf.getChannelData(ch);
    let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
    for (let i = 0; i < len; i++) {
      const w = Math.random()*2-1;
      b0=0.99886*b0+w*0.0555179; b1=0.99332*b1+w*0.0750759; b2=0.96900*b2+w*0.1538520;
      b3=0.86650*b3+w*0.3104856; b4=0.55000*b4+w*0.5329522; b5=-0.7616*b5-w*0.0168980;
      out[i]=(b0+b1+b2+b3+b4+b5+b6+w*0.5362)*0.032; b6=w*0.115926;
    }
  }
  return buf;
}

function createVinylBuffer(ctx, sec) {
  const len = ctx.sampleRate * sec, buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const out = buf.getChannelData(ch); let last = 0;
    for (let i = 0; i < len; i++) {
      last = last*0.92 + (Math.random()*2-1)*0.08;
      out[i] = last*0.16 + (Math.random()<0.00055 ? (Math.random()*2-1)*0.3 : 0);
    }
  }
  return buf;
}

function ensureAudioGraph(forceAmbientOnIOS = false) {
  if (isIOS && !forceAmbientOnIOS && state.rainLevel===0 && state.oceanLevel===0 && state.vinylLevel===0) return;
  if (audioCtx) { if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {}); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  audioCtx = new AC();
  masterGain = audioCtx.createGain();
  masterGain.gain.value = state.muted ? 0 : state.volume;
  sessionGain = audioCtx.createGain();
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.42;

  if (!isIOS) {
    decks.forEach((d, idx) => {
      d.src = audioCtx.createMediaElementSource(d.el);
      d.gain = audioCtx.createGain();
      d.gain.gain.value = idx === activeDeck ? 1 : 0;
      d.src.connect(d.gain);
      d.gain.connect(sessionGain);
    });
  }

  const pinkBuf = createPinkBuffer(audioCtx, 6);
  const rainSrc = audioCtx.createBufferSource(); rainSrc.buffer = pinkBuf; rainSrc.loop = true;
  const rainFlt = audioCtx.createBiquadFilter(); rainFlt.type="bandpass"; rainFlt.frequency.value=1250; rainFlt.Q.value=0.42;
  rainGain = audioCtx.createGain(); rainGain.gain.value = 0;
  rainSrc.connect(rainFlt); rainFlt.connect(rainGain); rainGain.connect(sessionGain); rainSrc.start();

  const oceanSrc = audioCtx.createBufferSource(); oceanSrc.buffer = pinkBuf; oceanSrc.loop = true;
  const oceanFlt = audioCtx.createBiquadFilter(); oceanFlt.type="lowpass"; oceanFlt.frequency.value=520;
  const oLfo = audioCtx.createOscillator(); oLfo.frequency.value=0.095;
  const oDep = audioCtx.createGain(); oDep.gain.value=260; oLfo.connect(oDep); oDep.connect(oceanFlt.frequency); oLfo.start();
  oceanGain = audioCtx.createGain(); oceanGain.gain.value = 0;
  oceanSrc.connect(oceanFlt); oceanFlt.connect(oceanGain); oceanGain.connect(sessionGain); oceanSrc.start();

  const vSrc = audioCtx.createBufferSource(); vSrc.buffer = createVinylBuffer(audioCtx, 6); vSrc.loop = true;
  const vFlt = audioCtx.createBiquadFilter(); vFlt.type="bandpass"; vFlt.frequency.value=2200; vFlt.Q.value=0.5;
  vinylGain = audioCtx.createGain(); vinylGain.gain.value = 0;
  vSrc.connect(vFlt); vFlt.connect(vinylGain); vinylGain.connect(sessionGain); vSrc.start();

  sessionGain.connect(masterGain);
  masterGain.connect(analyser);
  analyser.connect(audioCtx.destination);
}

const playback = new EventTarget();
const changed = (kind = "state") => playback.dispatchEvent(new Event(kind));
const getCurrentTrack = () => state.queue[state.currentIdx] || null;
const volume = () => state.muted ? 0 : state.volume;
const activeAudio = () => decks[activeDeck].el;
const tracksFor = (slugs) => slugs ? slugs.map((slug) => state.allTracks.find((t) => t.slug === slug)).filter(Boolean) : [...state.allTracks];

function fmtTime(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = String(Math.floor(s / 60) % 60).padStart(2, "0");
  const rest = String(s % 60).padStart(2, "0");
  return h ? `${h}:${m}:${rest}` : `${m}:${rest}`;
}

function putGain(param, value) {
  param.cancelScheduledValues(0);
  param.setValueAtTime(value, audioCtx.currentTime);
}

function putDeckGain(index, gain) {
  const deck = decks[index];
  if (deck.gain) putGain(deck.gain.gain, gain);
  else deck.el.volume = gain * volume();
}

function syncAmbience(on = state.isPlaying) {
  [[rainGain, state.rainLevel * 0.55], [oceanGain, state.oceanLevel * 0.65],
    [vinylGain, state.vinylLevel * 0.42]].forEach(([node, gain]) => {
    if (node) putGain(node.gain, on ? gain : 0);
  });
}

function setVolume(level, muted = false) {
  state.volume = level;
  state.muted = muted;
  if (masterGain) putGain(masterGain.gain, volume());
  if (isIOS && !nativeRamp) putDeckGain(activeDeck, 1);
  savePrefs();
  changed();
}

function collapseFade() {
  clearTimeout(fadeEnd);
  clearInterval(nativeRamp);
  fadeEnd = nativeRamp = null;
  decks[1 - activeDeck].el.pause();
  putDeckGain(1 - activeDeck, 0);
  putDeckGain(activeDeck, 1);
}

function equalPower(from, to, seconds) {
  if (!seconds) { collapseFade(); return; }
  const points = 64;
  if (decks[to].gain) {
    const now = audioCtx.currentTime;
    [[from, Math.cos], [to, Math.sin]].forEach(([index, curve]) => {
      const param = decks[index].gain.gain;
      param.cancelScheduledValues(now);
      param.setValueCurveAtTime(Float32Array.from({ length: points },
        (_, point) => curve(point / (points - 1) * Math.PI / 2)), now, seconds);
    });
  } else {
    const start = performance.now();
    nativeRamp = setInterval(() => {
      const angle = Math.min(1, (performance.now() - start) / (seconds * 1000)) * Math.PI / 2;
      putDeckGain(from, Math.cos(angle));
      putDeckGain(to, Math.sin(angle));
    }, 16);
  }
  fadeEnd = setTimeout(collapseFade, seconds * 1000);
}

function cancelStart() {
  if (!startAttempt) return;
  const attempt = startAttempt;
  startAttempt = null;
  attempt.abort.abort();
  attempt.el.pause();
  state.starting = false;
}

function waitForAdvance(el, signal) {
  const origin = el.currentTime;
  return new Promise((resolve, reject) => {
    const dispose = (result, value) => {
      clearInterval(poll);
      clearTimeout(limit);
      el.removeEventListener("error", fail);
      signal.removeEventListener("abort", fail);
      result(value);
    };
    const fail = () => dispose(reject);
    const poll = setInterval(() => {
      if (!el.paused && el.currentTime > origin + 0.01) dispose(resolve);
    }, 25);
    const limit = setTimeout(fail, 12000);
    el.addEventListener("error", fail, { once: true });
    signal.addEventListener("abort", fail, { once: true });
    try { el.play().catch(fail); }
    catch { fail(); }
  });
}

async function playSelection(selection) {
  const { queue, index, session, activity, automatic = false, resume = false } = selection;
  const track = queue[index];
  if (!track) return false;
  cancelStart();
  collapseFade();
  if (!state.isPlaying) resetSessionGain();

  const from = activeDeck;
  const continuing = resume && Boolean(activeAudio().getAttribute("src")) && !activeAudio().ended;
  const to = continuing ? from : 1 - from;
  const el = decks[to].el;
  const attempt = { abort: new AbortController(), el };
  startAttempt = attempt;
  state.failure = null;
  state.completedUntil = 0;
  state.starting = false;

  ensureAudioGraph();
  putDeckGain(to, continuing ? 1 : 0);
  if (!continuing) el.src = track.url;
  const pending = waitForAdvance(el, attempt.abort.signal);
  const hint = setTimeout(() => {
    if (startAttempt !== attempt) return;
    state.starting = true;
    changed();
  }, 250);
  changed();

  try {
    await pending;
    if (startAttempt !== attempt) return false;
    startAttempt = null;
    state.starting = false;
    const duration = state.isPlaying && !decks[from].el.paused && from !== to
      ? (automatic ? state.crossfadeSec : 0.28) : 0;
    activeDeck = to;
    state.queue = queue;
    state.currentIdx = index;
    state.isPlaying = true;
    if (session !== undefined) {
      state.activity = activity || null;
      state.sessionName = session;
      if (activity) state.lastActivity = activity.key;
      setBreath(Boolean(activity?.breath));
      installTimer(preferredTimer(activity));
    } else {
      resumeTimer();
    }
    equalPower(from, to, duration);
    syncAmbience();
    savePrefs();
    updateMediaSession();
    changed("track");
    return true;
  } catch {
    if (startAttempt !== attempt) return false;
    startAttempt = null;
    el.pause();
    putDeckGain(to, 0);
    state.starting = false;
    if (state.isPlaying && activeAudio().paused) pausePlayback({ render: false });
    state.failure = { label: "Couldn't load this session", retry: () => playSelection(selection) };
    changed();
    return false;
  } finally {
    clearTimeout(hint);
  }
}

function pausePlayback({ holdTimer = true, render = true } = {}) {
  cancelStart();
  collapseFade();
  decks.forEach((deck, index) => {
    deck.el.pause();
    putDeckGain(index, 0);
  });
  state.isPlaying = false;
  syncAmbience(false);
  resetSessionGain();
  if (holdTimer) pauseTimer();
  updateMediaSession();
  if (render) changed();
}

function stopSession() {
  pausePlayback({ render: false });
  state.timer = null;
  state.failure = null;
  if (activeAudio().readyState) activeAudio().currentTime = 0;
  setBreath(false);
  changed();
  changed("clock");
}

function togglePlayback() {
  if (state.timer?.phase === "break") {
    if (state.timer.deadline) pauseTimer();
    else resumeTimer();
    changed();
    return;
  }
  if (state.isPlaying || startAttempt) return pausePlayback();
  if (!getCurrentTrack()) return startActivity(state.lastActivity || "deep_work");
  return playSelection({ queue: state.queue, index: state.currentIdx, resume: true });
}

function nextIndex(automatic) {
  const count = state.queue.length;
  if (!count) return -1;
  if (automatic && state.loopMode === "one") return state.currentIdx;
  if (state.shuffle && count > 1) return (state.currentIdx + 1 + Math.floor(Math.random() * (count - 1))) % count;
  if (state.currentIdx + 1 < count) return state.currentIdx + 1;
  return state.loopMode === "all" || !automatic ? 0 : -1;
}

function nextTrack(automatic = false) {
  const index = nextIndex(automatic);
  if (index >= 0) return playSelection({ queue: state.queue, index, automatic });
  if (automatic) pausePlayback();
}

function previousTrack() {
  const el = activeAudio();
  if (el.currentTime > 5) {
    cancelStart();
    collapseFade();
    seekTo(0);
    changed();
    return;
  }
  const count = state.queue.length;
  if (count) return playSelection({ queue: state.queue, index: (state.currentIdx + count - 1) % count });
}

function startActivity(key) {
  const activity = ACTIVITY_BY_KEY.get(key);
  if (!activity) return;
  return playSelection({ queue: tracksFor(activity.queue), index: 0, activity, session: activity.name });
}

function setBreath(on) {
  state.breathOn = on;
  state.breathStartTs = performance.now();
}

function currentPosition() {
  const el = activeAudio();
  return { cur: el.currentTime || 0, dur: Number.isFinite(el.duration) ? el.duration : getCurrentTrack()?.duration || 0 };
}

function seekTo(seconds) {
  const el = activeAudio();
  if (!el.readyState) return;
  el.currentTime = Math.min(currentPosition().dur, Math.max(0, seconds));
  changed("position");
}

function updateMediaSession() {
  if (!navigator.mediaSession) return;
  const track = getCurrentTrack();
  navigator.mediaSession.playbackState = state.isPlaying ? "playing" : "paused";
  if (track) navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title, artist: "Dreamlight", album: state.sessionName,
    artwork: [{ src: new URL(track.cover, location.href).href, type: "image/png" }],
  });
}

let lastPositionSync = 0;
let automaticFrom = null;
decks.forEach(({ el }, index) => {
  el.addEventListener("loadedmetadata", () => { if (index === activeDeck) changed("position"); });
  el.addEventListener("ended", () => {
    if (index !== activeDeck) return;
    if (startAttempt) return;
    if (state.autoNext) nextTrack(true);
    else pausePlayback();
  });
  el.addEventListener("timeupdate", () => {
    if (index !== activeDeck) return;
    const { cur, dur } = currentPosition();
    changed("position");
    const now = performance.now();
    if (navigator.mediaSession?.setPositionState && dur > 0 && now - lastPositionSync > 1000) {
      lastPositionSync = now;
      navigator.mediaSession.setPositionState({ duration: dur, playbackRate: 1, position: Math.min(cur, dur) });
    }
    if (dur - cur > state.crossfadeSec + 1) automaticFrom = null;
    if (state.isPlaying && state.autoNext && state.crossfadeSec > 0 && !startAttempt &&
        !fadeEnd && automaticFrom !== el && dur > state.crossfadeSec + 10 && dur - cur <= state.crossfadeSec) {
      automaticFrom = el;
      selectedAutomatic(activeDeck, el);
    }
  });
  el.addEventListener("error", () => {
    if (index !== activeDeck || !state.isPlaying || startAttempt) return;
    pausePlayback({ render: false });
    state.failure = { label: "Couldn't load this session",
      retry: () => playSelection({ queue: state.queue, index: state.currentIdx }) };
    changed();
  });
});

async function selectedAutomatic(index, el) {
  const next = nextIndex(true);
  if (next < 0) return;
  if (!await playSelection({ queue: state.queue, index: next, automatic: true }) &&
      index === activeDeck && el.ended && !startAttempt && state.isPlaying) pausePlayback();
}

if (navigator.mediaSession) {
  const handlers = {
    play: () => { if (!state.isPlaying && !startAttempt) togglePlayback(); },
    pause: () => pausePlayback(),
    nexttrack: () => nextTrack(),
    previoustrack: previousTrack,
    seekto: ({ seekTime }) => seekTo(seekTime),
  };
  Object.entries(handlers).forEach(([action, handler]) => {
    try { navigator.mediaSession.setActionHandler(action, handler); } catch {}
  });
}

// A deadline represents a running clock. A paused clock stores its remaining milliseconds.
function preferredTimer(activity = state.activity) {
  return state.timerPresets[activity?.key || "library"] || { minutes: activity?.minutes || 0, intervals: false };
}

function setTimer(minutes, intervals = false) {
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 1440) return false;
  if (intervals) minutes = 25;
  state.timerPresets[state.activity?.key || "library"] = { minutes, intervals };
  installTimer({ minutes, intervals });
  savePrefs();
  changed();
  return true;
}

function installTimer({ minutes, intervals }) {
  resetSessionGain();
  const total = minutes * 60 * 1000;
  state.timer = total ? { total, remaining: total, deadline: state.isPlaying ? Date.now() + total : 0,
    intervals, round: 1, phase: "work", fading: false } : null;
  changed("clock");
}

function pauseTimer() {
  const timer = state.timer;
  if (!timer?.deadline) return;
  timer.remaining = Math.max(0, timer.deadline - Date.now());
  timer.deadline = 0;
  timer.fading = false;
  resetSessionGain();
  changed("clock");
}

function resumeTimer() {
  const timer = state.timer;
  if (!timer || timer.deadline) return;
  timer.deadline = Date.now() + timer.remaining;
  changed("clock");
}

function getTimerState() {
  const t = state.timer;
  return {
    timerKind: t?.intervals ? "Intervals" : t ? "Countdown" : "Continuous",
    timerTotal: t ? Math.ceil(t.total / 1000) : 0,
    timerRemain: t ? Math.max(0, Math.ceil((t.deadline ? t.deadline - Date.now() : t.remaining) / 1000)) : 0,
    timerRunning: Boolean(t?.deadline),
    intervalPhase: t?.intervals ? t.phase : null,
    intervalRound: t?.intervals ? t.round : null,
  };
}

function resetSessionGain() {
  if (sessionGain) putGain(sessionGain.gain, 1);
  if (isIOS && !nativeRamp) putDeckGain(activeDeck, 1);
  if (state.timer) state.timer.fading = false;
}

function fadeSession(seconds) {
  if (!sessionGain) return;
  const gain = sessionGain.gain;
  putGain(gain, gain.value);
  gain.linearRampToValueAtTime(0, audioCtx.currentTime + seconds);
}

function checkDeadline() {
  const timer = state.timer;
  if (!timer?.deadline) return;
  const timeLeft = timer.deadline - Date.now();
  if (timeLeft <= 0) {
    if (timer.intervals && timer.phase === "break") {
      timer.round++;
      timer.phase = "work";
      timer.total = timer.remaining = 25 * 60 * 1000;
      timer.deadline = 0;
      playSelection({ queue: state.queue, index: state.currentIdx, resume: true });
    } else if (timer.intervals && timer.round < 4) {
      pausePlayback({ holdTimer: false, render: false });
      timer.phase = "break";
      timer.total = timer.remaining = 5 * 60 * 1000;
      timer.deadline = Date.now() + timer.total;
      changed();
    } else {
      stopSession();
      state.completedUntil = Date.now() + 3200;
      changed("complete");
    }
  } else if (timer.phase === "work" && timeLeft <= Math.min(state.activity?.gentleEnd ? 4500 : 1500, timer.total / 2)) {
    if (!timer.fading) {
      timer.fading = true;
      fadeSession(timeLeft / 1000);
    }
    if (isIOS) decks.forEach(({ el }, index) => {
      if (!el.paused) putDeckGain(index, Math.min(1, timeLeft / Math.min(state.activity?.gentleEnd ? 4500 : 1500, timer.total / 2)));
    });
  }
  changed("clock");
}

setInterval(checkDeadline, 125);
document.addEventListener("visibilitychange", () => {
  checkDeadline();
  if (!document.hidden && audioCtx?.state === "suspended" && state.isPlaying) audioCtx.resume().catch(() => {});
});
