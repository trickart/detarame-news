/**
 * ごちゃまぜ具合のチェック用サンプラー。
 * 両手法でそれぞれ N 本ずつ生成して標準出力に並べる(サイトには影響しない)。
 *
 * 使い方: tsx src/sample.ts [本数] [シード接頭辞]
 */
import { readFileSync } from "node:fs";
import { generateNews } from "./engine.js";
import { METHOD_LABELS, type Method, type Model } from "./types.js";

const n = Number(process.argv[2] ?? 15);
const prefix = process.argv[3] ?? "sample";

const model: Model = JSON.parse(readFileSync("data/model.json", "utf8"));

for (const method of ["splice", "markov2"] as Method[]) {
  console.log(`\n=== ${METHOD_LABELS[method]} ===`);
  const seen = new Set<string>();
  let i = 0;
  while (seen.size < n && i < n * 20) {
    const g = generateNews(model, `${prefix}:${method}:${i++}`, method);
    if (!g || seen.has(g.title)) continue;
    seen.add(g.title);
    console.log(`・${g.title}(ソース${g.sources.length}件)`);
  }
}
