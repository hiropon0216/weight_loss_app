# Nutrition Management Redesign

Last updated: 2026-06-07

## Goal

現在の「食事チェック」は、減量に効く行動を素早く記録するには良いが、実際の摂取カロリーとPFCを把握するには粗い。

この再設計では、食材名とg数から栄養を計算できる食事記録へ作り替える。ただし、毎回すべてを細かく入力させると続かないため、直近履歴とお気に入りを中心に、2回目以降の入力を短くする。

## Design principles

- 食事管理は「正確さ」より先に「続くこと」を優先する。
- 通常食材は100gあたり栄養値からg数で計算する。
- 加工食品はバーコード検索を優先し、見つからない場合は手入力で登録する。
- 一度入力したものは、直近履歴10件とお気に入りから再入力できる。
- 栄養計算の根拠を `source_type` として保存し、あとから修正できるようにする。
- 体重管理の主指標である7日平均と矛盾しないよう、単日カロリーでユーザーを責めない。

## Data sources

### Generic ingredients

通常食材の第一候補は、文部科学省の「日本食品標準成分表（八訂）増補2023年」を使う。

理由:

- 日本の食材名、調理状態、可食部100gあたりの栄養値に合っている。
- Excelデータが公開されており、アプリ用のローカルマスタに変換しやすい。
- 食品成分データベースの検索結果はCSVダウンロードできる。

扱い:

- アプリ内では読み取り専用の `generic_foods` マスタとして持つ。
- 初期実装では、よく使う食品だけを小さなJSONとしてGitHub Pagesから配信する。
- 本格化したら、文科省Excelから変換するビルドスクリプトを作る。
- 成分値は可食部100gあたりとして扱う。

注意:

- 食品成分表にない食品は検索できない。
- 検索名は表記ゆれに弱いので、アプリ側で別名、ひらがな、カテゴリを持つ。
- `Tr`、`-`、`(0)` などの特殊値は計算ルールを固定してから取り込む。

### Generic ingredient search master

ユーザーが気にしている「通常食材検索のDB」は、ユーザーの食事ログ保存先とは別物として扱う。

イメージ:

```text
検索欄に「レタス」と入力
候補として「レタス 土耕栽培 生」「レタス 水耕栽培 生」などを表示
ユーザーが候補を選択
100gあたりのカロリー、PFCを表示
ユーザーが食べたg数を入力
食事ログへ計算済みの実績を登録
```

この標準食材マスタは、クラウドDBへユーザーが書き込むものではない。アプリが配信する静的データであり、スマホは以下のどちらかで参照する。

- 小規模版: `data/generic_foods_core.json` をアプリ起動時または初回検索時に読み込む。
- 本格版: 文科省データを変換した `generic_foods_*.json` をカテゴリ別に分割し、必要なカテゴリだけ読み込む。

GitHub Pagesでもこの方式は成立する。HTML/CSS/JavaScriptと同じように食品マスタJSONを配信し、スマホ側で検索するため、アプリ専用のサーバDBは不要。

ただし、食材マスタの更新はアプリ更新と同じ扱いになる。文科省データや変換ルールを更新したら、JSONを再生成してGitHub Pagesへ反映する。

この更新はエンドユーザーが日々行うものではない。アプリ側のメンテナンス作業として、以下のどちらかで扱う。

- 手動更新: 文科省のExcelデータを取得し、変換スクリプトで `generic_foods_*.json` を再生成する。
- 自動更新: GitHub Actionsなどで定期的にデータ取得、変換、差分確認を行い、必要な時だけ更新PRを作る。

無料APIを直接参照する案も検討対象だが、通常食材の主経路にはしない。

理由:

- 文科省の食品成分データベースはWeb検索とExcel/CSV取得はできるが、アプリが安定利用できる公式REST APIとしては設計されていない。
- USDA FoodData Centralのような無料APIは存在するが、日本語の食材名、国内の食品分類、日本食品標準成分表ベースの値とはズレやすい。
- 商用の食品成分APIは選択肢になるが、無料枠、利用制限、キャッシュ可否、国内食品カバレッジ、将来の課金リスクを確認する必要がある。
- 食事入力のたびに外部APIへ依存すると、通信不良、レート制限、API変更で毎日の記録体験が壊れやすい。

