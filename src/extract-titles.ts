/**
 * ウィキニュース日本語版の pages-articles dump から記事タイトルを抽出して
 * data/titles.json に保存する。
 *
 * 対象: ns=0(標準名前空間)かつリダイレクトでないページ。
 * dump の XML は1ページごとに整形されているため、行ベースで十分パースできる。
 */
import { createReadStream, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

const DUMP_PATH =
  process.argv[2] ?? "dump/jawikinews-latest-pages-articles.xml";
const OUT_PATH = "data/titles.json";

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, "&");
}

/** 生成素材として不適切なメタ的タイトルを除外する */
function isUsableTitle(title: string): boolean {
  if (title.length < 4) return false;
  // 「2005年5月10日」のような日付だけの記事ページ
  if (/^\d{4}年(\d{1,2}月(\d{1,2}日)?)?$/.test(title)) return false;
  if (title.includes("メインページ")) return false;
  return true;
}

async function main() {
  const rl = createInterface({
    input: createReadStream(DUMP_PATH, "utf8"),
    crlfDelay: Infinity,
  });

  const titles: string[] = [];
  let currentTitle: string | null = null;
  let ns: string | null = null;
  let isRedirect = false;

  for await (const line of rl) {
    const trimmed = line.trim();
    if (trimmed === "<page>") {
      currentTitle = null;
      ns = null;
      isRedirect = false;
    } else if (trimmed.startsWith("<title>")) {
      currentTitle = decodeEntities(
        trimmed.replace(/^<title>/, "").replace(/<\/title>$/, ""),
      );
    } else if (trimmed.startsWith("<ns>")) {
      ns = trimmed.replace(/^<ns>/, "").replace(/<\/ns>$/, "");
    } else if (trimmed.startsWith("<redirect ")) {
      isRedirect = true;
    } else if (trimmed === "</page>") {
      if (currentTitle && ns === "0" && !isRedirect && isUsableTitle(currentTitle)) {
        titles.push(currentTitle);
      }
    }
  }

  writeFileSync(OUT_PATH, JSON.stringify(titles, null, 1), "utf8");
  console.log(`${titles.length} 件のタイトルを ${OUT_PATH} に保存しました`);
}

main();
