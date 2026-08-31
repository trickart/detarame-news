/**
 * data/titles.json のタイトル群を kuromoji で分かち書きし、
 * 2次マルコフ連鎖とピボット接合の両方に使えるモデルを data/model.json に保存する。
 * どちらの手法でも「どの部分がどの記事由来か」を追跡できる。
 *
 * モデル構築は一度だけ実行すればよく、日次の生成は model.json のみを使う
 * (GitHub Actions 上で kuromoji を動かす必要がない)。
 */
import { readFileSync, writeFileSync } from "node:fs";
import kuromoji from "kuromoji";
import { BOS, EOS, KEY_SEP, type Model, type SourceRef } from "./types.js";

const TITLES_PATH = "data/titles.json";
const NG_WORDS_PATH = "data/ng-words.json";
const OUT_PATH = "data/model.json";

function buildTokenizer(): Promise<kuromoji.Tokenizer<kuromoji.IpadicFeatures>> {
  return new Promise((resolve, reject) => {
    kuromoji
      .builder({ dicPath: "node_modules/kuromoji/dict" })
      .build((err, tokenizer) => (err ? reject(err) : resolve(tokenizer)));
  });
}

function articleUrl(title: string): string {
  return `https://ja.wikinews.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}

/** ピボット(接合の蝶番)にできる内容語かどうか */
function isPivotToken(t: kuromoji.IpadicFeatures): boolean {
  return (
    t.surface_form.length >= 2 &&
    (t.pos === "名詞" || t.pos === "動詞") &&
    t.pos_detail_1 !== "数" &&
    t.pos_detail_1 !== "非自立" &&
    t.pos_detail_1 !== "接尾"
  );
}

async function main() {
  const allTitles: string[] = JSON.parse(readFileSync(TITLES_PATH, "utf8"));
  const ngWords: string[] = JSON.parse(readFileSync(NG_WORDS_PATH, "utf8"));
  // NGワードを含む記事は素材から除外する(ソースリンクとしても表示させない)
  const titles = allTitles.filter((t) => !ngWords.some((w) => t.includes(w)));
  console.log(`NGワードを含む ${allTitles.length - titles.length} 件を除外しました`);
  const tokenizer = await buildTokenizer();

  const sources: SourceRef[] = [];
  const transitions: Record<string, { t: string; s: number }[]> = {};
  const allTokens: string[][] = [];
  const allPivots: number[][] = [];

  const addTransition = (prev2: string, prev1: string, to: string, sourceId: number) => {
    const key = prev2 + KEY_SEP + prev1;
    (transitions[key] ??= []).push({ t: to, s: sourceId });
  };

  for (const title of titles) {
    const id = sources.length;
    sources.push({ id, title, url: articleUrl(title) });

    const morphs = tokenizer.tokenize(title);
    const tokens = morphs.map((t) => t.surface_form);
    allTokens.push(tokens);
    allPivots.push(
      morphs.flatMap((t, i) => (isPivotToken(t) ? [i] : [])),
    );
    if (tokens.length === 0) continue;

    // 2次マルコフ: (2つ前, 1つ前) → 次
    const seq = [BOS, BOS, ...tokens, EOS];
    for (let i = 0; i + 2 < seq.length; i++) {
      addTransition(seq[i], seq[i + 1], seq[i + 2], id);
    }
  }

  const model: Model = {
    sources,
    titles,
    transitions,
    tokens: allTokens,
    pivots: allPivots,
  };
  writeFileSync(OUT_PATH, JSON.stringify(model), "utf8");

  const nStates = Object.keys(transitions).length;
  const nTrans = Object.values(transitions).reduce((a, v) => a + v.length, 0);
  console.log(
    `モデルを ${OUT_PATH} に保存しました(記事 ${sources.length} 件、状態 ${nStates}、遷移 ${nTrans})`,
  );
}

main();