したがって、通常食材は「公式データを元にした静的マスタ」をアプリが持ち、更新はアプリ側で管理する。ユーザーは検索とg入力だけを行う。

検索用に持つ項目:

| Field | Example | Purpose |
| --- | --- | --- |
| id | `mext:06048` | 食品の安定ID |
| name | `レタス 土耕栽培 生` | 表示名 |
| kana | `れたす どこうさいばい なま` | ひらがな検索 |
| aliases | `["レタス", "れたす", "lettuce"]` | 表記ゆれ検索 |
| category | `野菜類` | 絞り込み |
| nutrients_per_100g | `{ "energy_kcal": 11, ... }` | 100gあたり計算 |

検索結果の表示例:

```text
レタス 土耕栽培 生
100gあたり 11kcal / P 0.6g / F 0.1g / C 2.8g

[食べた量] 80 g
=> 9kcal / P 0.5g / F 0.1g / C 2.2g
```

検索の優先順位:

1. 完全一致: `レタス`
2. かな一致: `れたす`
3. 別名一致: `lettuce`
4. 部分一致: `サニー レタス`
5. カテゴリ補助: 野菜類

初期マスタに必ず含めたい食品:

- 米、パン、麺、オートミール
- 鶏むね肉、鶏もも肉、卵、豆腐、納豆、魚、牛乳、ヨーグルト
- レタス、キャベツ、ブロッコリー、トマト、きゅうり、玉ねぎ
- バナナ、りんご
- 主要な調味料と油

### Packaged products

加工食品の第一候補は、バーコードからOpen Food Factsを参照する。

Open Food Factsは米国APIではない。フランス発の非営利プロジェクトによるグローバルな共同編集データベースであり、日本の商品も登録されている場合がある。ただし、ユーザー投稿型なので、日本商品の網羅性、最新性、正確性は保証されない。

理由:

- バーコードをキーに商品名、栄養成分、内容量などを取得できる。
- 読み取りは認証なしで使えるが、カスタムUser-Agentが必要。
- API v3が現行の推奨バージョン。

扱い:

- `GET https://world.openfoodfacts.org/api/v3.6/product/{barcode}.json` を候補にする。
- 取得結果は `packaged_products_cache` に保存し、同じ商品は再取得しない。
- 日本の商品は未登録や栄養欠損があり得るため、取得できてもユーザー確認を挟む。
- 欠損がある場合は、手入力で上書きした値を優先する。

バーコード検索はAPI前提でよい。バーコード番号だけでは栄養値は分からないため、JAN/EAN/UPCコードをキーに商品DBを引く必要がある。

APIから取得する主な項目:

| API field | App field | Use |
| --- | --- | --- |
| `code` | barcode | 商品識別 |
| `status`, `result` | lookup_status | 見つかったかどうか |
| `product.product_name` | product_name | 商品名 |
| `product.brands` | brand | ブランド |
| `product.quantity` | quantity_label | 表示用の内容量 |
| `product.product_quantity` | package_size_g | 内容量gに変換できる場合 |
| `product.serving_size` | serving_size_label | 表示用の1食量 |
| `product.nutrition_data_per` | nutrition_basis | `100g` などの栄養基準 |
| `product.nutriments.energy-kcal_100g` | energy_kcal_100g | 100gあたり熱量 |
| `product.nutriments.energy-kcal_serving` | energy_kcal_serving | 1食あたり熱量 |
| `product.nutriments.proteins_100g` | protein_g_100g | 100gあたりたんぱく質 |
| `product.nutriments.proteins_serving` | protein_g_serving | 1食あたりたんぱく質 |
| `product.nutriments.fat_100g` | fat_g_100g | 100gあたり脂質 |
| `product.nutriments.fat_serving` | fat_g_serving | 1食あたり脂質 |
| `product.nutriments.carbohydrates_100g` | carbs_g_100g | 100gあたり炭水化物 |
| `product.nutriments.carbohydrates_serving` | carbs_g_serving | 1食あたり炭水化物 |
| `product.nutriments.salt_100g` | salt_g_100g | 100gあたり食塩相当量 |
| `product.nutriments.salt_serving` | salt_g_serving | 1食あたり食塩相当量 |
| `product.ingredients_text` | ingredients_text | 任意表示 |
| `product.selected_images` | image | 任意表示 |

