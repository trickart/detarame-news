/**
 * でたらめニュース生成エンジン。
 * generate.ts(日次生成)と sample.ts(チューニング用サンプラー)から使う。
 */
import { readFileSync } from "node:fs";
import {
  BOS,
  EOS,
  KEY_SEP,
  type Method,
  type Model,
  type Segment,
  type SourceRef,
} from "./types.js";

const NG_WORDS: string[] = JSON.parse(
  readFileSync("data/ng-words.json", "utf8"),
);
const ACCUSATION_WORDS: string[] = JSON.parse(
  readFileSync("data/accusation-words.json", "utf8"),
);

const MAX_TOKENS = 40;
const MIN_LENGTH = 12;
const MAX_LENGTH = 60;
const MAX_ATTEMPTS = 500;

/** 文字列 → 32bit シード */
export function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (const c of s) {
    h ^= c.codePointAt(0)!;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: シード付き決定的乱数 */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 日替わりの手法選択(通算日数の偶奇で交互に切り替え) */
export function methodForDate(date: string): Method {
  const days = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
  return days % 2 === 0 ? "splice" : "markov2";
}

const BRACKET_PAIRS: [string, string][] = [
  ["「", "」"],
  ["『", "』"],
  ["【", "】"],
  ["(", ")"],
  ["(", ")"],
];

/** 括弧の対応が崩れていないか(閉じ忘れ・閉じだけ等を棄却するため) */
function bracketsBalanced(text: string): boolean {
  for (const [open, close] of BRACKET_PAIRS) {
    let depth = 0;
    for (const ch of text) {
      if (ch === open) depth++;
      else if (ch === close && --depth < 0) return false;
    }
    if (depth !== 0) return false;
  }
  return true;
}

interface GenToken {
  text: string;
  sourceId: number;
}

/** 2次マルコフ連鎖で1本生成 */
function generateMarkov2(model: Model, rand: () => number): GenToken[] | null {
  const tokens: GenToken[] = [];
  let prev2 = BOS;
  let prev1 = BOS;
  for (let i = 0; i < MAX_TOKENS; i++) {
    const candidates = model.transitions[prev2 + KEY_SEP + prev1];
    if (!candidates || candidates.length === 0) return null;
    const pick = candidates[Math.floor(rand() * candidates.length)];
    if (pick.t === EOS) return tokens;
    tokens.push({ text: pick.t, sourceId: pick.s });
    prev2 = prev1;
    prev1 = pick.t;
  }
  return null; // 長すぎる場合は棄却
}

type PivotIndex = Map<string, { title: number; pos: number }[]>;

/** ピボット単語 → 出現位置の索引(接合用) */
function buildPivotIndex(model: Model): PivotIndex {
  const index: PivotIndex = new Map();
  model.pivots.forEach((positions, title) => {
    for (const pos of positions) {
      const word = model.tokens[title][pos];
      const list = index.get(word) ?? [];
      list.push({ title, pos });
      index.set(word, list);
    }
  });
  return index;
}

/** ピボット接合で1本生成: タイトルAの前半 + 共通語 + タイトルBの後半 */
function generateSplice(
  model: Model,
  pivotIndex: PivotIndex,
  rand: () => number,
): GenToken[] | null {
  const a = Math.floor(rand() * model.tokens.length);
  const toksA = model.tokens[a];
  // 先頭・末尾以外にあり、他のタイトルにも(末尾以外で)登場するピボット
  const pivots = model.pivots[a].filter((pos) => {
    if (pos === 0 || pos === toksA.length - 1) return false;
    return (pivotIndex.get(toksA[pos]) ?? []).some(
      (e) => e.title !== a && e.pos < model.tokens[e.title].length - 1,
    );
  });
  if (pivots.length === 0) return null;
  const posA = pivots[Math.floor(rand() * pivots.length)];
  const candidates = (pivotIndex.get(toksA[posA]) ?? []).filter(
    (e) => e.title !== a && e.pos < model.tokens[e.title].length - 1,
  );
  const b = candidates[Math.floor(rand() * candidates.length)];

  // ピボット以外の内容語も共有する組(=同一話題の続報同士)は、
  // つなげても実話同然になりやすいので棄却する
  const pivotWord = toksA[posA];
  const wordsA = new Set(model.pivots[a].map((p) => toksA[p]));
  const sharesOther = model.pivots[b.title].some((p) => {
    const w = model.tokens[b.title][p];
    return w !== pivotWord && wordsA.has(w);
  });
  if (sharesOther) return null;

  // 前半・後半が短すぎると片方のタイトルほぼそのままになるので棄却する
  const prefixText = toksA.slice(0, posA + 1).join("");
  const suffixText = model.tokens[b.title].slice(b.pos + 1).join("");
  if (prefixText.length < 6 || suffixText.length < 6) return null;

  return [
    ...toksA.slice(0, posA + 1).map((text) => ({ text, sourceId: a })),
    ...model.tokens[b.title]
      .slice(b.pos + 1)
      .map((text) => ({ text, sourceId: b.title })),
  ];
}

export interface Generated {
  title: string;
  segments: Segment[];
  sources: SourceRef[];
}

/**
 * 棄却条件を満たす1本を生成する。
 * 同じ (model, seedStr, method) なら常に同じ結果を返す。
 */
export function generateNews(
  model: Model,
  seedStr: string,
  method: Method,
): Generated | null {
  const rand = mulberry32(hashSeed(seedStr));
  const pivotIndex = method === "splice" ? buildPivotIndex(model) : null;
  const properNouns = new Set(model.properNouns);

  let result: GenToken[] | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidate =
      method === "splice"
        ? generateSplice(model, pivotIndex!, rand)
        : generateMarkov2(model, rand);
    if (!candidate) continue;
    const text = candidate.map((t) => t.text).join("");
    // 短すぎ・長すぎ・単一ソースの出力は棄却
    const distinctSources = new Set(candidate.map((t) => t.sourceId));
    if (text.length < MIN_LENGTH || text.length > MAX_LENGTH) continue;
    if (distinctSources.size < 2) continue;
    // 元タイトルが丸ごと含まれる出力は「ほぼ実在の見出し」なので棄却
    if (model.titles.some((t) => text.includes(t))) continue;
    // 素材は除外済みだが、トークンの組み合わせで偶然できる場合もあるので
    // 生成結果に対しても NG ワードをチェックする
    if (NG_WORDS.some((w) => text.includes(w))) continue;
    // 括弧の対応が崩れた見出し(閉じ忘れ・閉じだけ)は棄却
    if (!bracketsBalanced(text)) continue;
    // 実在の固有名詞(人名・組織など)と犯罪の嫌疑を思わせる語が同じ見出しに
    // 共存すると、切り取られたときに事実と誤読されるおそれがあるので棄却
    if (
      ACCUSATION_WORDS.some((w) => text.includes(w)) &&
      candidate.some((t) => properNouns.has(t.text))
    )
      continue;
    result = candidate;
    break;
  }
  if (!result) return null;

  // 使われたソースだけを 0 起点で採番し直し、連続する同一ソースを結合
  const usedIds: number[] = [];
  const idMap = new Map<number, number>();
  for (const t of result) {
    if (!idMap.has(t.sourceId)) {
      idMap.set(t.sourceId, usedIds.length);
      usedIds.push(t.sourceId);
    }
  }
  const segments: Segment[] = [];
  for (const t of result) {
    const source = idMap.get(t.sourceId)!;
    const last = segments[segments.length - 1];
    if (last && last.source === source) {
      last.text += t.text;
    } else {
      segments.push({ text: t.text, source });
    }
  }

  return {
    title: segments.map((s) => s.text).join(""),
    segments,
    sources: usedIds.map((origId, newId) => ({
      ...model.sources[origId],
      id: newId,
    })),
  };
}
