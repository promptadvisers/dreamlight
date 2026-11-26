const views = { start: $("startView"), activities: $("activityView"), library: $("libraryView"), player: $("playerView") };
const headings = { start: $("startTitle"), activities: $("activityHeading"), library: $("libraryHeading"), player: $("playerTitle") };
const scrollPositions = {};
let view = "start", returnView = "start", selectedMode = null, pendingActivity = null;
let blueprint = BLUEPRINTS[0], scene = "scene", zen = false, remoteVisible = false, windowVisible = true;
let lastStageKey = null, heroArt, environmentArt, toastTimeout;
let renderedTrack = null, renderedPlaying = null;
const icon = (name) => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;

function artSlot(className = "") {
  const slot = document.createElement("span");
  slot.className = `art-slot ${className}`;
  slot.setAttribute("aria-hidden", "true");
  slot.innerHTML = '<img alt="">';
  return slot;
}

function focusHeading() {
  headings[view].focus({ preventScroll: true });
}

function showView(next, { focus = true, restoreScroll = false } = {}) {
  if (zen && next !== "player") setZen(false);
  if (next === view) {
    if (focus) focusHeading();
    return;
  }
  scrollPositions[view] = scrollY;
  if (next === "player") {
    returnView = view;
    document.body.classList.add("player-open");
  } else document.body.classList.remove("player-open");
  motion.clearPreviews();
  views[view].hidden = true;
  view = next;
  views[view].hidden = false;
  document.querySelectorAll("[data-view]").forEach((button) => {
    if (button.dataset.view === (view === "activities" ? "start" : view)) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  scrollTo(0, restoreScroll ? scrollPositions[view] || 0 : 0);
  if (focus) focusHeading();
  syncArt();
}

function setEnvironment(mode) {
  const wrap = $("activityEnvironment");
  wrap.querySelector(".outgoing-art")?.remove();
  if (environmentArt) {
    if (!prefersReducedMotion && view === "activities") {
      const outgoing = artSlot("outgoing-art");
      motion.setArt(outgoing, artForMode(selectedMode));
      wrap.append(outgoing);
      outgoing.addEventListener("animationend", () => outgoing.remove(), { once: true });
    }
    environmentArt.remove();
  }
  environmentArt = artSlot("environment-art");
  motion.setArt(environmentArt, artForMode(mode.key));
  wrap.prepend(environmentArt);
}

function chooseMode(key) {
  const mode = MODE_BY_KEY.get(key);
  if (!mode) return;
  setEnvironment(mode);
  selectedMode = key;
  document.documentElement.style.setProperty("--accent", mode.hue);
  $("activityHeading").textContent = mode.name;
  $("activityFeel").textContent = mode.feel;
  const tiles = ACTIVITIES.filter((activity) => activity.mode === key).map((activity, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "activity-card";
    button.dataset.activity = activity.key;
    button.dataset.reveal = "";
    button.style.setProperty("--i", index);
    button.style.setProperty("--art-hue", mode.hue);
    const art = artSlot("activity-art");
    motion.setArt(art, artForActivity(activity));
    button.innerHTML = `<span><strong>${activity.name}</strong><small>${activity.minutes ? activity.minutes + " min" : "Continuous"}</small></span>
      <svg class="row-play" aria-hidden="true"><use href="#i-play"/></svg>`;
    button.prepend(art);
    motion.bindTile(button, art);
    button.addEventListener("click", () => launchActivity(activity.key));
    return button;
  });
  $("activityGrid").replaceChildren(...tiles);
  markActivity();
  showView("activities");
  syncArt();
}

function renderModes() {
  $("modeGrid").replaceChildren(...MODES.map((mode) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mode-card";
    button.dataset.mode = mode.key;
    button.style.setProperty("--art-hue", mode.hue);
    button.innerHTML = `<strong>${mode.name}</strong><span class="feel">${mode.feel}</span>
      <svg class="card-arrow" aria-hidden="true"><use href="#i-right"/></svg>`;
    const art = artSlot();
    motion.setArt(art, artForMode(mode.key));
    button.prepend(art);
    motion.bindTile(button, art);
    button.addEventListener("click", () => chooseMode(mode.key));
    return button;
  }));
}

function markActivity() {
  document.querySelectorAll("[data-activity]").forEach((button) => {
    const live = button.dataset.activity === state.activity?.key;
    const label = button.querySelector("strong");
    const dot = label.querySelector(".live-dot");
    if (live && !dot) {
      label.insertAdjacentHTML("beforeend", '<span class="live-dot" aria-hidden="true"></span>');
      button.setAttribute("aria-current", "true");
    } else if (!live && dot) {
      dot.remove();
      button.removeAttribute("aria-current");
    }
  });
}

let launchGeneration = 0;
function launchActivity(key) {
  const activity = ACTIVITY_BY_KEY.get(key);
  if (!activity) return;
  const generation = ++launchGeneration;
  pendingActivity = activity;
  const result = startActivity(key);
  pickScene("scene");
  showView("player");
  syncArt(true);
  renderTransport();
  return result?.finally(() => {
    if (launchGeneration !== generation) return;
    pendingActivity = null;
    renderTransport();
    syncArt();
  });
}

function syncArt(forceReveal = false) {
  const activity = state.activity || (!getCurrentTrack() ? pendingActivity : null);
  const track = getCurrentTrack();
  const accent = view === "activities" ? MODE_BY_KEY.get(selectedMode)?.hue : MODE_BY_KEY.get(activity?.mode)?.hue;
  document.documentElement.style.setProperty("--accent", accent || "#8DB9FF");
  const art = activity ? artForActivity(activity) : artForTrack(track);
  const key = activity?.key || track?.slug || "-";
  if (lastStageKey !== key || forceReveal) {
    motion.setArt(heroArt, art);
    motion.setArt($("miniArt"), art);
    const hero = $("heroScene");
    hero.classList.remove("reveal");
    if (view === "player") {
      void hero.offsetWidth;
      hero.classList.add("reveal");
    }
    lastStageKey = key;
  }
  $("heroScene").hidden = scene !== "scene";
  canvas.hidden = scene !== "signal";
  $("signalTools").hidden = scene !== "signal" || zen;
  motion.selectStage(view === "activities" ? environmentArt : view === "player" && scene === "scene" ? heroArt : null);
  if (windowVisible && !remoteVisible) syncVisualizer();
}

function pickScene(chosen) {
  scene = chosen;
  $("playerStage").classList.toggle("signal-on", scene === "signal");
  document.querySelectorAll("[data-scene]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.scene === scene)));
  syncArt();
}

function pickSignal(style) {
  state.vizMode = style;
  document.querySelectorAll("[data-signal]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.signal === style)));
  pickScene("signal");
  savePrefs();
}

function setZen(on) {
  if (on === zen) return;
  if (on) showView("player");
  zen = on;
  document.body.classList.toggle("zen", on);
  $("exitZen").hidden = !on;
  $("enterZen").hidden = on;
  if (on) {
    $("exitZen").focus();
    if (document.fullscreenEnabled) $("heroVisual").requestFullscreen().catch(() => {});
  } else {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    $("enterZen").focus({ preventScroll: true });
  }
  syncArt();
}

function renderClock() {
  const { timerKind, timerTotal, timerRemain, intervalPhase, intervalRound } = getTimerState();
  const time = timerTotal ? fmtTime(timerRemain) : "";
  $("clockValue").textContent = time || "Continuous";
  $("clockNote").textContent = intervalPhase ? `${intervalPhase === "work" ? "Focus" : "Break"} · round ${intervalRound} of 4` : time ? "remaining" : "";
  $("miniClock").textContent = time && `${time} left`;
  document.querySelectorAll(".timer-chip").forEach((button) => {
    button.querySelector("span").textContent = timerKind;
    button.setAttribute("aria-label", `Session timer: ${timerKind}${time ? ", " + time + " remaining" : ""}`);
  });
}

function renderPosition() {
  const { cur, dur } = currentPosition();
  const seek = $("seek");
  seek.disabled = !getCurrentTrack() || !activeAudio().readyState;
  seek.max = dur || 3600;
  if (!seek.matches(":active")) seek.value = cur;
  seek.style.setProperty("--position", `${dur ? Math.min(100, cur / dur * 100) : 0}%`);
  seek.setAttribute("aria-valuetext", fmtTime(cur) + " of " + fmtTime(dur));
  $("elapsed").textContent = fmtTime(cur);
  $("duration").textContent = fmtTime(dur);
}

function renderTransport() {
  const track = getCurrentTrack();
  const activity = state.activity || (!track ? pendingActivity : null);
  const title = activity?.name || state.sessionName || "Choose an activity";
  $("playerTitle").textContent = title;
  $("playerMode").textContent = MODE_BY_KEY.get(activity?.mode)?.name || "Now playing";
  $("currentTrack").textContent = track?.title || "";
  $("miniTitle").textContent = title;
  $("miniTrack").textContent = track?.title || "Dreamlight";
  const breakRunning = state.timer?.phase === "break" && state.timer.deadline;
  const playing = state.isPlaying || breakRunning;
  document.querySelectorAll('[data-transport="toggle"]').forEach((button) => {
    const label = playing ? "Pause" : state.starting ? "Cancel start" : "Play";
    button.setAttribute("aria-label", label);
    button.title = label;
    button.querySelector("use").setAttribute("href", playing || state.starting ? "#i-pause" : "#i-play");
  });
  document.querySelectorAll(".stop-button").forEach((button) => { button.hidden = state.activity?.key !== "deep_sleep"; });
  document.querySelectorAll('[data-transport="previous"], [data-transport="next"]').forEach((button) => { button.disabled = !track; });
  const resume = ACTIVITY_BY_KEY.get(state.lastActivity);
  $("resumeBtn").hidden = !resume;
  if (resume) $("resumeBtn").querySelector("span").textContent = `Resume ${resume.name}`;
  $("breathBtn").setAttribute("aria-pressed", String(state.breathOn));
  $("breathBtn").setAttribute("aria-label", state.breathOn ? "Turn breath pacer off" : "Turn breath pacer on");
  $("breathGuide").hidden = !state.breathOn;
  renderClock();
  renderPosition();
  renderFeedback();
  markActivity();
}

function renderFeedback() {
  const text = state.failure?.label || (state.starting ? "Starting…" : "");
  if ($("feedbackText").textContent !== text) $("feedbackText").textContent = text;
  $("retryBtn").hidden = !state.failure;
}

function announceComplete() {
  clearTimeout(toastTimeout);
  $("feedbackText").textContent = "Session complete";
  toastTimeout = setTimeout(() => {
    if ($("feedbackText").textContent === "Session complete") $("feedbackText").textContent = "";
  }, 3200);
}

function showTrack() {
  const track = getCurrentTrack();
  $("details").hidden = !track;
  if (!track) return;
  setVisualTrack(track);
  $("description").textContent = track.description;
  const carrier = track.binauralL != null && track.binauralR != null
    ? `Left ${track.binauralL} Hz · Right ${track.binauralR} Hz` : track.binaural;
  $("telemetry").replaceChildren(...[
    ["Frequency", track.band], ["Carriers", carrier], ["Tempo", `${track.bpm} BPM`], ["Key", track.key],
    ["Signal", getTrackVisual(track).archetype.replaceAll("_", " ")],
    ["Breath cadence", getTrackVisual(track).breathLabel],
  ].map(([label, value]) => {
    const group = document.createElement("div");
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    term.textContent = label;
    description.textContent = value;
    group.append(term, description);
    return group;
  }));
}

function toggleBreath() {
  setBreath(!state.breathOn);
  if (state.breathOn) showView("player");
  renderTransport();
}

setInterval(() => {
  if (!state.breathOn || view !== "player" || document.hidden || remoteVisible || !windowVisible) return;
  const { phase, remaining, expansion } = breathStep(performance.now(), getTrackVisual(getCurrentTrack()));
  $("breathPhase").textContent = phase[0] + phase.slice(1).toLowerCase();
  $("breathCount").textContent = `${Math.ceil(remaining)}s`;
  $("breathGuide").style.setProperty("--breath-size", prefersReducedMotion ? 1 : 0.72 + expansion * 0.58);
}, 80);

function libraryTracks() {
  const search = $("search").value.trim().toLowerCase();
  const mode = $("modeFilter").value, mood = $("moodFilter").value, band = $("bandFilter").value;
  return tracksFor(blueprint.slugs).filter((track) =>
    (!mode || ACTIVITIES.some((activity) => activity.mode === mode && activity.queue.includes(track.slug))) && (!mood || track.mood === mood) &&
    (!band || bandFamily(track) === band) &&
    (!search || `${track.title} ${track.subtitle} ${track.description} ${track.band}`.toLowerCase().includes(search)));
}

function bandFamily(track) {
  return track.band.replace(/^[\d.]+\s*Hz\s*/i, "");
}

function optionList(id, values) {
  const select = $(id);
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = MODE_BY_KEY.get(value)?.name || value.replace(/^[a-z]/, (letter) => letter.toUpperCase());
    select.append(option);
  });
}

function startLibrary(queue, index, title) {
  const track = queue[index];
  if (!track) return;
  playSelection({ queue, index, session: title });
  showView("player");
}

function renderBlueprints() {
  $("blueprints").replaceChildren(...BLUEPRINTS.map((item) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "blueprint";
    card.setAttribute("aria-pressed", String(blueprint === item));
    card.innerHTML = `<img alt="" src="${item.cover}"><span><b>${item.name}</b><small>${item.meta}</small></span>`;
    card.addEventListener("click", () => {
      blueprint = item;
      $("blueprints").querySelectorAll("button").forEach((button) => button.setAttribute("aria-pressed", String(button === card)));
      renderLibrary();
    });
    return card;
  }));
}

