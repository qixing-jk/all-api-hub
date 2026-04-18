---
home: true
title: "ホーム"
heroImage: "/512.png"
heroText: "All API Hub - AI集約中継ステーションマネージャー"
tagline: "オープンソースのブラウザ拡張機能。サードパーティ製AI集約中継ステーションと自社構築のNew APIを一元管理。アカウントの自動認識、残高表示、モデル同期、キー管理をサポートし、クロスプラットフォームとクラウドバックアップにも対応。"
actions:
  - text: "利用開始"
    link: "./get-started.html"
    type: "primary"
    
  - text: "Chrome ウェブストア"
    link: "https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo"
    type: "secondary"

  - text: "Edge アドオン"
    link: "https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa"
    type: "secondary"

  - text: "FireFox アドオン"
    link: "https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24}"
    type: "secondary"
    
  - text: "Safari インストール"
    link: "./safari-install.html"
    type: "secondary"

features:
  - title: "スマートサイト管理"
    details: "AI集約中継サイトを自動認識し、アクセス・トークンを生成。サイト名とチャージ倍率をインテリジェントに取得。重複検出と手動追加をサポート。"
  - title: "マルチアカウントシステム"
    details: "各サイトに複数アカウントを追加可能。アカウントのグループ化と高速切り替え、残高と詳細な使用ログをリアルタイムで表示。"
  - title: "トークンとキー管理"
    details: "すべてのAPIキーを便利に管理。表示、コピー、リフレッシュ、一括操作をサポート。"
  - title: "モデル情報表示"
    details: "サイトがサポートするモデルリストと価格情報を明確に表示。"
  - title: "サインイン状態監視"
    details: "どのサイトがサインインをサポートしているかを自動検出。その日まだサインインしていないアカウントをマーク。1つのパネルで複数のサイトへのサインインを順番に完了させ、サインイン忘れによる無料枠の無駄遣いを削減。"
  - title: "高速エクスポート・統合"
    details: "CherryStudio、CC Switch、Kilo Code、CLIProxyAPI、Claude Code Router、および自社構築ホスティングサイトへ設定を一括エクスポート。"
  - title: "自社構築サイトバックエンド連携"
    details: "自社構築のNew API、DoneHub、Veloera、Octopusインスタンスのバックエンド連携とチャネル関連操作をサポート。"
  - title: "データバックアップ・復元"
    details: "JSON形式でのインポート・エクスポート、WebDavによるクラウドバックアップをサポートし、クロスデバイスでのデータ同期を実現。"
  - title: "全プラットフォーム対応"
    details: "Chrome、Edge、Firefoxなどのブラウザに対応。モバイルブラウザ（例: Mobile Edge、Firefox for Android、Kiwiなど）でも使用可能。ダークモードにも対応。"
  - title: "プライバシーとセキュリティ"
    details: "完全にオフラインで動作。すべてのデータはローカルに保存され、インターネット接続なしで全てのコア機能を使用可能。"
  - title: "Cloudflare アンチDDosアシスタント"
    details: "5秒ルールによる保護を自動的に解除し、サイトの認識と記録を確実にします。"

footer: "AGPL-3.0 Licensed | Copyright 2025-present All API Hub"
---

## 紹介

現在、AIエコシステムにはNew APIシリーズに基づいた集約中継ステーションや自社構築パネルが増加しており、各サイトの残高、モデルリスト、APIキーを同時に管理することは、分散的で時間がかかることがよくあります。

All API Hubはブラウザ拡張機能として、これらのサイトのアカウントを自動認識し、ワンクリックで残高の確認、モデルやキーの管理、自動サインインを行います。また、自社構築のNew API、DoneHub、Veloera、Octopus向けのバックエンド連携やチャネル関連ツールを提供します。現在、以下のプロジェクトに基づく中継ステーションアカウントをサポートしています。

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

macOSでSafari経由で拡張機能を使用する場合は、まず[Safariインストールガイド](./safari-install.md)を確認してください。SafariはXcode経由でインストールする必要があります。これは、Chrome/Edge/Firefoxのストアインストールや解凍ロードとは異なる方法です。

もしQQブラウザ、360セキュアブラウザ、360クイックブラウザ、Cheetahブラウザ、Brave、Vivaldi、Operaなどのブラウザを使用している場合は、[QQ/360等ブラウザインストールガイド](./other-browser-install.md)を確認してください。

<a id="community"></a>
## 💬 コミュニティ交流

使用に関する問題の迅速なコミュニケーション、設定のトラブルシューティング、互換性のあるサイトの共有を行いたい場合は、以下のコミュニティチャネルの利用をお勧めします。

- [GitHub Discussions](https://github.com/qixing-jk/all-api-hub/discussions)：問題の整理、経験の蓄積、長期的な議論に適しています。
- [Discord コミュニティ](https://discord.gg/RmFXZ577ZQ)：多言語ユーザー向けで、機能が豊富、議論や問題解決に適しています。
- [Telegram グループ](https://t.me/qixing_chat)：多言語ユーザー間の迅速なコミュニケーションに適しています。
- WeChatグループ：以下のQRコードをスキャンして、中国語の交流グループに参加してください。

<img
  src="../../../resources/wechat_group.png"
  alt="All API Hub WeChatグループQRコード"
  style="width: min(280px, 100%);"
/>