アプリが必須として使うのは、商品名、ブランド、内容量または1食量、熱量、たんぱく質、脂質、炭水化物、食塩相当量までに絞る。原材料、画像、カテゴリ、Nutri-Score、NOVAなどは入力UXには使わない。

正規化ルール:

1. `energy-kcal_serving` と `serving_size` が両方ある場合は、初期値を「1食」として表示する。
2. `*_serving` がなく `*_100g` と `product_quantity` がある場合は、1個分を `*_100g * product_quantity / 100` で計算する。
3. `*_100g` しかない場合は、ユーザーに食べたg数だけ入力させる。
4. 必須栄養値が欠ける場合は、取得できた商品名とブランドだけ使い、栄養値は手入力に切り替える。
5. ユーザーが修正した値は `manual_override` として保存し、次回以降はAPI値より優先する。

バーコード入力のUX:

```text
バーコード読取
商品取得
確認画面
  商品名
  ブランド
  内容量/1食量
  kcal / P / F / C / 食塩
登録
```

ユーザーに追加で求める入力は、原則として「何個または何食食べたか」だけにする。商品カテゴリごとの食べ方、スープを飲んだ量、調理方法などの追加質問は出さない。必要な場合だけ、ユーザーが任意で栄養値を編集できるようにする。

日清カップヌードルの例:

```text
JAN: 49698626
API lookup: product_found
product_name: カップヌードル
brands: Nissin, 日清
quantity: 78 g
serving_size: 78 g
API栄養値:
  1食 354kcal / P 10.6g / F 13.6g / C 47.4g / 食塩 4.9g
```

この場合、アプリは「カップヌードル 1食」を初期値として出し、ユーザーはそのまま登録できる。公式パッケージやメーカーサイトの値と違う場合だけ、ユーザーが手入力で修正する。

注意:

- Open Food Factsはユーザー投稿型のDBなので、正確性は保証されない。
- 読み取り系APIにはレート制限があるため、検索連打や入力ごとの自動検索は避ける。
- 本番利用前にAPI利用フォーム、ライセンス表示、User-Agentを整える。

### Manual foods

どのDBにも合わない食品は、手入力で保存する。

入力形式:

- 商品名または食事名
- 入力基準: `per_100g`, `per_serving`, `total`
- カロリー
- たんぱく質
- 脂質
- 炭水化物
- 食物繊維
- 食塩相当量
- 1食量または内容量

保存後は `custom_foods` として扱い、履歴やお気に入りから再利用できる。

## Nutrient fields

MVPで計算対象にする主要項目。

| Field | Unit | Required | Reason |
| --- | --- | --- | --- |
| energy_kcal | kcal | Yes | 減量判断の中心 |
| protein_g | g | Yes | 既存のたんぱく質目標と接続 |
| fat_g | g | Yes | 減量停滞時の見直しに使う |
| carbs_g | g | Yes | 糖質、主食量の把握に使う |
| fiber_g | g | No | 満腹感と食事品質の判断に使う |
| salt_g | g | No | 体重の水分変動説明に使う |

将来追加候補:

- sugar_g
- saturated_fat_g
- calcium_mg
- iron_mg
- potassium_mg
- alcohol_g

## Core calculation

通常食材と100g基準の商品は、以下で計算する。

```text
consumed_value = per_100g_value * grams / 100
```

1食基準の商品は、以下で計算する。

```text
consumed_value = per_serving_value * servings
```

内容量全体を手入力した場合は、以下で計算する。