function renderLibrary() {
  const tracks = libraryTracks();
  $("trackHeading").textContent = blueprint.name;
  $("trackCount").textContent = `${tracks.length} ${tracks.length === 1 ? "track" : "tracks"}`;
  $("playBlueprint").hidden = blueprint.key === "all";
  $("noTracks").hidden = Boolean(tracks.length);
  $("trackRows").replaceChildren(...tracks.map((track, index) => {
    const row = document.createElement("tr");
    row.dataset.slug = track.slug;
    row.innerHTML = `<td><button type="button" class="track-play" aria-label="Play ${track.title}">
      <img src="${track.cover}" alt="" loading="lazy"><span><strong>${track.title}</strong><small>${track.subtitle}</small></span>
      <span class="track-marker" hidden>${icon("signal")} <span class="sr-only"></span></span></button></td>
      <td class="track-band">${track.band}</td><td class="track-length">${Math.round(track.duration / 60)} min</td>
      <td class="track-action"><button type="button" class="pill" aria-label="Add ${track.title} next">Add next</button></td>`;
    row.querySelector(".track-play").addEventListener("click", () => startLibrary(tracks, index, blueprint.name === "All Sessions" ? "Library" : blueprint.name));
    row.querySelector(".track-action button").addEventListener("click", (event) => {
      addNext(track);
      const button = event.currentTarget;
      button.textContent = "Added";
      setTimeout(() => { button.textContent = "Add next"; }, 1100);
    });
    return row;
  }));
  markLibrary();
}

