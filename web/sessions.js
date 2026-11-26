const MODES = [
  { key: "focus", name: "Focus", feel: "Lock in", hue: "#8DB9FF" },
  { key: "relax", name: "Relax", feel: "Exhale", hue: "#F5BF8D" },
  { key: "sleep", name: "Sleep", feel: "Drift off", hue: "#A5A4ED" },
  { key: "meditate", name: "Meditate", feel: "Be here", hue: "#98DBC2" },
];

const ACTIVITIES = [
  { mode: "focus", key: "deep_work", name: "Deep work", minutes: 50,
    queue: ["dreamlight", "helix_signature", "obsidian_pulse", "quartz_engine", "neon_synapse", "cobalt_lattice"] },
  { mode: "focus", key: "morning_coffee", name: "Morning coffee", minutes: 25,
    queue: ["golden_atelier", "amber_horizon", "emerald_canopy"] },
  { mode: "focus", key: "creative_flow", name: "Creative flow", minutes: 45,
    queue: ["prism_spark", "velvet_drift", "moss_courtyard"] },
  { mode: "focus", key: "study", name: "Study", minutes: 25, intervals: true,
    queue: ["rainlit_loft", "cedar_study"] },
  { mode: "focus", key: "light_work", name: "Light work", minutes: 25,
    queue: ["moss_courtyard", "emerald_canopy", "amber_horizon"] },
  { mode: "focus", key: "motivation", name: "Get moving", minutes: 15,
    queue: ["aurora_ascent", "solar_flare", "kinetic_forge"] },
  { mode: "relax", key: "unwind", name: "Unwind", minutes: 20,
    queue: ["hearth_ember", "dusk_lagoon"] },
  { mode: "relax", key: "recharge", name: "Recharge", minutes: 15,
    queue: ["velvet_drift", "dusk_lagoon"] },
  { mode: "relax", key: "chill", name: "Chill", minutes: 0,
    queue: ["rainlit_loft", "hearth_ember"] },
  { mode: "sleep", key: "wind_down", name: "Wind down", minutes: 30,
    queue: ["lunar_cradle", "midnight_tide"] },
  { mode: "sleep", key: "power_nap", name: "Power nap", minutes: 20, gentleEnd: true,
    queue: ["cloud_drift"] },
  { mode: "sleep", key: "deep_sleep", name: "Deep sleep", minutes: 0,
    queue: ["abyssal_drift", "deep_trench"] },
  { mode: "meditate", key: "meditate", name: "Meditate", minutes: 10,
    queue: ["saffron_sanctuary", "midnight_tide"] },
  { mode: "meditate", key: "breathwork", name: "Breathwork", minutes: 10, breath: true,
    queue: ["midnight_tide"] },
];

const TIMER_PRESETS = Object.freeze([10, 15, 20, 25, 30, 45, 50, 60, 90]);
const ACTIVITY_BY_KEY = new Map(ACTIVITIES.map((activity) => [activity.key, activity]));
const MODE_BY_KEY = new Map(MODES.map((mode) => [mode.key, mode]));

const BLUEPRINTS = [
  { key: "all",      name: "All Sessions",     meta: "25h · Full Library",  cover: "covers/dreamlight.png",        slugs: null },
  { key: "deepwork", name: "Deep Work Sprint", meta: "6h · Gamma & Beta",   cover: "covers/cobalt_lattice.png",
    slugs: ["dreamlight", "cobalt_lattice", "neon_synapse", "quartz_engine", "obsidian_pulse", "helix_signature"] },
  { key: "energize", name: "Morning Ignition", meta: "3h · High-Beta",      cover: "covers/aurora_ascent.png",
    slugs: ["aurora_ascent", "solar_flare", "kinetic_forge"] },
  { key: "study",    name: "Study & Reading",  meta: "4h · Lo-Fi & SMR",    cover: "covers/cedar_study.png",
    slugs: ["rainlit_loft", "cedar_study", "golden_atelier", "amber_horizon"] },
  { key: "creative", name: "Creative Flow",    meta: "4h · Gamma & Alpha",  cover: "covers/prism_spark.png",
    slugs: ["prism_spark", "moss_courtyard", "emerald_canopy", "velvet_drift"] },
  { key: "unwind",   name: "Evening Reset",    meta: "4h · Alpha & Theta",  cover: "covers/hearth_ember.png",
    slugs: ["hearth_ember", "dusk_lagoon", "midnight_tide", "saffron_sanctuary"] },
  { key: "sleep",    name: "Nap & Deep Sleep", meta: "4h · Theta & Delta",  cover: "covers/lunar_cradle.png",
    slugs: ["cloud_drift", "abyssal_drift", "lunar_cradle", "deep_trench"] },
  { key: "ramp",     name: "Full Descent",     meta: "25h · 42 → 1.5 Hz",   cover: "covers/velvet_drift.png",
    slugs: ["cobalt_lattice", "neon_synapse", "prism_spark", "kinetic_forge", "aurora_ascent", "solar_flare", "quartz_engine", "dreamlight", "obsidian_pulse", "helix_signature", "rainlit_loft", "cedar_study", "golden_atelier", "amber_horizon", "moss_courtyard", "emerald_canopy", "velvet_drift", "hearth_ember", "dusk_lagoon", "midnight_tide", "saffron_sanctuary", "cloud_drift", "abyssal_drift", "lunar_cradle", "deep_trench"] },
];
