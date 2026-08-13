/**
 * Builder title + ID code generation for the Builder ID Card.
 *
 * Deterministic: the same name + stack always produces the same title, so a
 * card looks identical if someone rebuilds it. The reroll button walks the
 * `nudge` counter instead of using randomness, so the result stays stable
 * across re-renders while still feeling like a dice roll.
 */

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const ADJECTIVES = [
  "SUSEGAD",
  "MIDNIGHT",
  "BEACHSIDE",
  "FENI-FUELLED",
  "SALT-CRUSTED",
  "MONSOON",
  "SUNBURNT",
  "BAREFOOT",
  "LOW-LATENCY",
  "CAFFEINATED",
  "NO-SLEEP",
  "HIGH-TIDE",
];

const NOUNS = [
  "SHIPPER",
  "ARCHITECT",
  "ALCHEMIST",
  "RENEGADE",
  "OPERATOR",
  "TINKERER",
  "WAVE RIDER",
  "NIGHT OWL",
  "PROTOTYPER",
  "DEBUGGER",
  "DEMO SLAYER",
  "SANDCASTLE ENGINEER",
];

/** First meaningful word of the stack field, e.g. "react, next" -> "REACT". */
function stackWord(stack: string): string | null {
  const first = stack.trim().split(/[\s,/&|]+/)[0];
  if (!first) return null;
  const word = first.toUpperCase();
  return word.length <= 10 ? word : null;
}

export function generateBuilderTitle(name: string, stack: string, nudge = 0): string {
  const seed = hash(`${name.trim().toLowerCase()}|${stack.trim().toLowerCase()}`) + nudge * 2654435761;
  const adjective = ADJECTIVES[seed % ADJECTIVES.length];
  const noun = NOUNS[Math.floor(seed / ADJECTIVES.length) % NOUNS.length];
  const stackTag = stackWord(stack);

  // Three words only when they stay short enough to read on one line.
  if (stackTag) {
    const withStack = `${adjective} ${stackTag} ${noun}`;
    if (withStack.length <= 26) return withStack;
    return `${stackTag} ${noun}`;
  }
  return `${adjective} ${noun}`;
}

/** Badge serial, e.g. HHG26-7C4F. */
export function generateBuilderCode(name: string, stack: string): string {
  const seed = hash(`hhg26|${name.trim().toLowerCase()}|${stack.trim().toLowerCase()}`);
  return `HHG26-${seed.toString(16).toUpperCase().padStart(8, "0").slice(0, 4)}`;
}
