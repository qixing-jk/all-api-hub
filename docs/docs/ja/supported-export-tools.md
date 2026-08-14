# サポートされているエクスポートツールリスト

> クライアント、CLI ツール、または独自のバックエンドで既に API を使用している場合、All API Hub はサイト設定をより迅速に移行するのに役立ち、`Base URL`、`API Key`、モデル名の再入力を減らすことができます。

## 一般的なクライアントとツール

| 製品 | 公式説明 | 公式リンク |
|------|----------|----------|
| Cherry Studio | AI 生産性スタジオ。スマート対話、自律エージェント、300 以上のヘルパーを提供し、最先端の大規模モデルへの統一アクセスを実現します。 | [公式サイト](https://www.cherry-ai.com/) / [GitHub](https://github.com/CherryHQ/cherry-studio) |
| Kelivo | モバイルとデスクトップに対応した Flutter 製の大規模言語モデルチャットクライアント。 | [GitHub](https://github.com/Chevey339/kelivo) |
| CC Switch | Claude Code、Codex、OpenCode、openclaw、Gemini CLI 向けのクロスプラットフォームデスクトップ統合アシスタント。 | [GitHub](https://github.com/farion1231/cc-switch) |
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
