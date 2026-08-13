/**
 * Goa sticker pack — drawn as inline SVG so one source powers both the tray
 * thumbnail (an <img>) and the Konva canvas layer (an <img> in a KonvaImage).
 *
 * Style follows hhgoa.com: flat fills from the brand palette, every shape
 * carried by a thick near-black outline, sign-board panels and arrow markers
 * for the text pieces.
 *
 * Each sticker is authored in a small viewBox and emitted at RENDER_PX on its
 * long edge so the 2048px export stays crisp — SVGs rasterise at their
 * intrinsic size before Konva scales them up.
 */

const INK = "#0a2a1c";
const GREEN = "#0b5c39";
const GREEN_MID = "#2f9e5f";
const YELLOW = "#f4d913";
const PINK = "#ec1876";
const CREAM = "#f6f0de";
const BROWN = "#8a5a2b";
const TERRA = "#d2553a";

const RENDER_PX = 512;

function svg(vbW: number, vbH: number, body: string) {
  const max = Math.max(vbW, vbH);
  const w = Math.round((vbW / max) * RENDER_PX);
  const h = Math.round((vbH / max) * RENDER_PX);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${vbW} ${vbH}">` +
    `<g stroke-linejoin="round" stroke-linecap="round">${body}</g></svg>`
  );
}