function markLibrary() {
  const slug = getCurrentTrack()?.slug;
  $("trackRows").querySelectorAll("tr").forEach((row) => {
    const current = row.dataset.slug === slug;
    if (current) row.setAttribute("aria-current", "true");
    else row.removeAttribute("aria-current");
    const marker = row.querySelector(".track-marker");
    marker.hidden = !current;
    marker.querySelector(".sr-only").textContent = state.isPlaying ? "Playing now" : "Current track, paused";
    marker.title = state.isPlaying ? "Playing now" : "Current track, paused";
  });
}

function addNext(track) {
  if (!state.queue.length) {
    state.queue = [track];
    state.sessionName = "Library";
    showTrack();
    renderTransport();
    syncArt();
  } else {
    const insert = state.currentIdx + 1;
    state.queue = [...state.queue.slice(0, insert), track, ...state.queue.slice(insert)];
  }
  renderQueue();
}

function moveQueue(from, to, restoreFocus) {
  if (to < 0 || to >= state.queue.length || from === to) return;
  const current = state.currentIdx;
  const entries = state.queue.map((track, index) => ({ track, current: index === current }));
  entries.splice(to, 0, entries.splice(from, 1)[0]);
  state.queue = entries.map(({ track }) => track);
  state.currentIdx = entries.findIndex((entry) => entry.current);
  renderQueue();
  if (restoreFocus) {
    const target = $("queueList").children[to];
    const preferred = target.querySelector(restoreFocus);
    (preferred.disabled ? target.querySelector("button:not(:disabled)") : preferred)?.focus();
  }
}

