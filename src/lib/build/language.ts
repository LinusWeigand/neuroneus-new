// The builders report back in the human's language. Telling a model "match this sample"
// proved unreliable (one summary came back in Spanish), so we decide it here and name the
// language explicitly. Covers the languages the UI supports.

const GERMAN = new Set(
  "der die das und ich nicht ist mit für wir eine ein einen auf zu sie es mein meine wie oder auch soll sollen werden bitte kann können wenn dann jeder jede alle sehe sehen einfach nur".split(" "),
);
const ENGLISH = new Set(
  "the and is to with for my we a an of it should can i you in on be that this how or also please if then every each all see just only".split(" "),
);

function score(text: string) {
  const lower = text.toLowerCase();
  let de = /[äöüß]/.test(lower) ? 2 : 0;
  let en = 0;
  for (const word of lower.match(/[a-zäöüß]+/g) ?? []) {
    if (GERMAN.has(word)) de++;
    else if (ENGLISH.has(word)) en++;
  }
  return { de, en };
}

/** Samples newest first: the most recent message that carries a clear signal decides. */
export function humanLanguage(samples: string[]): "German" | "English" {
  for (const text of samples) {
    const { de, en } = score(text);
    if (de !== en) return de > en ? "German" : "English";
  }
  return "English";
}
