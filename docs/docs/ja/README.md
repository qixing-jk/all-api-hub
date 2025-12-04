---
home: true
title: ホーム
heroImage: https://github.com/qixing-jk/all-api-hub/blob/main/assets/icon.png?raw=true
heroText: All API Hub - AIアグリゲーション中継ステーションマネージャー
tagline: オープンソースのブラウザプラグイン。サードパーティのAIアグリゲーション中継ステーションと自己構築のNew APIを一元管理：アカウントの自動認識、残高確認、モデル同期、キー管理、クロスプラットフォームおよびクラウドバックアップをサポート。
actions:
  - text: 使用開始
    link: /get-started.html # 実際のドキュメントパス（例：/guide/）に変更することをお勧めします
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
    details: AIアグリゲーション中継サイトを自動認識し、アクセストークンを作成します。サイト名とチャージ倍率をスマートに取得し、重複検出と手動追加をサポートします。
  - title: マルチアカウントシステム
    details: 各サイトに複数のアカウントを追加でき、アカウントのグループ化と迅速な切り替え、リアルタイムでの残高確認と詳細な使用ログをサポートします。
  - title: トークンとキーの管理
    details: すべてのAPIキーを便利に管理し、表示、コピー、更新、一括操作をサポートします。
  - title: モデル情報表示
    details: サイトがサポートするモデルリストと価格情報を明確に表示します。
  - title: サインインステータス監視
    details: どのサイトがサインインをサポートしているかを自動検出し、その日まだサインインしていないアカウントをマークします。これにより、1つのパネルで複数のサイトのサインインを順番に完了させ、サインイン忘れによる無料クォータの無駄を減らすことができます。
  - title: 迅速なエクスポートと統合
    details: CherryStudioとNew APIへの設定をワンクリックでエクスポートし、APIの使用プロセスを簡素化します。
  - title: New API系システム管理
    details: 自己構築のNew APIインスタンスのチャネル管理とモデルリスト同期をサポートし、専用のチャネル管理インターフェースを提供します。
  - title: データバックアップと復元
    details: JSON形式でのインポート/エクスポートとWebDavクラウドバックアップをサポートし、デバイス間のデータ同期を実現します。
  - title: 全プラットフォーム対応
    details: Chrome、Firefoxブラウザと互換性があり、Kiwi Browserなどのモバイルブラウザをサポートし、ダークモードに対応しています。
  - title: プライバシーとセキュリティ
    details: 完全オフラインで動作し、すべてのデータはローカルに保存されます。インターネット接続なしで全コア機能を使用できます。
  - title: Cloudflareシールドバイパスアシスタント
    details: 5秒シールドに遭遇した場合、自動的にポップアップでシールドをバイパスし、サイトが認識され記録されることを保証します。
  - title: 迅速なエクスポート
    details: サイト設定をCherryStudio、New API、CC Switchへワンクリックでエクスポートします。

footer: AGPL-3.0 ライセンス | Copyright 2025-present All API Hub
---

## はじめに

現在、市場には多数のAIアグリゲーション中継サイトが存在し、残高、モデルリスト、キーなどの情報を確認するたびに個別にログインする必要があり、非常に煩雑です。

このプラグインは、以下のプロジェクトに基づくAIアグリゲーション中継サイトのアカウントを自動的に認識し、統合管理できます。

- [one-api](https://github.com/songquanpeng/one-api)
- [new-api](https://github.com/QuantumNous/new-api)
- [Veloera](https://github.com/Veloera/Veloera)
- [one-hub](https://github.com/MartialBE/one-hub)
- [done-hub](https://github.com/deanxv/done-hub)
- Neo-API（クローズドソース）
- Super-API（クローズドソース）
- RIX_API（クローズドソース、基本機能をサポート）
- VoAPI（クローズドソース、旧バージョンをサポート）