# OpenRouter のアカウント、API Key、モデルを All API Hub で管理する

> OpenRouter の残高、API Key、モデル価格、クライアント設定を 1 か所で管理します。

**All API Hub** は、AI API ユーザー向けのオープンソースのブラウザー拡張機能です。OpenRouter と組み合わせることで、コンソールを何度も開き、API Key を探して同じ設定を複数のツールに入力する手間を減らせます。

OpenRouter を追加すると、残高とアカウント状態の確認、ワークスペースごとの API Key 管理、モデルと価格の確認、新しく作成した完全な API Key の保存と AI ツールでの利用ができます。

## OpenRouter ユーザーに便利な理由

複数の OpenRouter ワークスペース、AI API サービス、クライアントを使う場合、残高が分散し、API Key の整理やモデル価格の比較が難しくなり、同じ設定を何度も入力することになります。

- **残高と状態を確認**：OpenRouter と他の AI API アカウントを同じ画面で確認できます。
- **ワークスペースの API Key を管理**：API Key の表示、作成、編集、無効化、削除を 1 か所で行えます。
- **モデルと価格を比較**：OpenRouter のモデルを検索し、他のアカウントのモデル情報と比較できます。
- **完全な API Key を保存**：新しい Key の全体が表示されている間に API 認証情報ライブラリへ保存できます。
- **いつものツールをすばやく設定**：Cherry Studio、CC Switch、Kilo Code、Claude Code Router などへエクスポートできます。

おすすめの流れは、OpenRouter アカウントを自動で追加し、All API Hub で残高、API Key、モデルを管理して、AI ツールで使うときに保存済みの設定をコピーまたはエクスポートする方法です。

<a id="choose-access-path"></a>
## 推奨する追加順序

| 順序 | 追加方法 | 利用する場合 |
| --- | --- | --- |
| 1 | アカウントを自動追加 | OpenRouter にログイン済みで、すばやく追加したい場合 |
| 2 | アカウントを手動追加 | 自動追加が完了しない場合 |
| 3 | API Key だけを保存 | アカウント管理は不要で、既存の API Key を保存、確認、エクスポートしたい場合 |

::: tip Management Key と API Key の違い
Management Key はアカウント追加と OpenRouter 上の API Key 管理に使用します。API Key は AI クライアントに設定するキーです。自動追加では All API Hub が Management Key を作成するため、通常は事前準備は不要です。
:::

## 準備

