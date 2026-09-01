/**
 * data/model.json から一日分のでたらめニュースを生成し、
 * news/YYYY-MM-DD.json に保存する。
 *
 * 生成手法は日替わり(通算日数の偶奇):
 *   - ピボット接合   … 共通の内容語を蝶番に2つのタイトルを縫い合わせる(偶数日)
 *   - 2次マルコフ連鎖 … 直前2単語を見て次の単語を選ぶ(奇数日)
 *
 * 日付文字列をシードにした決定的乱数を使うため、同じ日に再実行しても
 * 同じ結果になる(Actions のリトライで内容が変わらない)。
 * 通常シードで棄却され尽くした場合はシード替え→手法切り替えの順で
 * フォールバックする(これも決定的)。
 *
 * 使い方: tsx src/generate.ts [YYYY-MM-DD] [--force]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { todayJST } from "./date.js";
import { generateForDate, methodForDate } from "./engine.js";
import { METHOD_LABELS, type DailyNews, type Model } from "./types.js";

const MODEL_PATH = "data/model.json";

function main() {
  const dateArg = process.argv[2];
  if (dateArg && dateArg !== "--force" && !/^\d{4}-\d{2}-\d{2}$/.test(dateArg)) {
    console.error(`日付の形式が不正です: ${dateArg}`);
    process.exit(1);
  }
  const date = dateArg && dateArg !== "--force" ? dateArg : todayJST();
  const outPath = `news/${date}.json`;
  if (existsSync(outPath) && !process.argv.includes("--force")) {
    console.log(`${outPath} は既に存在します(--force で上書き)`);
    return;
  }

  const model: Model = JSON.parse(readFileSync(MODEL_PATH, "utf8"));
  const generated = generateForDate(model, date);
  if (!generated) {
    console.error("生成に失敗しました(全手法・全リトライで条件を満たす出力が得られません)");
    process.exit(1);
  }
  const { method, retry, ...rest } = generated;
  if (retry > 0 || method !== methodForDate(date)) {
    console.warn(`フォールバックを使用しました(手法 ${method}、リトライ ${retry})`);
  }

  const news: DailyNews = { date, method, ...rest };
  writeFileSync(outPath, JSON.stringify(news, null, 1), "utf8");
  console.log(`${outPath} [${METHOD_LABELS[method]}]: ${news.title}`);
  console.log(
    `ソース ${news.sources.length} 件: ${news.sources.map((s) => s.title).join(" / ")}`,
  );
}

main();