export function svgToDataUrl(source: string) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(source)}`;
}

/* Text stickers fall back to the system mono when Space Mono isn't installed —
   an <img> can't reach the webfont the page itself loaded. */
const MONO = "'Space Mono','SFMono-Regular',ui-monospace,monospace";

/** Sign-board panel, like the DAY 01 / DAY 02 boards on the site. */
function board(text: string, fill: string, ink: string, fontSize = 26) {
  return svg(
    240,
    80,
    `<rect x="5" y="5" width="230" height="70" rx="5" fill="${fill}" stroke="${INK}" stroke-width="7"/>` +
      `<rect x="16" y="16" width="208" height="48" rx="2" fill="none" stroke="${CREAM}" stroke-width="3"/>` +
      `<text x="120" y="49" text-anchor="middle" font-family="${MONO}" font-size="${fontSize}" font-weight="700" fill="${ink}">${text}</text>`
  );
}

export type BoardStyle = "yellow" | "pink" | "green";

const BOARD_STYLES: Record<BoardStyle, { fill: string; ink: string }> = {
  yellow: { fill: YELLOW, ink: INK },
  pink: { fill: PINK, ink: CREAM },
  green: { fill: GREEN, ink: YELLOW },
};

/**
 * The builder nameplate: name, stack and generated title on one sign board, in
 * the same panel style as the DAY boards on the site.
 *
 * One board rather than three because it has to be laid out automatically —
 * three separate boards would need their heights measured after load and
 * stacked, and any of them could be dragged away from the others. As a single
 * image it places itself, moves as a unit, and can't get half-deleted.
 *
 * Space Mono is fixed-pitch, so the widest line's character count sizes the
 * board without measuring text.
 */
export function makeBadgeBoard(name: string, stack: string, title: string, style: BoardStyle = "yellow"): string {
  const { fill, ink } = BOARD_STYLES[style];

  /* Fixed box. Sizing the strip to its contents meant it grew and shrank as
     the user typed, so it never sat the same way twice and a long stack could
     run wider than the photo. The plate is now always the same rectangle and
     the text shrinks to fit its half instead. */
  const vbW = 840;
  const vbH = 76;
  const padX = 22;
  const gap = 16;
  const divW = 3;
  const advance = 0.6; // Space Mono character width, as a share of font size
  const minSize = 11;
  const width = (text: string, size: number) => text.length * size * advance;

  const nameText = name.trim().toUpperCase() || "YOUR NAME";
  let sub = [stack.trim().toUpperCase(), title.trim().toUpperCase()].filter(Boolean).join("  ·  ");

  /* The divider used to sit at a fixed offset, which left a short name like
     MANYA marooned beside a gap half the plate wide. Both halves are measured
     instead, shrunk together only if they overflow, then centred as one block
     — so the spacing follows the text while the plate stays the same size. */
  const avail = vbW - padX * 2 - (sub ? gap * 2 + divW : 0);
  let nameSize = 32;
  let subSize = 20;
  const overflow = (width(nameText, nameSize) + width(sub, subSize)) / avail;
  if (overflow > 1) {
    nameSize = Math.max(minSize, nameSize / overflow);
    subSize = Math.max(minSize, subSize / overflow);
  }

  const nameW = width(nameText, nameSize);
  // Still over at the smallest readable size: trim the sub text, never the name.
  const maxSubChars = Math.max(0, Math.floor((avail - nameW) / (subSize * advance)));
  if (sub.length > maxSubChars) sub = maxSubChars > 1 ? sub.slice(0, maxSubChars - 1) + "…" : "";

  const subW = width(sub, subSize);
  const block = nameW + (sub ? gap + divW + gap + subW : 0);
  const x0 = (vbW - block) / 2;
  const dividerX = x0 + nameW + gap;
  const subX = dividerX + divW + gap;

  return svgToDataUrl(
    svg(
      vbW,
      vbH,
      `<rect x="4" y="4" width="${vbW - 8}" height="${vbH - 8}" rx="8" fill="${fill}" stroke="${INK}" stroke-width="6"/>` +
        `<text x="${x0.toFixed(1)}" y="${vbH / 2 + nameSize * 0.34}" font-family="${MONO}" font-size="${nameSize.toFixed(1)}" font-weight="700" fill="${ink}">${escapeXml(nameText)}</text>` +
        (sub
          ? `<rect x="${dividerX.toFixed(1)}" y="${vbH / 2 - 16}" width="${divW}" height="32" fill="${ink}" opacity="0.45"/>` +
            `<text x="${subX.toFixed(1)}" y="${vbH / 2 + subSize * 0.34}" font-family="${MONO}" font-size="${subSize.toFixed(1)}" font-weight="700" fill="${ink}" opacity="0.85">${escapeXml(sub)}</text>`
          : "")
    )
  );
}

/** Names carry apostrophes and ampersands; unescaped they break the SVG. */
function escapeXml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Direction marker, like the beach signpost arrows on the site. */
function arrow(text: string, fill: string, ink: string, dir: "left" | "right", fontSize = 24) {
  const shape =
    dir === "right"
      ? "M6 6 L 196 6 L 252 44 L 196 82 L 6 82 Z"
      : "M252 6 L 62 6 L 6 44 L 62 82 L 252 82 Z";
  const inner =
    dir === "right"
      ? "M20 19 L 190 19 L 232 44 L 190 69 L 20 69 Z"
      : "M238 19 L 68 19 L 26 44 L 68 69 L 238 69 Z";
  const tx = dir === "right" ? 118 : 140;
  return svg(
    258,
    88,
    `<path d="${shape}" fill="${fill}" stroke="${INK}" stroke-width="7"/>` +
      `<path d="${inner}" fill="none" stroke="${CREAM}" stroke-width="3"/>` +
      `<text x="${tx}" y="53" text-anchor="middle" font-family="${MONO}" font-size="${fontSize}" font-weight="700" fill="${ink}">${text}</text>`
  );
}

/** Rope-hung board, like the DAY 01 - DAY 04 signs on the site. */
function hangingBoard(text: string, fill: string, ink: string, fontSize = 22) {
  return svg(
    240,
    120,
    `<path d="M16 10 L 224 10" fill="none" stroke="${INK}" stroke-width="7"/>` +
      `<path d="M44 12 L 32 32 M196 12 L 208 32" fill="none" stroke="${INK}" stroke-width="6"/>` +
      `<circle cx="32" cy="40" r="9" fill="none" stroke="${INK}" stroke-width="5"/>` +
      `<circle cx="208" cy="40" r="9" fill="none" stroke="${INK}" stroke-width="5"/>` +
      `<rect x="18" y="46" width="204" height="66" rx="4" fill="${fill}" stroke="${INK}" stroke-width="7"/>` +
      `<rect x="30" y="58" width="180" height="42" fill="none" stroke="${CREAM}" stroke-width="3"/>` +
      `<text x="120" y="86" text-anchor="middle" font-family="${MONO}" font-size="${fontSize}" font-weight="700" fill="${ink}">${text}</text>`
  );
}

/** Four-petal bougainvillea bloom with a yellow centre. */
function bloom(cx: number, cy: number, r: number) {
  const petals = [0, 90, 180, 270]
    .map(
      (a) =>
        `<ellipse cx="${cx}" cy="${cy - r}" rx="${(r * 0.6).toFixed(1)}" ry="${r}" fill="${PINK}" ` +
        `stroke="${INK}" stroke-width="5" transform="rotate(${a} ${cx} ${cy})"/>`
    )
    .join("");
  return (
    petals +
    `<circle cx="${cx}" cy="${cy}" r="${(r * 0.32).toFixed(1)}" fill="${YELLOW}" stroke="${INK}" stroke-width="4"/>`
  );
}

function sunRays() {
  return [...Array(16)]
    .map((_, i) => {
      const a = (i / 16) * Math.PI * 2;
      const p = (r: number) =>
        `${(100 + Math.cos(a) * r).toFixed(1)} ${(100 + Math.sin(a) * r).toFixed(1)}`;
      return `<path d="M ${p(62)} L ${p(92)}" stroke="${INK}" stroke-width="6"/>`;
    })
    .join("");
}

function starPoints(cx: number, cy: number, outer: number, inner: number, n = 5) {
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i / (n * 2)) * Math.PI * 2;
    pts.push(`${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`);
  }
  return pts.join(" ");
}

/** Parasol dome: top arc out, scalloped edge back. */
const UMBRELLA_DOME =
  "M18 112 A 82 82 0 0 1 182 112 " +
  "A 20.5 20.5 0 0 1 141 112 A 20.5 20.5 0 0 1 100 112 " +
  "A 20.5 20.5 0 0 1 59 112 A 20.5 20.5 0 0 1 18 112 Z";

function umbrellaWedges() {
  const cx = 100;
  const cy = 112;
  const r = 90;
  return [...Array(4)]
    .map((_, k) => {
      const a0 = Math.PI + (k / 4) * Math.PI;
      const a1 = Math.PI + ((k + 1) / 4) * Math.PI;
      const x0 = cx + Math.cos(a0) * r;
      const y0 = cy + Math.sin(a0) * r;
      const x1 = cx + Math.cos(a1) * r;
      const y1 = cy + Math.sin(a1) * r;
      return `<path d="M ${cx} ${cy} L ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 0 1 ${x1.toFixed(
        1
      )} ${y1.toFixed(1)} Z" fill="${k % 2 === 0 ? YELLOW : PINK}"/>`;
    })
    .join("");
}

