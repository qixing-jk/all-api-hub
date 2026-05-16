---
home: true
title: "ホーム"
heroImage: "/512.png"
heroText: "All API Hub - あなたの万能 AI 資産マネージャー"
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
  - title: "📦 資産の一元管理ボード"
    details: "複数のサイトとアカウントを1つのパネルに集約。残高、使用量、健全状態を一目で確認でき、スマートなアドレス認識で簡単に追加できます。"
  - title: "🏷️ 独立した API 資格情報"
    details: "サイトアカウントがなくても、Base URL + Key を直接保存可能。タグ分けに対応し、モデル確認やインターフェース検証も可能です。"
  - title: "💰 モデル価格の比較"
    details: "各サイトのモデル価格を実際のコストで比較。最適なグループを自動的に特定し、最もお得な利用ルートを提案します。"
  - title: "✅ 高度なインターフェース検証"
    details: "モデルの可用性、トークン互換性、CLI プロキシの接続性を一括テスト。「サイトは通るがツールでエラーが出る」問題を簡単に解決します。"
  - title: "📈 詳細な使用量統計"
    details: "日付、アカウント、モデルごとに使用量と費用を分析。ヒートマップ、遅延ビュー、低速リクエスト分析を提供します。"
  - title: "📅 自動チェックイン補助"
    details: "サインイン対応サイトを集中管理。自動スケジュールサインイン、カスタム URL 遷移、チャージ/交換ページへの誘導をサポートします。"
  - title: "🚀 迅速なエコシステム統合"
    details: "CherryStudio、CC Switch、Kilo Code 等へ秒速同期。またはアカウント情報を自社構築の管理バックエンドに直接プッシュできます。"
  - title: "🛠️ 自社構築サイト連携"
    details: "New API、AxonHub、Claude Code Hub 等に深く対応。チャネル管理やモデル同期、リダイレクト設定が可能です。"
  - title: "🔒 プライバシーと安全な同期"
    details: "ローカル保存を基本とし、暗号化 WebDAV 同期をサポート。Cloudflare のチャレンジにも自動的に対応して盾を越えます。"

footer: "AGPL-3.0 Licensed | Copyright 2025-present All API Hub"
---

## 紹介

AI の時代には、節約したり別のモデルを試したりするために、複数の中継サイトアカウントを持つことがよくあります。ただし、管理は面倒になりがちです。残高は分散し、価格は比較しづらく、毎日の手動チェックインも忘れやすくなります。

**All API Hub は、その問題を解決するためのツールです。** AI 資産を一元管理し、より簡単で見やすく、自動化された管理を実現します。

## 🎯 使用シーン

### 👤 一般の AI ユーザー（初心者向け）

- **どう始めればよいですか？**：[拡張機能をダウンロードしてインストール](./get-started.md) -> [最初のアカウントを追加](./get-started.md#add-site)
- **節約したい**：[自動チェックインでクレジットを獲得](./auto-checkin.md) -> [サイト間でモデル価格を比較](./model-list.md)
- **もっと手間を減らしたい**：[資産の変化をひと目で確認](./balance-history.md) -> [アカウントを他の AI ツールに同期](./get-started.md#quick-export-sites)

### 🛠️ 上級ユーザー（Key コレクター）

- **キー管理**：[独立した URL+Key を資格情報として保存](./api-credential-profiles.md)
- **可用性テスト**：[API と CLI の互換性を一括検証](./web-ai-api-check.md)
- **デバイス間同期**：[暗号化 WebDAV バックアップを設定](./webdav-sync.md)

### 👑 サイト管理者（運営者向け）

- **効率化ツール**：[拡張機能内でチャネルを管理](./self-hosted-site-management.md) -> [モデルを一括同期](./managed-site-model-sync.md)
- **設定の最適化**：[モデルリダイレクトを設定](./model-redirect.md)
- **セキュリティ対策**：[2FA / OTP 検証を処理](./new-api-security-verification.md)

## 🧩 サポートされているシステムアーキテクチャ

All API Hub は、以下のオープンソースおよびクローズドソースのシステムに深く対応しています：

- **オープンソースアーキテクチャ**：One API, New API, Sub2API, Veloera, AxonHub, One-Hub, Done-Hub など。
- **特色あるアーキテクチャと互換性のあるプラットフォーム**：AIHubMix, AnyRouter, Neo-API, Super-API, VoAPI, v-api など。

> macOS で Safari を使う場合は、先に [Safari インストールガイド](./safari-install.md) を確認してください。
> QQ / 360 / Brave などのブラウザを使う場合は、[手動インストールガイド](./other-browser-install.md) を確認してください。

<a id="community"></a>
## 💬 コミュニティ交流

問題の相談や便利なサイトの共有をしたい場合は、コミュニティに参加してください：

- [GitHub Discussions](https://github.com/qixing-jk/all-api-hub/discussions)
- [Discord コミュニティ](https://discord.gg/RmFXZ577ZQ)
- [Telegram グループ](https://t.me/qixing_chat)
- **WeChat グループ**：下の QR コードをスキャンして中国語グループに参加してください。

<img
  src="../../../resources/wechat_group.png"
  alt="All API Hub WeChatグループQRコード"
  style="width: min(280px, 100%);"
/>