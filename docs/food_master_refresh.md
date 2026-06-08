# 食品マスタ更新設計

## 対象

- `data/generic_foods_core.json`
  - 通常食材の静的マスタ。
  - アプリ内では食材名、かな、別名、カテゴリの部分一致で検索する。
- `data/processed_foods_core.json`
  - 加工食品の静的マスタ。
  - `data/sources/processed_foods_seed.json` に一次情報URLを持つ食品だけを採用する。
- `data/processed_foods_estimated.json`
  - 商品名で検索しやすくするための推定加工食品マスタ。
  - アイス、菓子、カップ麺、飲料など、商品表示を想定した概算値を `1個`、`1袋`、`1食` などの実入力単位で保持する。
  - 精度は80-90%程度の入力補助を目的とし、文部科学省FoodDB由来の `processed_foods_core.json` とは分離する。
- `data/processed_food_categories.json`
  - 加工食品カテゴリの定義。
  - カテゴリは先に保持し、食品データは一次情報が確認できたものだけ追加する。

## 一次情報ポリシー

加工食品マスタは、文部科学省「食品成分データベース」の明細URLからkcal、P、F、Cを取得できたものだけを生成対象にする。

seedにURLがあっても、生成時に以下の条件を満たさなければActionを失敗させる。

- URLが `https://fooddb.mext.go.jp/` 配下である
- 明細ページをHTTP 200で取得できる
- kcal、たんぱく質、脂質、炭水化物が取得できる

これにより、商品名と出典URLがずれたデータや、二次情報由来の数値を静的マスタへ混ぜない。

## 更新頻度

GitHub Actionsは月1回の定期実行と手動実行にする。

文部科学省FoodDBは食品成分表の改訂・増補に合わせて更新される性質が強く、日次で頻繁に変わる商品DBではない。アプリ側の静的マスタも、リアルタイムの商品バーコード検索ではなく、代表的な食品を安定参照する用途である。

そのため、通常運用は月次更新で十分。食品番号の変更、増補、seed追加を行った場合だけ手動実行で即時反映する。

## Action

`.github/workflows/refresh-food-masters.yml` が以下を実行する。

1. `node scripts/build_generic_foods_core.mjs`
2. `node scripts/build_processed_foods_core.mjs`
3. `git diff --check`
4. 生成差分があれば `codex/refresh-food-masters` ブランチでPRを作成する

## 初版の加工食品マスタ

初版は、指定カテゴリの箱をすべて定義したうえで、FoodDB明細から取得できた23件だけを採用した。

未収載カテゴリは、一次情報を確認できるseedを追加してから増やす。特にレトルト食品、冷凍食品、惣菜（中食）はメーカー・商品単位で差が大きいため、バーコードAPIまたはユーザー登録マスタとの併用を前提にする。

## 推定加工食品マスタ

`data/processed_foods_estimated.json` は、バーコード検索や手入力前の補助候補として使う。

このマスタは一次情報での厳密検証ではなく、よく食べる市販品をすばやく登録するための概算値である。信頼度を区別するため、各レコードの `sourceType` は `processed_estimated` とし、`ediblePortionNote` に `AI推定` と明記する。

文部科学省FoodDBから再生成する `processed_foods_core.json` とは別ファイルにすることで、月次の洗い替えで推定商品データが消えないようにする。
