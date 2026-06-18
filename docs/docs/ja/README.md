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
  - title: "🏷️ API 認証情報庫"
    details: "サイトアカウントがなくても、Base URL + API Key を直接保存可能。コピー、API 検証、モデル確認、残高/使用量確認に使えます。"
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

- **キー管理**：[独立した URL+Key を API 認証情報庫に保存](./api-credential-profiles.md)
- **可用性テスト**：[API と CLI の互換性を一括検証](./web-ai-api-check.md)
- **デバイス間同期**：[暗号化 WebDAV バックアップを設定](./webdav-sync.md)

### 👑 サイト管理者（運営者向け）

- **効率化ツール**：[拡張機能内でチャネルを管理](./self-hosted-site-management.md) -> [モデルを一括同期](./managed-site-model-sync.md)
- **設定の最適化**：[モデルリダイレクトを設定](./model-redirect.md)
- **セキュリティ対策**：[2FA / OTP 検証を処理](./new-api-security-verification.md)

## 🧩 サポートされているシステムアーキテクチャ

どのアーキテクチャを使っていても、高い確率で対応しています：

- **アカウントサイト互換アーキテクチャ**：One API, New API, Veloera, One-Hub, Done-Hub, Sub2API など。
- **特色あるアカウントプラットフォームと互換実装**：AIHubMix, AnyRouter, Neo-API, Super-API, v-api など。
- **セルフホスト型管理バックエンド**：New API, Veloera, Done-Hub, [Octopus](https://github.com/bestruirui/octopus), AxonHub, Claude Code Hub など。チャネル管理、移行、一部のモデル同期に利用できます。

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
  alt="All API Hub WeChat グループ QR コード"
  style="width: min(280px, 100%);"
/>

<a id="sponsors"></a>
## ❤️ 協賛スポンサー

<div class="readme-sponsor readme-sponsor-featured">
  <p class="readme-sponsor-banner">
    <a href="https://dis.chatdesks.cn/chatdesk/hsyqallapihub.html">
      <img src="../../../resources/partners/volcengine.png" alt="火山引擎方舟 Coding-Plan">
    </a>
  </p>
  <p class="readme-sponsor-copy">
    <strong>火山引擎方舟 Coding-Plan</strong> は字节跳动推出的开发者生产力计划。Lite 套餐仅需 <strong>9.9 元/月</strong>，即可使用豆包、DeepSeek、GLM 等主流模型，适配 Cursor、Claude Code、Windsurf 等 IDE 工具，并提供模型自动切换体验。现在通过<a href="https://dis.chatdesks.cn/chatdesk/hsyqallapihub.html">活动链接</a>加入，还可享受好友邀请返利及首单优惠。
  </p>
</div>

<hr class="readme-sponsor-divider">

<div class="readme-sponsor">
  <div class="readme-sponsor-logo">
    <a href="https://ai.centos.hk">
      <img class="readme-sponsor-logo-small" src="../../../resources/partners/xingchen.png" alt="星辰AI">
    </a>
  </div>
  <p class="readme-sponsor-copy">
    感谢星辰AI赞助了本项目！星辰AI是一家稳定、高效的 API 中转服务商，提供 Claude Code、Codex、Gemini 等多种中转服务。1:1 的チャージ比率に対応し、請求書も発行でき、Claude は通常価格の 40% 程度から利用できます。詳細と利用開始は <a href="https://ai.centos.hk">こちらのリンク</a>をご覧ください（<a href="./sponsor-guides/xingchen.md">設定ガイド</a>）。
  </p>
</div>

<hr class="readme-sponsor-divider">

<div class="readme-sponsor">
  <div class="readme-sponsor-logo">
    <a href="https://www.packyapi.com/register?aff=all-api-hub">
      <img src="../../../resources/partners/packycode.png" alt="PackyCode">
    </a>
  </div>
  <p class="readme-sponsor-copy">
    感谢 PackyCode 赞助了本项目！PackyCode は、Claude Code、Codex、Gemini など、多数の中継サービスを提供する、信頼性と効率性に優れた API 中継サービスプロバイダーです。PackyCode
    は、当ソフトウェアのユーザーに特別割引を提供しています。<a href="https://www.packyapi.com/register?aff=all-api-hub">こちらのリンク</a>から登録し、初回チャージ時に "all-api-hub" プロモコードを入力すると、10% オフになります。
  </p>
</div>

<hr class="readme-sponsor-divider">

<div class="readme-sponsor">
  <div class="readme-sponsor-logo">
    <a href="https://www.atlascloud.ai/console/coding-plan">
      <img src="../../../resources/partners/atlas-cloud-logo-display.svg" alt="Atlas Cloud">
    </a>
  </div>
  <p class="readme-sponsor-copy">
    感谢 Atlas Cloud 赞助了本项目！Atlas Cloud はフルモーダル AI 推論プラットフォームで、1 つの AI API から動画生成、画像生成、LLM API にアクセスでき、300
    以上の厳選モデルを横断して利用できます。より手頃な API 利用に向けた新しい Coding Plan プロモーションは、<a href="https://www.atlascloud.ai/console/coding-plan">こちらのリンク</a>をご覧ください。
  </p>
</div>

<hr class="readme-sponsor-divider">

<div class="readme-sponsor">
  <div class="readme-sponsor-logo">
    <a href="https://runapi.co/register?aff=cvDm">
      <img class="readme-sponsor-logo-small" src="../../../resources/partners/runapi.jpg" alt="RunAPI">
    </a>
  </div>
  <p class="readme-sponsor-copy">
    感谢 RunAPI 赞助了本项目！RunAPI は高効率で安定した API OpenRouter の代替プラットフォームです。1つの API Key で OpenAI、Claude、Gemini、DeepSeek、Grok など 150 以上の主要モデルにアクセスでき、最低 10% の価格で、非常に安定しており、Claude Code、OpenClaw などのツールとシームレスに互換性があります。RunAPI
    は All API Hub のユーザーに限定特典を提供しています：<a href="https://runapi.co/register?aff=cvDm">こちらのリンク</a>から登録し、RunAPI の管理者に連絡すると、￥7 の無料クレジットを受け取ることができます（<a href="./sponsor-guides/runapi.md">設定ガイド</a>）。
  </p>
</div>