---
home: true
title: ホーム
heroImage: /512.png
heroText: All API Hub - AI集約中継ステーションマネージャー
tagline: "オープンソースのブラウザ拡張機能。サードパーティのAI集約中継ステーションとセルフホスト型New APIを統一管理：アカウントの自動認識、残高表示、モデル同期、キー管理、クロスプラットフォームおよびクラウドバックアップをサポート"
actions:
  - text: 利用開始
    link: /get-started.html # 実際のドキュメントパスに変更してください。例: /guide/
    type: primary
    
  - text: Chrome ウェブストア
    link: https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo
    type: secondary

  - text: Edge アドオン
    link: https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa
    type: secondary

  - text: FireFox アドオン
    link: https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24}
    type: secondary

features:
  - title: スマートサイト管理
    details: AI集約中継サイトを自動認識し、アクセス トークンを作成します。サイト名とチャージ倍率をインテリジェントに取得し、重複検出と手動追加をサポートします。
  - title: マルチアカウントシステム
    details: 各サイトに複数のアカウントを追加でき、アカウントのグループ化と高速切り替え、残高と詳細な使用ログのリアルタイム表示をサポートします。
  - title: トークンとキーの管理
    details: すべてのAPIキーを便利に管理し、表示、コピー、リフレッシュ、一括操作をサポートします。
  - title: モデル情報表示
    details: サイトがサポートするモデルリストと価格情報を明確に表示します。
  - title: チェックイン状態監視
    details: チェックインをサポートするサイトを自動検出し、その日まだチェックインしていないアカウントにフラグを付けます。これにより、1つのパネルで複数のサイトへのチェックインを順番に完了でき、チェックイン忘れによる無料額面の無駄遣いを減らすことができます。
  - title: 高速エクスポートと統合
    details: CherryStudio、CC Switch、Kilo Code、CLIProxyAPI、Claude Code Router、およびセルフホスト型サイトへの設定を一括エクスポートします。
  - title: セルフホスト型サイトバックエンド連携
    details: セルフホスト型New API、DoneHub、Veloera、およびOctopusインスタンスのバックエンド連携とチャネル関連操作をサポートします。
  - title: データバックアップと復元
    details: JSON形式のインポート/エクスポートとWebDavクラウドバックアップをサポートし、クロスデバイスデータ同期を実現します。
  - title: 全プラットフォーム対応
    details: Chrome、Edge、Firefoxなどのブラウザと互換性があり、モバイル/スマートフォンブラウザ（例:Mobile Edge、Firefox for Android、Kiwiなど）でも使用でき、ダークモードにも対応しています。
  - title: プライバシーとセキュリティ
    details: 完全オフラインで動作し、すべてのデータはローカルに保存されます。インターネット接続なしで、すべてのコア機能を使用できます。
  - title: Cloudflare保護回避アシスタント
    details: 5秒ルールによる保護に遭遇した場合、自動的にプロンプトが表示され、保護を回避し、サイトが認識および記録されることを保証します。

footer: AGPL-3.0 ライセンス | Copyright 2025-present All API Hub
---

## 紹介

現在、AIエコシステムにはNew APIシリーズに基づいた集約中継ステーションやセルフホスト型パネルが増えています。各サイトの残高、モデルリスト、APIキーを同時に管理することは、しばしば分散しており、時間がかかります。

All API Hubはブラウザ拡張機能として、これらのサイトのアカウントを自動認識し、残高の表示、モデルやキーの管理、自動チェックインを一括で行うことができます。また、セルフホスト型New API、DoneHub、Veloera、Octopus向けのバックエンド連携とチャネル関連ツールを提供します。現在、以下のプロジェクトに基づいた中継ステーションアカウントをサポートしています。

- [one-api](https://github.com/songquanpeng/one-api)
- [new-api](https://github.com/QuantumNous/new-api)
- [Veloera](https://github.com/Veloera/Veloera)
- [one-hub](https://github.com/MartialBE/one-hub)
- [done-hub](https://github.com/deanxv/done-hub)
- [Sub2API](https://github.com/Wei-Shaw/sub2api)
- [AnyRouter](https://anyrouter.top)
- WONG公益站
- Neo-API（クローズドソース）
- Super-API（クローズドソース）
- RIX_API（クローズドソース、基本機能サポート）
- VoAPI（クローズドソース、旧バージョンサポート）

<a id="community"></a>
## 💬 コミュニティ交流

使用上の問題、設定のトラブルシューティング、互換性のあるサイトの共有などをより迅速に行いたい場合は、以下のコミュニティチャネルをご利用ください。

- [GitHub Discussions](https://github.com/qixing-jk/all-api-hub/discussions)：問題の整理、経験の蓄積、長期的な議論に適しています。
- [Telegram グループ](https://t.me/qixing_chat)：多言語ユーザー間の迅速なコミュニケーションに適しています。
- WeChatグループ：以下のQRコードをスキャンして、中国語の交流グループに参加してください。

<img
  src="../../../resources/wechat_group.png"
  alt="All API Hub WeChatグループQRコード"
  style="width: min(280px, 100%);"
/>