```yaml
---
home: true
title: ホーム
heroImage: https://github.com/qixing-jk/all-api-hub/blob/main/assets/icon.png?raw=true
heroText: All API Hub - AIアグリゲーションプロキシマネージャー
tagline: オープンソースのブラウザプラグイン。すべてのAIアグリゲーションプロキシサイトのアカウントを自動で識別・管理し、残高の確認、モデルの同期、キーの管理を行い、クロスプラットフォームとクラウドバックアップに対応します。
actions:
  - text: 使用開始
    link: /jp/get-started.html # 建议修改为您的实际文档路径，例如 /guide/
    type: primary
    
  - text: Chrome ウェブストア
    link: https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo
    type: secondary

  - text: Edge アドオン
    link: https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa
    type: secondary

  - text: Firefox アドオン
    link: https://addons.mozilla.org/firefox/addon/%E4%B8%AD%E8%BD%AC%E7%AB%99%E7%AE%A1%E7%90%86%E5%99%A8-all-api-hub
    type: secondary

features:
  - title: スマートサイト管理
    details: AIアグリゲーションプロキシサイトを自動で識別し、アクセストークンを作成します。サイト名とチャージ比率をスマートに取得し、重複検出と手動追加に対応しています。
  - title: マルチアカウントシステム
    details: 各サイトに複数のアカウントを追加でき、アカウントのグループ化と高速切り替え、リアルタイムでの残高確認と詳細な利用ログをサポートします。
  - title: トークンとキーの管理
    details: すべてのAPIキーを簡単に管理し、表示、コピー、更新、一括操作をサポートします。
  - title: モデル情報の確認
    details: サイトがサポートするモデルリストと価格情報を明確に表示します。
  - title: チェックインステータス監視
    details: サイトがチェックイン機能をサポートしているかを自動で検出し、現在のチェックインステータスを表示します。
  - title: 高速エクスポート連携
    details: CherryStudioとNew APIへの設定の一括エクスポートで、API利用プロセスを簡素化します。
  - title: New API型システム管理
    details: チャンネルとフォークプロジェクトのモデルリストを自動で同期し、モデルリダイレクトを生成することで、手動設定の手間を省き、モデルの可用性を最大限に高めます。
  - title: データバックアップと復元
    details: JSON形式でのインポート/エクスポートおよびWebDavクラウドバックアップをサポートし、デバイス間のデータ同期を実現します。
  - title: 全プラットフォーム対応
    details: Chrome、Firefoxブラウザに対応し、Kiwi Browserなどのモバイルブラウザもサポート、ダークモードにも適応します。
  - title: プライバシーとセキュリティ
    details: 完全オフラインで動作し、すべてのデータはローカルに保存されます。ネットワーク接続なしで主要な全機能を使用できます。

footer: AGPL-3.0 Licensed | Copyright © 2025-present All API Hub
---

## はじめに

現在、市場には多数のAIアグリゲーションプロキシサイトが存在し、残高、モデルリスト、キーなどの情報を確認するたびに個別にログインする必要があり、非常に煩雑です。

このプラグインは、以下のプロジェクトに基づくAIアグリゲーションプロキシサイトのアカウントを自動で識別し、統合管理できます。

- [one-api](https://github.com/songquanpeng/one-api)
- [new-api](https://github.com/QuantumNous/new-api)
- [Veloera](https://github.com/Veloera/Veloera)
- [one-hub](https://github.com/MartialBE/one-hub)
- [done-hub](https://github.com/deanxv/done-hub)
- Neo-API（クローズドソース）
- Super-API（クローズドソース）
- RIX_API（クローズドソース、基本機能対応）
- VoAPI（クローズドソース、旧バージョン対応）
```