function renderQueue() {
  let dragging = null;
  $("emptyQueue").hidden = Boolean(state.queue.length);
  $("queueList").replaceChildren(...state.queue.map((track, index) => {
    const item = document.createElement("li");
    item.draggable = true;
    if (index === state.currentIdx) item.setAttribute("aria-current", "true");
    item.innerHTML = `<div class="queue-item"><span>${track.title}</span>
      <span><button type="button" class="icon-btn up" aria-label="Move ${track.title} up">${icon("up")}</button>
      <button type="button" class="icon-btn down" aria-label="Move ${track.title} down">${icon("up")}</button></span></div>`;
    item.querySelector(".up").disabled = index === 0;
    item.querySelector(".down").disabled = index === state.queue.length - 1;
    item.querySelector(".up").addEventListener("click", () => moveQueue(index, index - 1, ".up"));
    item.querySelector(".down").addEventListener("click", () => moveQueue(index, index + 1, ".down"));
    item.addEventListener("dragstart", (event) => { dragging = index; event.dataTransfer.setData("text/plain", track.title); });
    item.addEventListener("dragover", (event) => { if (dragging !== null) { event.preventDefault(); item.classList.add("queue-target"); } });
    item.addEventListener("dragleave", () => item.classList.remove("queue-target"));
    item.addEventListener("dragend", () => { dragging = null; $("queueList").querySelectorAll(".queue-target").forEach((node) => node.classList.remove("queue-target")); });
    item.addEventListener("drop", (event) => { event.preventDefault(); if (dragging !== null) moveQueue(dragging, index); });
    return item;
  }));
}

