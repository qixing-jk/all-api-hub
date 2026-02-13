---
home: true
title: ホーム
heroImage: https://github.com/qixing-jk/all-api-hub/blob/main/assets/icon.png?raw=true
heroText: All API Hub - AI 統合リレーハブ マネージャー
tagline: "オープンソースのブラウザプラグイン。サードパーティのAI統合リレーハブと自前構築の New API を一元管理：アカウントの自動識別、残高確認、モデル同期、キー管理、クロスプラットフォームおよびクラウドバックアップに対応"
actions:
  - text: 利用開始
    link: /get-started.html # 建议修改为您的实际文档路径，例如 /guide/
    type: primary
    
  - text: Chrome ウェブストア
    link: https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo
    type: secondary

  - text: Edge アドオンストア
    link: https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa
    type: secondary

  - text: FireFox アドオンストア
    link: https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24}
    type: secondary

features:
  - title: スマートサイト管理
    details: AI統合リレーサイトを自動識別し、アクセストークンを作成。サイト名とチャージレートをインテリジェントに取得し、重複検出と手動追加をサポートします。
  - title: マルチアカウントシステム
    details: 各サイトで複数のアカウント追加、アカウントグループ化と高速切り替え、リアルタイム残高確認、詳細な利用ログをサポートします。
  - title: トークンとキーの管理
    details: すべての API Key を簡単に管理。表示、コピー、更新、一括操作をサポートします。
  - title: モデル情報の確認
    details: サイトがサポートするモデルリストと価格情報を明確に表示します。
  - title: チェックインステータスの監視
    details: どのサイトがチェックインをサポートしているかを自動検出し、当日未チェックインのアカウントにマークを付けます。一つのパネルで複数のサイトのチェックインを順番に完了させ、チェックイン忘れによる無料クォータの浪費を防ぎます。
  - title: 高速エクスポートと統合
    details: CherryStudio および New API への設定をワンクリックでエクスポートし、API利用プロセスを簡素化します。
  - title: New API ライクなシステム管理
    details: 自前構築の New API インスタンスに対するチャネル管理とモデルリスト同期をサポートし、専用のチャネル管理インターフェースを提供します。
  - title: データバックアップと復元
    details: JSON形式でのインポート/エクスポートと WebDav クラウドバックアップをサポートし、クロスデバイスデータ同期を実現します。
  - title: 全プラットフォーム対応
    details: Chrome、Firefox ブラウザと互換性があり、Kiwi Browser などのモバイルブラウザをサポートし、ダークモードに対応します。
  - title: プライバシーとセキュリティ
    details: 完全にオフラインで動作し、すべてのデータはローカルに保存されます。ネットワーク接続なしで全コア機能を利用可能です。
  - title: Cloudflare シールド回避アシスタント
    details: 5秒シールドに遭遇した場合、自動的にポップアップウィンドウでシールドを回避し、サイトが識別・記録されることを保証します。
  - title: 高速エクスポート
    details: CherryStudio、New API、CC Switch へのサイト設定をワンクリックでエクスポートします。

footer: AGPL-3.0 ライセンス | Copyright 2025-present All API Hub
---

## はじめに

現在のAIエコシステムでは、New API シリーズに基づいた統合リレーハブや自前構築パネルがますます増えています。これらの各サイトの残高、モデルリスト、APIキーを同時に管理するのは、分散していて時間がかかりがちです。

All API Hub はブラウザプラグインとして、これらのサイトのアカウントを自動的に識別し、残高確認、モデル管理、キー管理、自動チェックインをワンクリックで実行できます。また、自前構築の New API 向けにモデル同期やチャネル管理などのツールを提供します。現在、以下のプロジェクトに基づいたリレーハブアカウントをサポートしています：

- [one-api](https://github.com/songquanpeng/one-api)
- [new-api](https://github.com/QuantumNous/new-api)
- [Veloera](https://github.com/Veloera/Veloera)
- [one-hub](https://github.com/MartialBE/one-hub)
- [done-hub](https://github.com/deanxv/done-hub)
- [Sub2API](https://github.com/Wei-Shaw/sub2api)（基本機能をサポート）
- Neo-API（クローズドソース）
- Super-API（クローズドソース）
- RIX_API（クローズドソース、基本機能をサポート）
- VoAPI（クローズドソース、旧バージョンをサポート）