export type GoaSticker = {
  id: string;
  label: string;
  url: string;
};

function make(id: string, label: string, source: string): GoaSticker {
  return { id, label, url: svgToDataUrl(source) };
}

export const GOA_STICKERS: GoaSticker[] = [
  make(
    "sun",
    "Sunset",
    svg(
      200,
      200,
      sunRays() + `<circle cx="100" cy="100" r="52" fill="${YELLOW}" stroke="${INK}" stroke-width="7"/>`
    )
  ),

  make(
    "palm",
    "Palm",
    svg(
      200,
      200,
      `<path d="M98 182 C 88 142, 92 108, 104 84" fill="none" stroke="${INK}" stroke-width="14"/>` +
        `<path d="M98 182 C 88 142, 92 108, 104 84" fill="none" stroke="${CREAM}" stroke-width="5"/>` +
        `<path d="M104 84 Q 58 60 28 82 Q 64 78 104 84 Z" fill="${GREEN}" stroke="${INK}" stroke-width="6"/>` +
        `<path d="M104 84 Q 152 60 180 82 Q 144 78 104 84 Z" fill="${GREEN}" stroke="${INK}" stroke-width="6"/>` +
        `<path d="M104 84 Q 70 38 38 30 Q 78 52 104 84 Z" fill="${GREEN_MID}" stroke="${INK}" stroke-width="6"/>` +
        `<path d="M104 84 Q 140 38 172 30 Q 132 52 104 84 Z" fill="${GREEN_MID}" stroke="${INK}" stroke-width="6"/>` +
        `<path d="M104 84 Q 96 34 106 14 Q 122 46 104 84 Z" fill="${GREEN}" stroke="${INK}" stroke-width="6"/>` +
        `<circle cx="92" cy="94" r="9" fill="${BROWN}" stroke="${INK}" stroke-width="5"/>` +
        `<circle cx="114" cy="98" r="9" fill="${BROWN}" stroke="${INK}" stroke-width="5"/>`
    )
  ),

  make(
    "wave",
    "Wave",
    svg(
      200,
      130,
      `<path d="M10 44 Q 46 4 84 40 T 158 34 Q 176 26 192 38" fill="none" stroke="${INK}" stroke-width="16"/>` +
        `<path d="M10 44 Q 46 4 84 40 T 158 34 Q 176 26 192 38" fill="none" stroke="${CREAM}" stroke-width="7"/>` +
        `<path d="M10 90 Q 46 50 84 86 T 158 80" fill="none" stroke="${INK}" stroke-width="16"/>` +
        `<path d="M10 90 Q 46 50 84 86 T 158 80" fill="none" stroke="${CREAM}" stroke-width="7"/>`
    )
  ),

  make(
    "coconut",
    "Nariyal pani",
    svg(
      200,
      200,
      `<path d="M110 48 L 128 14 L 158 8" fill="none" stroke="${INK}" stroke-width="14"/>` +
        `<path d="M110 48 L 128 14 L 158 8" fill="none" stroke="${PINK}" stroke-width="7"/>` +
        `<path d="M100 44 C 148 60 158 116 130 160 C 118 180 82 180 70 160 C 42 116 52 60 100 44 Z" fill="${GREEN_MID}" stroke="${INK}" stroke-width="7"/>` +
        `<path d="M96 66 C 76 88 74 124 84 156" fill="none" stroke="${CREAM}" stroke-width="6" opacity="0.75"/>`
    )
  ),

  make(
    "scooter",
    "Scooter",
    svg(
      200,
      200,
      `<circle cx="58" cy="148" r="24" fill="${INK}"/>` +
        `<circle cx="58" cy="148" r="9" fill="${CREAM}"/>` +
        `<circle cx="150" cy="148" r="24" fill="${INK}"/>` +
        `<circle cx="150" cy="148" r="9" fill="${CREAM}"/>` +
        `<ellipse cx="140" cy="118" rx="44" ry="36" fill="${PINK}" stroke="${INK}" stroke-width="7"/>` +
        `<path d="M52 120 L 52 142 L 146 142 L 146 120 Z" fill="${PINK}" stroke="${INK}" stroke-width="7"/>` +
        `<path d="M52 142 L 52 94 C 52 82 60 74 72 70 L 84 84 C 74 88 68 96 68 108 L 68 142 Z" fill="${PINK}" stroke="${INK}" stroke-width="7"/>` +
        `<path d="M102 92 C 102 82 112 76 126 76 L 156 76 C 166 76 166 90 156 92 Z" fill="${INK}"/>` +
        `<path d="M74 68 L 104 54" fill="none" stroke="${INK}" stroke-width="9"/>` +
        `<circle cx="62" cy="90" r="10" fill="${YELLOW}" stroke="${INK}" stroke-width="5"/>` +
        `<path d="M150 104 L 172 104 M150 118 L 176 118 M150 132 L 172 132" fill="none" stroke="${INK}" stroke-width="5"/>`
    )
  ),

  make(
    "shades",
    "Shades",
    svg(
      200,
      150,
      `<path d="M22 62 L 4 50 M178 62 L 196 50" fill="none" stroke="${INK}" stroke-width="8"/>` +
        `<path d="M86 66 Q 100 56 114 66" fill="none" stroke="${INK}" stroke-width="9"/>` +
        `<rect x="18" y="54" width="72" height="50" rx="19" fill="${PINK}" stroke="${INK}" stroke-width="7"/>` +
        `<rect x="110" y="54" width="72" height="50" rx="19" fill="${PINK}" stroke="${INK}" stroke-width="7"/>` +
        `<path d="M32 70 L 46 90 M124 70 L 138 90" fill="none" stroke="${CREAM}" stroke-width="6" opacity="0.85"/>`
    )
  ),

  make(
    "chappals",
    "Chappals",
    svg(
      200,
      200,
      `<g transform="rotate(-12 64 104)">` +
        `<ellipse cx="64" cy="104" rx="28" ry="56" fill="${YELLOW}" stroke="${INK}" stroke-width="7"/>` +
        `<path d="M64 66 L 46 90 M64 66 L 82 90" fill="none" stroke="${INK}" stroke-width="8"/>` +
        `</g>` +
        `<g transform="rotate(12 136 104)">` +
        `<ellipse cx="136" cy="104" rx="28" ry="56" fill="${PINK}" stroke="${INK}" stroke-width="7"/>` +
        `<path d="M136 66 L 118 90 M136 66 L 154 90" fill="none" stroke="${INK}" stroke-width="8"/>` +
        `</g>`
    )
  ),

  make(
    "starfish",
    "Starfish",
    svg(
      200,
      200,
      `<polygon points="${starPoints(100, 104, 86, 42)}" fill="${PINK}" stroke="${INK}" stroke-width="7"/>` +
        `<circle cx="100" cy="94" r="7" fill="${INK}"/>` +
        `<circle cx="79" cy="120" r="6" fill="${INK}"/>` +
        `<circle cx="121" cy="120" r="6" fill="${INK}"/>`
    )
  ),

  make(
    "shell",
    "Shell",
    svg(
      200,
      175,
      `<path d="M100 160 C 34 148 24 82 100 30 C 176 82 166 148 100 160 Z" fill="${CREAM}" stroke="${INK}" stroke-width="7"/>` +
        `<path d="M100 156 L 60 58 M100 156 L 80 42 M100 156 L 100 36 M100 156 L 120 42 M100 156 L 140 58" fill="none" stroke="${INK}" stroke-width="5"/>`
    )
  ),

  make(
    "umbrella",
    "Beach parasol",
    svg(
      200,
      200,
      `<clipPath id="dome"><path d="${UMBRELLA_DOME}"/></clipPath>` +
        `<g clip-path="url(#dome)">${umbrellaWedges()}</g>` +
        `<path d="${UMBRELLA_DOME}" fill="none" stroke="${INK}" stroke-width="7"/>` +
        `<path d="M100 112 L 100 178 Q 100 190 114 188" fill="none" stroke="${INK}" stroke-width="9"/>` +
        `<circle cx="100" cy="24" r="8" fill="${INK}"/>`
    )
  ),

  make(
    "surfboard",
    "Surfboard",
    svg(
      200,
      200,
      `<g transform="rotate(-20 100 100)">` +
        `<path d="M100 12 C 130 52 130 148 100 188 C 70 148 70 52 100 12 Z" fill="${CREAM}" stroke="${INK}" stroke-width="7"/>` +
        `<path d="M100 26 L 100 174" fill="none" stroke="${INK}" stroke-width="4"/>` +
        `<path d="M100 62 C 112 84 112 116 100 138 C 88 116 88 84 100 62 Z" fill="${PINK}" stroke="${INK}" stroke-width="5"/>` +
        `</g>`
    )
  ),

  make(
    "sailboat",
    "Sailboat",
    svg(
      200,
      190,
      `<path d="M100 16 L 100 128" fill="none" stroke="${INK}" stroke-width="7"/>` +
        `<path d="M108 26 L 108 126 L 168 126 Z" fill="${CREAM}" stroke="${INK}" stroke-width="7"/>` +
        `<path d="M92 44 L 92 126 L 46 126 Z" fill="${PINK}" stroke="${INK}" stroke-width="7"/>` +
        `<path d="M22 132 L 178 132 L 152 166 L 48 166 Z" fill="${GREEN}" stroke="${INK}" stroke-width="7"/>`
    )
  ),

  make(
    "seagull",
    "Seagulls",
    svg(
      200,
      110,
      `<path d="M14 66 Q 44 22 74 62 Q 104 22 134 62" fill="none" stroke="${CREAM}" stroke-width="9"/>` +
        `<path d="M120 34 Q 142 6 164 30" fill="none" stroke="${CREAM}" stroke-width="7"/>`
    )
  ),

  make(
    "bottle",
    "Cheers",
    svg(
      200,
      200,
      `<rect x="80" y="6" width="40" height="18" rx="5" fill="${PINK}" stroke="${INK}" stroke-width="6"/>` +
        `<path d="M84 22 L 116 22 L 116 48 C 116 62 132 68 132 88 L 132 178 C 132 187 126 192 116 192 L 84 192 C 74 192 68 187 68 178 L 68 88 C 68 68 84 62 84 48 Z" fill="${YELLOW}" stroke="${INK}" stroke-width="7"/>` +
        `<rect x="68" y="106" width="64" height="50" fill="${PINK}" stroke="${INK}" stroke-width="6"/>` +
        `<path d="M82 122 L 118 122 M82 140 L 108 140" fill="none" stroke="${CREAM}" stroke-width="5"/>`
    )
  ),

  make(
    "laptop",
    "Ship it",
    svg(
      200,
      170,
      `<rect x="42" y="14" width="116" height="86" rx="7" fill="${GREEN}" stroke="${INK}" stroke-width="7"/>` +
        `<path d="M62 42 L 80 57 L 62 72" fill="none" stroke="${YELLOW}" stroke-width="8"/>` +
        `<path d="M92 74 L 128 74" fill="none" stroke="${YELLOW}" stroke-width="8"/>` +
        `<path d="M26 108 L 174 108 L 188 140 L 12 140 Z" fill="${CREAM}" stroke="${INK}" stroke-width="7"/>` +
        `<path d="M82 126 L 118 126" fill="none" stroke="${INK}" stroke-width="6"/>`
    )
  ),

  make(
    "star",
    "Starburst",
    svg(
      200,
      200,
      `<polygon points="${starPoints(100, 100, 90, 37)}" fill="${YELLOW}" stroke="${INK}" stroke-width="7"/>`
    )
  ),

  make(
    "villa",
    "Goan villa",
    svg(
      200,
      190,
      `<path d="M12 84 L 44 30 L 156 30 L 188 84 Z" fill="${TERRA}" stroke="${INK}" stroke-width="7"/>` +
        `<path d="M62 32 L 52 82 M84 32 L 79 82 M106 32 L 106 82 M128 32 L 133 82 M150 32 L 160 82" fill="none" stroke="${INK}" stroke-width="4"/>` +
        `<rect x="28" y="84" width="144" height="88" fill="${CREAM}" stroke="${INK}" stroke-width="7"/>` +
        `<rect x="44" y="100" width="34" height="38" fill="${GREEN}" stroke="${INK}" stroke-width="6"/>` +
        `<rect x="122" y="100" width="34" height="38" fill="${PINK}" stroke="${INK}" stroke-width="6"/>` +
        `<path d="M61 100 L 61 138 M139 100 L 139 138" fill="none" stroke="${INK}" stroke-width="4"/>` +
        `<rect x="84" y="108" width="32" height="64" fill="${YELLOW}" stroke="${INK}" stroke-width="6"/>` +
        `<path d="M100 108 L 100 172" fill="none" stroke="${INK}" stroke-width="4"/>` +
        `<path d="M18 172 L 182 172" fill="none" stroke="${INK}" stroke-width="9"/>`
    )
  ),

  make(
    "shack",
    "Beach shack",
    svg(
      200,
      165,
      `<path d="M8 66 L 100 16 L 192 66 Z" fill="${GREEN}" stroke="${INK}" stroke-width="7"/>` +
        `<rect x="26" y="66" width="148" height="82" fill="${CREAM}" stroke="${INK}" stroke-width="7"/>` +
        `<rect x="44" y="72" width="112" height="28" rx="4" fill="${PINK}" stroke="${INK}" stroke-width="6"/>` +
        `<text x="100" y="92" text-anchor="middle" font-family="${MONO}" font-size="15" font-weight="700" fill="${CREAM}">GOA BEACH</text>` +
        `<rect x="42" y="108" width="116" height="40" fill="${GREEN}" stroke="${INK}" stroke-width="6"/>` +
        `<path d="M42 128 L 158 128" fill="none" stroke="${BROWN}" stroke-width="9"/>` +
        `<path d="M70 132 L 70 148 M100 132 L 100 148 M130 132 L 130 148" fill="none" stroke="${INK}" stroke-width="5"/>`
    )
  ),

  make(
    "deckchair",
    "Deck chair",
    svg(
      200,
      190,
      `<path d="M44 156 L 30 182 M104 150 L 112 180 M170 128 L 182 172" fill="none" stroke="${INK}" stroke-width="9"/>` +
        `<path d="M28 146 L 60 40 L 98 50 L 84 112 L 172 96 L 180 130 L 40 162 Z" fill="${GREEN}" stroke="${INK}" stroke-width="7"/>` +
        `<path d="M50 92 L 82 100 M56 58 L 90 66" fill="none" stroke="${CREAM}" stroke-width="6"/>` +
        `<path d="M116 110 L 120 140 M148 104 L 152 133" fill="none" stroke="${CREAM}" stroke-width="6"/>`
    )
  ),

  make(
    "mug",
    "Chai break",
    svg(
      200,
      190,
      `<path d="M80 44 C 90 32 72 24 82 10 M116 44 C 126 32 108 24 118 10" fill="none" stroke="${INK}" stroke-width="6"/>` +
        `<path d="M148 84 C 184 84 184 136 144 136" fill="none" stroke="${INK}" stroke-width="11"/>` +
        `<path d="M44 62 L 154 62 L 142 158 C 141 170 132 176 120 176 L 78 176 C 66 176 57 170 56 158 Z" fill="${CREAM}" stroke="${INK}" stroke-width="7"/>` +
        `<path d="M50 104 L 148 104 L 143 132 L 55 132 Z" fill="${PINK}" stroke="${INK}" stroke-width="5"/>`
    )
  ),

  make(
    "flower",
    "Bougainvillea",
    svg(
      200,
      200,
      `<path d="M112 192 C 96 152 98 116 118 84" fill="none" stroke="${INK}" stroke-width="13"/>` +
        `<path d="M112 192 C 96 152 98 116 118 84" fill="none" stroke="${GREEN_MID}" stroke-width="5"/>` +
        `<path d="M104 148 Q 62 138 44 106 Q 90 108 104 148 Z" fill="${GREEN}" stroke="${INK}" stroke-width="6"/>` +
        `<path d="M110 116 Q 148 108 164 78 Q 122 82 110 116 Z" fill="${GREEN}" stroke="${INK}" stroke-width="6"/>` +
        bloom(70, 62, 26) +
        bloom(136, 50, 22) +
        bloom(126, 108, 20)
    )
  ),

  make(
    "signpost",
    "Signpost",
    svg(
      200,
      200,
      `<rect x="88" y="52" width="24" height="140" fill="${CREAM}" stroke="${INK}" stroke-width="7"/>` +
        `<path d="M88 76 L 112 62 M88 116 L 112 102 M88 156 L 112 142" fill="none" stroke="${INK}" stroke-width="4"/>` +
        `<path d="M100 62 L 168 62 L 190 84 L 168 106 L 100 106 Z" fill="${YELLOW}" stroke="${INK}" stroke-width="6"/>` +
        `<path d="M116 74 L 160 74 L 172 84 L 160 94 L 116 94 Z" fill="none" stroke="${INK}" stroke-width="3"/>` +
        `<path d="M100 120 L 32 120 L 10 142 L 32 164 L 100 164 Z" fill="${PINK}" stroke="${INK}" stroke-width="6"/>` +
        `<path d="M84 132 L 40 132 L 28 142 L 40 152 L 84 152 Z" fill="none" stroke="${CREAM}" stroke-width="3"/>`
    )
  ),

  make(
    "fish",
    "Fish curry",
    svg(
      200,
      140,
      `<path d="M152 70 L 192 40 L 192 100 Z" fill="${PINK}" stroke="${INK}" stroke-width="7"/>` +
        `<path d="M24 70 C 58 20 126 20 156 70 C 126 120 58 120 24 70 Z" fill="${PINK}" stroke="${INK}" stroke-width="7"/>` +
        `<path d="M88 32 L 104 12 L 116 36" fill="${YELLOW}" stroke="${INK}" stroke-width="6"/>` +
        `<path d="M84 70 Q 104 96 124 70 Z" fill="${YELLOW}" stroke="${INK}" stroke-width="5"/>` +
        `<path d="M118 46 Q 132 70 118 94 M142 52 Q 154 70 142 88" fill="none" stroke="${INK}" stroke-width="4"/>` +
        `<circle cx="58" cy="60" r="12" fill="${CREAM}" stroke="${INK}" stroke-width="5"/>` +
        `<circle cx="58" cy="60" r="5" fill="${INK}"/>`
    )
  ),

  make(
    "crab",
    "Crab",
    svg(
      200,
      165,
      `<path d="M56 108 L 26 132 M66 120 L 44 148 M144 108 L 174 132 M134 120 L 156 148" fill="none" stroke="${INK}" stroke-width="9"/>` +
        `<path d="M54 82 C 26 74 20 48 38 36" fill="none" stroke="${INK}" stroke-width="9"/>` +
        `<path d="M146 82 C 174 74 180 48 162 36" fill="none" stroke="${INK}" stroke-width="9"/>` +
        `<path d="M38 20 C 58 22 60 52 38 52 C 22 52 20 20 38 20 Z" fill="${PINK}" stroke="${INK}" stroke-width="6"/>` +
        `<path d="M162 20 C 142 22 140 52 162 52 C 178 52 180 20 162 20 Z" fill="${PINK}" stroke="${INK}" stroke-width="6"/>` +
        `<ellipse cx="100" cy="100" rx="54" ry="38" fill="${PINK}" stroke="${INK}" stroke-width="7"/>` +
        `<path d="M78 66 L 78 50 M122 66 L 122 50" fill="none" stroke="${INK}" stroke-width="6"/>` +
        `<circle cx="78" cy="46" r="10" fill="${CREAM}" stroke="${INK}" stroke-width="5"/>` +
        `<circle cx="122" cy="46" r="10" fill="${CREAM}" stroke="${INK}" stroke-width="5"/>` +
        `<circle cx="78" cy="46" r="4" fill="${INK}"/><circle cx="122" cy="46" r="4" fill="${INK}"/>` +
        `<path d="M84 112 Q 100 124 116 112" fill="none" stroke="${INK}" stroke-width="5"/>`
    )
  ),

  make(
    "turtle",
    "Olive ridley",
    svg(
      200,
      180,
      `<circle cx="100" cy="34" r="20" fill="${GREEN_MID}" stroke="${INK}" stroke-width="6"/>` +
        `<circle cx="92" cy="30" r="4" fill="${INK}"/>` +
        `<ellipse cx="26" cy="62" rx="26" ry="16" fill="${GREEN_MID}" stroke="${INK}" stroke-width="6" transform="rotate(-32 26 62)"/>` +
        `<ellipse cx="174" cy="62" rx="26" ry="16" fill="${GREEN_MID}" stroke="${INK}" stroke-width="6" transform="rotate(32 174 62)"/>` +
        `<ellipse cx="34" cy="146" rx="24" ry="14" fill="${GREEN_MID}" stroke="${INK}" stroke-width="6" transform="rotate(32 34 146)"/>` +
        `<ellipse cx="166" cy="146" rx="24" ry="14" fill="${GREEN_MID}" stroke="${INK}" stroke-width="6" transform="rotate(-32 166 146)"/>` +
        `<ellipse cx="100" cy="98" rx="64" ry="52" fill="${GREEN}" stroke="${INK}" stroke-width="7"/>` +
        `<polygon points="100,74 120,86 120,110 100,122 80,110 80,86" fill="${YELLOW}" stroke="${INK}" stroke-width="5"/>` +
        `<path d="M80 86 L 44 74 M120 86 L 156 74 M80 110 L 46 122 M120 110 L 154 122 M100 74 L 100 50 M100 122 L 100 148" fill="none" stroke="${INK}" stroke-width="5"/>`
    )
  ),

  make(
    "cocktail",
    "Feni o'clock",
    svg(
      200,
      200,
      `<path d="M124 26 L 142 100" fill="none" stroke="${INK}" stroke-width="10"/>` +
        `<path d="M124 26 L 142 100" fill="none" stroke="${PINK}" stroke-width="4"/>` +
        `<path d="M28 48 L 172 48 L 100 122 Z" fill="${YELLOW}" stroke="${INK}" stroke-width="7"/>` +
        `<path d="M100 118 L 100 168" fill="none" stroke="${INK}" stroke-width="9"/>` +
        `<path d="M58 176 L 142 176" fill="none" stroke="${INK}" stroke-width="11"/>` +
        `<path d="M40 20 A 30 30 0 0 1 100 20 Z" fill="${PINK}" stroke="${INK}" stroke-width="6"/>` +
        `<path d="M70 20 L 70 46" fill="none" stroke="${INK}" stroke-width="5"/>` +
        `<path d="M170 62 A 26 26 0 1 1 146 46 Z" fill="${GREEN_MID}" stroke="${INK}" stroke-width="6"/>`
    )
  ),

  make(
    "headphones",
    "Goa trance",
    svg(
      200,
      170,
      `<path d="M28 116 A 74 74 0 0 1 172 116" fill="none" stroke="${INK}" stroke-width="16"/>` +
        `<path d="M28 116 A 74 74 0 0 1 172 116" fill="none" stroke="${CREAM}" stroke-width="6"/>` +
        `<rect x="10" y="98" width="42" height="60" rx="16" fill="${PINK}" stroke="${INK}" stroke-width="7"/>` +
        `<rect x="148" y="98" width="42" height="60" rx="16" fill="${PINK}" stroke="${INK}" stroke-width="7"/>` +
        `<rect x="62" y="110" width="15" height="34" rx="5" fill="${YELLOW}" stroke="${INK}" stroke-width="5"/>` +
        `<rect x="85" y="92" width="15" height="52" rx="5" fill="${YELLOW}" stroke="${INK}" stroke-width="5"/>` +
        `<rect x="108" y="102" width="15" height="42" rx="5" fill="${YELLOW}" stroke="${INK}" stroke-width="5"/>` +
        `<rect x="131" y="118" width="15" height="26" rx="5" fill="${YELLOW}" stroke="${INK}" stroke-width="5"/>`
    )
  ),

  make(
    "lighthouse",
    "Fort Aguada",
    svg(
      200,
      200,
      `<path d="M18 40 L 54 52 M18 84 L 54 76 M182 40 L 146 52 M182 84 L 146 76" fill="none" stroke="${YELLOW}" stroke-width="8"/>` +
        `<path d="M72 30 L 100 6 L 128 30 Z" fill="${GREEN}" stroke="${INK}" stroke-width="6"/>` +
        `<rect x="78" y="30" width="44" height="32" fill="${YELLOW}" stroke="${INK}" stroke-width="6"/>` +
        `<clipPath id="tower"><path d="M72 172 L 82 62 L 118 62 L 128 172 Z"/></clipPath>` +
        `<path d="M72 172 L 82 62 L 118 62 L 128 172 Z" fill="${CREAM}"/>` +
        `<g clip-path="url(#tower)"><path d="M60 92 L 140 92 M58 132 L 142 132" fill="none" stroke="${PINK}" stroke-width="20"/></g>` +
        `<path d="M72 172 L 82 62 L 118 62 L 128 172 Z" fill="none" stroke="${INK}" stroke-width="7"/>` +
        `<rect x="58" y="172" width="84" height="20" fill="${GREEN}" stroke="${INK}" stroke-width="6"/>`
    )
  ),

  make(
    "dog",
    "Beach dog",
    svg(
      200,
      160,
      `<path d="M50 96 C 26 82 32 56 52 60" fill="none" stroke="${INK}" stroke-width="10"/>` +
        `<ellipse cx="96" cy="102" rx="54" ry="30" fill="${YELLOW}" stroke="${INK}" stroke-width="7"/>` +
        `<path d="M66 126 L 66 150 M104 128 L 104 150 M132 122 L 136 148" fill="none" stroke="${INK}" stroke-width="11"/>` +
        `<circle cx="150" cy="70" r="28" fill="${YELLOW}" stroke="${INK}" stroke-width="7"/>` +
        `<path d="M132 46 C 120 26 144 18 150 42 Z" fill="${BROWN}" stroke="${INK}" stroke-width="6"/>` +
        `<ellipse cx="176" cy="82" rx="16" ry="12" fill="${CREAM}" stroke="${INK}" stroke-width="6"/>` +
        `<circle cx="186" cy="80" r="5" fill="${INK}"/>` +
        `<circle cx="150" cy="64" r="5" fill="${INK}"/>` +
        `<path d="M168 92 Q 176 100 184 94" fill="none" stroke="${INK}" stroke-width="4"/>`
    )
  ),

  make(
    "camera",
    "Memories",
    svg(
      200,
      160,
      `<rect x="58" y="20" width="46" height="22" rx="5" fill="${GREEN}" stroke="${INK}" stroke-width="6"/>` +
        `<rect x="14" y="40" width="172" height="106" rx="12" fill="${GREEN}" stroke="${INK}" stroke-width="7"/>` +
        `<circle cx="100" cy="94" r="38" fill="${CREAM}" stroke="${INK}" stroke-width="7"/>` +
        `<circle cx="100" cy="94" r="19" fill="${PINK}" stroke="${INK}" stroke-width="5"/>` +
        `<circle cx="92" cy="86" r="6" fill="${CREAM}"/>` +
        `<circle cx="156" cy="64" r="10" fill="${YELLOW}" stroke="${INK}" stroke-width="5"/>` +
        `<path d="M32 62 L 56 62" fill="none" stroke="${YELLOW}" stroke-width="7"/>`
    )
  ),

  make(
    "clock",
    "2:47 PM",
    svg(
      200,
      200,
      `<circle cx="100" cy="100" r="84" fill="${GREEN}" stroke="${INK}" stroke-width="8"/>` +
        `<circle cx="100" cy="100" r="68" fill="none" stroke="${CREAM}" stroke-width="4"/>` +
        `<path d="M100 24 L 100 40 M176 100 L 160 100 M100 176 L 100 160 M24 100 L 40 100" fill="none" stroke="${YELLOW}" stroke-width="8"/>` +
        `<path d="M100 100 L 144 97" fill="none" stroke="${YELLOW}" stroke-width="10"/>` +
        `<path d="M100 100 L 38 87" fill="none" stroke="${YELLOW}" stroke-width="8"/>` +
        `<circle cx="100" cy="100" r="9" fill="${PINK}" stroke="${INK}" stroke-width="5"/>`
    )
  ),

  make(
    "sunsetSea",
    "Sunset point",
    svg(
      200,
      160,
      `<path d="M46 42 L 38 26 M100 30 L 100 12 M154 42 L 162 26" fill="none" stroke="${YELLOW}" stroke-width="8"/>` +
        `<path d="M40 96 A 60 60 0 0 1 160 96 Z" fill="${YELLOW}" stroke="${INK}" stroke-width="7"/>` +
        `<path d="M6 96 L 194 96" fill="none" stroke="${INK}" stroke-width="7"/>` +
        `<rect x="66" y="108" width="68" height="12" rx="6" fill="${YELLOW}" stroke="${INK}" stroke-width="5"/>` +
        `<rect x="76" y="128" width="48" height="11" rx="5.5" fill="${YELLOW}" stroke="${INK}" stroke-width="5"/>` +
        `<rect x="86" y="146" width="28" height="10" rx="5" fill="${YELLOW}" stroke="${INK}" stroke-width="5"/>`
    )
  ),

  make("arrowGoa", "HH Goa '26", arrow("HH GOA '26", YELLOW, INK, "right", 24)),
  make("arrowFrame", "#FrameInGoa", arrow("#FrameInGoa", PINK, CREAM, "left", 22)),
  make("arrowBeach", "To the beach", arrow("TO THE BEACH", YELLOW, INK, "right", 20)),
  make("arrowAguada", "Aguada 12 km", arrow("AGUADA 12 KM", PINK, CREAM, "left", 20)),
  make("builder", "Builder", board("BUILDER", YELLOW, INK, 28)),
  make("susegad", "Susegad", board("SUSEGAD", GREEN, YELLOW, 28)),
  make("shipOrShip", "Ship or ship", board("SHIP OR SHIP", PINK, CREAM, 22)),
  make("vibeCoded", "Vibe coded", board("VIBE CODED", YELLOW, INK, 24)),
  make("feniFuelled", "Feni fuelled", board("FENI FUELLED", PINK, CREAM, 22)),
  make("amchemGoem", "Amchem Goem", board("AMCHEM GOEM", GREEN, YELLOW, 22)),
  make("buildDay", "Build day", hangingBoard("BUILD DAY", PINK, CREAM, 22)),
  make("launchDay", "Launch day", hangingBoard("LAUNCH DAY", YELLOW, INK, 22)),
];