const modalReturns = new WeakMap();
function openDialog(id, origin = document.activeElement) {
  const dialog = $(id);
  if (dialog.open) return;
  if (id === "queueDialog") renderQueue();
  if (id === "timerDialog") syncTimerOptions();
  if (id === "mixerDialog") syncMixer();
  const parent = origin.closest("dialog");
  if (parent?.open) {
    origin = modalReturns.get(parent) || document.body;
    parent.close();
  }
  modalReturns.set(dialog, origin);
  dialog.showModal();
  dialog.querySelector(".dialog-close").focus();
}

function syncTimerOptions() {
  const timer = state.timer;
  $("continuousBtn").setAttribute("aria-pressed", String(!timer));
  $("intervalBtn").setAttribute("aria-pressed", String(Boolean(timer?.intervals)));
  $("intervalBtn").title = state.activity?.intervals ? "Study intervals: 25 minutes of focus, 5 minutes of rest" : "";
  $("timerPresets").querySelectorAll("button").forEach((button) => {
    button.setAttribute("aria-pressed", String(!timer?.intervals && timer?.total === Number(button.dataset.minutes) * 60000));
  });
  $("customMinutes").value = "";
}

const mixControls = [["volume", "Volume"], ["rainLevel", "Rain"], ["oceanLevel", "Ocean"], ["vinylLevel", "Vinyl"]];
function syncMixer() {
  mixControls.forEach(([key]) => {
    const percent = Math.round((key === "volume" && state.muted ? 0 : state[key]) * 100);
    $(key).value = percent;
    $(key + "Out").textContent = percent ? `${percent}%` : "Off";
  });
  $("crossfade").value = state.crossfadeSec;
}

