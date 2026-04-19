export const FACTIONS = {};

export const STATUS = {
  alive:   { label: "Naživu",   color: "#2E7D32", icon: "●" },
  dead:    { label: "Mrtvý/á", color: "#8B0000", icon: "✦" },
  unknown: { label: "Neznámo", color: "#6A1B9A", icon: "?" },
};

// Artifact state enum — shown as a chip in artifact cards/editors.
export const ARTIFACT_STATES = {
  nalezen:    { label: "Nalezen",      color: "#2E7D32", icon: "✨" },
  u_postavy:  { label: "U postavy",    color: "#C9A14B", icon: "🎒" },
  strezeny:   { label: "Střežený",     color: "#1565C0", icon: "🛡" },
  skryty:     { label: "Skrytý",       color: "#6A1B9A", icon: "🕵" },
  ztraceny:   { label: "Ztracený",     color: "#795548", icon: "❓" },
  zniceny:    { label: "Zničený",      color: "#8B0000", icon: "💥" },
};

export const CHARACTERS    = [];
export const LOCATIONS     = [];
export const EVENTS        = [];
export const RELATIONSHIPS = [];
export const MYSTERIES     = [];
export const MAP_PINS      = [];

// Seeded D&D races. Users can delete any of these; deletion tombstones
// in `deletedDefaults` prevent re-seeding on restart.
export const SPECIES = [
  { id: "human",      name: "Člověk",       description: "" },
  { id: "elf",        name: "Elf",          description: "" },
  { id: "half_elf",   name: "Půlelf",       description: "" },
  { id: "dwarf",      name: "Trpaslík",     description: "" },
  { id: "halfling",   name: "Hobit",        description: "" },
  { id: "gnome",      name: "Gnóm",         description: "" },
  { id: "tiefling",   name: "Tiefling",     description: "" },
  { id: "dragonborn", name: "Dračizeň",     description: "" },
  { id: "half_orc",   name: "Půlork",       description: "" },
  { id: "orc",        name: "Ork",          description: "" },
  { id: "goliath",    name: "Goliáš",       description: "" },
  { id: "half_dragon",name: "Půldrak",      description: "" },
  { id: "aasimar",    name: "Aasimar",      description: "" },
  { id: "genasi",     name: "Genasi",       description: "" },
  { id: "firbolg",    name: "Firbolg",      description: "" },
];

export const PANTHEON  = [];
export const ARTIFACTS = [];
