import "server-only";
import { generateText, Output } from "ai";
import { z } from "zod";
import { modelFor, structuredModelId } from "@/lib/ai";
import { recordUsage, type UsageScope } from "@/lib/usage";

// The playtest: a game is judged the way players judge it, by what they see in the first
// seconds. After a round's tasks are live, the deployed game is opened in a real browser
// (BROWSER_WS_ENDPOINT: a Playwright server), played for a few seconds with real key presses
// and screenshotted; a vision model reviews the screenshots against the spec and the art
// direction, and what a player would notice comes back as one concrete fix task.
// (After Play2Code: a GUI playtester in the generation loop is what lifts generated games.)

export function playtestConfigured() {
  return Boolean(process.env.BROWSER_WS_ENDPOINT);
}

export type Shot = { label: string; jpeg: Buffer };

/** Opens the game, starts a run, plays a little, and returns screenshots and page errors. */
export async function captureGame(url: string): Promise<{ shots: Shot[]; errors: string[] }> {
  const { chromium } = await import("playwright-core");
  const browser = await chromium.connect(process.env.BROWSER_WS_ENDPOINT!, { timeout: 90_000 });
  const shots: Shot[] = [];
  const errors: string[] = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on("pageerror", (e) => errors.push(e.message.slice(0, 300)));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text().slice(0, 300));
    });
    const shot = async (label: string) => shots.push({ label, jpeg: await page.screenshot({ type: "jpeg", quality: 70 }) });

    await page.goto(url, { waitUntil: "load", timeout: 60_000 });
    await page.waitForTimeout(3000);
    await shot("title screen");
    const play = page.locator(".g-btn-play");
    // The Play button breathes (never "stable"): click it as it is, or start with Enter.
    const clicked = (await play.count()) > 0 && (await play.first().click({ timeout: 5000, force: true }).then(() => true, () => false));
    if (!clicked) await page.keyboard.press("Enter");
    await page.waitForTimeout(1500);
    await shot("the first moment of a run");
    // Move around and use the action button, like a curious first-time player.
    for (const [key, ms] of [
      ["ArrowRight", 700],
      ["ArrowUp", 450],
      ["ArrowLeft", 700],
      ["ArrowDown", 450],
    ] as const) {
      await page.keyboard.down(key);
      await page.waitForTimeout(ms / 2);
      await page.keyboard.press("Space");
      await page.waitForTimeout(ms / 2);
      await page.keyboard.up(key);
    }
    await shot("after 3 seconds of moving and pressing the action key");
    await page.waitForTimeout(4000);
    await shot("7 seconds into the run");
  } finally {
    await browser.close().catch(() => {});
  }
  return { shots, errors: [...new Set(errors)].slice(0, 8) };
}

const reviewSchema = z.object({
  score: z.number(),
  verdict: z.string(),
  issues: z.array(z.string()),
  title: z.string(),
  detail: z.string(),
});

export type PlaytestReview = { score: number; verdict: string; issues: string[]; task: { title: string; detail: string } | null };

/** A demanding playtester and art director look at the screenshots. */
export async function reviewGame(
  scope: UsageScope,
  input: { name: string; spec: string; artDirection: string; shots: Shot[]; errors: string[]; language: "German" | "English" },
): Promise<PlaytestReview | null> {
  const model = structuredModelId();
  try {
    const { output, usage } = await generateText({
      model: modelFor(model),
      output: Output.object({ schema: reviewSchema }),
      reasoning: "low",
      maxOutputTokens: 4000,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(120_000),
      providerOptions: { azure: { store: false } },
      instructions: `You are a demanding playtester and art director at an indie game studio. You see screenshots of a browser game a team just shipped, taken by a bot that opened it, pressed Play, moved around and pressed the action key. Judge only what is visible, the way a player would in the first ten seconds.

Rubric:
1. Recognizable: everything the spec names looks like what it is at first glance (an animal has its defining features, food looks like that food); nothing is a generic blob, gem, ball or rectangle standing in for something.
2. Polish: no plain shapes or programmer art, a coherent palette, not washed out or too dark, the action reads at a glance, characters and items big enough for a phone, a world that feels alive.
3. Responsive: the game reacts to input (the player moved between screenshots, things happen) and the run doesn't end or break immediately.
4. Interface: the title screen sells the game; the HUD is readable and leaves the play area free.
5. Errors: any page errors listed below.

score: 0 to 10 (8 or more means a player would call it polished).
verdict: one sentence on the overall impression.
issues: the concrete problems a player would notice, most important first, at most 6. Each names what's wrong and what it should be instead.
If score < 8: title is the fix task's name for the product owner, max 6 words, in ${input.language}; detail is the engineer's brief in English, max 160 words: exactly what to change, by game object, using the game kit (game/kit/sprites.ts animals, food and plants; game/kit/textures.ts; game/kit/fx.ts juice; theme palette roles) and docs/ART-DIRECTION.md. If score >= 8, title and detail are empty strings.`,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Game: ${input.name}\n\nSpec:\n${input.spec}\n\nArt direction (excerpt):\n${input.artDirection.slice(0, 3000)}\n\nPage errors: ${input.errors.length ? input.errors.join("\n") : "none"}\n\nScreenshots, in order:`,
            },
            ...input.shots.flatMap((s) => [
              { type: "text" as const, text: s.label },
              { type: "image" as const, image: s.jpeg, mediaType: "image/jpeg" },
            ]),
          ],
        },
      ],
    });
    await recordUsage(scope, "playtest", model, usage);
    const fix = output.score < 8 && output.title.trim() && output.detail.trim();
    return {
      score: output.score,
      verdict: output.verdict.trim(),
      issues: output.issues.map((i) => i.trim()).filter(Boolean).slice(0, 6),
      task: fix ? { title: output.title.trim().slice(0, 80), detail: `${output.detail.trim()}\n\nPlaytest findings:\n${output.issues.map((i) => `- ${i}`).join("\n")}`.slice(0, 2000) } : null,
    };
  } catch (err) {
    console.error("[playtest] review failed", err);
    return null;
  }
}
