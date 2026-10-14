# サポートされているサイトのリスト

> All API Hub は主に 2 種類のオブジェクトをサポートしています。1 つは日常的にログインして使用するプロキシ / 管理パネル、もう 1 つは自分で構築し、プラグインで引き続き管理したいバックエンドシステムです。

## 日常的に追加および管理できるサイト

以下は、ユーザーが最も一般的で、All API Hub を通じて一元管理するのに最も適したサイトの種類です。オープンソースの配信アーキテクチャ、商用プロキシサービス、独立したプラットフォームを網羅しています。

### アカウントサイト互換アーキテクチャ

主要なオープンソース LLM API 管理・配信システムおよびその派生・二次開発バージョンに基づくサイトをサポートします。

| サイト / システム             | サイト紹介                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | 公式リンク                                                                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| New API                       | 統一された AI モデル集約および配布センター。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | [公式サイト](https://www.newapi.ai/) / [GitHub](https://github.com/QuantumNous/new-api)                                                                      |
| One API                       | LLM API 管理および配布システム。OpenAI、Azure、Anthropic Claude、Google Gemini、DeepSeek などの主要モデルをサポートし、API を統一的にアダプトします。キー管理および二次配布に使用できます。                                                                                                                                                                                                                                                                                                                                                                                           | [GitHub](https://github.com/songquanpeng/one-api)                                                                                                            |
| Sub2API                       | Sub2API-CRS2 ワンストップオープンソースプロキシサービス。Claude、OpenAI、Gemini、Antigravity のサブスクリプションを統一的に接続し、共同利用による効率的なコスト分担とネイティブツールのシームレスな利用に対応します。 サイト固有のチェックイン方式は個別に対応し、DaiGua の通常の毎日チェックインも含みます。ラッキーチェックインは行わず、Turnstile 認証を完了できない場合は元のサイトで手動操作してください。 | [GitHub](https://github.com/Wei-Shaw/sub2api)                                                                                                                |
| one-hub                       | OpenAI インターフェース管理および配布システム。songquanpeng/one-api から改変され、より多くのモデルをサポートし、統計ページを追加し、OpenAI 以外のモデルの関数呼び出しを改善しました。                                                                                                                                                                                                                                      | [公式サイト](https://one-hub.xiao5.info/) / [GitHub](https://github.com/MartialBE/one-hub)                                                                   |
| DoneHub                       | このプロジェクトは one-hub をベースに二次開発されました。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | [GitHub](https://github.com/deanxv/done-hub)                                                                                                                 |
| VoAPI / VoAPI v2              | 新版 VoAPI は、従来の VoAPI をベースに再開発された新世代の AI モデル管理・配信システムで、旧バージョンのデプロイとも互換性を維持しています。                                                                                                                                                                                                                                                                                                                                                                                                          | [GitHub](https://github.com/VoAPI/VoAPI)                                                                                                                     |
| Veloera                       | このプロジェクトはメンテナンスを停止しました。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | [GitHub](https://github.com/Veloera/Veloera)                                                                                                                 |
| Super-API                     | Super-Api 新しい AI モデルインターフェース管理および配布系统。NewAPI をベースに開発されています。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | [GitHub](https://github.com/SuperAI-Api/Super-API)                                                                                                           |
| API易                         | New API アーキテクチャをベースに二次開発された商用 AI モデル中継サービス。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | —                                                                                                                                                            |
| ModelFlare                    | New API から派生した高機能な AI モデル中継プラットフォーム。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | —                                                                                                                                                            |
| v-api                         | one-api をベースにした、高機能なプロキシプラットフォーム。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | 該当なし                                                                                                                                                     |

### 独立したプラットフォームおよび商用プロキシサービス

独自のアカウント体系、専用コンソール、またはカスタム API を備えた AI モデルプラットフォームおよびプロキシサービスをサポートします。

| サイト / システム             | サイト紹介                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | 公式リンク                                                                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| OpenRouter                    | 複数のモデル提供元を統一 API で利用できる独立した AI モデル集約プラットフォーム。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | [公式サイト](https://openrouter.ai/) / [ドキュメント](https://openrouter.ai/docs) / [設定ガイド](./service-guides/openrouter.md)                             |
| Kimi オープンプラットフォーム | Kimi（Moonshot）公式オープンプラットフォーム。国際版と中国版はそれぞれ独立したアカウント体系を使用します。                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | [国際版](https://platform.kimi.ai/) / [中国版](https://platform.kimi.com/)                                                                                   |
| AnyRouter                     | Claude Code プロキシ · ゼロしきい値 · 無料 $50                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | [ドキュメント](https://docs.anyrouter.top/) / [公式サイト](https://anyrouter.top/register?aff=tDKX)                                                          |
| AgentRouter                   | AI API ルーティングおよびプロキシサービスプラットフォーム。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | [公式サイト](https://agentrouter.org/register?aff=TUX6)                                                                                                      |
| AIHubMix                      | モデル API と専用アカウントコンソールを提供する独立した AI API 集約プラットフォーム。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | [公式サイト](https://aihubmix.com/?aff=W3DN) / [API ドキュメント](https://docs.aihubmix.com/cn/api/Cli) / [設定ガイド](./sponsor-guides/aihubmix.md)         |
| 老张 API                      | 商用 AI モデル API 中継サービス。標準、国内・予備、海外直通、CF-CDN の各入口は同じアカウント体系を使用します。                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | —                                                                                                                                                            |
| Dahl                          | トークン残高を利用する AI 推論サービス。モデル API とアカウントコンソールを提供します。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | —                                                                                                                                                            |
| FoxCode                       | 開発者向けの AI コーディングモデル中継およびサブスクリプションプラットフォーム。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | —                                                                                                                                                            |
| 肖恩 AI (`free.supxh.xin`) | 独立した CharityAPI 公益サイト。Cookie による追加、永久/当日クレジット、チェックイン、単一推論キーの取得・エクスポート、招待リンク、公開告知、キーで利用可能なモデルに対応。現金換算は行わず、当日クレジットは翌日失効します。キーの更新は元サイトで操作してください。VIP 枠と空でない利用履歴は未対応です。 | [サイト](https://free.supxh.xin/) |
| Cubence                       | モデル呼び出し、グループ、利用枠の管理を提供する商用 AI モデル API プラットフォーム。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | —                                                                                                                                                            |
| RightCode                     | 商用 AI Agent 中継サービス。right.codes と rightapi.ai は同じサービスの入口です。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | —                                                                                                                                                            |
| Grsai                         | 商用 AI モデル集約中継服务。grsai.com と grsai.ai は同じサービスの入口です。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | —                                                                                                                                                            |
| FreeModel                     | モデル API、チャージ残高、サブスクリプションプランを提供する独立した AI サービスプラットフォーム。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | —                                                                                                                                                            |
| SharedChat                    | Codex と Vibe Code の共有利用およびクォータ管理に特化した AI サブスクリプションサービス。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | —                                                                                                                                                            |
| WONG公益站                    | 安定した公開されたサイト紹介はありません。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | 安定した公開された公式リンクはありません                                                                                                                     |

## ❤️ 推奨スポンサーサイト

安定していて効率的かつ互換性の高い AI プロキシサービスをお探しなら、次のパートナーをお試しください。

<div class="sponsor-list">
  <section class="sponsor-item">
    <a class="sponsor-logo" href="https://s.qiniu.com/qE3eai">
      <img src="../../../resources/partners/qiniu.png" alt="Qiniu Cloud AI">
    </a>
    <p>
      <strong>Qiniu Cloud AI</strong> は Qiniu Cloud のエンタープライズ向け MaaS プラットフォームで、世界の主要 150 以上のモデルへワンストップでアクセスでき、主要モデルプロバイダーのプロトコルと互換性があります。テキスト、画像、音声、動画、ファイル処理まで対応します。エンタープライズユーザーは <a href="https://s.qiniu.com/qE3eai">こちらのリンク</a> から <strong>1,200 万 Token</strong> を無料で受け取れ、紹介特典では最大で百億 Token 規模の報酬を獲得できます。
    </p>
  </section>

  <hr>

  <section class="sponsor-item">
    <a class="sponsor-logo" href="https://api.fenno.ai/s/DCGC">
      <img src="../../../resources/partners/fennoai.jpg" alt="FennoAI">
    </a>
    <p>
      <strong>FennoAI</strong> は、Codex 中継サービスを中心に提供する安定性と効率性に優れた API 中継サービスプロバイダーです。OpenAI と Anthropic のプロトコルに対応し、Codex、Claude Code、OpenCode などの主要なコーディングツールへ接続できます。1 日あたり 1,000 億 Token 規模の企業利用を安定して支え、中国国内および海外法人との企業間決済と請求書発行にも対応しています。<a href="https://api.fenno.ai/s/DCGC">専用リンク</a>からわずか <strong>1.99 ドル</strong>で、50 ドル相当の Coding Plan クレジットを購入できます。友人の購入に対して最大 20% の紹介報酬を受け取ることができ、紹介人数に応じて報酬も増えます（<a href="./service-guides/fenno.md">設定ガイド</a>）。
    </p>
  </section>

  <hr>

  <section class="sponsor-item">
    <a class="sponsor-logo" href="https://www.packyapi.ai/register?aff=all-api-hub">
      <img src="../../../resources/partners/packycode.png" alt="PackyCode">
    </a>
    <p>
      <strong>PackyCode</strong> は、Claude Code、Codex、Gemini などの多様なプロキシサービスを提供しています。<a href="https://www.packyapi.ai/register?aff=all-api-hub">こちらのリンク</a>から登録し、初回チャージ時に "all-api-hub" クーポンコードを入力すると、<strong>10% オフ</strong>になります（<a href="./sponsor-guides/packycode.md">設定ガイド</a>）。
    </p>
  </section>

  <hr>

  <section class="sponsor-item">
    <a class="sponsor-logo sponsor-logo-small" href="https://ai.centos.hk">
      <img src="../../../resources/partners/xingchen.png" alt="Xingchen AI">
    </a>
    <p>
      <strong>Xingchen AI</strong> は、Claude Code、Codex、Gemini などに対応した安定性と効率性の高い API 中継サービスプロバイダーです。1:1 のチャージ比率に対応し、請求書も発行でき、Claude は通常価格の 40% 程度から利用できます。詳細と利用開始は <a href="https://ai.centos.hk">こちらのリンク</a>をご覧ください（<a href="./sponsor-guides/xingchen.md">設定ガイド</a>）。
    </p>
  </section>

  <hr>

  <section class="sponsor-item">
    <a class="sponsor-logo" href="https://www.xuanshuapi.com/register?aff=ALL-API-HUB&promo=ALL-API-HUB">
      <img src="../../../resources/partners/xuanshu-api.png" alt="XuanShu API">
    </a>
    <p>
      <strong>XuanShu API</strong> は、企業、技術チーム、個人開発者向けの次世代 AI モデルルーティングゲートウェイです。Claude、GPT、Grok など世界トップクラスのモデルへ、エンタープライズ級の安定性を備えた API で一括アクセスできます。モデル料金は通常価格の 10% から 60% まで。<a href="https://www.xuanshuapi.com/register?aff=ALL-API-HUB&promo=ALL-API-HUB">こちらのリンク</a>から登録するとチャージ特典が追加され、初回チャージはさらにお得です。法人のお客様は法人銀行振込と請求書発行に対応しています（<a href="./service-guides/xuanshuapi.md">設定ガイド</a>）。
    </p>
  </section>

  <hr>

  <section class="sponsor-item">
    <a class="sponsor-logo" href="https://www.aicodemirror.ai/register?invitecode=7IQNR8">
      <img src="../../../resources/partners/aicodemirror.png" alt="AICodeMirror">
    </a>
    <p>
      <strong>AICodeMirror</strong> は Claude Code / Codex / Gemini CLI 向けの公式高安定中継サービスを提供し、エンタープライズ級の高同時実行、迅速な請求書発行、24 時間 365 日の専任技術サポートに対応しています。Claude Code / Codex / Gemini の公式チャネルを通常価格の 38% / 2% / 9% 程度から利用でき、チャージ時の追加割引もあります。<a href="https://www.aicodemirror.ai/register?invitecode=7IQNR8">こちらのリンク</a>から登録すると<strong>初回チャージが 20% オフ</strong>になり、エンタープライズ顧客は最大 25% オフを受けられます。
    </p>
  </section>

  <hr>

  <section class="sponsor-item">
    <a class="sponsor-logo" href="https://sui-xiang.com/">
      <img src="../../../resources/partners/suixiang.jpg" alt="Suixiang AI Relay">
    </a>
    <p>
      <strong>Suixiang AI Relay</strong> は、Claude、Codex、Gemini などに対応した信頼性と効率性の高い API 中継サービスプロバイダーです。1:1 チャージ、従量課金、毎日のチェックインによるテストクレジット、複数回線冗長、リージョン間 DR、自動フェイルオーバーに対応します。詳しくは <a href="https://sui-xiang.com/">こちらのリンク</a>をご覧ください（<a href="./service-guides/suixiang.md">設定ガイド</a>）。
    </p>
  </section>

  <hr>

  <section class="sponsor-item">
    <a class="sponsor-logo" href="https://go.apimart.ai/gh-all-api-hub">
      <img src="../../../resources/partners/apimart.png" alt="APIMart">
    </a>
    <p>
      <strong>APIMart</strong> は AI 画像・動画生成に特化した低価格 API プラットフォームです。GPT-Image-2 は <strong>1 枚 $0.006</strong> から、1 ドルで 160 枚以上の画像を生成できます。画像と動画をひとつの非同期 API でカバーし、タスクを送信して ID を取得、ポーリングまたはコールバックで結果を取得できます。数万枚のバッチ処理もタイムアウトなしで実行でき、モデルを切り替えてもコードの変更は不要です。従量課金・月額料金なし。<a href="https://go.apimart.ai/gh-all-api-hub">こちらのリンク</a>から登録して利用を始められます。
    </p>
  </section>

  <hr>

  <section class="sponsor-item sponsor-item-featured">
    <a href="https://www.byteplus.com/en/product/modelark?utm_campaign=hw&utm_content=all-api-hub&utm_medium=devrel_tool_web&utm_source=OWO&utm_term=all-api-hub">
      <img src="../../../resources/partners/volcengine_en.jpg" alt="Dola Seed on BytePlus ModelArk">
    </a>
    <p>
      <strong>Dola Seed on BytePlus ModelArk</strong> は ByteDance がグローバル市場向けに開発したフルモーダル汎用大規模モデルです。BytePlus ModelArk から、マルチモーダル理解と生成、エージェント協調、推論、ツール連携、コーディング機能を利用できます。<a href="https://www.byteplus.com/en/product/modelark?utm_campaign=hw&utm_content=all-api-hub&utm_medium=devrel_tool_web&utm_source=OWO&utm_term=all-api-hub">BytePlus ModelArk のリンク</a>から登録すると、各モデルにつき 500,000 トークン分の無料推論枠を受け取れます。
    </p>
  </section>

  <hr>
</div>

## 互換性はあるが公開資料が少ないバリアント

以下の互換性のあるタイプは、現在プラグインのサポート範囲内ですが、公開された公式資料は比較的限られています。通常、プライベートデプロイメント、クローズドソースブランチ、または特定のサイトのブランド化バージョンで見られます。

- `Neo-API`
- `RIX_API`

これらのシステムには安定した公開ホームページがないため、ここに追加のリンクは記載しません。利用可能かどうかは、通常、ターゲットサイトが一般的な互換性のあるバージョンであるかどうかに依存します。

## 接続して引き続き管理できるカスタムバックエンド

ご自身でバックエンドシステムを構築している場合、All API Hub は現在のサイトを、選択したバックエンドにインポートして、後続の管理を容易にすることもサポートしています。

| バックエンドシステム                              | サイト紹介                                                                                                                                                                                          | 公式リンク                                                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| [CLIProxyAPI](./cliproxyapi-integration.md)       | Gemini CLI、Antigravity、ChatGPT Codex、Claude Code、Qwen Code、iFlow を OpenAI / Gemini / Claude / Codex と互換性のある API サービスにラップします。                                             | [ドキュメント](https://help.router-for.me/) / [GitHub](https://github.com/router-for-me/CLIProxyAPI) |
| New API                                           | 統一された AI モデル集約および配布センター。                                                                                                                                                      | [公式サイト](https://www.newapi.ai/) / [GitHub](https://github.com/QuantumNous/new-api)              |
| Sub2API                                           | Sub2API-CRS2 ワンストップオープンソースプロキシサービス。Claude、OpenAI、Gemini、Antigravity のサブスクリプションを統一的に接続し、共同利用とネイティブツールに対応します。                       | [GitHub](https://github.com/Wei-Shaw/sub2api)                                                        |
| AxonHub                                           | オープンソース AI Gateway。任意の SDK を通じて 100 以上の LLM を呼び出すことができ、フェイルオーバー、ロードバランシング、コスト管理、およびエンドツーエンドの追跡が組み込まれています。          | [公式サイト](https://axonhub.onrender.com/) / [GitHub](https://github.com/looplj/axonhub)            |
| Claude Code Hub                                   | チーム向けのマルチベンダー AI API プロキシおよび運用プラットフォーム。Claude、OpenAI Compatible、Codex、Gemini を統一的に統合し、弾力的なスケジューリング、監視、および価格管理をサポートします。 | [GitHub](https://github.com/ding113/claude-code-hub)                                                 |
| Octopus                                           | 個人向けの LLM API 集約サービス。                                                                                                                                                                 | [GitHub](https://github.com/bestruirui/octopus)                                                      |
| [OmniRoute](./omniroute-integration.md)           | セルフホストの AI ゲートウェイ。多数の provider を内蔵し、スコープ付きアクセストークンと接続単位の上流アドレス上書きに対応します。                                                                | [GitHub](https://github.com/diegosouzapw/OmniRoute)                                                  |
| [gpt-load](./gpt-load-integration.md)             | 軽量なセルフホスト AI ゲートウェイ（Go 製）。グループはチャンネルドライバとキープールで構成されます。                                                                                             | [GitHub](https://github.com/tbphp/gpt-load)                                                          |
| Magpie | Codex や Claude Code などの AI コーディングツール向けに、メニューバーからモデルを切り替えられるモデルゲートウェイ。 | [GitHub](https://github.com/yetone/magpie)                                                           |
| Veloera                                           | このプロジェクトはメンテナンスを停止しました。                                                                                                                                                    | [GitHub](https://github.com/Veloera/Veloera)                                                         |
| DoneHub                                           | このプロジェクトは one-hub をベースに二次開発されました。                                                                                                                                         | [GitHub](https://github.com/deanxv/done-hub)                                                         |

## 関連ドキュメント

- [サポートされているエクスポートツールのリスト](./supported-export-tools.md)
- [スポンサー設定ガイド](./sponsor-guides.md)
- [サイト構成のエクスポートを迅速に行う](./quick-export.md)
- [セルフホスト型サイト管理](./self-hosted-site-management.md)
- [セルフホスト型サイトモデル同期](./managed-site-model-sync.md)
