import "server-only";
import { generateText, Output } from "ai";
import { z } from "zod";
import { modelFor, reasoningFor, structuredModelId } from "@/lib/ai";
import type { GameRender } from "@/lib/build/game-kit";
import { type ProjectSpec, specText } from "@/lib/spec/templates";
import { recordUsage, type UsageScope } from "@/lib/usage";
import { ART_IDS, ART_THEMES, type ArtTheme, artSlug } from "./art";

// Art direction for games, in two steps: pick a curated theme and 2D or 3D (cheap, when the
// spec completes), then write the game's own art bible on top of it (docs/ART-DIRECTION.md,
// once, when the build sets the game up). The theme keeps colors and type harmonious; the
// art bible makes it this game, in terms of the kit's building blocks.

const WANTS_3D = /\b3d\b|three[- ]?dimensional|first[- ]person|third[- ]person|ego[- ]?perspektive|voxel|low[- ]poly/i;

/** Picks the theme and whether the game is 2D or 3D. */
export async function chooseArt(
  scope: UsageScope,
  input: { name: string; vision: string; spec: ProjectSpec },
): Promise<{ slug: string; render: GameRender }> {
  const text = `${input.vision}\n${specText(input.spec)}`;
  const fallback = { slug: artSlug("neon-arcade"), render: (WANTS_3D.test(text) ? "3d" : "2d") as GameRender };
  const model = structuredModelId();
  try {
    const { output, usage } = await generateText({
      model: modelFor(model),
      output: Output.object({
        schema: z.object({
          theme: z.enum(ART_IDS as [string, ...string[]]),
          render: z.enum(["2d", "3d"]),
          reason: z.string(),
        }),
      }),
      reasoning: "none",
      maxOutputTokens: 800,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(45_000),
      providerOptions: { azure: { store: false } },
      instructions: `You are the art director of a small game studio. Pick the art direction a browser game will be built with, and whether it is 2D or 3D.

render: "3d" only when the human asked for 3D or the game needs it (first- or third-person, flying or driving through a 3D world, exploring 3D spaces). Everything else is "2d": arcade, platformers, puzzles, top-down, side view, card and word games. 2D is the default.

theme: the art direction whose mood fits the game's genre, audience, setting and the visual style the human asked for. Themes (id: description):
${ART_THEMES.map((t) => `- ${t.id}: ${t.description}`).join("\n")}`,
      prompt: `Game: ${input.name}\nVision: ${input.vision}\n\nSpec:\n${specText(input.spec)}`,
    });
    await recordUsage(scope, "design", model, usage);
    // The human's explicit "3D" wins over the model's caution, and vice versa.
    const render = WANTS_3D.test(text) ? "3d" : output.render;
    return { slug: artSlug(output.theme), render };
  } catch (err) {
    console.error("[art] choice failed, using the default", err);
    return fallback;
  }
}

const directionSchema = z.object({
  title: z.string(),
  tagline: z.string(),
  markdown: z.string(),
});

/** The game's art bible, built from the theme and the kit's building blocks. */
export async function writeArtDirection(
  scope: UsageScope,
  input: { name: string; vision: string; spec: ProjectSpec; theme: ArtTheme; render: GameRender },
): Promise<z.infer<typeof directionSchema> | null> {
  const { theme, render } = input;
  const blocks =
    render === "2d"
      ? "2D kit (Phaser): sprites from game/kit/textures.ts: creature (character with eyes; mood angry for enemies), orb, gem, star, heart, box (platforms, walls, tiles), ship, spikes, ring, cloud, glow, spark, chip, custom (own canvas drawing with the same shading). Effects in game/kit/fx.ts: juice.collect/hit/explode/celebrate, fx.shake/flash/hitStop/burst/sparks/confetti/shockwave/floatText/pop/squash/blink/trail/aura/bob/punch. Backdrop from the theme recipe (sky, sun or moon, silhouettes, particles). Sizes in U (1% of the screen's short side)."
      : "3D kit (Three.js): meshes from game/kit/models.ts: character (rounded body with eyes; mood angry for enemies), gem, coin, crate, rock, tree, spikes, platform, plus materials.toon/standard/glow from the palette. Lighting, sky, fog, shadows and bloom come from the theme (game/kit/stage.ts). Effects in game/kit/fx.ts: juice.collect/hit/explode, fx.burst/shake/pop/squash/flash/floatText. Sizes in world units (1 = a character's height).";
  const model = structuredModelId();
  try {
    const { output, usage } = await generateText({
      model: modelFor(model),
      output: Output.object({ schema: directionSchema }),
      reasoning: reasoningFor(model, "low"),
      maxOutputTokens: 6000,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(90_000),
      providerOptions: { azure: { store: false } },
      instructions: `You are the art director of a small game studio. Write the art bible the engineer follows to make this ${render.toUpperCase()} browser game look and feel polished, like a hit indie game, not a prototype.

The art direction is "${theme.name}": ${theme.description}
Palette roles (use the role names, never new colors): primary ${theme.palette.primary} = the player; secondary ${theme.palette.secondary} = world accents; accent ${theme.palette.accent} = rewards and score; danger ${theme.palette.danger} = enemies and hazards; good ${theme.palette.good} = health and success; bg ${theme.palette.bg}, surface ${theme.palette.surface}, ink ${theme.palette.ink}.
Fonts and the menus, HUD, title screen and game over are already themed by the kit.

What the engineer builds with: ${blocks}

markdown: Markdown, at most 4500 characters, these sections:
## Look: one or two sentences: the feeling, the shape language (round and soft, sharp and angular, chunky...), the perspective.
## Cast: every character, enemy, item and obstacle in this game: the kit building block, the palette role, the size, idle motion and one detail that gives it character.
## World: the backdrop and the play area: ground, platforms or arena, layers, what scrolls, decoration that makes it feel alive.
## Feedback: every game event (moving, jumping, shooting, collecting, getting hit, combos, levelling up, losing, winning) mapped to the kit effects and sound that fire, so nothing happens silently.
## Motion: how movement feels (acceleration, weight, snappiness), speeds in kit units, easing, timings of key animations.
## Screens: what the HUD shows (score, lives, which stats), the toasts, the mood of the title screen.
Be concrete and specific to this game. No preamble, no code.

title: the game's display title for the title screen, max 24 characters (the project name, or a punchier version of it).
tagline: one short line under the title, max 60 characters, that sells the core loop.
Write title, tagline and the visible texts in the language of the spec.`,
      prompt: `Game: ${input.name}\nVision: ${input.vision}\n\nSpec:\n${specText(input.spec)}`,
    });
    await recordUsage(scope, "design_brief", model, usage);
    const markdown = output.markdown.trim();
    if (markdown.length < 300) return null;
    return {
      title: output.title.trim().slice(0, 40) || input.name,
      tagline: output.tagline.trim().slice(0, 90),
      markdown: `# Art direction: ${input.name}\n\nTheme: ${theme.name} (tokens in game/theme.ts). ${render === "3d" ? "3D" : "2D"} game.\n\n${markdown}\n`,
    };
  } catch (err) {
    console.error("[art] art direction failed", err);
    return null;
  }
}
