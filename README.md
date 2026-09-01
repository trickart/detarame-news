# でたらめニュース

閉鎖されたウィキニュース日本語版のアーカイブ dump から記事タイトルを取り出し、
ごちゃまぜにした架空のニュース見出しを一日一本生成する静的サイトです。

生成手法は日替わりで2つを交互に使います(通算日数の偶奇で決定):

- **ピボット接合** — 共通の内容語を蝶番にして2つのタイトルを縫い合わせるカットアップ。
  読みやすく「実在しそうで実在しない」見出しになる。
- **二次マルコフ連鎖** — 直前2単語を見て次の単語を選ぶ。よりシュールな混ざり方になる。

どちらも生成時に「同一話題の続報同士の接合」「元タイトルを丸ごと含む出力」
「括弧の対応が崩れた出力」などを棄却して、実話同然・不自然な見出しが出ないように
しています。

また `data/ng-words.json` の NG ワード(「自殺」など)を含む記事は素材から除外し、
トークンの組み合わせで偶然 NG ワードができた出力も棄却します。

さらに、実在の人名・組織名(kuromoji が固有名詞と判定した語+辞書にない未知語。
地名は除く)と `data/accusation-words.json` の嫌疑語(「容疑」「逮捕」「疑い」など)が
同じ見出しに共存した出力も棄却します。実在の人物に架空の犯罪嫌疑が結び付いた
見出しは、切り取って共有されると免責表示が効かないためです。

どちらのリストも自由に編集できます(編集後は `npm run model` でモデルを
再構築してください)。

見出しの各部分は由来となった元記事ごとに色分けされ、同じ色で元記事へのリンクが
表示されます(遷移ごとにソース記事 ID を保持するマルコフモデルで実現)。

## 構成

```
dump からタイトル抽出 → kuromoji で分かち書き → 出所付きマルコフモデル (data/model.json)
                                                        │
GitHub Actions (毎日 JST 0:05) ── 生成 news/YYYY-MM-DD.json ── コミット
                                                        │
                                      静的サイトビルド (dist/) → GitHub Pages
```

- `src/extract-titles.ts` — dump XML から ns=0・非リダイレクトの記事タイトルを抽出
- `src/build-model.ts` — kuromoji で分かち書きし、両手法用のモデル(2次マルコフ遷移+トークン列・ピボット位置)を構築。どの部分がどの記事由来かを追跡できる
- `src/generate.ts` — 日付をシードにした決定的乱数で一日分を生成(再実行しても同じ結果)。手法は日付の偶奇で切り替え。棄却され尽くした場合はシード替え→手法切り替えの順で決定的にフォールバック
- `src/verify.ts` — 実運用と同じ経路で先の日付まで生成し、候補枯渇・NG ワード混入・嫌疑語×固有名詞の共存(近似)をチェック。ワードリストや素材を編集したら `npm run model` の後に `npm run verify` を回す(`npm run verify 365` で日数指定、`--verbose` で全見出し表示)
- `src/build-site.ts` — `news/*.json` から `dist/` に静的サイトを生成(OGP メタタグ付き)。
  直近30件の Atom フィード `dist/feed.xml` もここで生成
- `src/build-og.ts` — 日別の OGP 画像(1200×630 PNG)を `dist/og/` に生成。
  見出しはサイトと同じソース別色分きで描画される(フォントは `assets/fonts/` に同梱)

生成・ビルドは `data/model.json` だけを使うため、日次の Actions 実行に dump や
kuromoji の辞書構築は不要です。

## セットアップ(初回のみ)

```sh
npm install
npm run dump        # dump のダウンロードと解凍(bunzip2 が必要)
npm run preprocess  # タイトル抽出 + モデル構築(data/ にコミットする)
```

## ローカルでの生成・確認

```sh
npm run generate                 # 今日(JST)の分を生成
npm run generate -- 2026-09-15   # 日付指定(--force で上書き)
npm run build                    # dist/ にサイトを生成
open dist/index.html
```

## デプロイ(GitHub Pages + 独自ドメイン detarame.news)

1. GitHub にパブリックリポジトリを作成して push する
2. リポジトリの Settings → Pages → Source を「GitHub Actions」にする
3. Actions タブから `daily-news` ワークフローを手動実行(workflow_dispatch)して初回デプロイ
4. ドメインの DNS に、apex ドメイン(detarame.news)用の A レコードを設定する:
   `185.199.108.153` / `185.199.109.153` / `185.199.110.153` / `185.199.111.153`
   (対応していれば AAAA レコード `2606:50c0:8000::153` 〜 `:8003::153` も)
5. Settings → Pages → Custom domain に `detarame.news` を入力し、
   DNS 検証が通ったら「Enforce HTTPS」を有効にする

以降は毎日 JST 0時すぎに自動で新しいニュースが追加・デプロイされます。

## X (Twitter) 自動投稿(任意)

毎日のデプロイ後に、その日の見出しとページへのリンクを X に自動投稿できます。

1. [X Developer Portal](https://developer.x.com/) で無料プランのアプリを作成する
   (無料プランの投稿枠は月500件なので一日一回の投稿には十分)
2. アプリの権限を **Read and Write** にしてから、
   「Keys and tokens」で Consumer Keys と Access Token & Secret を発行する
   (権限変更後に Access Token を再発行すること)
3. リポジトリの Settings → Secrets and variables → Actions に以下を登録する
   - `X_API_KEY` / `X_API_SECRET` … Consumer Keys(API Key / Secret)
   - `X_ACCESS_TOKEN` / `X_ACCESS_SECRET` … Access Token / Secret

文面の確認はローカルでできます:

```sh
npm run post -- 2026-09-01 --dry-run
```

## ライセンス

- **コード**: [MIT License](LICENSE)
- **生成テキスト**: 素材として[ウィキニュース日本語版](https://ja.wikinews.org/)の
  記事タイトル([CC BY 2.5](https://creativecommons.org/licenses/by/2.5/deed.ja))を
  使用しているため、生成されたニュース見出しも同ライセンスで提供されます。

生成されるニュースはすべて架空のものであり、事実ではありません。
