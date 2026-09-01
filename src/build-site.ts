/**
 * news/*.json から静的サイトを dist/ に生成する。
 *
 * 出力:
 *   dist/index.html            最新のニュース
 *   dist/news/YYYY-MM-DD.html  日別ページ
 *   dist/archive.html          アーカイブ一覧
 *   dist/feed.xml              Atom フィード(直近30件)
 *   dist/style.css             (public/ からコピー)
 *
 * ソース色は「その日のソース一覧のインデックス × 黄金角」で色相を決め、
 * CSS カスタムプロパティ --h としてインラインで埋め込む。
 */
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { formatDateJa } from "./date.js";
import { METHOD_LABELS, SITE_URL, type DailyNews } from "./types.js";

const SITE_TITLE = "でたらめニュース";
const TAGLINE = "マルコフ連鎖とカットアップが日替わりでお届けする、実在しないニュース";
const FEED_FILE = "feed.xml";
const FEED_ENTRIES = 30;

const GOLDEN_ANGLE = 137.508;

function hue(index: number): number {
  return Math.round((index * GOLDEN_ANGLE) % 360);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function page(opts: {
  title: string;
  description: string;
  cssPath: string;
  /** SITE_URL からの相対パス(canonical / og:url 用)。例: "news/2026-09-01.html" */
  path: string;
  /** OGP 画像の日付(dist/og/<date>.png を指す) */
  ogDate: string;
  body: string;
}): string {
  const canonical = `${SITE_URL}/${opts.path}`;
  const ogImage = `${SITE_URL}/og/${opts.ogDate}.png`;
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(opts.title)}</title>
<meta name="description" content="${escapeHtml(opts.description)}">
<meta property="og:title" content="${escapeHtml(opts.title)}">
<meta property="og:description" content="${escapeHtml(opts.description)}">
<meta property="og:type" content="article">
<meta property="og:url" content="${canonical}">
<meta property="og:site_name" content="${SITE_TITLE}">
<meta property="og:locale" content="ja_JP">
<meta property="og:image" content="${ogImage}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="canonical" href="${canonical}">
<link rel="alternate" type="application/atom+xml" title="${SITE_TITLE}" href="${SITE_URL}/${FEED_FILE}">
<link rel="stylesheet" href="${opts.cssPath}">
</head>
<body>
<div class="wrap">
${opts.body}
</div>
</body>
</html>
`;
}

function siteHeader(homePath: string): string {
  return `<header class="site">
<p class="brand"><a href="${homePath}">${SITE_TITLE}</a></p>
<p class="tagline">${TAGLINE}</p>
</header>`;
}

function siteFooter(): string {
  return `<footer class="site">
<p>このサイトのニュースはすべて自動生成された架空のものであり、事実ではありません。</p>
<p>生成の素材として<a href="https://ja.wikinews.org/">ウィキニュース日本語版</a>の記事タイトル(<a href="https://creativecommons.org/licenses/by/2.5/deed.ja">CC BY 2.5</a>)を使用しています。本サイトのテキストも同ライセンスで提供されます。</p>
<p><a href="${SITE_URL}/${FEED_FILE}">Atom フィード</a></p>
</footer>`;
}

/** 見出しとソース一覧をまとめた記事ブロック */
function articleBlock(news: DailyNews): string {
  const headline = news.segments
    .map(
      (seg) =>
        `<span class="seg" style="--h:${hue(seg.source)}">${escapeHtml(seg.text)}</span>`,
    )
    .join("");
  const sourceItems = news.sources
    .map(
      (src) =>
        `<li style="--h:${hue(src.id)}"><span class="swatch"></span><a href="${escapeHtml(src.url)}" rel="external">${escapeHtml(src.title)}</a></li>`,
    )
    .join("\n");
  return `<article>
<p class="date">${formatDateJa(news.date)}<span class="method">本日の製法: ${METHOD_LABELS[news.method]}</span></p>
<h1 class="headline">${headline}</h1>
<section class="sources">
<h2>本日のソース記事</h2>
<p class="note">見出しの文字色は、その部分の由来となった記事を示しています。</p>
<ul>
${sourceItems}
</ul>
</section>
</article>`;
}

/** YYYY-MM-DD → RFC 3339(日次生成が走る JST 0:05 を公開時刻とする) */
function atomDate(date: string): string {
  return `${date}T00:05:00+09:00`;
}

/** フィード用のエントリ本文(HTML)。切り取り対策として免責も毎回含める */
function feedContent(news: DailyNews): string {
  const sourceItems = news.sources
    .map(
      (src) =>
        `<li><a href="${escapeHtml(src.url)}">${escapeHtml(src.title)}</a></li>`,
    )
    .join("");
  return `<p>本日の製法: ${METHOD_LABELS[news.method]}</p>
<p>本日のソース記事:</p>
<ul>${sourceItems}</ul>
<p>この見出しは自動生成された架空のものであり、事実ではありません。</p>`;
}

/** Atom フィード(直近 FEED_ENTRIES 件、新しい順) */
function buildFeed(all: DailyNews[]): string {
  const recent = all.slice(-FEED_ENTRIES).reverse();
  const entries = recent
    .map((news) => {
      const url = `${SITE_URL}/news/${news.date}.html`;
      return `<entry>
<id>${url}</id>
<title>${escapeHtml(news.title)}</title>
<link rel="alternate" type="text/html" href="${url}"/>
<published>${atomDate(news.date)}</published>
<updated>${atomDate(news.date)}</updated>
<content type="html">${escapeHtml(feedContent(news))}</content>
</entry>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="ja">
<id>${SITE_URL}/</id>
<title>${SITE_TITLE}</title>
<subtitle>${escapeHtml(TAGLINE)}</subtitle>
<link rel="alternate" type="text/html" href="${SITE_URL}/"/>
<link rel="self" type="application/atom+xml" href="${SITE_URL}/${FEED_FILE}"/>
<updated>${atomDate(recent[0].date)}</updated>
<author><name>${SITE_TITLE}</name><uri>${SITE_URL}/</uri></author>
<rights>本フィードのニュースはすべて自動生成された架空のものです。素材としてウィキニュース日本語版の記事タイトル(CC BY 2.5)を使用しており、テキストは同ライセンスで提供されます。</rights>
${entries}
</feed>
`;
}

function pager(all: DailyNews[], index: number, pathPrefix: string): string {
  const prev = all[index - 1];
  const next = all[index + 1];
  const prevLink = prev
    ? `<a href="${pathPrefix}news/${prev.date}.html">← ${prev.date}</a>`
    : "<span></span>";
  const nextLink = next
    ? `<a href="${pathPrefix}news/${next.date}.html">${next.date} →</a>`
    : "<span></span>";
  return `<nav class="pager">
${prevLink}
<a class="center" href="${pathPrefix}archive.html">アーカイブ</a>
${nextLink}
</nav>`;
}

function main() {
  const files = readdirSync("news")
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort();
  if (files.length === 0) {
    console.error("news/ に生成済みニュースがありません");
    process.exit(1);
  }
  const all: DailyNews[] = files.map((f) =>
    JSON.parse(readFileSync(`news/${f}`, "utf8")),
  );

  rmSync("dist", { recursive: true, force: true });
  mkdirSync("dist/news", { recursive: true });
  copyFileSync("public/style.css", "dist/style.css");

  // 日別ページ
  all.forEach((news, i) => {
    const html = page({
      title: `${news.title} | ${SITE_TITLE}`,
      description: `${formatDateJa(news.date)}のでたらめニュース`,
      cssPath: "../style.css",
      path: `news/${news.date}.html`,
      ogDate: news.date,
      body: [siteHeader("../index.html"), articleBlock(news), pager(all, i, "../"), siteFooter()].join("\n"),
    });
    writeFileSync(`dist/news/${news.date}.html`, html, "utf8");
  });

  // トップページ = 最新
  const latest = all[all.length - 1];
  const indexHtml = page({
    title: SITE_TITLE,
    description: `${TAGLINE}。本日の見出し: ${latest.title}`,
    cssPath: "style.css",
    path: "index.html",
    ogDate: latest.date,
    body: [
      siteHeader("index.html"),
      articleBlock(latest),
      pager(all, all.length - 1, ""),
      siteFooter(),
    ].join("\n"),
  });
  writeFileSync("dist/index.html", indexHtml, "utf8");

  // アーカイブ
  const archiveItems = [...all]
    .reverse()
    .map(
      (news) =>
        `<li><span class="adate">${formatDateJa(news.date)}</span><a href="news/${news.date}.html">${escapeHtml(news.title)}</a></li>`,
    )
    .join("\n");
  const archiveHtml = page({
    title: `アーカイブ | ${SITE_TITLE}`,
    description: `${SITE_TITLE}の過去のニュース一覧`,
    cssPath: "style.css",
    path: "archive.html",
    ogDate: latest.date,
    body: [
      siteHeader("index.html"),
      `<section class="archive"><h1>アーカイブ</h1><ul>\n${archiveItems}\n</ul></section>`,
      siteFooter(),
    ].join("\n"),
  });
  writeFileSync("dist/archive.html", archiveHtml, "utf8");

  // Atom フィード
  writeFileSync(`dist/${FEED_FILE}`, buildFeed(all), "utf8");

  console.log(`dist/ に ${all.length} 日分のサイトを生成しました`);
}

main();
