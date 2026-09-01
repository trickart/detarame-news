/**
 * 実運用と同じシード・フォールバック経路で先の日付まで日次生成を走らせ、
 * 安全性と候補枯渇を機械的にチェックする。
 *
 * チェック内容:
 *   - 生成が失敗(全手法・全リトライで枯渇)しないか → 検出したら exit 1
 *   - 見出しに NG ワードが混入していないか → 検出したら exit 1(エンジンのバグ)
 *   - 嫌疑語と固有名詞の共存がないか(3文字以上の固有名詞の部分一致による近似。
 *     エンジン本体はトークン単位で判定するため、ここでの検出は誤検知の可能性あり)
 *     → 警告のみ
 *
 * ng-words.json / accusation-words.json / titles.json を編集して
 * `npm run model` した後に回す。
 *
 * 使い方: tsx src/verify.ts [日数=90] [開始日=今日] [--verbose]
 */
import { readFileSync } from "node:fs";
import { todayJST } from "./date.js";
import { generateForDate, methodForDate } from "./engine.js";
import type { Model } from "./types.js";

const args = process.argv.slice(2).filter((a) => a !== "--verbose");
const verbose = process.argv.includes("--verbose");
const days = Number(args[0] ?? 90);
const start = args[1] ?? todayJST();
if (!Number.isInteger(days) || days < 1 || !/^\d{4}-\d{2}-\d{2}$/.test(start)) {
  console.error("使い方: tsx src/verify.ts [日数=90] [開始日=今日] [--verbose]");
  process.exit(1);
}

const model: Model = JSON.parse(readFileSync("data/model.json", "utf8"));
const ngWords: string[] = JSON.parse(readFileSync("data/ng-words.json", "utf8"));
const accusationWords: string[] = JSON.parse(
  readFileSync("data/accusation-words.json", "utf8"),
);
// 「リー」等の短い固有名詞は「フェリー」などに部分一致して誤検知だらけに
// なるので、近似チェックは3文字以上に絞る
const properNouns = model.properNouns.filter((p) => p.length >= 3);

let failures = 0;
let ngHits = 0;
let warnings = 0;
let fallbacks = 0;
const startMs = Date.parse(`${start}T00:00:00Z`);
for (let d = 0; d < days; d++) {
  const date = new Date(startMs + d * 86_400_000).toISOString().slice(0, 10);
  const g = generateForDate(model, date);
  if (!g) {
    failures++;
    console.error(`${date}: 生成失敗(候補枯渇)`);
    continue;
  }
  if (g.retry > 0 || g.method !== methodForDate(date)) {
    fallbacks++;
    console.log(`${date}: フォールバック使用(手法 ${g.method}、リトライ ${g.retry})`);
  }
  const problems: string[] = [];
  const ng = ngWords.filter((w) => g.title.includes(w));
  if (ng.length > 0) {
    ngHits++;
    problems.push(`NGワード混入: ${ng.join(", ")}`);
  }
  const acc = accusationWords.filter((w) => g.title.includes(w));
  const proper = properNouns.filter((p) => g.title.includes(p));
  if (acc.length > 0 && proper.length > 0) {
    warnings++;
    problems.push(
      `嫌疑語×固有名詞の疑い(近似): ${acc.join(", ")} × ${proper.join(", ")}`,
    );
  }
  if (problems.length > 0) {
    console.warn(`${date} [${g.method}] ${g.title} ← ${problems.join(" / ")}`);
  } else if (verbose) {
    console.log(`${date} [${g.method}] ${g.title}`);
  }
}

console.log(
  `\n${start} から ${days} 日分: 生成失敗 ${failures} 件、NGワード混入 ${ngHits} 件、` +
    `嫌疑語×固有名詞の警告 ${warnings} 件、フォールバック使用 ${fallbacks} 件`,
);
if (failures > 0 || ngHits > 0) process.exit(1);
