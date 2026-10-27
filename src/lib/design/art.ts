// Art directions for games. A web app is built to a brand design system (DESIGN.md); a game
// gets one of these instead: a curated, tested look (palette with roles, display and body
// fonts, backdrop, 3D lighting, post-processing, music mood) that the game kit renders.
// Models pick colors badly; picking from curated themes keeps every game harmonious, and the
// art direction the model writes on top (docs/ART-DIRECTION.md) makes it specific.
//
// Stored as the project's designSlug, prefixed: "art:neon-arcade". Client-safe.

export type ArtFont = {
  /** Google Fonts family, as next/font/google exports it (spaces → underscores). */
  family: string;
  /** Required for fonts that aren't variable. */
  weight?: string[];
};

export type ArtTheme = {
  id: string;
  name: string;
  /** For the model that picks one: mood, genres it suits. */
  description: string;
  palette: {
    /** Deepest background. */
    bg: string;
    /** Background highlight (top of the sky gradient, glow behind menus). */
    bg2: string;
    /** Panels, ground, platforms. */
    surface: string;
    /** Main text and the brightest neutral. */
    ink: string;
    /** Secondary text. */
    muted: string;
    /** The player and the main call to action. */
    primary: string;
    /** World accents, secondary characters. */
    secondary: string;
    /** Rewards: pickups, coins, score. */
    accent: string;
    /** Enemies, hazards, damage. */
    danger: string;
    /** Health, success, safe zones. */
    good: string;
  };
  fonts: { display: ArtFont; body: ArtFont };
  /** Headings and titles: uppercase or as written, and letter spacing. */
  titleCase: "uppercase" | "none";
  titleTracking: string;
  /** Menu panels: frosted glass, solid card, paper with ink border, or chunky pixel frame. */
  panel: "glass" | "solid" | "paper" | "pixel";
  radius: number;
  /** The 2D backdrop recipe (game kit: backdrop.ts). */
  backdrop: {
    sky: [string, string];
    orb: string | null;
    silhouettes: "mountains" | "hills" | "trees" | "city" | "dunes" | "none";
    particles: "stars" | "bubbles" | "snow" | "fireflies" | "dust" | "confetti";
    grid: boolean;
  };
  /** 3D lighting and environment (game kit: stage.ts). */
  world3d: { skyTop: string; skyBottom: string; ground: string; fog: number; sun: string; sunIntensity: number };
  /** Bloom strength 0–1.5, screen vignette, grain and scanlines 0–1, UI glow 0–1. */
  fx: { bloom: number; vignette: number; grain: number; scanlines: number; glow: number; pixelArt: boolean };
  music: { mood: "major" | "minor"; bpm: number };
};