function bindControls() {
  $("mixerRows").innerHTML = mixControls.map(([key, label]) => `
    <div class="mixer-row"><label for="${key}">${label}</label><input id="${key}" type="range" min="0" max="100">
      <output id="${key}Out" for="${key}"></output></div>`).join("");
  mixControls.forEach(([key]) => {
    $(key).addEventListener("input", (event) => {
      const value = Number(event.target.value) / 100;
      if (key === "volume") setVolume(value);
      else {
        state[key] = value;
        if (state.isPlaying) {
          ensureAudioGraph(true);
          syncAmbience();
        }
        savePrefs();
      }
      syncMixer();
    });
  });
  const prefs = [
    ["crossfade", "crossfadeSec", (el) => Number(el.value)], ["autoNext", "autoNext", (el) => el.checked],
    ["shuffle", "shuffle", (el) => el.checked], ["repeat", "loopMode", (el) => el.value],
  ];
  prefs.forEach(([id, key, read]) => {
    const element = $(id);
    if (element.type === "checkbox") element.checked = state[key];
    else element.value = state[key];
    element.addEventListener("change", () => { state[key] = read(element); savePrefs(); });
  });
  $("timerPresets").replaceChildren(...TIMER_PRESETS.map((minutes) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pill";
    button.dataset.minutes = minutes;
    button.textContent = `${minutes} min`;
    button.addEventListener("click", () => { setTimer(minutes); $("timerDialog").close(); });
    return button;
  }));
  $("customTimer").addEventListener("submit", (event) => {
    event.preventDefault();
    if (setTimer($("customMinutes").valueAsNumber)) $("timerDialog").close();
  });
  $("continuousBtn").addEventListener("click", () => { setTimer(0); $("timerDialog").close(); });
  $("intervalBtn").addEventListener("click", () => { setTimer(25, true); $("timerDialog").close(); });
  document.querySelectorAll("dialog").forEach((dialog) => {
    dialog.querySelector(".dialog-close").addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (event) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right ||
          event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    });
    dialog.addEventListener("close", () => {
      const origin = modalReturns.get(dialog);
      if (origin?.getClientRects().length && !document.querySelector("dialog[open]")) origin.focus({ preventScroll: true });
    });
  });
  document.querySelectorAll("[data-transport]").forEach((button) => {
    const actions = { toggle: togglePlayback, previous: previousTrack, next: () => nextTrack(), stop: stopSession };
    button.addEventListener("click", actions[button.dataset.transport]);
  });
  document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => {
    showView(button.dataset.view === "start" && selectedMode ? "activities" : button.dataset.view, { restoreScroll: true });
  }));
  document.querySelector("[data-home]").addEventListener("click", resetModes);
  document.querySelectorAll("[data-dialog]").forEach((button) => button.addEventListener("click", () => openDialog(button.dataset.dialog, button)));
  document.querySelectorAll("[data-scene]").forEach((button) => button.addEventListener("click", () => pickScene(button.dataset.scene)));
  document.querySelectorAll("[data-signal]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.signal === state.vizMode));
    button.addEventListener("click", () => pickSignal(button.dataset.signal));
  });
  $("aboutBtn").addEventListener("click", () => openDialog("aboutDialog"));
  $("backModes").addEventListener("click", resetModes);
  $("backPlayer").addEventListener("click", closePlayer);
  $("openPlayer").addEventListener("click", () => showView("player"));
  $("resumeBtn").addEventListener("click", resumeLastActivity);
  $("breathBtn").addEventListener("click", toggleBreath);
  $("retryBtn").addEventListener("click", () => state.failure?.retry());
  $("enterZen").addEventListener("click", () => setZen(true));
  $("exitZen").addEventListener("click", () => setZen(false));
  document.addEventListener("fullscreenchange", () => { if (zen && !document.fullscreenElement) setZen(false); });
  $("seek").addEventListener("input", (event) => seekTo(event.target.valueAsNumber));
  $("search").addEventListener("input", renderLibrary);
  ["modeFilter", "moodFilter", "bandFilter"].forEach((id) => $(id).addEventListener("change", renderLibrary));
  $("playBlueprint").addEventListener("click", () => startLibrary(tracksFor(blueprint.slugs), 0, blueprint.name));
}

function resumeLastActivity() {
  if (state.activity?.key !== state.lastActivity || (!state.isPlaying && !state.timer && preferredTimer().minutes)) {
    launchActivity(state.lastActivity);
    return;
  }
  showView("player");
  if (!state.isPlaying && !state.timer?.deadline && !startAttempt) togglePlayback();
}

function resetModes() {
  selectedMode = null;
  showView("start");
}

function closePlayer() {
  showView(returnView, { restoreScroll: true });
}

document.addEventListener("keydown", (event) => {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || document.querySelector("dialog[open]")) return;
  if (event.key === "Escape" && zen) { setZen(false); return; }
  if (event.target !== document.body) return;
  const shortcuts = {
    " ": togglePlayback, n: () => nextTrack(), p: previousTrack,
    m: () => setVolume(state.volume, !state.muted),
    v: () => { if (view === "player" && scene === "signal") closePlayer(); else { showView("player"); pickScene("signal"); } },
    z: () => setZen(!zen), b: toggleBreath, "?": () => openDialog("helpDialog"),
    ArrowLeft: () => seekTo(currentPosition().cur - 15), ArrowRight: () => seekTo(currentPosition().cur + 15),
  };
  ["signature", "silk", "halo", "horizon"].forEach((style, index) => { shortcuts[index + 1] = () => { showView("player"); pickSignal(style); }; });
  const action = shortcuts[event.key.length === 1 ? event.key.toLowerCase() : event.key];
  if (action) { event.preventDefault(); action(); }
});

