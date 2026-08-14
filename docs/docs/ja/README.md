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
  - title: "📊 複数サイトの資産ダッシュボード"
    details: "複数の AI 中継サイトの残高、利用量、傾向、アカウント状態を一画面で確認し、分散した管理を一つにまとめられます。"
  - title: "🔑 API 認証情報ライブラリ"
    details: "サイトアカウントを登録せず、共有されたものや日頃個別に収集した Base URL と API Key をまとめて保存し、情報の確認、テスト、エクスポートにすぐ使えます。"
  - title: "💰 サイト間モデル価格比較"
    details: "各サイトのモデル価格を実質価格に換算し、よりお得なモデルやグループをひと目で見つけられます。"
  - title: "✅ 複数サイトの自動チェックイン"
    details: "複数サイトへワンクリックまたはスケジュールでチェックインし、毎日のログインなしで特典を自動的に受け取れます。"
  - title: "🧪 API・モデル・CLI 検証"
    details: "API の接続状態、モデルの利用可否、CLI の接続状態をワンクリックでテストし、設定上の問題をすばやく切り分けられます。"
  - title: "🔔 お知らせとタスク結果通知"
    details: "登録済みサイトのお知らせを一か所で確認し、メンテナンス、モデル、価格などの更新に加えて、自動チェックイン、WebDAV 自動同期、モデル同期の結果もすぐに受け取れます。"
  - title: "🚀 Web ページからの取り込みとワンクリックエクスポート"
    details: "Web ページから Base URL や API Key をすばやく検出し、よく使う AI クライアントへワンクリックでエクスポートできます。"
  - title: "🛠️ 主要 AI ゲートウェイ対応"
    details: "New API、AxonHub、Claude Code Hub、Octopus、Veloera、DoneHub を一元管理し、保存済みのアカウントや API 認証情報からチャネルを作成できます。ゲートウェイ経由でモデルをまとめて呼び出し、チャネルを切り替えながら、モデル同期やリダイレクトも利用できます。"
  - title: "🔐 ローカル優先と自動同期"
    details: "データはデフォルトでブラウザ内に保存されます。暗号化 WebDAV 自動同期を有効にすると、複数デバイス間で安全に同期し、パソコンを替えてもそのまま使い続けられます。"

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