```text
consumed_value = total_value * eaten_grams / package_grams
```

丸め方:

- kcalは整数
- PFCは小数1桁
- 食塩相当量は小数2桁
- 合計値は内部では丸めず、表示時だけ丸める

## User flows

### Add meal

食事入力の主画面は、以下の順で探せるようにする。

1. 直近10件
2. お気に入り
3. 食材検索
4. バーコード
5. 手入力

最初の画面で検索欄を出すが、検索欄の下には直近10件とお気に入りを先に並べる。毎日食べるものは検索させない。

### Generic ingredient flow

```text
食材名を検索
候補から選択
g数を入力
栄養計算を即時表示
食事に追加
直近履歴を更新
```

例:

```text
鶏むね肉 皮なし 150g
234kcal / P 34.8g / F 2.9g / C 0.2g
```

### Barcode flow

```text
バーコードをスキャン
商品候補を取得
栄養値の有無を確認
食べた量を入力
食事に追加
直近履歴を更新
```

未登録、または栄養が足りない場合:

```text
商品名だけ取得できた
栄養成分を手入力
custom_foodsとして保存
次回からバーコードで呼び出し
```

### Manual flow

```text
名前を入力
基準を選択
栄養成分を入力
食べた量を入力
食事に追加
必要ならお気に入り登録
```

手入力は「完璧なDB登録」ではなく、「次回から楽をするための登録」として扱う。

## Recent history

直近履歴は10件だけ保持する。

対象:

- 通常食材
- バーコード商品
- 手入力食品
- お気に入りから追加した食品

保存ルール:

- 同じ食品を再入力したら先頭へ移動する。
- 同じ食品でもg数が大きく違う場合は、最新のg数をデフォルトにする。
- 11件目が入ったら最古を削除する。
- 日別の食事ログ本体は削除しない。削除するのは入力ショートカットだけ。

`recent_food_inputs` の例。

```json
{
  "food_id": "generic:01123",
  "source_type": "generic",
  "display_name": "鶏むね肉 皮なし",
  "default_amount_g": 150,
  "last_used_at": "2026-06-07T08:00:00+09:00"
}
```

## Favorites

お気に入りは、直近履歴よりも意図的に残したい入力ショートカットとして扱う。

登録できるもの:

- 単体食品
- 加工食品
- 手入力食品
- 複数食品をまとめた食事テンプレート

例:

- 朝食セット: オートミール40g、プロテイン30g、牛乳200ml
- 鶏むね定番: 鶏むね肉150g、白米180g、ブロッコリー100g
- コンビニ昼食: サラダチキン1個、おにぎり2個

お気に入りから追加する時は、量をその場で変更できるようにする。

## Data model

### food_sources

| Field | Type | Notes |
| --- | --- | --- |
| id | string | `generic`, `open_food_facts`, `manual` |
| name | string | 表示名 |
| version | string | データ更新バージョン |
| license_note | string | 表示用の出典メモ |
| source_url | string | 参照元URL |

### generic_foods

| Field | Type | Notes |
| --- | --- | --- |
| id | string | 文科省食品番号など |
| source_id | string | `generic` |
| name | string | 表示名 |
| aliases | string[] | 検索用別名 |
| category | string | 肉類、魚介類など |
| edible_portion_note | string | 可食部、調理状態 |
| energy_kcal_100g | number | 100gあたり |
| protein_g_100g | number | 100gあたり |
| fat_g_100g | number | 100gあたり |
| carbs_g_100g | number | 100gあたり |
| fiber_g_100g | number | 任意 |
| salt_g_100g | number | 任意 |

### packaged_products_cache

| Field | Type | Notes |
| --- | --- | --- |
| barcode | string | JAN/EAN/UPC |
| source_id | string | `open_food_facts` |
| product_name | string | 商品名 |
| brand | string | ブランド |
| serving_size_g | number | 取得できた場合 |
| package_size_g | number | 取得できた場合 |
| nutrients_per_100g | object | 取得できた場合 |
| nutrients_per_serving | object | 取得できた場合 |
| fetched_at | string | キャッシュ更新日時 |
| confidence | string | `complete`, `partial`, `manual_override` |

