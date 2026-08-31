/**
 * news/*.json から日別の OGP 画像(1200×630 PNG)を dist/og/ に生成する。
 * 見出しはサイトと同じ「ソース別の色分け」で描画される。
 *
 * SVG を組み立てて @resvg/resvg-js でラスタライズする。フォントは
 * assets/fonts/ に同梱した Noto Sans CJK を使うため、実行環境に依存しない。
 *
 * build-site.ts が dist/ を作った後に実行すること(npm run build が両方を回す)。
 */
import { Resvg } from "@resvg/resvg-js";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { formatDateJa } from "./date.js";
import { METHOD_LABELS, type DailyNews, type Segment } from "./types.js";

const FONT_PATH = "assets/fonts/NotoSansCJKjp-Bold.otf";
const FONT_FAMILY = "Noto Sans CJK JP";

const WIDTH = 1200;
const HEIGHT = 630;
const MARGIN = 70;
const HEADLINE_SIZE = 64;
const LINE_HEIGHT = 92;
const MAX_LINE_WIDTH = WIDTH - MARGIN * 2;

const GOLDEN_ANGLE = 137.508;

/** サイトのライトテーマと同じ色: hsl(h, 72%, 34%) を hex にして返す */
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

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 全角 1em・半角 0.55em の概算で文字幅を見積もる */
function charWidth(ch: string, fontSize: number): number {
  return /[ -˿]/.test(ch) ? fontSize * 0.55 : fontSize;
}

interface Run {
  text: string;
  color: string;
}

/** 色付き断片を行幅に合わせて折り返し、行ごとの Run 列にする */
function wrapSegments(segments: Segment[], fontSize: number, maxWidth: number): Run[][] {
  const lines: Run[][] = [[]];
  let x = 0;
  for (const seg of segments) {
    const color = sourceColor(seg.source);
    for (const ch of seg.text) {
      const w = charWidth(ch, fontSize);
      if (x + w > maxWidth && x > 0) {
        lines.push([]);
        x = 0;
      }
      const line = lines[lines.length - 1];
      const last = line[line.length - 1];
      if (last && last.color === color) {
        last.text += ch;
      } else {
        line.push({ text: ch, color });
      }
      x += w;
    }
  }
  return lines;
}

function buildSvg(news: DailyNews): string {
  const lines = wrapSegments(news.segments, HEADLINE_SIZE, MAX_LINE_WIDTH);
  const headlineHeight = lines.length * LINE_HEIGHT;
  // ヘッダ(上部)とフッタ(下部)の間で見出しブロックを上下センタリング
  const headlineTop = 210 + Math.max(0, (330 - headlineHeight) / 2);

  const headlineText = lines
    .map((line, i) => {
      const tspans = line
        .map((run) => `<tspan fill="${run.color}">${escapeXml(run.text)}</tspan>`)
        .join("");
      const y = headlineTop + i * LINE_HEIGHT + HEADLINE_SIZE;
      return `<text x="${MARGIN}" y="${y}" font-size="${HEADLINE_SIZE}" font-weight="bold" font-family="${FONT_FAMILY}">${tspans}</text>`;
    })
    .join("\n");

  const meta = `${formatDateJa(news.date)} ─ 本日の製法: ${METHOD_LABELS[news.method]}`;

  return `<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
<rect width="${WIDTH}" height="${HEIGHT}" fill="#faf8f4"/>
<text x="${MARGIN}" y="108" font-size="52" font-weight="bold" font-family="${FONT_FAMILY}" fill="#1a1a1a" letter-spacing="6">でたらめニュース</text>
<rect x="${MARGIN}" y="136" width="${WIDTH - MARGIN * 2}" height="3" fill="#1a1a1a"/>
<rect x="${MARGIN}" y="143" width="${WIDTH - MARGIN * 2}" height="1.5" fill="#1a1a1a"/>
<text x="${MARGIN}" y="188" font-size="28" font-family="${FONT_FAMILY}" fill="#666666">${escapeXml(meta)}</text>
${headlineText}
<text x="${MARGIN}" y="${HEIGHT - 48}" font-size="26" font-family="${FONT_FAMILY}" fill="#666666">実在しないニュースを毎日一本 ─ detarame.news</text>
</svg>`;
}

function main() {
  const files = readdirSync("news")
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort();
  mkdirSync("dist/og", { recursive: true });

  for (const f of files) {
    const news: DailyNews = JSON.parse(readFileSync(`news/${f}`, "utf8"));
    const resvg = new Resvg(buildSvg(news), {
      font: {
        fontFiles: [FONT_PATH],
        loadSystemFonts: false,
        defaultFontFamily: FONT_FAMILY,
      },
    });
    writeFileSync(`dist/og/${news.date}.png`, resvg.render().asPng());
  }
  console.log(`dist/og/ に ${files.length} 枚の OGP 画像を生成しました`);
}

main();