function getState() {
  const track = getCurrentTrack();
  const art = availableArt(state.activity ? artForActivity(state.activity) : artForTrack(track));
  return {
    ready: Boolean(state.allTracks.length),
    activity: state.activity?.key || "",
    name: state.sessionName || "Dreamlight",
    title: track?.title || "",
    trackSlug: track?.slug || "",
    ...art,
    playing: state.isPlaying,
    starting: state.starting,
    error: state.failure?.label || "",
    completed: state.completedUntil > Date.now(),
    volume: state.volume,
    reducedMotion: prefersReducedMotion,
    ...currentPosition(),
    ...getTimerState(),
    upNext: !state.shuffle && state.autoNext ? state.queue[nextIndex(true)]?.title || "" : "",
  };
}

function syncVisualVisibility() {
  const active = windowVisible && !remoteVisible;
  motion.suppress(!active);
  if (active) syncVisualizer();
  else if (visualFrame !== null) {
    cancelAnimationFrame(visualFrame);
    visualFrame = null;
  }
}

window.dreamlight = Object.freeze({
  getState, toggle: togglePlayback, next: () => nextTrack(), prev: previousTrack, stop: stopSession,
  setTimer, startActivity: launchActivity, modes: MODES, activities: ACTIVITIES, timerPresets: TIMER_PRESETS,
  retry: () => state.failure?.retry(),
  zen: () => setZen(!zen), breath: toggleBreath,
  setRemoteVisible(on) { remoteVisible = on; syncVisualVisibility(); },
  setWindowVisible(on) { windowVisible = on; syncVisualVisibility(); },
});

playback.addEventListener("track", () => {
  showTrack();
  renderTransport();
  markLibrary();
  renderQueue();
  syncArt();
});
playback.addEventListener("state", () => {
  renderTransport();
  const track = getCurrentTrack();
  if (renderedTrack !== track || renderedPlaying !== state.isPlaying) {
    renderedTrack = track;
    renderedPlaying = state.isPlaying;
    markLibrary();
  }
});
playback.addEventListener("clock", renderClock);
playback.addEventListener("position", renderPosition);
playback.addEventListener("complete", announceComplete);

motionPreference.addEventListener("change", (event) => {
  prefersReducedMotion = event.matches;
  syncArt();
});
document.addEventListener("visibilitychange", () => { if (windowVisible && !remoteVisible) syncVisualizer(); });
new ResizeObserver(() => { if (windowVisible && !remoteVisible) syncVisualizer(); }).observe($("heroVisual"));

async function init() {
  heroArt = artSlot();
  $("heroScene").append(heroArt);
  bindControls();
  try {
    const result = await Promise.all([fetch("tracks.json").then((response) => response.json()), loadMotionInventory]);
    state.allTracks = result[0].tracks;
    const activity = ACTIVITY_BY_KEY.get(state.lastActivity);
    if (activity || saved.lastFilename) {
      const track = state.allTracks.find((item) => item.filename === saved.lastFilename);
      const queue = tracksFor(activity?.queue || BLUEPRINTS.find((item) => item.key === saved.activeStack)?.slugs);
      state.queue = queue;
      state.currentIdx = Math.max(0, queue.indexOf(track));
      state.activity = activity || null;
      state.sessionName = activity?.name || "Library";
      installTimer(preferredTimer(activity));
      if (getCurrentTrack()) activeAudio().src = getCurrentTrack().url;
    }
    renderModes();
    renderBlueprints();
    optionList("modeFilter", MODES.map((mode) => mode.key));
    optionList("moodFilter", [...new Set(state.allTracks.map((track) => track.mood))]);
    optionList("bandFilter", [...new Set(state.allTracks.map(bandFamily))]);
    renderLibrary();
    showTrack();
    renderTransport();
    syncArt();
  } catch {
    state.failure = { label: "Couldn't load this session", retry: () => location.reload() };
    renderFeedback();
  }
}

init();
