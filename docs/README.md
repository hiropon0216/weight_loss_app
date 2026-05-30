# docs

Last updated: 2026-05-30

このディレクトリは、減量アプリの設計判断と機能開発用ドキュメントを置く場所です。

## 今すぐ保持するドキュメント

| File | Purpose |
| --- | --- |
| [product_brief.md](product_brief.md) | アプリ全体のコンセプト、ターゲット、成功指標を固定する |
| [mvp_weight_management.md](mvp_weight_management.md) | MVPである体重管理機能の詳細設計を管理する |
| [decision_log.md](decision_log.md) | 設計上の決定事項と理由を時系列で残す |

## 今後追加するとよいドキュメント

| File | When to add | Purpose |
| --- | --- | --- |
| `ux_flows.md` | 画面実装を始める前 | 画面遷移、主要コンポーネント、入力導線を整理する |
| `data_model.md` | DBや永続化方式を決める時 | テーブル、型、制約、派生値の扱いを整理する |
| `api_contract.md` | バックエンド/APIを作る時 | リクエスト/レスポンス、エラー、認可を固定する |
| `analytics_plan.md` | リリース前 | 継続率、入力率、体重トレンドなどの計測項目を整理する |
| `release_checklist.md` | MVP公開前 | 動作確認、データ保護、アクセシビリティ、ストア公開準備を管理する |

## ドキュメント運用ルール

- 重要な意思決定は `decision_log.md` に追記する。
- 仕様の正本は、まず `mvp_weight_management.md` に集約する。
- 実装で仕様が変わった場合は、コードだけでなく該当ドキュメントも更新する。
- 日々の体重増減ではなく、7日平均と行動継続を主役にする方針を崩さない。