### custom_foods

| Field | Type | Notes |
| --- | --- | --- |
| id | string | UUID |
| name | string | ユーザー入力名 |
| barcode | string | 任意 |
| basis | string | `per_100g`, `per_serving`, `total` |
| default_amount_g | number | 任意 |
| default_servings | number | 任意 |
| nutrients | object | 入力された栄養値 |
| created_at | string | 作成日時 |
| updated_at | string | 更新日時 |

### meal_logs

| Field | Type | Notes |
| --- | --- | --- |
| id | string | UUID |
| date | string | `YYYY-MM-DD` |
| meal_type | string | `breakfast`, `lunch`, `dinner`, `snack` |
| items | MealItem[] | 食品明細 |
| totals | object | 合計栄養値 |
| memo | string | 任意 |
| created_at | string | 作成日時 |
| updated_at | string | 更新日時 |

### meal_items

| Field | Type | Notes |
| --- | --- | --- |
| id | string | UUID |
| food_ref | string | `generic:01123`, `barcode:490...`, `custom:uuid` |
| source_type | string | `generic`, `barcode`, `manual`, `favorite` |
| display_name | string | 入力時の名前を固定 |
| amount_g | number | g入力の場合 |
| servings | number | 1食単位の場合 |
| nutrients_snapshot | object | 入力時点の計算値 |

### recent_food_inputs

| Field | Type | Notes |
| --- | --- | --- |
| food_ref | string | 重複判定キー |
| source_type | string | 参照元 |
| display_name | string | 表示名 |
| default_amount_g | number | 前回量 |
| default_servings | number | 前回食数 |
| last_used_at | string | 並び順 |

### favorite_foods

| Field | Type | Notes |
| --- | --- | --- |
| id | string | UUID |
| type | string | `food`, `meal_template` |
| name | string | 表示名 |
| items | MealItemTemplate[] | 単体でも配列で持つ |
| sort_order | number | 並び順 |
| created_at | string | 作成日時 |

## Storage strategy

現状のPWAでは、まずスマホのブラウザ内保存で始める。

ここでいうローカル保存は、開発PC上のDBではなく、ユーザーが実際に入力するスマホ端末のブラウザストレージを指す。GitHub Pagesで公開したURLをスマホで開く場合、`localStorage` や `IndexedDB` はそのスマホのブラウザ内に作られるため、スマホ入力そのものは成立する。

保存対象は2種類に分ける。

| Type | Owner | Example | Storage |
| --- | --- | --- | --- |
| 標準食材マスタ | アプリ | レタス100gあたりの栄養値 | GitHub PagesでJSON配信、スマホで読み取り |
| ユーザーデータ | ユーザー | 食べた量、食事ログ、履歴、お気に入り | スマホのブラウザストレージ |

標準食材マスタはユーザーごとに保存するDBではなく、アプリが持つ参照データである。スマホはそれを読み込んで検索するだけなので、ユーザーが食材マスタを管理する必要はない。

ただし、これは端末内保存であり、クラウドDBではない。

担保できること:

- スマホで開いた同じURL、同じブラウザなら、食事ログ、履歴、お気に入りを継続して使える。
- GitHub Pagesのような静的ホスティングでも、食品マスタJSONと端末内ストレージで動く。
- バーコードAPIはネットワーク越しに参照し、取得結果だけをスマホ内にキャッシュできる。

担保できないこと:

- スマホとPCの自動同期。
- SafariとChromeなど、別ブラウザ間のデータ共有。
- 端末初期化、ブラウザデータ削除、URL変更時のデータ維持。
- 複数端末で同じ食事ログを編集すること。

そのため、実用上の最低ラインとして、食事ログ実装前にJSONエクスポート/インポートを用意する。複数端末同期や長期バックアップを必須要件にする場合は、Supabase、Firebase、Cloudflare D1などのクラウドDBを設計に追加する。

