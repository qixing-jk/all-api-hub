# はじめに

わずか数分で、AIアセットのインテリジェント管理の旅を始めましょう。All API Hub は、残高の自動同期、毎日のチェックイン、および一般的なAIツールへのワンクリック統合を支援します。

## 1. プラグインのインストール

最適な体験（自動更新を含む）を得るために、**各ブラウザの公式ストアからのインストールを強くお勧めします**。

| チャネル | ダウンロードリンク | 現在のバージョン | ユーザー数 |
|---|---|---|---|
| Chrome ウェブストア | [Chrome ウェブストア](https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo) | [![Chrome version](https://img.shields.io/chrome-web-store/v/lapnciffpekdengooeolaienkeoilfeo?label=Chrome&logo=googlechrome&style=flat)](https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo) | [![Chrome Web Store Users](https://img.shields.io/chrome-web-store/users/lapnciffpekdengooeolaienkeoilfeo?label=Chrome%20Users)](https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo) |
| Edge ウェブストア | [Edge ウェブストア](https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa) | [![Edge version](https://img.shields.io/badge/dynamic/json?label=Edge&prefix=v&query=%24.version&url=https%3A%2F%2Fmicrosoftedge.microsoft.com%2Faddons%2Fgetproductdetailsbycrxid%2Fpcokpjaffghgipcgjhapgdpeddlhblaa&logo=microsoftedge&style=flat)](https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa) | [![Edge Add-ons Users](https://img.shields.io/badge/dynamic/json?label=Edge%20Users&query=$.activeInstallCount&url=https://microsoftedge.microsoft.com/addons/getproductdetailsbycrxid/pcokpjaffghgipcgjhapgdpeddlhblaa)](https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa) |
| Firefox ウェブストア | [Firefox ウェブストア](https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24}) | [![Firefox version](https://img.shields.io/amo/v/%7Bbc73541a-133d-4b50-b261-36ea20df0d24%7D?label=Firefox&logo=firefoxbrowser&style=flat)](https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24}) | [![Mozilla Add-on Users](https://img.shields.io/amo/users/%7Bbc73541a-133d-4b50-b261-36ea20df0d24%7D?label=Firefox%20Users)](https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24}) |

<details>
<summary>📦 手動インストール、Safari、またはモバイルデバイスが必要ですか？（クリックして展開）</summary>

- **GitHub Stable**：ストア版または Chrome ウェブストア互換版をインストールできない場合、または公開済みの修正を一時的に手動インストールしたい場合は、[GitHub Releases](https://github.com/qixing-jk/all-api-hub/releases) から正式版をダウンロードできます。手動インストール版はストア版のように自動更新されません。新しいバージョンの通知を受け取るには、リポジトリを Star / Watch してください。
- **Nightly プレリリース**：新機能を早く試してテストに協力したいユーザー向けです。ストアの安定版より不安定な場合があります。Nightly も手動インストール経路で、自動更新されません。
- **Safari (Mac)**：Xcode を介してインストールする必要があります。詳細は [Safari インストールガイド](./safari-install.md) を参照してください。
- **QQ / 360 / Brave / Vivaldi / Opera など**：Chromium 系ブラウザでもインストール経路は異なります。Brave、Vivaldi、Opera は通常まず Chrome ウェブストアを試せます。ストア経路を使えない場合は手動読み込みを使ってください。詳細は [その他のブラウザへのインストールガイド](./other-browser-install.md) を参照してください。
- **モバイルデバイス**：Edge モバイル版、Firefox Android、Kiwi などに対応しています。詳細は [モバイル FAQ](./faq.md#mobile-browser-support) を参照してください。

</details>

<a id="add-site"></a>
## 2. 最初のアカウントを追加する

これは、プラグインを使用する上で最も重要なステップです。**「自動認識」機能の使用を強くお勧めします**。これは、QR コードでログインするのと同じくらい簡単です。

### 2.1 自動認識（推奨）

::: tip ステップ 1
まず、ブラウザで AI 中継ステーションのウェブサイトを開き、ログインしてください。
:::

1. ブラウザの右上にあるプラグインアイコンをクリックして、メインページを開きます。
2. **`アカウントを追加`** をクリックします。
3. 表示されるダイアログボックスに、サイトの URL を入力します。
4. **`自動認識`** をクリックします。
5. 情報に誤りがないことを確認したら、**`追加を確定`** をクリックします。

::: tip アカウントをまだ持っていませんか？
安定していて効率的かつ互換性の高い AI プロキシサービスをお探しなら、次のパートナーをお試しください。

- [Qiniu Cloud AI](https://s.qiniu.com/qE3eai)：150 以上の主要グローバルモデルへ一括アクセスできる企業向け MaaS プラットフォームです。企業ユーザーは 1,200 万トークンの無料枠を受け取れます。
- [FennoAI](https://api.fenno.ai/s/DCGC)：OpenAI と Anthropic プロトコルに対応した、安定性と効率性の高い Codex 中継サービスです。主要なコーディングツールに接続でき、1 日あたり 1,000 億 Token 規模の企業利用を支えます。All API Hub ユーザーは 1.99 ドルで 50 ドル相当の Coding Plan クレジットを購入でき、友人の購入に対して最大 20% の紹介報酬を受け取れます。[設定ガイド](./service-guides/fenno.md)
- [PackyCode](https://www.packyapi.com/register?aff=all-api-hub)：チャージ時に `all-api-hub` クーポンコードを入力すると 10% オフになります。[設定ガイド](./sponsor-guides/packycode.md)
- [Xingchen AI](https://ai.centos.hk)：1:1 のチャージ比率、請求書対応、Claude は通常価格の 40% 程度から利用できます。[設定ガイド](./sponsor-guides/xingchen.md)
- [XuanShu API](https://www.xuanshuapi.com/register?aff=ALL-API-HUB&promo=ALL-API-HUB)：企業、技術チーム、個人開発者向けの次世代 AI モデルルーティングゲートウェイで、Claude、GPT、Grok など世界トップクラスのモデルへ API で一括アクセスできます。チャージは 20% オフ、モデル料金は通常価格の 20% から。登録で 5 米ドル分、この専用リンクからの登録でさらに 5 米ドル分のクレジットを受け取れ、法人向け請求書にも対応します。[設定ガイド](./service-guides/xuanshuapi.md)
- [Atlas Cloud](https://www.atlascloud.ai/console/coding-plan?utm_source=github&utm_medium=link&utm_campaign=all-api-hub)：1 つの AI API で 300 以上の厳選された動画、画像、LLM モデルを利用でき、新しい Coding Plan プロモーションでより手頃に API へアクセスできます。
- [AICodeMirror](https://www.aicodemirror.ai/register?invitecode=7IQNR8)：Claude Code / Codex / Gemini CLI 向けの公式高安定中継サービスです。このリンクから登録すると初回チャージが 20% オフになり、エンタープライズ顧客は最大 25% オフを受けられます。
- [Suixiang AI Relay](https://sui-xiang.com/)：Claude、Codex、Gemini などの API 中継サービスを提供し、従量課金、毎日のチェックインによるテストクレジット、複数回線冗長、自動フェイルオーバーに対応します。
- [Infistar.ai](https://infistar.ai/register?aff=ALLAPIHUB&ref_source=link)：提供モデルはすべて実際の呼び出しで検証済みです。10,000 本を超える公式 API と公式アカウントプールの供給経路を負荷分散し、テキスト、動画、画像、埋め込み、リランキングなどのフルモーダル機能、透明な料金と利用量、公式価格の 10% からの価格を提供します。
- [Dola Seed on BytePlus ModelArk](https://www.byteplus.com/en/product/modelark?utm_campaign=hw&utm_content=all-api-hub&utm_medium=devrel_tool_web&utm_source=OWO&utm_term=all-api-hub)：BytePlus ModelArk から登録すると、各モデルにつき 500,000 トークン分の無料推論枠を受け取れます。
:::

> **盾越えのヒント**：サイトに Cloudflare 認証（5 秒ルール）がある場合、プラグインは自動的にウィンドウを表示して盾越えを支援します。認証が完了すると、自動的に認識を続行します。

<a id="manual-addition"></a>
### 2.2 手動追加（代替）

自動認識に失敗した場合は、**「手動追加」**をクリックし、サイト種別を選択してアカウント情報を入力します。必要な項目、Access Token の確認場所、注意事項については、[アカウントの手動追加ガイド](./account-management.md#manual-addition)を参照してください。

---

## 3. サポートされているサイトタイプ

どのアーキテクチャを使っていても、高い確率で対応しています：
- **アカウントサイト互換アーキテクチャ**：New API, One API, Sub2API, One-Hub, Veloera, Done-Hub など。
- **特色あるアカウントプラットフォームと互換実装**：OpenRouter, AnyRouter, AIHubMix, Super-API, v-api, Neo-API など。
- **セルフホスト型管理バックエンド**：New API, Sub2API, AxonHub, Claude Code Hub, [Octopus](https://github.com/bestruirui/octopus), Veloera, Done-Hub など。バックエンド管理、移行、一部のモデル同期に利用できます。

::: tip 互換性に関するヒント
アカウントサイト互換アーキテクチャで構築された中継サイトは、通常アカウントとして追加できます。AxonHub、Octopus、Claude Code Hub などは主にセルフホスト型管理バックエンドとして利用します。完全な互換性リストについては、[サポートされているサイトとシステムタイプ](./supported-sites.md) を参照してください。
:::

<a id="quick-export-sites"></a>
## 4. クイックエクスポートと統合

アカウントを追加した後、これらの設定をワンクリックで他の AI ツールに「プッシュ」でき、手動でのコピー＆ペーストは不要になります。

1. **`キー管理`** ページに移動します。
2. エクスポートしたいキーを見つけます。設定済みのセルフホスト型サイトへインポートする場合は、操作エリアにあるそのサイトのアイコンを直接クリックします。その他のツールへは **`エクスポート`** をクリックし、**チャットクライアント**、**コーディングエージェント**、**ゲートウェイとルーティングツール**のいずれかから対象を選択します。
3. ダイアログの案内に従って、アプリの起動、設定のコピーまたはダウンロード、管理 API 経由のインポートを完了します。

> 完全なリストについては、[サポートされているエクスポートツールと統合ターゲット](./supported-export-tools.md) を参照してください。

---

## 5. コア機能の詳細ガイド

### 📊 アセットダッシュボードと統計
- **[設定ページ概要（メインダッシュボード）](./options-overview.md)**：アカウントステータス、認証情報庫、本日の使用量、およびタスクを一画面で確認。
- **[アセット概要とリアルタイム更新](./auto-refresh.md)**：複数サイトの残高、使用量、健全状態を一元管理。
- **[残高履歴](./balance-history.md)**：資産の変動トレンドを直感的に表示。
- **[使用量統計分析](./usage-analytics.md)**：消費量、モデル分布、遅延を多角的に分析。

### 🔑 キー管理とクイック統合
- **[トークン管理](./key-management.md)**：サイトのトークンを一元管理し、ワンクリックで補完可能。
- **[API 認証情報庫](./api-credential-profiles.md)**：アカウントなしで `Base URL + API Key` を保存し、コピー、検証、モデル確認に使えます。
- **[Web API スニッフィング](./web-ai-api-check.md)**：Web ページ内で API 設定を迅速に識別・テスト。

### ⚡ 自動化と情報追跡
- **[自動チェックインフロー](./auto-checkin.md)**：すべてのサイトのチェックインを毎日自動的に実行。
- **[サイト公告](./site-announcements.md)**：保存済みサイトの公告をバックグラウンドで取得し、メンテナンス、モデル変更、価格調整などの情報をまとめて確認。
- **[引き換えアシスタント](./redemption-assist.md)**：Web ページ上の引き換えコードを自動認識し、ワンクリックで取得。
- **[ブックマーク整理](./bookmark-management.md)**：コンソール、ドキュメント、チャージ入口を一元管理。

### 🛡️ 安定性とセキュリティ保護
- **[Cloudflare 盾越えアシスタント](./cloudflare-helper.md)**：検証を支援し、リフレッシュやチェックインの中断を防ぎます。
- **[WebDAV 同期と暗号化](./webdav-sync.md)**：クロスデバイスでの暗号化バックアップをサポートし、データを失わないようにします。

### 🔔 通知チャネル
- **[タスク通知](./task-notifications.md)**：**`設定 → 一般 → 通知`** で有効化し、ブラウザシステム通知、Telegram Bot、Feishu Bot、DingTalk Bot、WeCom Bot、ntfy、汎用 Webhook でバックグラウンドタスクの結果通知を受け取れます。

### 🛠️ セルフホスト型サイト運用ツール
- **[セルフホスト型サイト管理](./self-hosted-site-management.md)**：プラグイン内で直接チャネルの追加、削除、変更、クエリを実行。
- **[モデル同期とリダイレクト](./managed-site-model-sync.md)**：アップストリームモデルを一括同期し、マッピングロジックを設定。

---

## 6. その他の説明

- [よくある質問 FAQ](./faq.md)
- [更新ログ](./changelog.md)
- [権限説明](./permissions.md)
- [データ管理](./data-management.md)
