# サポートされているエクスポートツールリスト

> クライアント、CLI ツール、または独自のバックエンドで既に API を使用している場合、All API Hub はサイト設定をより迅速に移行するのに役立ち、`Base URL`、`API Key`、モデル名の再入力を減らすことができます。

## 一般的なクライアントとツール

| 製品 | 公式説明 | 公式リンク |
|------|----------|----------|
| Cherry Studio | AI 生産性スタジオ。スマート対話、自律エージェント、300 以上のヘルパーを提供し、最先端の大規模モデルへの統一アクセスを実現します。 | [公式サイト](https://www.cherry-ai.com/) / [GitHub](https://github.com/CherryHQ/cherry-studio) |
| Kelivo | モバイルとデスクトップに対応した Flutter 製の大規模言語モデルチャットクライアント。 | [GitHub](https://github.com/Chevey339/kelivo) |
| CC Switch | Claude Code、Codex、Gemini CLI、Grok CLI、Hermes、OpenCode、OpenClaw 向けのクロスプラットフォームデスクトップ統合アシスタント。 | [GitHub](https://github.com/farion1231/cc-switch) |
| Cursor++ | 自分の API キーを使用して、Cursor で Anthropic、OpenAI、Gemini などのモデルを利用できます。 | [公式サイト](https://ccursor.cometix.dev/) |
| Kilo Code | Kilo は、統合されたエージェンティブエンジニアリングプラットフォームです。 | [公式サイト](https://kilocode.ai/) / [GitHub](https://github.com/Kilo-Org/kilocode) |
| Roo Code | Roo Code は、AI 開発チーム全体をコードエディタに直接配置します。 | [公式サイト](https://roocode.com/) / [GitHub](https://github.com/RooCodeInc/Roo-Code) |
| CLIProxyAPI | Gemini CLI、Antigravity、ChatGPT Codex、Claude Code、Qwen Code、iFlow を OpenAI / Gemini / Claude / Codex と互換性のある API サービスにラップします。 | [ドキュメント](https://help.router-for.me/) / [GitHub](https://github.com/router-for-me/CLIProxyAPI) |
| Claude Code Router | Claude Code をコーディングインフラストラクチャとして使用し、Anthropic の最新情報を継続的に取得しながら、モデルとの対話を自分で決定できるようにします。 | [公式サイト](https://musistudio.github.io/claude-code-router/) / [GitHub](https://github.com/musistudio/claude-code-router) |

## Kelivo モバイルへのエクスポート

アカウントキーまたは API 認証情報の操作メニューから「Kelivo モバイルへエクスポート」を選択します。ダイアログにはプロトコル、プロバイダー名、API キー、Base URL があらかじめ入力され、コピーする前に各項目を確認・編集できます。次に Kelivo モバイルのプロバイダー管理でインポートを選び、ダイアログの QR コードをスキャンするか、コピーしたモバイル用インポートコードをテキストボックスに貼り付けます。アカウントキー自体に固定のプロトコルはないため、初期値は OpenAI Compatible です。必要に応じて Anthropic または Google に変更できます。

Kelivo の PC 版には現在プロバイダーのインポート機能がなく、QR コードやインポートコードは使用できません。PC 版で利用する場合は、ダイアログに表示されたプロトコル、プロバイダー名、API キー、Base URL を使ってプロバイダーを手動で追加してください。

インポートコードに含まれるのは、プロバイダー名、API キー、プロバイダー種別、および該当する場合の Base URL だけです。モデル一覧、カスタムリクエストヘッダー、その他の All API Hub 設定は含まれません。OpenAI Compatible と Anthropic では、ダイアログに表示された Base URL がそのままエクスポートされます。Google プロバイダーは公式 API アドレスのみをサポートするため、Google を選ぶとアドレスが固定されます。別のプロトコルに戻すと、以前入力した Base URL が復元されます。

Kelivo は OpenAI Responses にも対応していますが、現在の `ai-provider:v1` インポートコードには Responses の設定が保存されません。`openai` タイプとしてインポートしたプロバイダーは、必ず OpenAI Compatible で開始します。Responses を使用する場合は、インポート完了後に Kelivo のプロバイダー設定で有効にしてください。

::: warning インポート内容を保護してください
QR コードと Kelivo モバイル用インポートコードには、API キーが平文で含まれます。スクリーンショットを共有したり、公開チャット、Issue、ログ、リポジトリへ貼り付けたりしないでください。
:::

## Cursor++ へのエクスポート

アカウントキーの操作メニューから「Cursor++ プロバイダー設定をエクスポート」を選択します。All API Hub は OpenAI 互換のモデル一覧を読み込み、Cursor++ 0.0.13 で使用する `provider` オブジェクトを生成します。このオブジェクトには、安定したプロバイダー ID、名前、`baseUrl`、API キー認証情報、および `defaultOn: true` が設定されたモデル一覧が含まれます。

エクスポート前に、検出されたモデルを検索・削除したり、複数のモデル ID を入力または貼り付けたりできます。初期値にはアカウントの既存の OpenAI 互換アドレスが使用されます。選択したネイティブプロトコルが別のパスを使用する場合は、プロバイダーの Base URL を直接編集できます。

Cursor++ は現在、次のプロトコルタイプに対応しています：

- **OpenAI Chat Completions**（デフォルト）：`type: "openai-chat"` をエクスポートします。
- **OpenAI Responses**：`type: "openai-responses"` をエクスポートします。
- **Anthropic Messages**：`type: "anthropic"` をエクスポートします。
- **Gemini**：`type: "gemini"` をエクスポートします。

プロトコルの選択によって変わるのは、Cursor++ がプロバイダーを呼び出す方法だけです。All API Hub のモデル検出では、引き続きアカウントの既存の OpenAI 互換モデルエンドポイントを使用し、対応するネイティブプロトコルのエンドポイントを自動検証することはありません。

コピー後、Cursor++ で **Edit Providers Config** を開き、`~/.ccursor/providers.json` の `providers` 配列にこのオブジェクトを追加します。コピーされるのは単一の `provider` であり、設定ファイル全体を上書きまたは置き換えるものではありません。モデル検出に失敗した場合や空の一覧が返された場合は、1 つ以上のモデル ID を手動で追加してからコピーできます。

::: warning コピー内容を保護してください
エクスポートされる JSON には API キーが平文で含まれます。公開チャット、Issue、ログ、リポジトリには貼り付けないでください。
:::

## Kilo Code / Roo Code へのエクスポート

### Kilo Code 7.x

Kilo Code 7.x を選択すると、各アカウントキーまたは API 認証情報が、わかりやすい名前の `provider` としてエクスポートされます。各 `provider` には、対応するエンドポイントから検出・正規化されたすべてのモデル ID と、そのプロバイダー用に手動で入力して保持したモデル ID が含まれます。エクスポートに含まれていても、All API Hub がそのモデルをすべてのワークフローで利用できると検証したことにはなりません。まずデフォルトの `model` を選択し、複数のプロバイダーをエクスポートする場合はデフォルトの `provider` も選択してください。

各 `provider` では、次の API プロトコルを選択できます：

- **OpenAI Compatible**（デフォルト）：`@ai-sdk/openai-compatible` をエクスポートします。
- **OpenAI Responses**：`@ai-sdk/openai` をエクスポートします。
- **Anthropic Messages**：`@ai-sdk/anthropic` をエクスポートします。

プロトコルの選択によって変わるのは、Kilo Code が使用する AI SDK プロバイダーパッケージだけです。All API Hub は既存のモデル検出フローを維持し、読み込まれた結果をすべてエクスポートします。Anthropic Messages を選択しても、モデル検出を省略したり、モデル ID を書き換えたり、未検証のモデルメタデータを追加したりすることはありません。

次の 2 つの方法から選択できます：

- **設定ファイルをダウンロード**：「Kilo 7.x 設定をダウンロード」を選択し、Kilo Code の Settings → About Kilo Code → Import でダウンロードした `kilo-settings.json` を選び、内容を確認して保存します。このファイルは、現在の Kilo Code のインポートフローでそのまま使用できます。
- **設定をコピー**：「プロバイダー設定をコピー」を選択すると、トップレベルの `{ provider, model }` 断片がコピーされます。この 2 つのフィールドを、既存の設定 JSON にある同名のトップレベルフィールドへマージしてください。この断片だけでは完全なインポートファイルになりません。

Kilo Code の設定インポート上限は現在 1 MiB です。ファイルが上限を超える場合、単一の API 認証情報は設定をコピーして手動でマージしてください。アカウントキーの一括エクスポートでは、選択するプロバイダーを減らすか、設定をコピーして手動でマージできます。

::: tip インポート後に API キーフィールドが空に見える場合があります
インライン API キーを含む設定をインポートしても、Kilo Code のプロバイダー編集画面では API キーフィールドが空のまま表示されることがあります。これは現在の UI の制限であり、エクスポートの失敗ではありません。インポートされたインラインキーと編集画面の認証状態は別々に保存され、実行時には引き続きキーを利用できます。
:::

### 旧バージョンの Roo Code / Kilo Code 5.x

旧形式では、設定ごとに 1 つのモデルだけをエクスポートします。「旧版 apiConfigs をコピー」を選択した後、コピーした内容を設定の `providerProfiles.apiConfigs` にマージしてください。完全な設定ファイルを使う場合は `kilo-code-settings.json` をダウンロードし、対応するバージョンの設定インポート機能を使用します。

## カスタムバックエンド / 管理パネル

独自の AI プロキシまたは集約バックエンドを構築している場合でも、All API Hub は現在のサイトを直接選択したバックエンドターゲットにインポートできます。

| 製品 | 公式説明 | 公式リンク |
|------|----------|----------|
| New API | 統合された AI モデル集約および配布センター。 | [公式サイト](https://www.newapi.ai/) / [GitHub](https://github.com/QuantumNous/new-api) |
| AxonHub | オープンソース AI Gateway。任意の SDK を介して 100 以上の LLM を呼び出すことができ、フェイルオーバー、ロードバランシング、コスト管理、およびエンドツーエンドの追跡が組み込まれています。 | [公式サイト](https://axonhub.onrender.com/) / [GitHub](https://github.com/looplj/axonhub) |
| Claude Code Hub | チーム向けのマルチベンダー AI API プロキシおよび運用プラットフォーム。Claude、OpenAI Compatible、Codex、Gemini への統一アクセスを提供し、弾力的なスケジューリング、監視、価格設定をサポートします。 | [GitHub](https://github.com/ding113/claude-code-hub) |
| Octopus | 個人向けの LLM API 集約サービス。 | [GitHub](https://github.com/bestruirui/octopus) |
| Veloera | このプロジェクトはメンテナンスを停止しました。 | [GitHub](https://github.com/Veloera/Veloera) |
| DoneHub | このプロジェクトは one-hub をベースに二次開発されました。 | [GitHub](https://github.com/deanxv/done-hub) |

## 関連ドキュメント

- [サポートされているサイトリスト](./supported-sites.md)
- [サイト設定のエクスポートを迅速化](./quick-export.md)
- [CLIProxyAPI の統合](./cliproxyapi-integration.md)
- [セルフホスト型サイト管理](./self-hosted-site-management.md)