1. All API Hub をインストールします。[ブラウザストア版](../get-started.md)を推奨します。
2. [OpenRouter](https://openrouter.ai/) に登録してログインします。
3. 完全な Management Key や API Key を公開スクリーンショット、Issue、チャットに含めないでください。

<a id="add-openrouter-account"></a>
## OpenRouter アカウントを自動で追加する

これが推奨する方法です。Management Key を事前に作成する必要はなく、All API Hub が追加中に作成します。

1. 同じブラウザで [OpenRouter](https://openrouter.ai/) にログインします。
2. All API Hub で `アカウントを追加` を選び、`https://openrouter.ai` を入力します。
3. `OpenRouter 管理キーを作成して検出` を選択します。
4. All API Hub が OpenRouter を開き、Management Key を自動で作成します。アカウント情報が戻るまでページを開いたままにしてください。
5. アカウント情報を確認して保存します。

![OpenRouter アカウントを自動で追加する](../../static/image/en/openrouter/add-account-auto-detect.png)

::: warning 再試行する前に確認してください
新しく開いたページが閉じた、タイムアウトした、または結果が戻らなかった場合は、すぐに再試行しないでください。先に [Management Keys](https://openrouter.ai/settings/management-keys) ページで All API Hub 用の Management Key が作成されていないか確認し、その後で再試行するか手動追加に切り替えてください。
:::

## 自動追加に失敗した場合は手動で追加する

1. OpenRouter の [Management Keys](https://openrouter.ai/settings/management-keys) ページを開きます。
2. All API Hub 用の Management Key を作成し、完全な値が表示されている間にコピーします。ページを離れると完全なキーは再表示できません。
3. All API Hub のアカウント追加ダイアログで `https://openrouter.ai` を入力し、手動追加に切り替えます。
4. サイトタイプに `OpenRouter` を選び、Management Key と画面に表示される残りの必須項目を入力します。
5. アカウントを保存します。キーを使用できない場合は、確認して再試行するよう画面に表示されます。

<a id="add-runtime-api-key"></a>
## アカウントを追加せず既存の API Key を保存する

残高、ワークスペース、OpenRouter 上のキー管理が不要な場合は、アカウントを追加せず既存の API Key を API 認証情報ライブラリに保存できます。

1. OpenRouter の [API Keys](https://openrouter.ai/settings/keys) ページで API Key を作成し、すぐにコピーします。以前に完全な値を安全に保存した既存のキーも使用できます。
2. All API Hub で `設定 → API 認証情報ライブラリ` を開き、認証情報を追加します。
3. 次の内容を入力します。
   - **名前**：例 `OpenRouter`。
   - **API タイプ**：`OpenAI 互換` を選択。
   - **Base URL**：`https://openrouter.ai/api/v1`。
   - **API Key**：用意した API Key。
4. 保存後、認証情報カードから利用できるモデルを確認し、API Key が使えるか確認したり、設定をコピー・エクスポートしたりできます。

この方法では、アカウント残高やワークスペースの表示、OpenRouter 上のキー管理はできません。後から必要になった場合は、前述の手順でアカウントを追加してください。

![OpenRouter API Key を API 認証情報ライブラリに保存する](../../static/image/en/openrouter/add-api-credential.png)

<a id="manage-openrouter-keys"></a>
## OpenRouter API Key をまとめて管理する

アカウント追加後、`設定 → キー管理` を開き、OpenRouter アカウントとワークスペースを選択します。次の操作ができます。

- 各キーが利用できるか確認し、上限、使用量、有効期限を見る。
- 必要に応じてワークスペース、使用上限、有効期限を設定してキーを作成する。
- キーを編集、無効化、再有効化する。
- 不要になったキーを完全に削除する。

![OpenRouter ワークスペースの API Key を管理する](../../static/image/en/openrouter/key-management.png)

### 新しいキーをすぐに保存する

OpenRouter が完全な API Key を表示するのは作成直後の一度だけです。

1. 一度限りのキー表示ダイアログを閉じないでください。
2. キーをコピーするか、API 認証情報ライブラリに保存します。
3. 保存後、モデル一覧の取得、API 検証、クライアントへのエクスポートに使用できます。

ダイアログを閉じた後、All API Hub は完全なキーを復元できません。保存しなかった場合は、そのキーを削除して作り直してください。

![新しく作成した OpenRouter API Key の完全な値を保存する](../../static/image/en/openrouter/save-one-time-key.png)

<a id="browse-openrouter-models"></a>
## OpenRouter モデルを確認・比較する

`設定 → モデル一覧` を開いて OpenRouter アカウントを選択すると、モデルを検索し、モデル名、モデル ID、価格、コンテキスト長、対応する入出力形式などを確認できます。

`すべてのアカウント` では、OpenRouter モデルを他のアカウントのモデルと並べて比較できます。

通常の OpenRouter API Key を API 認証情報ライブラリに保存した場合も、認証情報カードから利用できるモデルを確認し、その API Key が使えるか確認できます。

![OpenRouter のモデルと価格を確認する](../../static/image/en/openrouter/model-catalog.png)

## 管理から実際の利用まで

### よく使う AI ツールへエクスポートする

他のツールで OpenRouter を使う場合は、API 認証情報ライブラリに保存した設定を対応クライアントへエクスポートできます。Base URL、API Key、モデル情報を何度も入力する手間を減らせます。

### All API Hub と AI クライアントの役割

| | All API Hub | Cherry Studio、NextChat などの AI クライアント |
| --- | --- | --- |
| 主な用途 | アカウント、残高、API Key、モデル価格の管理 | チャット、コーディング支援、ファイル分析など |
| 連携方法 | OpenRouter の設定を整理してエクスポート | インポートした設定で OpenRouter に接続 |

OpenRouter はモデルと API サービスを提供します。All API Hub はアカウントと設定を整理し、チャット、コーディング支援、その他のモデル呼び出しは選択したクライアントが行います。

## 利用時の注意

- アカウントとキーは、既定では現在のブラウザに保存されます。WebDAV 同期を有効にした場合のみ、設定した WebDAV ストレージに同期されます。
- Management Key は All API Hub 専用に作成し、他のツールと共用しないことを推奨します。
- キー管理で編集または削除すると、OpenRouter 上のキーも変更されます。削除したキーは復元できません。
- 作成、編集、削除の結果がはっきりしない場合は、再試行する前に一覧を更新してください。
- 一部の個人ワークスペースではメンバーを選択できません。画面上で続行できる場合は、作成者を選択しなくても問題ありません。

## よくある問題

### Management Key を使用できないと表示されるのはなぜですか？

OpenRouter の Management Keys ページでキーがまだ存在するか確認してください。完全なキーを見つけたりコピーしたりできない場合は、新しく作成してアカウントを更新または再追加してください。

### ワークスペースは見えるのにキーを管理できないのはなぜですか？

現在のアカウントでは、そのワークスペースを管理できない可能性があります。選択したワークスペースと Management Key の権限を確認してください。

### ワークスペースメンバーを選択できないのはなぜですか？

個人またはデフォルトのワークスペースでは、メンバー一覧が表示されない場合があります。作成者は任意です。画面上で続行できる場合は、選択しないまま進めてください。

### 既存の API Key をコピーまたはエクスポートできないのはなぜですか？

OpenRouter は既存のキーの完全な値を再表示しません。作成時にコピーするか API 認証情報ライブラリへ保存した場合だけ、後からコピー、確認、エクスポートできます。

### API Key を保存してもアカウント管理に OpenRouter が表示されないのはなぜですか？

API 認証情報ライブラリは `Base URL + API Key` を保存するだけで、OpenRouter アカウントは追加しません。残高の確認や OpenRouter 上のキー管理には、前述の手順でアカウントを追加してください。

## OpenRouter の関連ページ

- [OpenRouter API Keys](https://openrouter.ai/settings/keys)
- [OpenRouter Management Keys](https://openrouter.ai/settings/management-keys)
- [Management Key ガイド](https://openrouter.ai/docs/guides/overview/auth/management-api-keys)

## 関連ドキュメント

- [サービス利用ガイド](../service-guides.md)
- [アカウント管理](../account-management.md)
- [API 認証情報ライブラリ](../api-credential-profiles.md)
- [キー管理](../key-management.md)
- [モデル一覧と価格比較](../model-list.md)
- [プライバシー](../privacy.md)
