/**
 * X (Twitter) 用のプロフィールアイコンを assets/ に生成する。
 * サイトの配色(クリーム地 + ソース色分けパレット)に合わせた「で」一文字。
 *
 *   assets/x-icon.png       … 多色(ソース色の斜めストライプ)
 *   assets/x-icon-black.png … 黒一色
 *
 * 使い方: tsx src/build-icon.ts
 */
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";

const FONT_PATH = "assets/fonts/NotoSansCJKjp-Bold.otf";
const FONT_FAMILY = "Noto Sans CJK JP";
const SIZE = 1024;

const GOLDEN_ANGLE = 137.508;

/** build-og.ts と同じ: hsl(h, 72%, 34%) を hex で返す */
function sourceColor(index: number): string {
  const h = ((index * GOLDEN_ANGLE) % 360) / 360;
  const s = 0.72;
  const l = 0.34;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number): number => {
    t = ((t % 1) + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const hex = (v: number) =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${hex(channel(h + 1 / 3))}${hex(channel(h))}${hex(channel(h - 1 / 3))}`;
}

function buildSvg(fill: string, defs = ""): string {
  const fontSize = 680;
  // CJK グリフは em ボックスにほぼセンタリングされているので、
  // ベースラインを中央 + 0.36em に置くと視覚的に中央に来る
  const baseline = SIZE / 2 + fontSize * 0.36;
  return `<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg">
${defs}
<rect width="${SIZE}" height="${SIZE}" fill="#faf8f4"/>
<text x="${SIZE / 2}" y="${baseline}" text-anchor="middle" font-size="${fontSize}" font-weight="bold" font-family="${FONT_FAMILY}" fill="${fill}">で</text>
</svg>`;
}

function render(svg: string, outPath: string) {
  const resvg = new Resvg(svg, {
    font: {
      fontFiles: [FONT_PATH],
      loadSystemFonts: false,
      defaultFontFamily: FONT_FAMILY,
    },
  });
  writeFileSync(outPath, resvg.render().asPng());
  console.log(`${outPath} を生成しました`);
}

// 多色版: ソース色パレット4色の斜めストライプ(ハードストップ)
const colors = [0, 1, 2, 3].map(sourceColor);
const stops = colors
  .flatMap((c, i) => [
    `<stop offset="${(i / colors.length) * 100}%" stop-color="${c}"/>`,
    `<stop offset="${((i + 1) / colors.length) * 100}%" stop-color="${c}"/>`,
  ])
  .join("\n");
const gradientDefs = `<defs>
<linearGradient id="seg" x1="0" y1="0" x2="1" y2="1">
${stops}
</linearGradient>
</defs>`;
render(buildSvg("url(#seg)", gradientDefs), "assets/x-icon.png");

// 黒一色版
render(buildSvg("#1a1a1a"), "assets/x-icon-black.png");
