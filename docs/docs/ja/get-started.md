# 使用開始

New APIなどのAIハブアカウントの管理体験を最適化するために設計されたオープンソースのブラウザ拡張機能です。ユーザーは、アカウント残高、モデル、キーを一元的に管理・確認でき、新しいサイトを自動で追加できます。モバイルデバイスでは、Kiwiまたはモバイル版Firefoxブラウザ経由での使用をサポートしています。

## 1. ダウンロード

### チャネルごとのバージョン比較

| チャネル | ダウンロードリンク | 現在のバージョン |
|------|----------|----------|
| GitHub Release | [Release ダウンロード](https://github.com/qixing-jk/all-api-hub/releases) | ![GitHub version](https://img.shields.io/github/v/release/qixing-jk/all-api-hub?label=GitHub&logo=github&style=flat) |
| Chrome ストア | [Chrome ストア](https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo) | ![Chrome version](https://img.shields.io/chrome-web-store/v/lapnciffpekdengooeolaienkeoilfeo?label=Chrome&logo=googlechrome&style=flat) |
| Edge ストア | [Edge ストア](https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa) | ![Edge version](https://img.shields.io/badge/dynamic/json?label=Edge&prefix=v&query=%24.version&url=https%3A%2F%2Fmicrosoftedge.microsoft.com%2Faddons%2Fgetproductdetailsbycrxid%2Fpcokpjaffghgipcgjhapgdpeddlhblaa&logo=microsoftedge&style=flat) |
| Firefox ストア | [Firefox ストア](https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24}) | ![Firefox version](https://img.shields.io/amo/v/%7Bbc73541a-133d-4b50-b261-36ea20df0d24%7D?label=Firefox&logo=firefoxbrowser&style=flat) |

::: warning 注意
ストアバージョンは審査プロセスにより1〜3日遅延することがあります。新機能や修正をいち早く体験したい場合は、GitHub Releaseバージョンを優先するか、リポジトリのソースコードからビルドすることをお勧めします。
:::

## 2. サポートされているサイト

以下のプロジェクトに基づいてデプロイされたハブをサポートしています：
- [one-api](https://github.com/songquanpeng/one-api)
- [new-api](https://github.com/QuantumNous/new-api)
- [Veloera](https://github.com/Veloera/Veloera)
- [one-hub](https://github.com/MartialBE/one-hub)
- [done-hub](https://github.com/deanxv/done-hub)
- [VoAPI](https://github.com/VoAPI/VoAPI)
- [Super-API](https://github.com/SuperAI-Api/Super-API)

::: warning
サイトが二次開発され、一部の重要なAPI（例：`/api/user`）が変更されている場合、拡張機能がそのサイトを正常に追加できない可能性があります。
:::

## 3. サイトの追加

::: info ヒント
拡張機能の自動認識機能がCookieを通じてアカウントの[アクセストークン](#manual-addition)を取得できるように、事前にブラウザで目的のハブにログインしておく必要があります。
:::

### 3.1 自動認識による追加

1. 拡張機能のメインページを開き、`アカウント追加`をクリックします

![新增账号](./static/image/add-account-btn.png)

2. ハブのアドレスを入力し、`自動認識`をクリックします

![自动识别](./static/image/add-account-dialog-btn.png)

3. 自動認識が正しいことを確認したら、`追加を確定`をクリックします

::: info ヒント
拡張機能は、以下のようなアカウントの様々な情報を自動で認識します：
- ユーザー名
- ユーザーID
- [アクセストークン](#manual-addition)
- チャージ金額の比率
:::

> ターゲットサイトがCloudflareの5秒シールドを有効にしている場合、拡張機能はシールド解除を助けるために独立したウィンドウを自動でポップアップします。通過後、認識プロセスを続行できます。
> IPの品質が悪い、またはその他の理由がある場合は、タイムアウト前にポップアップウィンドウで手動でシールド解除を完了する必要があります。

### 3.2 Cloudflare シールド解除アシスタントの概要

- Cloudflareの5秒シールドが認識された場合、拡張機能は自動的に一時的なウィンドウを立ち上げ、検証完了を支援します。チャレンジに手動介入が必要な場合は、ポップアップ内で検証をクリックしてください。
- 検証が通過すると、自動的に元のプロセスに戻り、Access Tokenとサイト情報の取得を続行します。
- 詳細については、[Cloudflare保護と一時ウィンドウへのダウングレード](#cloudflare-window-downgrade)を参照してください。

<a id="manual-addition"></a>
### 3.3 手動追加

::: info ヒント
自動認識が成功しなかった場合、手動でサイトアカウントを追加できます。以下の情報を事前に取得する必要があります。（サイトによってUIが異なる場合があるため、ご自身で探してください）
:::
![用户信息](./static/image/site-user-info.png)

ターゲットサイトがカスタムバージョン（例：AnyRouter）である場合は、アカウント追加時に手動で **Cookie モード**に切り替えてから、自動認識または手動入力を実行してください。厳格な保護が施されているサイトに遭遇した場合は、Cloudflareシールド解除アシスタントと組み合わせて使用することもできます。詳細については、[よくある質問](./faq.md#anyrouter-error)を参照してください。

<a id="quick-export-sites"></a>
## 4. サイトの迅速なエクスポート

この拡張機能は、追加済みのサイトAPI設定を[CherryStudio](https://github.com/CherryHQ/cherry-studio)、[CC Switch](https://github.com/ccswitch/ccswitch)、および[New API](https://github.com/QuantumNous/new-api)へワンクリックでエクスポートすることをサポートしており、これらのプラットフォームでアップストリームプロバイダーを追加するプロセスを簡素化します。

### 4.1 設定

迅速なエクスポート機能を使用する前に、拡張機能の **基本設定** ページで、ターゲットプラットフォーム（New API）の **サーバーアドレス**、**管理者トークン**、および **ユーザーID**を設定する必要があります。

### 4.2 エクスポートプロセス

1. **キー管理への移動**：拡張機能の **キー管理** ページで、エクスポートしたいサイトに対応する API キーを見つけます。
2. **エクスポートをクリック**：キー操作メニューで、**「CherryStudio / CC Switch / New APIへエクスポート」**を選択します。
3. **自動処理**：
   * **New APIの場合**：拡張機能は、ターゲットプラットフォームに同じ `Base URL` を持つチャネルが既に存在するかどうかを自動で検出し、重複追加を防ぎます。存在しない場合は、新しいチャネルを作成し、サイト名、`Base URL`、APIキー、および利用可能なモデルリストを自動で入力します。
   * **CherryStudio / CC Switchの場合**：拡張機能は、ターゲットアプリケーションのプロトコルに従って、サイトとキーをローカルプログラムまたはクリップボードに直接送信し、項目ごとの貼り付けの手間を省きます。

この機能により、APIプロバイダーの設定を他のプラットフォームに簡単にインポートでき、手動でのコピー＆ペーストが不要となり、作業効率が向上します。

## 5. 機能の概要

### 5.1 自動更新とヘルスステータス

- **設定 → 自動更新**を開くと、アカウントデータの定期的な更新を有効にできます。デフォルトの間隔は6分（360秒）で、最短60秒をサポートしています。
- **「拡張機能を開いたときに自動更新」**にチェックを入れると、ポップアップを開いたときにデータを同期できます。
- **「ヘルスステータスを表示」**を有効にすると、アカウントカードにヘルスステータスインジケーター（正常/警告/エラー/不明）が表示されます。

### 5.2 チェックイン検出

- アカウント情報で **「チェックイン検出を有効にする」** にチェックを入れると、サイトのチェックインステータスを追跡できます。
- カスタムサイトに対応するため、**カスタムチェックイン URL** と **カスタムチャージ URL** の設定をサポートしています。
- チェックインが必要なアカウントはリストにヒントが表示され、クリックするとチェックインページにジャンプできます。

### 5.3 WebDAV バックアップとマルチデバイス同期

- **設定 → WebDAV バックアップ**に進み、WebDAVアドレス、ユーザー名、パスワードを設定します。
- 同期ポリシー（マージ/アップロードのみ/ダウンロードのみ）を選択し、自動同期間隔を設定できます。
- JSONインポート/エクスポートと組み合わせて、二重バックアップを実現することをお勧めします。

### 5.4 ソート優先度

- **設定 → ソート優先度設定**でアカウントのソートロジックを調整します。
- 現在のサイト、ヘルスステータス、チェックイン要件、カスタムフィールドなどの条件を組み合わせて並べ替えることをサポートしています。
- ドラッグ＆ドロップで優先度を調整でき、不要なソートルールはいつでも無効にできます。

### 5.5 データインポート/エクスポート

- **設定 → データとバックアップ**の「インポートとエクスポート」エリアで、現在すべての設定をJSONとしてワンクリックでエクスポートできます。
- 以前のバージョンや他のデバイスからエクスポートされたデータをインポートすることをサポートしており、迅速な移行や復元に便利です。

### 5.6 New API モデルリスト同期

New APIモデルリスト同期機能の詳細なドキュメントについては、[New API モデルリスト同期](./new-api-model-sync.md)を参照してください。

### 5.7 New API チャネル管理（Beta）

拡張機能内で直接チャネルの作成/編集/削除を行い、モデルホワイトリストやシングルチャネル同期デバッグと組み合わせることで、New APIのバックエンドを行き来する頻度を大幅に減らすことができます。詳細な操作と注意事項については、[New API チャネル管理](./new-api-channel-management.md)を参照してください。

<a id="cloudflare-window-downgrade"></a>
### 5.8 Cloudflare 保護と一時ウィンドウへのダウングレード

- 認識またはAPI呼び出しがCloudflareによってブロックされた場合（一般的なステータスコード 401/403/429）、自動的に一時ウィンドウに切り替えて再試行し、ターゲットドメインのCookieを保持します。通常、手動操作は不要です。原理の詳細については、[Cloudflare シールド解除アシスタント](./cloudflare-helper.md)を参照してください。
- CAPTCHAが必要なシナリオに遭遇した場合は、ポップアップ表示されたアシスタントウィンドウでチャレンジを完了してください。頻繁に失敗する場合は、ネットワークを変更するか、リクエスト頻度を下げることを試みてください。

## 6. 詳細ドキュメント

- [Cloudflare シールド解除アシスタント](./cloudflare-helper.md)
- [サイト設定の迅速なエクスポート](./quick-export.md)
- [自動更新とリアルタイムデータ](./auto-refresh.md)
- [自動チェックインとチェックイン監視](./auto-checkin.md)
- [WebDAV バックアップと自動同期](./webdav-sync.md)
- [データインポート/エクスポート](./data-management.md)
- [New API モデルリスト同期](./new-api-model-sync.md)
- [New API チャネル管理](./new-api-channel-management.md)
- [CLIProxyAPI 統合](./cliproxyapi-integration.md)
- [モデルリダイレクト](./model-redirect.md)
- [ソート優先度設定](./sorting-priority.md)
- [権限管理（オプションの権限）](./permissions.md)

## 7. よくある質問とサポート

- 認証方法、AnyRouterへの対応、機能の使用ヒントなど、より詳細な [よくある質問](./faq.md) を確認してください。
- 問題が発生した場合や新機能が必要な場合は、[GitHub Issues](https://github.com/qixing-jk/all-api-hub/issues)にてフィードバックをお願いします。
- 過去の更新履歴については、[更新履歴](https://github.com/qixing-jk/all-api-hub/blob/main/CHANGELOG.md)をご覧ください。

::: tip 次のステップ
基本設定が完了したら、自動更新、チェックイン検出、またはWebDAV同期を引き続き設定し、より完全な使用体験を得ることができます。
:::