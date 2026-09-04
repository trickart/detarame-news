/**
 * その日のでたらめニュースを X (Twitter) に投稿する。
 *
 * X API v2 の POST /2/tweets を OAuth 1.0a(ユーザーコンテキスト)で叩く。
 * 署名は node:crypto で自前実装しているため追加の依存はない。
 * 無料プランの投稿枠(月500件)で一日一回の投稿には十分。
 *
 * 必要な環境変数(GitHub Secrets に設定):
 *   X_API_KEY, X_API_SECRET       … アプリの Consumer Keys
 *   X_ACCESS_TOKEN, X_ACCESS_SECRET … 投稿するアカウントの Access Token(Read and Write)
 * 未設定の場合はスキップして正常終了する(X 連携前でもワークフローを壊さない)。
 *
 * 使い方: tsx src/post-x.ts [YYYY-MM-DD] [--dry-run]
 */
import { createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { todayJST } from "./date.js";
import type { DailyNews } from "./types.js";

const API_URL = "https://api.x.com/2/tweets";

/** RFC 3986 のパーセントエンコード(OAuth 1.0a 用) */
function rfc3986(s: string): string {
  return encodeURIComponent(s).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** OAuth 1.0a の Authorization ヘッダを作る(ボディは JSON なので署名対象外) */
function oauthHeader(
  method: string,
  url: string,
  creds: { apiKey: string; apiSecret: string; token: string; tokenSecret: string },
): string {
  const params: Record<string, string> = {
    oauth_consumer_key: creds.apiKey,
    oauth_nonce: randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: creds.token,
    oauth_version: "1.0",
  };
  const paramString = Object.keys(params)
    .sort()
    .map((k) => `${rfc3986(k)}=${rfc3986(params[k])}`)
    .join("&");
  const baseString = [method, rfc3986(url), rfc3986(paramString)].join("&");
  const signingKey = `${rfc3986(creds.apiSecret)}&${rfc3986(creds.tokenSecret)}`;
  params.oauth_signature = createHmac("sha1", signingKey)
    .update(baseString)
    .digest("base64");
  const header = Object.keys(params)
    .sort()
    .map((k) => `${rfc3986(k)}="${rfc3986(params[k])}"`)
    .join(", ");
  return `OAuth ${header}`;
}

/** 投稿本文。URL 入りの投稿は料金が高くなるため、見出しとハッシュタグのみにする */
function buildText(news: DailyNews): string {
  return `${news.title} #でたらめニュース`;
}

async function main() {
  const dateArg = process.argv[2];
  const date = dateArg && /^\d{4}-\d{2}-\d{2}$/.test(dateArg) ? dateArg : todayJST();
  const news: DailyNews = JSON.parse(readFileSync(`news/${date}.json`, "utf8"));
  const text = buildText(news);

  if (process.argv.includes("--dry-run")) {
    console.log("--- dry-run: 投稿内容 ---");
    console.log(text);
    return;
  }

  const { X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET } = process.env;
  if (!X_API_KEY || !X_API_SECRET || !X_ACCESS_TOKEN || !X_ACCESS_SECRET) {
    console.log("X の認証情報が未設定のため投稿をスキップします");
    return;
  }

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: oauthHeader("POST", API_URL, {
        apiKey: X_API_KEY,
        apiSecret: X_API_SECRET,
        token: X_ACCESS_TOKEN,
        tokenSecret: X_ACCESS_SECRET,
      }),
    },
    body: JSON.stringify({ text }),
  });
  const body = await res.text();
  if (!res.ok) {
    console.error(`投稿に失敗しました: HTTP ${res.status} ${body}`);
    process.exit(1);
  }
  const id = JSON.parse(body)?.data?.id;
  console.log(`投稿しました: https://x.com/i/status/${id}`);
}

main();
