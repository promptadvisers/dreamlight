const $ = (id) => document.getElementById(id);
const motionPreference = matchMedia("(prefers-reduced-motion: reduce)");
let prefersReducedMotion = motionPreference.matches;

// The inventory avoids failed media requests for optional files. Local servers read it
// from disk at request time. Static hosts serve the checked-in snapshot.
const motionFiles = new Set();
const loadMotionInventory = fetch("motion-index.json").then((response) => response.json())
  .then((files) => files.forEach((path) => motionFiles.add(path))).catch(() => {});
const artForMode = (key) => ({ stem: `motion/modes/${key}`, hue: MODE_BY_KEY.get(key)?.hue });
const artForActivity = (activity) => ({ stem: `motion/activities/${activity.key}`, hue: MODE_BY_KEY.get(activity.mode)?.hue });
const artForTrack = (track) => ({ poster: track?.cover, loop: track?.coverLoop || (track ? `covers/loops/${track.slug}.mp4` : ""), hue: track?.palette?.[0] });
const availableArt = (art = {}) => ({
  poster: art.poster || (motionFiles.has(art.stem + ".jpg") ? art.stem + ".jpg" : ""),
  loop: motionFiles.has(art.loop || art.stem + ".mp4") ? (art.loop || art.stem + ".mp4") : "",
  hue: art.hue || "#8DB9FF",
});

const motion = (() => {
  const slots = new WeakMap();
  const broken = new Set();
  const running = new Map();
  let stage = null, hovered = null, focused = null, suspended = false;
  const viewport = new IntersectionObserver(sync);

  function setArt(slot, art) {
    const { poster, loop, hue } = availableArt(art);
    const previous = slots.get(slot);
    if (previous?.poster === poster && previous.loop === loop && previous.hue === hue) return;
    stop(slot, true);
    const img = slot.querySelector("img");
    img.onerror = () => { img.removeAttribute("src"); img.hidden = true; };
    img.hidden = !poster;
    if (poster) img.src = poster;
    else img.removeAttribute("src");
    slot.style.setProperty("--art-hue", hue);
    slots.set(slot, { poster, loop, hue });
  }

  function stop(slot, unload = false) {
    const video = slot.querySelector("video");
    if (!video) return;
    video.pause();
    slot.classList.remove("decoded");
    running.delete(slot);
    if (unload) video.remove();
  }

  function start(slot) {
    const art = slots.get(slot);
    if (!art?.loop || broken.has(art.loop) || running.has(slot)) return;
    let video = slot.querySelector("video");
    if (!video) {
      video = document.createElement("video");
      video.muted = video.loop = video.playsInline = true;
      video.preload = "none";
      if (art.poster) video.poster = art.poster;
      video.addEventListener("error", () => {
        broken.add(art.loop);
        stop(slot, true);
      }, { once: true });
      video.addEventListener("playing", () => {
        const show = () => {
          if (running.get(slot) === video && !video.paused) slot.classList.add("decoded");
        };
        if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(show);
        else show();
      });
      slot.append(video);
      video.src = art.loop;
    }
    running.set(slot, video);
    video.play().catch(() => {
      if (running.get(slot) === video && video.paused) stop(slot);
    });
  }

  function isVisible(slot) {
    if (!slot?.isConnected || !slot.getClientRects().length || slot.closest("[hidden]")) return false;
    const rect = slot.getBoundingClientRect();
    return rect.top < innerHeight && rect.bottom > 0 && rect.left < innerWidth && rect.right > 0;
  }

  function sync() {
    const preview = hovered || focused;
    const candidates = document.hidden || suspended || prefersReducedMotion ? [] : [stage, preview].filter(isVisible);
    for (const slot of running.keys()) if (!candidates.includes(slot)) stop(slot);
    candidates.forEach(start);
  }

  function selectStage(slot) {
    if (stage) viewport.unobserve(stage);
    stage = slot;
    if (stage) viewport.observe(stage);
    sync();
  }

  function bindTile(button, slot) {
    const pick = (kind, on) => {
      if (kind === "pointer") hovered = on ? slot : hovered === slot ? null : hovered;
      else focused = on ? slot : focused === slot ? null : focused;
      if (on) viewport.observe(slot);
      if (!on && slot !== hovered && slot !== focused) viewport.unobserve(slot);
      sync();
    };
    button.addEventListener("pointerenter", (event) => { if (event.pointerType !== "touch") pick("pointer", true); });
    button.addEventListener("pointerleave", () => pick("pointer", false));
    button.addEventListener("focus", () => { if (button.matches(":focus-visible")) pick("focus", true); });
    button.addEventListener("blur", () => pick("focus", false));
  }

  function clearPreviews() {
    [hovered, focused].filter(Boolean).forEach((slot) => viewport.unobserve(slot));
    hovered = focused = null;
    sync();
  }

  function suppress(on) {
    suspended = on;
    sync();
  }

  document.addEventListener("visibilitychange", sync);
  return { setArt, selectStage, bindTile, clearPreviews, suppress, sync };
})();