export const ART_THEMES: ArtTheme[] = [
  {
    id: "neon-arcade",
    name: "Neon Arcade",
    description: "Synthwave night: glowing neon on deep violet, a horizon grid and a magenta sun. Fast arcade action, shooters, racers, rhythm games.",
    palette: {
      bg: "#0a0618",
      bg2: "#2a0f4d",
      surface: "#170d36",
      ink: "#f6f1ff",
      muted: "#a99ad6",
      primary: "#2ef2ff",
      secondary: "#ff3fb4",
      accent: "#ffd447",
      danger: "#ff4766",
      good: "#4dffa6",
    },
    fonts: { display: { family: "Orbitron" }, body: { family: "Rajdhani", weight: ["500", "600", "700"] } },
    titleCase: "uppercase",
    titleTracking: "0.06em",
    panel: "glass",
    radius: 10,
    backdrop: { sky: ["#0a0618", "#3b1170"], orb: "#ff3fb4", silhouettes: "mountains", particles: "stars", grid: true },
    world3d: { skyTop: "#07041a", skyBottom: "#5a1a7a", ground: "#140a2e", fog: 0.02, sun: "#ffc6f0", sunIntensity: 2.0 },
    fx: { bloom: 1.1, vignette: 0.55, grain: 0.05, scanlines: 0.22, glow: 1, pixelArt: false },
    music: { mood: "minor", bpm: 118 },
  },
  {
    id: "cozy-meadow",
    name: "Cozy Meadow",
    description: "Soft, warm daylight pastels, rolling hills and drifting clouds, round friendly shapes. Casual, cute, relaxing, farming, puzzles, kids.",
    palette: {
      bg: "#9fd8ea",
      bg2: "#eaf8f1",
      surface: "#fffaf0",
      ink: "#3b2f4a",
      muted: "#77698a",
      primary: "#ff8a5c",
      secondary: "#6fbf73",
      accent: "#ffc93c",
      danger: "#e8505b",
      good: "#4cbf86",
    },
    fonts: { display: { family: "Fredoka" }, body: { family: "Nunito" } },
    titleCase: "none",
    titleTracking: "-0.01em",
    panel: "solid",
    radius: 22,
    backdrop: { sky: ["#8fd3ec", "#fdf2d8"], orb: "#fff1b8", silhouettes: "hills", particles: "dust", grid: false },
    world3d: { skyTop: "#7cc8e8", skyBottom: "#fdf0d5", ground: "#93d48c", fog: 0.012, sun: "#fff3d6", sunIntensity: 2.6 },
    fx: { bloom: 0.25, vignette: 0.16, grain: 0.03, scanlines: 0, glow: 0.12, pixelArt: false },
    music: { mood: "major", bpm: 96 },
  },
  {
    id: "retro-pixel",
    name: "Retro Pixel",
    description: "8-bit console look: chunky pixels, a classic 16-color palette, scanlines, blocky type. Platformers, dungeon crawlers, retro arcade.",
    palette: {
      bg: "#1a1c2c",
      bg2: "#333c57",
      surface: "#29366f",
      ink: "#f4f4f4",
      muted: "#94b0c2",
      primary: "#41a6f6",
      secondary: "#38b764",
      accent: "#ffcd75",
      danger: "#b13e53",
      good: "#a7f070",
    },
    fonts: { display: { family: "Press_Start_2P", weight: ["400"] }, body: { family: "VT323", weight: ["400"] } },
    titleCase: "uppercase",
    titleTracking: "0.02em",
    panel: "pixel",
    radius: 0,
    backdrop: { sky: ["#1a1c2c", "#5d275d"], orb: "#ef7d57", silhouettes: "mountains", particles: "stars", grid: false },
    world3d: { skyTop: "#1a1c2c", skyBottom: "#5d275d", ground: "#29366f", fog: 0.02, sun: "#ffcd75", sunIntensity: 2.2 },
    fx: { bloom: 0.3, vignette: 0.4, grain: 0, scanlines: 0.35, glow: 0.2, pixelArt: true },
    music: { mood: "minor", bpm: 132 },
  },
  {
    id: "deep-sea",
    name: "Bioluminescent Deep",
    description: "Dark ocean depths with glowing creatures, light shafts and rising bubbles. Exploration, survival, calm or eerie games.",
    palette: {
      bg: "#020b1a",
      bg2: "#06324a",
      surface: "#08243a",
      ink: "#e6fbff",
      muted: "#7fb3c4",
      primary: "#3df5d0",
      secondary: "#6b8bff",
      accent: "#ffe066",
      danger: "#ff5d73",
      good: "#7dff9b",
    },
    fonts: { display: { family: "Exo_2" }, body: { family: "Exo_2" } },
    titleCase: "uppercase",
    titleTracking: "0.08em",
    panel: "glass",
    radius: 18,
    backdrop: { sky: ["#0b4a63", "#020b1a"], orb: null, silhouettes: "dunes", particles: "bubbles", grid: false },
    world3d: { skyTop: "#0b4a63", skyBottom: "#01060f", ground: "#0a2a36", fog: 0.045, sun: "#9ff3ff", sunIntensity: 1.6 },
    fx: { bloom: 1.0, vignette: 0.6, grain: 0.04, scanlines: 0, glow: 1, pixelArt: false },
    music: { mood: "minor", bpm: 84 },
  },
  {
    id: "golden-sunset",
    name: "Golden Sunset",
    description: "Warm dusk: an orange-to-violet sky, a huge low sun, layered mountain silhouettes. Runners, racers, adventure, flying.",
    palette: {
      bg: "#24123a",
      bg2: "#f0705a",
      surface: "#3a1f4f",
      ink: "#fff4e8",
      muted: "#e6b9b2",
      primary: "#ffb547",
      secondary: "#ff5e8a",
      accent: "#7de2ff",
      danger: "#ff3b5c",
      good: "#8cf5a0",
    },
    fonts: { display: { family: "Bungee", weight: ["400"] }, body: { family: "Outfit" } },
    titleCase: "uppercase",
    titleTracking: "0.02em",
    panel: "glass",
    radius: 14,
    backdrop: { sky: ["#2b1640", "#ff8a5c"], orb: "#ffd36e", silhouettes: "mountains", particles: "dust", grid: false },
    world3d: { skyTop: "#2b1640", skyBottom: "#ff8a5c", ground: "#4a2350", fog: 0.02, sun: "#ffc58a", sunIntensity: 2.4 },
    fx: { bloom: 0.6, vignette: 0.45, grain: 0.05, scanlines: 0, glow: 0.6, pixelArt: false },
    music: { mood: "major", bpm: 104 },
  },
  {
    id: "candy-pop",
    name: "Candy Pop",
    description: "Bright, saturated, bouncy: candy colors, soft blobs and confetti, chunky rounded type. Party, match-3, casual, kids, physics toys.",
    palette: {
      bg: "#ffd6e8",
      bg2: "#fff3f8",
      surface: "#ffffff",
      ink: "#3d1f5c",
      muted: "#8a6aa8",
      primary: "#ff4fa3",
      secondary: "#4fb8f5",
      accent: "#ffbf00",
      danger: "#ff5a36",
      good: "#2fbf71",
    },
    fonts: { display: { family: "Lilita_One", weight: ["400"] }, body: { family: "Nunito" } },
    titleCase: "none",
    titleTracking: "0.01em",
    panel: "solid",
    radius: 24,
    backdrop: { sky: ["#ffc2de", "#fff6d6"], orb: null, silhouettes: "hills", particles: "confetti", grid: false },
    world3d: { skyTop: "#ffc2de", skyBottom: "#fff6d6", ground: "#ffb3d9", fog: 0.012, sun: "#fff4e6", sunIntensity: 2.6 },
    fx: { bloom: 0.2, vignette: 0.12, grain: 0, scanlines: 0, glow: 0.1, pixelArt: false },
    music: { mood: "major", bpm: 128 },
  },
  {
    id: "ink-paper",
    name: "Ink & Paper",
    description: "Hand-drawn noir: warm paper, black ink strokes, a single red accent, grain. Stealth, mystery, puzzle, minimalist or story games.",
    palette: {
      bg: "#efe9dc",
      bg2: "#faf6ec",
      surface: "#fffdf6",
      ink: "#1c1a17",
      muted: "#6b655a",
      primary: "#1c1a17",
      secondary: "#55504a",
      accent: "#e63946",
      danger: "#b5121b",
      good: "#2a9d8f",
    },
    fonts: { display: { family: "Permanent_Marker", weight: ["400"] }, body: { family: "Kalam", weight: ["400", "700"] } },
    titleCase: "none",
    titleTracking: "0",
    panel: "paper",
    radius: 6,
    backdrop: { sky: ["#f6f1e5", "#e9e1cf"], orb: "#e63946", silhouettes: "city", particles: "dust", grid: false },
    world3d: { skyTop: "#f3eee2", skyBottom: "#e2d9c6", ground: "#e6dece", fog: 0.02, sun: "#fff8ea", sunIntensity: 2.2 },
    fx: { bloom: 0, vignette: 0.25, grain: 0.09, scanlines: 0, glow: 0, pixelArt: false },
    music: { mood: "minor", bpm: 90 },
  },
  {
    id: "enchanted-forest",
    name: "Enchanted Forest",
    description: "A forest at dusk: layered tree silhouettes, fireflies, moss greens and gold, a little magic. Fantasy, adventure, RPG, exploration.",
    palette: {
      bg: "#0b1a14",
      bg2: "#24412f",
      surface: "#142a20",
      ink: "#f4ecd8",
      muted: "#a9b89f",
      primary: "#6fd3c1",
      secondary: "#7fb069",
      accent: "#f4c95d",
      danger: "#e0546a",
      good: "#a7e07f",
    },
    fonts: { display: { family: "Cinzel" }, body: { family: "Alegreya_Sans", weight: ["400", "500", "700"] } },
    titleCase: "uppercase",
    titleTracking: "0.1em",
    panel: "glass",
    radius: 12,
    backdrop: { sky: ["#0d1f2a", "#3d5a40"], orb: "#f6e7b0", silhouettes: "trees", particles: "fireflies", grid: false },
    world3d: { skyTop: "#0d1f2a", skyBottom: "#4d6b4c", ground: "#1d3b28", fog: 0.035, sun: "#ffe6b0", sunIntensity: 1.8 },
    fx: { bloom: 0.8, vignette: 0.55, grain: 0.04, scanlines: 0, glow: 0.8, pixelArt: false },
    music: { mood: "minor", bpm: 76 },
  },
  {
    id: "cosmic-void",
    name: "Cosmic Void",
    description: "Deep space: nebula clouds, parallax stars, violet and thruster orange, crisp sci-fi type. Space shooters, asteroids, strategy, sci-fi.",
    palette: {
      bg: "#05030f",
      bg2: "#1b0f3f",
      surface: "#120c2a",
      ink: "#eef0ff",
      muted: "#9aa0d0",
      primary: "#8c7bff",
      secondary: "#ff8a3d",
      accent: "#ffe27a",
      danger: "#ff4d6a",
      good: "#5cf0b3",
    },
    fonts: { display: { family: "Audiowide", weight: ["400"] }, body: { family: "Space_Grotesk" } },
    titleCase: "uppercase",
    titleTracking: "0.08em",
    panel: "glass",
    radius: 12,
    backdrop: { sky: ["#05030f", "#241552"], orb: "#ff8a3d", silhouettes: "none", particles: "stars", grid: false },
    world3d: { skyTop: "#05030f", skyBottom: "#241552", ground: "#120c2a", fog: 0.015, sun: "#e8e0ff", sunIntensity: 2.0 },
    fx: { bloom: 1.0, vignette: 0.55, grain: 0.03, scanlines: 0, glow: 0.9, pixelArt: false },
    music: { mood: "minor", bpm: 100 },
  },
  {
    id: "arctic-minimal",
    name: "Arctic Minimal",
    description: "Crisp and clean: icy whites and blues, soft snowfall, distant peaks, generous space. Puzzles, word and logic games, calm skill games.",
    palette: {
      bg: "#dcecf6",
      bg2: "#f7fbfe",
      surface: "#ffffff",
      ink: "#0b2a45",
      muted: "#5d7a92",
      primary: "#1f8fff",
      secondary: "#00b39a",
      accent: "#ff9f1c",
      danger: "#ff4757",
      good: "#20c26a",
    },
    fonts: { display: { family: "Righteous", weight: ["400"] }, body: { family: "Lexend" } },
    titleCase: "none",
    titleTracking: "0.01em",
    panel: "solid",
    radius: 16,
    backdrop: { sky: ["#bfe3f7", "#f7fbfe"], orb: null, silhouettes: "mountains", particles: "snow", grid: false },
    world3d: { skyTop: "#a9d8f2", skyBottom: "#f7fbfe", ground: "#eef6fb", fog: 0.014, sun: "#ffffff", sunIntensity: 2.4 },
    fx: { bloom: 0.15, vignette: 0.1, grain: 0, scanlines: 0, glow: 0.1, pixelArt: false },
    music: { mood: "major", bpm: 92 },
  },
];

export const ART_IDS = ART_THEMES.map((t) => t.id);

const ART_PREFIX = "art:";

export function isArtSlug(slug: string | null | undefined): slug is string {
  return Boolean(slug?.startsWith(ART_PREFIX));
}

export function artSlug(id: string) {
  return ART_PREFIX + id;
}

export function artTheme(slug: string): ArtTheme | null {
  const id = slug.startsWith(ART_PREFIX) ? slug.slice(ART_PREFIX.length) : slug;
  return ART_THEMES.find((t) => t.id === id) ?? null;
}
