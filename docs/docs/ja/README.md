---
home: true
title: ホーム
heroImage: https://github.com/qixing-jk/all-api-hub/blob/main/assets/icon.png?raw=true
heroText: All API Hub - AIアグリゲート中継ステーションマネージャー
tagline: "オープンソースのブラウザプラグイン。サードパーティのAIアグリゲート中継ステーションと自社構築のNew APIを一元管理：アカウントの自動識別、残高確認、モデル同期、キー管理、クロスプラットフォームおよびクラウドバックアップをサポート"
actions:
  - text: 今すぐ始める
    link: /get-started.html # 実際のドキュメントパス（例：/guide/）に修正することをお勧めします
    type: primary
    
  - text: Chrome ウェブストア
    link: https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo
    type: secondary

  - text: Edge アドオン
    link: https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa
    type: secondary

  - text: Firefox アドオン
    link: https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24}
    type: secondary

features:
  - title: スマートサイト管理
    details: AIアグリゲート中継サイトを自動識別し、アクセストークンを作成します。サイト名とチャージレートをスマートに取得し、重複検出と手動追加をサポートします。
  - title: マルチアカウントシステム
    details: 各サイトで複数のアカウントを追加でき、アカウントのグループ化と迅速な切り替え、リアルタイムでの残高確認と詳細な利用ログをサポートします。
  - title: トークンとキーの管理
    details: すべてのAPIキーを簡単に管理し、表示、コピー、更新、一括操作をサポートします。
  - title: モデル情報の表示
    details: サイトがサポートするモデルリストと価格情報を明確に表示します。
  - title: チェックインステータス監視
    details: チェックインをサポートするサイトを自動検出し、その日にまだチェックインしていないアカウントをマークします。これにより、1つのパネルで複数のサイトのチェックインを順番に完了させ、チェックイン忘れによる無料クォータの無駄を減らします。
  - title: 迅速なエクスポート統合
    details: CherryStudio と New API にワンクリックで設定をエクスポートし、API利用プロセスを簡素化します。
  - title: New APIライクなシステム管理
    details: 自社構築のNew APIインスタンスのチャネル管理とモデルリスト同期をサポートし、専用のチャネル管理インターフェースを提供します。
  - title: データバックアップと復元
    details: JSON形式でのインポート/エクスポートとWebDavクラウドバックアップをサポートし、デバイス間のデータ同期を実現します。
  - title: 全プラットフォーム対応
    details: Chrome、Firefoxブラウザに対応し、Kiwi Browserなどのモバイルブラウザもサポート、ダークモードにも適応します。
  - title: プライバシーとセキュリティ
    details: 完全オフラインで動作し、すべてのデータはローカルに保存されます。インターネット接続なしで全コア機能を利用できます。
  - title: Cloudflare シールド回避アシスタント
    details: 5秒シールドに遭遇した場合、自動的にポップアップでシールドを回避し、サイトが識別・記録されることを保証します。
  - title: 迅速なエクスポート
    details: CherryStudio、New API、CC Switchにサイト設定をワンクリックでエクスポートします。

footer: AGPL-3.0 Licensed | Copyright 2025-present All API Hub
---

## はじめに

現在、市場には多数のAIアグリゲート中継サイトが存在し、残高、モデルリスト、キーなどの情報を確認するたびに個別にログインする必要があり、非常に煩雑です。

このプラグインは、以下のプロジェクトに基づいたAIアグリゲート中継ステーションのアカウントを自動的に識別し、統合管理できます。

- [one-api](https://github.com/songquanpeng/one-api)
- [new-api](https://github.com/QuantumNous/new-api)
- [Veloera](https://github.com/Veloera/Veloera)
- [one-hub](https://github.com/MartialBE/one-hub)
- [done-hub](https://github.com/deanxv/done-hub)
- Neo-API（クローズドソース）
- Super-API（クローズドソース）
- RIX_API（クローズドソース、基本機能サポート）
- VoAPI（クローズドソース、旧バージョンサポート）