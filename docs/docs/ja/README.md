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
> QQ / 360 / Brave / Vivaldi / Opera などのブラウザを使う場合は、[その他のブラウザへのインストールガイド](./other-browser-install.md) を確認してください。
> ストア版が GitHub Releases より遅れる理由や、更新を手動で確認する方法を知りたい場合は、[インストール方法と更新について](./extension-update-install.md) を確認してください。

<a id="community"></a>
## 💬 コミュニティ交流

問題の相談や便利なサイトの共有をしたい場合は、コミュニティに参加してください：

- [GitHub Discussions](https://github.com/qixing-jk/all-api-hub/discussions)
- [Discord コミュニティ](https://discord.gg/RmFXZ577ZQ)
- [Telegram グループ](https://t.me/qixing_chat)
- [QQ グループ](https://qm.qq.com/q/ebSCy31Phe)
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
    <a href="https://www.byteplus.com/en/product/modelark?utm_campaign=hw&utm_content=all-api-hub&utm_medium=devrel_tool_web&utm_source=OWO&utm_term=all-api-hub">
      <img src="../../../resources/partners/volcengine_en.jpg" alt="Dola Seed on BytePlus ModelArk">
    </a>
  </p>
  <p class="readme-sponsor-copy">
    Dola Seed 様、本プロジェクトへのご協賛ありがとうございます。Dola Seed 2.0 は ByteDance がグローバル市場向けに独自開発したフルモーダル汎用大規模モデルです。統一されたマルチモーダルアーキテクチャを基盤に、テキスト、画像、音声、動画の理解と生成を横断的にサポートします。エージェント協調をネイティブに実現し、推論、長時間タスク実行、ツール連携、コーディング能力に優れています。スマートコックピット、パーソナルアシスタント、教育、カスタマーサポート、マーケティング、小売など幅広いシナリオに適用できます。マルチモーダル認識、エンドツーエンドの複雑タスク実行、安定した対話、データセキュリティに強みがあり、ModelArk プラットフォームからすぐにアクセス、デプロイできます。<a href="https://www.byteplus.com/en/product/modelark?utm_campaign=hw&utm_content=all-api-hub&utm_medium=devrel_tool_web&utm_source=OWO&utm_term=all-api-hub">こちらのリンク</a>から登録すると、各モデルにつき 500,000 トークン分の無料推論枠を受け取れます。<a href="https://dis.chatdesks.cn/chatdesk/hsyqallapihub.html"> >>中国大陆地区的开发者请点击这里</a>
  </p>
</div>

<hr class="readme-sponsor-divider">

<div class="readme-sponsor">
  <div class="readme-sponsor-logo">
    <a href="https://s.qiniu.com/qE3eai">
      <img src="../../../resources/partners/qiniu.png" alt="Qiniu Cloud AI">
    </a>
  </div>
  <p class="readme-sponsor-copy">
    Qiniu Cloud AI 様、本プロジェクトへのご協賛ありがとうございます。Qiniu Cloud AI は Qiniu Cloud のエンタープライズ向け MaaS プラットフォームで、世界の主要 150 以上のモデルへワンストップでアクセスでき、主要モデルプロバイダーのプロトコルと互換性があります。テキスト、画像、音声、動画、ファイル処理までフルモーダル処理に対応します。エンタープライズユーザーは <a href="https://s.qiniu.com/qE3eai">こちらのリンク</a> から 1,200 万 Token を無料で受け取れ、紹介特典では最大で百億 Token 規模の報酬を獲得できます。
  </p>
</div>

<hr class="readme-sponsor-divider">

<div class="readme-sponsor">
  <div class="readme-sponsor-logo">
    <a href="https://api.fenno.ai/register?redirect=/purchase?tab=subscription%26group=16&aff=VS3FMCGW4XK4">
      <img src="../../../resources/partners/fennoai.jpg" alt="Fenno.ai">
    </a>
  </div>
  <p class="readme-sponsor-copy">
    Fenno.ai 様、本プロジェクトへのご協賛ありがとうございます。Fenno.ai は安定性と効率性に優れた API 中継サービスプロバイダーで、主に Codex 中継サービスを提供しています。OpenAI と Anthropic のプロトコルに互換性があり、Codex、Claude Code、OpenCode などの主要なコーディングツールから柔軟に利用できます。All API Hub ユーザー向け特典として、<a href="https://api.fenno.ai/register?redirect=/purchase?tab=subscription%26group=16&aff=VS3FMCGW4XK4">こちらのリンク</a> から 9.9 元 / 150 ドル相当の Coding Plan を購読でき、紹介では最大 20% の報酬を受け取れます。
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
    PackyCode 様、本プロジェクトへのご協賛ありがとうございます！PackyCode は、Claude Code、Codex、Gemini など、多数の中継サービスを提供する、信頼性と効率性に優れた API 中継サービスプロバイダーです。PackyCode
    は、当ソフトウェアのユーザーに特別割引を提供しています。<a href="https://www.packyapi.com/register?aff=all-api-hub">こちらのリンク</a>から登録し、初回チャージ時に "all-api-hub" プロモコードを入力すると、10% オフになります（<a href="./sponsor-guides/packycode.md">設定ガイド</a>）。
  </p>
</div>

<hr class="readme-sponsor-divider">

<div class="readme-sponsor">
  <div class="readme-sponsor-logo">
    <a href="https://ai.centos.hk">
      <img class="readme-sponsor-logo-small" src="../../../resources/partners/xingchen.png" alt="Xingchen AI">
    </a>
  </div>
  <p class="readme-sponsor-copy">
    Xingchen AI 様、本プロジェクトへのご協賛ありがとうございます。Xingchen AI は、Claude Code、Codex、Gemini などに対応した安定性と効率性の高い API 中継サービスプロバイダーです。1:1 のチャージ比率に対応し、請求書も発行でき、Claude は通常価格の 40% 程度から利用できます。詳細と利用開始は <a href="https://ai.centos.hk">こちらのリンク</a>をご覧ください（<a href="./sponsor-guides/xingchen.md">設定ガイド</a>）。
  </p>
</div>

<hr class="readme-sponsor-divider">

<div class="readme-sponsor">
  <div class="readme-sponsor-logo">
    <a href="https://www.atlascloud.ai/console/coding-plan?utm_source=github&utm_medium=link&utm_campaign=all-api-hub">
      <img src="../../../resources/partners/atlas-cloud-logo-display.svg" alt="Atlas Cloud">
    </a>
  </div>
  <p class="readme-sponsor-copy">
    Atlas Cloud 様、本プロジェクトへのご協賛ありがとうございます。Atlas Cloud はフルモーダル AI 推論プラットフォームで、1 つの AI API から動画生成、画像生成、LLM API にアクセスでき、300
    以上の厳選モデルを横断して利用できます。より手頃な API 利用に向けた新しい Coding Plan プロモーションは、<a href="https://www.atlascloud.ai/console/coding-plan?utm_source=github&utm_medium=link&utm_campaign=all-api-hub">こちらのリンク</a>をご覧ください。
  </p>
</div>

<hr class="readme-sponsor-divider">

<div class="readme-sponsor">
  <div class="readme-sponsor-logo">
    <a href="https://sui-xiang.com/">
      <img src="../../../resources/partners/suixiang.jpg" alt="Suixiang AI Relay">
    </a>
  </div>
  <p class="readme-sponsor-copy">
    Suixiang AI Relay 様、本プロジェクトへのご協賛ありがとうございます。Suixiang AI Relay は、Claude、Codex、Gemini などの中継サービスを提供する、信頼性と効率性に優れた API 中継サービスプロバイダーです。プライバシー、透明性、迅速なサポートを重視し、データ転売やモデル品質の水増しを行いません。新規アカウントは毎日のチェックインで ¥0.5 のテストクレジットを受け取れ、1:1 チャージ、従量課金、複数回線冗長、リージョン間 DR、自動フェイルオーバー、長時間 SSE 接続の維持、99.9% の可用性に対応します。詳しくは <a href="https://sui-xiang.com/">こちらのリンク</a> をご覧ください。
  </p>
</div>

<hr class="readme-sponsor-divider">

<div class="readme-sponsor">
  <div class="readme-sponsor-logo">
    <a href="https://www.aicodemirror.com/register?invitecode=7IQNR8">
      <img src="../../../resources/partners/aicodemirror.png" alt="AICodeMirror">
    </a>
  </div>
  <p class="readme-sponsor-copy">
    AICodeMirror 様、本プロジェクトへのご協賛ありがとうございます。AICodeMirror は Claude Code / Codex / Gemini CLI 向けの公式高安定中継サービスを提供し、エンタープライズ級の高同時実行、迅速な請求書発行、24 時間 365 日の専任技術サポートに対応しています。Claude Code / Codex / Gemini の公式チャネルを通常価格の 38% / 2% / 9% 程度から利用でき、チャージ時の追加割引もあります。All API Hub ユーザー向け特典として、<a href="https://www.aicodemirror.com/register?invitecode=7IQNR8">こちらのリンク</a>から登録すると初回チャージが 20% オフになり、エンタープライズ顧客は最大 25% オフを受けられます。
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
    RunAPI 様、本プロジェクトへのご協賛ありがとうございます！RunAPI は、高効率で安定した API OpenRouter の代替プラットフォームです。1つの API Key で OpenAI、Claude、Gemini、DeepSeek、Grok など 150 以上の主要モデルにアクセスでき、最低 10% の価格で、非常に安定しており、Claude Code、OpenClaw などのツールとシームレスに互換性があります。RunAPI
    は All API Hub のユーザーに限定特典を提供しています：<a href="https://runapi.co/register?aff=cvDm">こちらのリンク</a>から登録し、RunAPI の管理者に連絡すると、￥7 の無料クレジットを受け取ることができます（<a href="./sponsor-guides/runapi.md">設定ガイド</a>）。
  </p>
</div>

<hr class="readme-sponsor-divider">

<div class="readme-sponsor">
  <div class="readme-sponsor-logo">
    <a href="https://unity2.ai/register?ref=9NjKJ86j&source=allapihub">
      <img src="../../../resources/partners/unity2ai.jpg" alt="Unity2.ai">
    </a>
  </div>
  <p class="readme-sponsor-copy">
    Unity2.ai 様、本プロジェクトへのご協賛ありがとうございます。Unity2.ai は、個人開発者、チーム、企業向けの高性能 AI モデル API 中継プラットフォームです。中国国内の大手企業にも長く利用され、1 日あたり 300 億 token 超の呼び出しを処理し、5,000 RPM 級の高同時実行に対応しています。残高課金、初回チャージ特典、組み合わせサブスクリプション、企業向け請求書、専任サポートにも対応します。<a href="https://unity2.ai/register?ref=9NjKJ86j&source=allapihub">こちらのリンク</a>から登録すると $2 の残高を受け取れます。公式グループに参加するとさらに $10、最大 $12 の無料枠を受け取れます。
  </p>
</div>

<hr class="readme-sponsor-divider">