- **アカウントサイト互換アーキテクチャ**：New API, One API, Sub2API, One-Hub, Veloera, Done-Hub など。
- **特色あるアカウントプラットフォームと互換実装**：AnyRouter, AIHubMix, Super-API, v-api, Neo-API など。
- **セルフホスト型管理バックエンド**：New API, AxonHub, Claude Code Hub, [Octopus](https://github.com/bestruirui/octopus), Veloera, Done-Hub など。チャネル管理、移行、一部のモデル同期に利用できます。

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

スポンサーの皆様による本プロジェクトへのご支援は、長期的な機能開発とメンテナンスを支えています。また、All API Hub を利用し、フィードバック、テスト、共有、改善に協力してくださるすべてのユーザー、コントリビューター、コミュニティの皆様にも感謝します。

<div class="readme-sponsor">
  <div class="readme-sponsor-logo">
    <a href="https://s.qiniu.com/qE3eai">
      <img src="../../../resources/partners/qiniu.png" alt="Qiniu Cloud AI">
    </a>
  </div>
  <p class="readme-sponsor-copy">
    Qiniu Cloud AI は Qiniu Cloud のエンタープライズ向け MaaS プラットフォームで、世界の主要 150 以上のモデルへワンストップでアクセスでき、主要モデルプロバイダーのプロトコルと互換性があります。テキスト、画像、音声、動画、ファイル処理までフルモーダル処理に対応します。エンタープライズユーザーは <a href="https://s.qiniu.com/qE3eai">こちらのリンク</a> から 1,200 万 Token を無料で受け取れ、紹介特典では最大で百億 Token 規模の報酬を獲得できます。
  </p>
</div>

<hr class="readme-sponsor-divider">

<div class="readme-sponsor">
  <div class="readme-sponsor-logo">
    <a href="https://api.fenno.ai/s/DCGC">
      <img src="../../../resources/partners/fennoai.jpg" alt="FennoAI">
    </a>
  </div>
  <p class="readme-sponsor-copy">
    FennoAI は、Codex 中継サービスを中心に提供する安定性と効率性に優れた API 中継サービスプロバイダーです。OpenAI と Anthropic のプロトコルに対応し、Codex、Claude Code、OpenCode などの主要なコーディングツールへ柔軟に接続できます。1 日あたり 1,000 億 Token 規模の企業利用を安定して支え、中国国内および海外法人との企業間決済と請求書発行にも対応しています。All API Hub ユーザー向け特典として、<a href="https://api.fenno.ai/s/DCGC">専用リンク</a>からわずか 1.99 ドルで、50 ドル相当の Coding Plan クレジットを購入できます。友人の購入に対して最大 20% の紹介報酬を受け取ることができ、紹介人数に応じて報酬も増えます。
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
    PackyCode は、Claude Code、Codex、Gemini など、多数の中継サービスを提供する、信頼性と効率性に優れた API 中継サービスプロバイダーです。PackyCode
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
    Xingchen AI は、Claude Code、Codex、Gemini などに対応した安定性と効率性の高い API 中継サービスプロバイダーです。1:1 のチャージ比率に対応し、請求書も発行でき、Claude は通常価格の 40% 程度から利用できます。詳細と利用開始は <a href="https://ai.centos.hk">こちらのリンク</a>をご覧ください（<a href="./sponsor-guides/xingchen.md">設定ガイド</a>）。
  </p>
</div>

<hr class="readme-sponsor-divider">

<div class="readme-sponsor">
  <div class="readme-sponsor-logo">
    <a href="https://www.xuanshuapi.com/register?aff=ALL-API-HUB&promo=ALL-API-HUB">
      <img src="../../../resources/partners/xuanshu-api.png" alt="XuanShu API">
    </a>
  </div>
  <p class="readme-sponsor-copy">
    XuanShu API は、企業、技術チーム、個人開発者向けの次世代 AI モデルルーティングゲートウェイです。Claude、GPT、Grok など世界トップクラスのモデルへ、エンタープライズ級の安定性を備えた API で一括アクセスできます。チャージは 20% オフ、モデル料金は通常価格の 20% から。登録で 5 米ドル分のクレジットを受け取れ、法人向け請求書にも対応します。<a href="https://www.xuanshuapi.com/register?aff=ALL-API-HUB&promo=ALL-API-HUB">こちらのリンク</a>から登録すると、さらに 5 米ドル分の追加クレジットを受け取れます。
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
    Atlas Cloud はフルモーダル AI 推論プラットフォームで、1 つの AI API から動画生成、画像生成、LLM API にアクセスでき、300
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
    Suixiang AI Relay は、Claude、Codex、Gemini などの中継サービスを提供する、信頼性と効率性に優れた API 中継サービスプロバイダーです。プライバシー、透明性、迅速なサポートを重視し、データ転売やモデル品質の水増しを行いません。新規アカウントは毎日のチェックインで ¥0.5 のテストクレジットを受け取れ、1:1 チャージ、従量課金、複数回線冗長、リージョン間 DR、自動フェイルオーバー、長時間 SSE 接続の維持、99.9% の可用性に対応します。詳しくは <a href="https://sui-xiang.com/">こちらのリンク</a> をご覧ください。
  </p>
</div>

<hr class="readme-sponsor-divider">

<div class="readme-sponsor">
  <div class="readme-sponsor-logo">
    <a href="https://www.aicodemirror.ai/register?invitecode=7IQNR8">
      <img src="../../../resources/partners/aicodemirror.png" alt="AICodeMirror">
    </a>
  </div>
  <p class="readme-sponsor-copy">
    AICodeMirror は Claude Code / Codex / Gemini CLI 向けの公式高安定中継サービスを提供し、エンタープライズ級の高同時実行、迅速な請求書発行、24 時間 365 日の専任技術サポートに対応しています。Claude Code / Codex / Gemini の公式チャネルを通常価格の 38% / 2% / 9% 程度から利用でき、チャージ時の追加割引もあります。All API Hub ユーザー向け特典として、<a href="https://www.aicodemirror.ai/register?invitecode=7IQNR8">こちらのリンク</a>から登録すると初回チャージが 20% オフになり、エンタープライズ顧客は最大 25% オフを受けられます。
  </p>
</div>

<hr class="readme-sponsor-divider">

<div class="readme-sponsor">
  <div class="readme-sponsor-logo">
    <a href="https://infistar.ai/register?aff=ALLAPIHUB&ref_source=link">
      <img src="../../../resources/partners/infistar.png" alt="Infistar.ai">
    </a>
  </div>
  <p class="readme-sponsor-copy">
    モデル品質の低下、性能制限、料金の不透明さが気になりますか？Infistar.ai で提供するすべてのモデルは実際の API 呼び出しで検証済みです。供給元は公式 API と公式アカウントプールで、10,000 本を超える供給経路を負荷分散し、低遅延とピーク時の安定性を確保しています。ChatGPT、Claude、Gemini、Grok、GLM、DeepSeek、Kimi、Qwen、MiniMax など国内外の主要モデルに対応し、テキスト、動画、画像、埋め込み、リランキングなどのフルモーダル機能をカバーします。料金と利用量は明確に確認でき、モデルは公式価格の 10% から利用できます。All API Hub ユーザーは<a href="https://infistar.ai/register?aff=ALLAPIHUB&ref_source=link">専用リンク</a>から登録してお試しいただけます。
  </p>
</div>

<hr class="readme-sponsor-divider">

<div class="readme-sponsor readme-sponsor-featured">
  <p class="readme-sponsor-banner">
    <a href="https://www.byteplus.com/en/product/modelark?utm_campaign=hw&utm_content=all-api-hub&utm_medium=devrel_tool_web&utm_source=OWO&utm_term=all-api-hub">
      <img src="../../../resources/partners/volcengine_en.jpg" alt="Dola Seed on BytePlus ModelArk">
    </a>
  </p>
  <p class="readme-sponsor-copy">
    Dola Seed 2.0 は ByteDance がグローバル市場向けに独自開発したフルモーダル汎用大規模モデルです。統一されたマルチモーダルアーキテクチャを基盤に、テキスト、画像、音声、動画の理解と生成を横断的にサポートします。エージェント協調をネイティブに実現し、推論、長時間タスク実行、ツール連携、コーディング能力に優れています。スマートコックピット、パーソナルアシスタント、教育、カスタマーサポート、マーケティング、小売など幅広いシナリオに適用できます。マルチモーダル認識、エンドツーエンドの複雑タスク実行、安定した対話、データセキュリティに強みがあり、ModelArk プラットフォームからすぐにアクセス、デプロイできます。<a href="https://www.byteplus.com/en/product/modelark?utm_campaign=hw&utm_content=all-api-hub&utm_medium=devrel_tool_web&utm_source=OWO&utm_term=all-api-hub">こちらのリンク</a>から登録すると、各モデルにつき 500,000 トークン分の無料推論枠を受け取れます。<a href="https://dis.chatdesks.cn/chatdesk/hsyqallapihub.html"> >>中国大陆地区的开发者请点击这里</a>
  </p>
</div>

<hr class="readme-sponsor-divider">
