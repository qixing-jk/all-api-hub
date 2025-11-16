---
home: true
title: ホーム
heroImage: https://github.com/qixing-jk/all-api-hub/blob/main/assets/icon.png?raw=true
heroText: All API Hub - AIアグリゲーションプロキシマネージャー
tagline: オープンソースのブラウザ拡張機能。すべてのAIアグリゲーションプロキシアカウントを自動的に識別・管理し、残高の確認、モデルの同期、キーの管理、クロスプラットフォームおよびクラウドバックアップをサポートします。
actions:
  - text: 使用を開始する
    link: /get-started.html # 実際のドキュメントパス（例: /guide/）に変更することをお勧めします
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
    details: AIアグリゲーションプロキシサイトを自動的に識別し、アクセストークンを作成します。サイト名とチャージ倍率をスマートに取得し、重複検出と手動追加をサポートします。
  - title: マルチアカウントシステム
    details: 各サイトに複数のアカウントを追加でき、アカウントのグループ化と迅速な切り替え、残高のリアルタイム表示、詳細な使用ログをサポートします。
  - title: トークンとキーの管理
    details: すべてのAPIキーを簡単に管理し、表示、コピー、更新、一括操作をサポートします。
  - title: モデル情報の表示
    details: サイトがサポートするモデルリストと価格情報を明確に表示します。
  - title: チェックインステータスの監視
    details: サイトがチェックイン機能をサポートしているかを自動的に検出し、現在のチェックインステータスを表示します。
  - title: 迅速なエクスポートと統合
    details: CherryStudio および New API への設定をワンクリックでエクスポートし、API使用プロセスを簡素化します。
  - title: New API 系システム管理
    details: New API およびそのフォークプロジェクトのモデルリストを自動的に同期し、モデルリダイレクトを生成することで、手動設定を不要にし、モデルの可用性を最大限に高めます。
  - title: データバックアップと復元
    details: JSON形式でのインポート/エクスポートおよびWebDavクラウドバックアップをサポートし、デバイス間のデータ同期を実現します。
  - title: 全プラットフォーム対応
    details: Chrome、Firefoxブラウザに対応し、Kiwi Browserなどのモバイルブラウザもサポート、ダークモードにも適応します。
  - title: プライバシーとセキュリティ
    details: 完全オフラインで動作し、すべてのデータはローカルに保存されます。ネットワーク接続なしで主要な全機能を使用できます。

footer: AGPL-3.0 Licensed | Copyright © 2025-present All API Hub
---

## はじめに

現在、市場には多数のAIアグリゲーションプロキシサイトが存在し、残高、モデルリスト、キーなどの情報を確認するたびに個別にログインする必要があり、非常に手間がかかります。

このプラグインは、以下のプロジェクトに基づくAIアグリゲーションプロキシアカウントを自動的に識別し、統合管理できます。

- [one-api](https://github.com/songquanpeng/one-api)
- [new-api](https://github.com/QuantumNous/new-api)
- [Veloera](https://github.com/Veloera/Veloera)
- [one-hub](https://github.com/MartialBE/one-hub)
- [done-hub](https://github.com/deanxv/done-hub)
- Neo-API（クローズドソース）
- Super-API（クローズドソース）
- RIX_API（クローズドソース、基本機能サポート）
- VoAPI（クローズドソース、旧バージョンサポート）