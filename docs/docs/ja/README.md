---
home: true
title: "ホーム"
heroImage: "/512.png"
heroText: "All API Hub - AI集約中継ステーションマネージャー"
tagline: "オープンソースのブラウザ拡張機能。サードパーティ製AI集約中継ステーションと自社構築のNew APIを一元管理。アカウントの自動認識、モデル価格の比較、API/CLI互換性の検証、モデルとチャネルの同期をサポートし、クロスプラットフォームと暗号化されたWebDAVバックアップに対応。"
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
  - title: "スマートサイト認識"
    details: "ログイン後、サイトアドレスを貼り付けるだけでアカウントを追加できます。サイト名、チャージ倍率などの情報を自動認識します。認識に失敗した場合は手動で補完でき、重複追加の警告も表示されます。"
  - title: "マルチアカウント概要"
    details: "複数のサイトとアカウントを1つのパネルに集約し、残高、使用量、健全状態を一目で確認できます。自動更新にも対応しています。"
  - title: "独立API認証情報アーカイブ"
    details: "サイトアカウントとは別にbaseUrlとAPI Keyを個別に保存でき、タグでフィルタリングし、モデル表示、インターフェース検証、ステータス統計に再利用できます。"
  - title: "モデルと価格比較"
    details: "モデルリストを表示するだけでなく、ソース、課金方式、グループ、アカウントでフィルタリングし、価格、倍率、実際のコストを比較し、最低価格または最適なグループをマークできます。"
  - title: "モデルとインターフェース検証"
    details: "モデルの可用性検証、一括検証、トークン互換性判断、CLI互換性チェックをサポートし、「サイトは利用可能だがツールが利用不可」といった問題のトラブルシューティングに適しています。"
  - title: "使用量分析と遅延トラブルシューティング"
    details: "サイト、アカウント、トークン、日付ごとに使用量、費用、モデル分布とトレンドをフィルタリング・比較し、ヒートマップ、遅延、低速リクエストビューを提供してトラブルシューティングを支援します。"
  - title: "自動サインインと交換ページへのリダイレクト"
    details: "サインインをサポートするサイトを集中認識し、サインイン状態を処理します。自動サインイン、カスタムサインインURL、チャージ/交換ページへのリダイレクトをサポートします。"
  - title: "高速エクスポート・統合"
    details: "CherryStudio、CC Switch、CLIProxyAPI、Claude Code Router、Kilo Code、および現在選択されている自社構築ホスティングサイトにワンクリックでエクスポートします。"
  - title: "自社構築サイトバックエンド連携"
    details: "自社構築のNew API、DoneHub、Veloera、Octopus、AxonHub、およびClaude Code Hubインスタンスに対してバックエンド連携とチャネル関連ツールを提供します。"
  - title: "WebDAVバックアップと同期"
    details: "JSONインポート・エクスポート、WebDAV自動同期、選択的同期、バックアップ暗号化をサポートし、クロスデバイスとマルチブラウザ移行を実現します。"
  - title: "Cloudflare盾越えアシスタント"
    details: "Cloudflareのチャレンジに遭遇した場合、自動的にヘルプウィンドウをポップアップ表示し、検証完了後に元の認識、リフレッシュ、またはサインインプロセスを続行します。"
  - title: "全プラットフォーム対応"
    details: "Chrome、Edge、Firefox、Safari、およびモバイル/スマートフォンブラウザ（例：Mobile Edge、Firefox for Android、Kiwiなど）と互換性があります。ダークモードにも対応しています。"
  - title: "プライバシー優先"
    details: "デフォルトでローカルストレージを優先し、テレメトリデータ収集はありません。WebDAVまたは外部インターフェースを設定した場合にのみ、対応するサービスにアクセスします。"

footer: "AGPL-3.0 Licensed | Copyright 2025-present All API Hub"
---

## 紹介

現在、AIエコシステムにはNew APIシリーズに基づいた集約中継ステーションや自社構築パネルが増加しており、各サイトの残高、使用量、モデル価格、APIキーの可用性を同時に管理することは、分散的で時間がかかることがよくあります。

All API Hubはブラウザ拡張機能として、これらのサイトのアカウントを自動認識し、ワンクリックで残高、使用量、モデル価格を確認、モデルとキーを管理、自動サインインを行います。また、独立したAPI認証情報管理をサポートし、自社構築のNew API、DoneHub、Veloera、Octopus、AxonHub、およびClaude Code Hubインスタンスに対してバックエンド連携とチャネル関連ツールを提供します。現在、以下のプロジェクトに基づく中継ステーションアカウントをサポートしています。

- [one-api](https://github.com/songquanpeng/one-api)
- [new-api](https://github.com/QuantumNous/new-api)
- [Veloera](https://github.com/Veloera/Veloera)
- [one-hub](https://github.com/MartialBE/one-hub)
- [done-hub](https://github.com/deanxv/done-hub)
- [AxonHub](https://github.com/looplj/axonhub)
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