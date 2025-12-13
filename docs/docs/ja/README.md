---
home: true
title: ホーム
heroImage: https://github.com/qixing-jk/all-api-hub/blob/main/assets/icon.png?raw=true
heroText: All API Hub - AIアグリゲーションプロキシマネージャー
tagline: "オープンソースブラウザ拡張機能。サードパーティAIアグリゲーションプロキシと自社構築New APIを一元管理：アカウントの自動認識、残高確認、モデル同期、キー管理、クロスプラットフォームおよびクラウドバックアップをサポート。"
actions:
  - text: 使用を開始
    link: /get-started.html # 建议修改为您的实际文档路径，例如 /guide/
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
    details: AIアグリゲーションプロキシサイトを自動認識し、アクセストークンを作成します。サイト名とチャージ比率をスマートに取得し、重複検出と手動追加をサポートします。
  - title: マルチアカウントシステム
    details: 各サイトに複数のアカウントを追加し、アカウントのグループ化と迅速な切り替え、リアルタイムでの残高確認と詳細な使用ログをサポートします。
  - title: トークンとキーの管理
    details: すべてのAPIキーを簡単に管理し、表示、コピー、更新、一括操作をサポートします。
  - title: モデル情報の表示
    details: サイトがサポートするモデルリストと価格情報を明確に表示します。
  - title: チェックインステータス監視
    details: どのサイトがチェックインをサポートしているかを自動検出し、その日にまだチェックインしていないアカウントをマークします。1つのパネルで複数のサイトのチェックインを順番に完了させることができ、チェックイン忘れによる無料クォータの無駄を削減します。
  - title: 迅速なエクスポートと統合
    details: ワンクリックで設定をCherryStudioおよびNew APIにエクスポートし、API使用プロセスを簡素化します。
  - title: New API類似システム管理
    details: 自社構築New APIインスタンスのチャネル管理とモデルリスト同期をサポートし、専用のチャネル管理インターフェースを提供します。
  - title: データバックアップと復元
    details: JSON形式でのインポート/エクスポートとWebDavクラウドバックアップをサポートし、クロスデバイスデータ同期を実現します。
  - title: 全プラットフォーム対応
    details: Chrome、Firefoxブラウザに対応し、Kiwi Browserなどのモバイルブラウザをサポートし、ダークモードに対応します。
  - title: プライバシーとセキュリティ
    details: 完全にオフラインで動作し、すべてのデータはローカルに保存されます。インターネット接続なしで全コア機能を使用できます。
  - title: Cloudflare CAPTCHA回避アシスタント
    details: 5秒盾に遭遇した場合、自動ポップアップで回避し、サイトが認識され、記録されることを保証します。
  - title: 迅速なエクスポート
    details: ワンクリックでサイト設定をCherryStudio、New API、およびCC Switchにエクスポートします。

footer: AGPL-3.0 Licensed | Copyright 2025-present All API Hub
---

## はじめに

現在、AIエコシステムでは、New APIシリーズに基づくアグリゲーションプロキシや自社構築パネルがますます増えています。各サイトの残高、モデルリスト、APIキーを同時に管理することは、多くの場合、分散的で時間もかかります。

All API Hubはブラウザ拡張機能として、これらのサイトのアカウントを自動認識し、ワンクリックで残高確認、モデル管理、キー管理、自動チェックインが可能です。また、自社構築New APIにはモデル同期やチャネル管理などのツールを提供します。現在、以下のプロジェクトに基づくプロキシのアカウントをサポートしています：

- [one-api](https://github.com/songquanpeng/one-api)
- [new-api](https://github.com/QuantumNous/new-api)
- [Veloera](https://github.com/Veloera/Veloera)
- [one-hub](https://github.com/MartialBE/one-hub)
- [done-hub](https://github.com/deanxv/done-hub)
- Neo-API（クローズドソース）
- Super-API（クローズドソース）
- RIX_API（クローズドソース、基本機能をサポート）
- VoAPI（クローズドソース、旧バージョンをサポート）