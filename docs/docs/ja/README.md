---
home: true
title: ホーム
heroImage: https://github.com/qixing-jk/all-api-hub/blob/main/assets/icon.png?raw=true
heroText: All API Hub - AIアグリゲート中継ステーションマネージャー
tagline: オープンソースのブラウザ拡張機能。すべてのAIアグリゲート中継ステーションアカウントを自動的に識別・管理し、残高の確認、モデルの同期、キーの管理、クロスプラットフォームおよびクラウドバックアップをサポートします。
actions:
  - text: 使用を開始する
    link: /jp/get-started.html # 実際のドキュメントパス（例：/guide/）に修正することをお勧めします
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
  - title: スマートなサイト管理
    details: AIアグリゲート中継サイトを自動的に識別し、アクセストークンを作成します。サイト名とチャージ倍率をインテリジェントに取得し、重複検出と手動追加をサポートします。
  - title: マルチアカウントシステム
    details: 各サイトで複数のアカウントを追加でき、アカウントのグループ化と迅速な切り替え、リアルタイムでの残高と詳細な使用ログの確認をサポートします。
  - title: トークンとキーの管理
    details: すべてのAPIキーを簡単に管理し、表示、コピー、更新、一括操作をサポートします。
  - title: モデル情報の表示
    details: サイトがサポートするモデルリストとチャネル情報を明確に表示し、New APIおよび互換性のあるシステムのモデルの自動同期をサポートします。
  - title: チェックインステータスの監視
    details: サイトがチェックイン機能をサポートしているかを自動的に検出し、現在のチェックインステータスを表示します。
  - title: 迅速なエクスポートと統合
    details: ワンクリックでCherryStudioとNew APIに設定をエクスポートし、APIの使用プロセスを簡素化します。
  - title: データバックアップと復元
    details: JSON形式でのインポート/エクスポートとWebDavクラウドバックアップをサポートし、デバイス間のデータ同期を実現します。
  - title: 全プラットフォーム対応
    details: Chrome、Firefoxブラウザと互換性があり、Kiwi Browserなどのモバイルブラウザをサポートし、ダークモードに対応しています。
  - title: プライバシーとセキュリティ
    details: 完全オフラインで動作し、すべてのデータはローカルに保存されます。インターネット接続なしで主要な機能をすべて使用できます。

footer: AGPL-3.0 Licensed | Copyright © 2025-present All API Hub
---

## はじめに

現在、市場には多数のAIアグリゲート中継サイトが存在し、残高、モデルリスト、キーなどの情報を確認するたびに個別にログインする必要があり、非常に煩雑です。

このプラグインは、以下のプロジェクトに基づくAIアグリゲート中継ステーションアカウントを自動的に識別し、統合管理できます。

- [one-api](https://github.com/songquanpeng/one-api)
- [new-api](https://github.com/QuantumNous/new-api)
- [Veloera](https://github.com/Veloera/Veloera)
- [one-hub](https://github.com/MartialBE/one-hub)
- [done-hub](https://github.com/deanxv/done-hub)
- VoAPI（クローズドソース、旧バージョン対応）
- Super-API（クローズドソース）
- RIX_API（クローズドソース、基本機能対応）