短期:

- `localStorage` の既存構造に合わせる。
- 食品マスタは小さなJSONとしてアプリに同梱する。
- 履歴10件、お気に入り、手入力食品、食事ログを保存する。
- JSONエクスポート/インポートでスマホ内データの退避と移行を可能にする。

中期:

- 食品マスタとバーコードキャッシュは `IndexedDB` に移す。
- 大きな文科省マスタを分割ロードできるようにする。
- GitHub Pagesの静的配信でも動く構成を維持する。
- 端末内保存を継続する場合でも、定期バックアップ導線を用意する。

将来:

- ログインや複数端末同期が必要になったら、バックエンドDBを採用する。
- ただし、栄養記録はプライベート性が高いので、同期は任意にする。

## Daily summary

食事ログの合計は、体重トレンドと同じく1日単位で見る。

表示項目:

- 今日の摂取カロリー
- たんぱく質
- 脂質
- 炭水化物
- 食物繊維
- 食塩相当量
- 目標との差分

コーチコメント例:

```text
たんぱく質はかなり良いです。今日は脂質が少し高めなので、夜は揚げ物より焼き物に寄せると整います。
```

```text
カロリーは目標内です。体重が明日増えても、塩分と水分のブレの可能性があります。7日平均で見ましょう。
```

## Scoring integration

既存の食事チェック点は、すぐには廃止しない。

移行ステップ:

1. 食事チェックはそのまま残す。
2. 新しい食事ログを追加する。
3. 食事ログがある日は、たんぱく質、カロリー、脂質、食塩から食事評価を補助する。
4. 十分に使えるようになったら、食事チェックを「簡易モード」として残す。

新評価の候補:

- たんぱく質が目標に近い
- 摂取カロリーが目標範囲内
- 脂質が過剰ではない
- 食物繊維が一定以上
- 食塩が高すぎない
- 夜遅い食事を避けた

## MVP slice

最初に実装するなら、以下の範囲に絞る。

必須:

- 通常食材マスタJSON
- 食材検索
- g入力
- 主要PFC計算
- 食事ログ保存
- 直近10件
- お気に入り登録
- 手入力食品

後回し:

- カメラバーコードスキャン
- Open Food Facts連携の本番運用
- 文科省全食品マスタ
- 写真入力
- レシピ提案
- クラウド同期

バーコードは重要だが、最初は「バーコード番号を手入力して検索」でもよい。カメラ読み取りはUX改善として後から足す。

## Open questions

- 食事ログは1日3食と間食に固定するか、自由な食事名にするか。
- 目標カロリーとPFCはユーザー設定で固定するか、体重トレンドから自動調整するか。
- 文科省マスタは最初から全件同梱するか、よく使う食品だけにするか。
- 食品名検索を日本語の表記ゆれにどこまで対応するか。
- バーコードDBにない日本の商品を、ユーザーの手入力だけで十分扱えるか。

## Acceptance criteria

- 鶏むね肉150gのような通常食材を、食材検索とg入力だけで食事に追加できる。
- レタスのような通常食材を検索すると、100gあたりの主要栄養値を参照できる。
- ユーザーは食べたg数を入力するだけで、実績値を登録できる。
- 追加時にカロリー、たんぱく質、脂質、炭水化物が即時計算される。
- 加工食品はバーコード、または手入力で登録できる。
- 同じ食品を再入力すると直近10件の先頭に移動する。
- 直近履歴は10件を超えない。
- お気に入りから食品または食事テンプレートを追加できる。
- 食事ログは日別合計を表示できる。
- 栄養値の参照元が `generic`, `barcode`, `manual` のどれか分かる。

## References

- 文部科学省: 日本食品標準成分表（八訂）増補2023年
  https://www.mext.go.jp/a_menu/syokuhinseibun/mext_00001.html
- 文部科学省: 食品成分データベース
  https://fooddb.mext.go.jp/
- Open Food Facts API documentation
  https://openfoodfacts.github.io/openfoodfacts-server/api/
