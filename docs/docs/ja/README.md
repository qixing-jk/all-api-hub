```yaml
home: true
title: ホーム
heroImage: https://github.com/qixing-jk/all-api-hub/blob/main/src/assets/icon.png?raw=true
heroText: All API Hub - AI集約中継ステーションマネージャー
tagline: "オープンソースのブラウザ拡張機能。サードパーティのAI集約中継ステーションと自社構築のNew APIを統一的に管理します。アカウントの自動認識、残高の確認、モデルの同期、キーの管理をサポートし、クロスプラットフォームとクラウドバックアップにも対応しています。"
actions:
  - text: 開始する
    link: /get-started.html # 実際のドキュメントパスに変更することを推奨します。例: /guide/
    type: primary
    
  - text: Chrome ウェブストア
    link: https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo
    type: secondary

  - text: Edge ウェブストア
    link: https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa
    type: secondary

  - text: FireFox アドオン
    link: https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24}
    type: secondary

features:
  - title: スマートサイト管理
    details: AI集約中継サイトを自動認識し、アクセス トークンを生成します。サイト名とチャージ倍率をインテリジェントに取得し、重複検出と手動追加をサポートします。
  - title: マルチアカウントシステム
    details: 各サイトに複数のアカウントを追加できます。アカウントのグループ化と高速切り替え、残高と詳細な使用ログのリアルタイム表示をサポートします。
  - title: トークンとキーの管理
    details: すべてのAPIキーを簡単に管理できます。表示、コピー、リフレッシュ、一括操作をサポートします。
  - title: モデル情報表示
    details: サイトがサポートするモデルのリストと価格情報を明確に表示します。
  - title: チェックイン状態監視
    details: チェックインをサポートするサイトを自動検出し、その日にまだチェックインしていないアカウントをマークします。これにより、1つのパネルで複数のサイトのチェックインを順番に完了でき、チェックイン忘れによる無料枠の無駄遣いを減らすことができます。
  - title: 高速エクスポートと統合
    details: 設定を一括でCherry StudioとNew APIにエクスポートし、APIの使用プロセスを簡素化します。
  - title: New API クラスシステム管理
    details: 自社構築のNew APIインスタンスのチャネル管理とモデルリスト同期をサポートし、専用のチャネル管理インターフェースを提供します。
  - title: データバックアップと復元
    details: JSON形式でのインポート/エクスポートとWebDAVによるクラウドバックアップをサポートし、クロスデバイスでのデータ同期を実現します。
  - title: 全プラットフォーム対応
    details: Chrome、Firefoxブラウザと互換性があり、Kiwi Browserなどのモバイルブラウザもサポートし、ダークモードにも対応しています。
  - title: プライバシーとセキュリティ
    details: 完全オフラインで動作し、すべてのデータはローカルに保存されます。インターネット接続なしで、すべてのコア機能を使用できます。
  - title: Cloudflare盾突破アシスタント
    details: 5秒ルールによる盾に遭遇した場合、自動的にポップアップで盾を突破し、サイトが認識および記録されることを保証します。
  - title: 高速エクスポート
    details: サイト設定を一括でCherry Studio、New API、CC Switchにエクスポートします。

footer: AGPL-3.0 Licensed | Copyright 2025-present All API Hub
---

## 紹介

現在、AIエコシステムには、New APIシリーズに基づいた集約中継ステーションや自社構築パネルがますます増えています。各サイトの残高、モデルリスト、APIキーを同時に管理することは、分散的で時間がかかることがよくあります。

All API Hubはブラウザ拡張機能として、これらのサイトのアカウントを自動認識し、残高の確認、モデルやキーの管理、自動チェックインを一括で行うことができます。また、自社構築のNew API向けに、モデル同期やチャネル管理などのツールを提供します。現在、以下のプロジェクトに基づく中継ステーションアカウントをサポートしています。

- [one-api](https://github.com/songquanpeng/one-api)
- [new-api](https://github.com/QuantumNous/new-api)
- [Veloera](https://github.com/Veloera/Veloera)
- [one-hub](https://github.com/MartialBE/one-hub)
- [done-hub](https://github.com/deanxv/done-hub)
- [Sub2API](https://github.com/Wei-Shaw/sub2api)
- Neo-API（クローズドソース）
- Super-API（クローズドソース）
- RIX_API（クローズドソース、基本機能サポート）
- VoAPI（クローズドソース、旧バージョンサポート）
```