# 開始する

New APIなどのAIハブアカウントの管理体験を最適化するために設計された、オープンソースのブラウザ拡張機能です。ユーザーはアカウント残高、モデル、およびキーを簡単に一元管理・確認でき、新しいサイトを自動的に追加できます。モバイルデバイスではKiwiまたはモバイル版Firefoxブラウザを通じて使用できます。

## 1. ダウンロード

### チャネルバージョンの比較

| チャネル | ダウンロードリンク | 現在のバージョン |
|------|----------|----------|
| GitHub Release | [Release ダウンロード](https://github.com/qixing-jk/all-api-hub/releases) | ![GitHub version](https://img.shields.io/github/v/release/qixing-jk/all-api-hub?label=GitHub&logo=github&style=flat) |
| Chromeストア | [Chrome 商店](https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo) | ![Chrome version](https://img.shields.io/chrome-web-store/v/lapnciffpekdengooeolaienkeoilfeo?label=Chrome&logo=googlechrome&style=flat) |
| Edgeストア | [Edge 商店](https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa) | ![Edge version](https://img.shields.io/badge/dynamic/json?label=Edge&prefix=v&query=%24.version&url=https%3A%2F%2Fmicrosoftedge.microsoft.com%2Faddons%2Fgetproductdetailsbycrxid%2Fpcokpjaffghgipcgjhapgdpeddlhblaa&logo=microsoftedge&style=flat) |
| Firefoxストア | [Firefox 商店](https://addons.mozilla.org/firefox/addon/%E4%B8%AD%E8%BD%AC%E7%AB%99%E7%AE%A1%E7%90%86%E5%99%A8-all-api-hub/) | ![Firefox version](https://img.shields.io/amo/v/%7Bbc73541a-133d-4b50-b261-36ea20df0d24%7D?label=Firefox&logo=firefoxbrowser&style=flat) |

::: warning ヒント
ストア版は審査プロセスにより1〜3日遅延する場合があります。新機能や修正をいち早く体験したい場合は、GitHub Release版を優先的に使用するか、リポジトリのソースコードからビルドすることをお勧めします。
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
サイトが二次開発され、一部の重要なAPI（例：`/api/user`）が変更された場合、拡張機能はこのサイトを正常に追加できない可能性があります。
:::

## 3. サイトの追加

::: info ヒント
まずブラウザで目的のハブにログインする必要があります。これにより、拡張機能の自動認識機能がCookieを通じてあなたのアカウントの[アクセストークン(Access Token)](#_3-2-手动添加)を取得できます。
:::

### 3.1 自動認識による追加

1. 拡張機能のメインページを開き、「`アカウント追加`」をクリックします。

![新增账号](../static/image/add-account-btn.png)

2. ハブのアドレスを入力し、「`自動認識`」をクリックします。

![自动识别](../static/image/add-account-dialog-btn.png)

3. 自動認識が正しいことを確認した後、「`追加を確定`」をクリックします。

::: info ヒント
拡張機能はあなたのアカウントのさまざまな情報を自動的に認識します。例えば：
- ユーザー名
- ユーザーID
- [アクセストークン(Access Token)](#_3-2-手动添加)
- チャージ金額比率
:::

### 3.2 手動追加

::: info ヒント
自動認識が成功しなかった場合、手動でサイトアカウントを追加できます。その際、以下の情報を事前に取得する必要があります。（各サイトのUIは異なる場合があるため、ご自身で探してください）
:::
![用户信息](../static/image/site-user-info.png)

ターゲットサイトがカスタマイズバージョン（例：AnyRouter）の場合、アカウント追加時に手動で**Cookieモード**に切り替えてから、自動認識または手動入力を実行してください。詳細は[よくある質問](./faq.md#anyrouter-网站报错怎么办)をご覧ください。

## 4. サイトの高速エクスポート

この拡張機能は、追加済みのサイトAPI設定を[CherryStudio](https://github.com/CherryHQ/cherry-studio)と[New API](https://github.com/QuantumNous/new-api)にワンクリックでエクスポートすることをサポートしており、これらのプラットフォームでアップストリームプロバイダーを追加するプロセスを簡素化します。

### 4.1 設定

高速エクスポート機能を使用する前に、拡張機能の**基本設定**ページで、ターゲットプラットフォーム（New API）の**サーバーアドレス**、**管理者トークン**、および**ユーザーID**を設定する必要があります。

### 4.2 エクスポート手順

1. **キー管理へ移動**：拡張機能の**キー管理**ページで、エクスポートしたいサイトに対応するAPIキーを見つけます。
2. **エクスポートをクリック**：キー操作メニューで、**「CherryStudioへエクスポート」**または**「New APIへエクスポート」**を選択します。
3. **自動処理**：
   * **New APIの場合**：拡張機能は、ターゲットプラットフォームに同じ`Base URL`のチャネルが既に存在するかどうかを自動的に検出し、重複追加を回避します。存在しない場合は、新しいチャネルを作成し、サイト名、`Base URL`、APIキー、および利用可能なモデルリストを自動的に入力します。
   * **CherryStudioの場合**：拡張機能はサイトとキーの情報を、ローカルのCherryStudioプログラムに直接送信します。

この機能により、APIプロバイダーの設定を他のプラットフォームに簡単にインポートでき、手動でのコピー＆ペーストが不要になり、作業効率が向上します。

## 5. 機能概要

### 5.1 自動更新とヘルスステータス

- **設定 → 自動更新**を開くと、アカウントデータの定期的な更新を有効にできます。デフォルトの間隔は6分（360秒）で、最短60秒をサポートしています。
- **「拡張機能を開いたときに自動更新」**にチェックを入れると、ポップアップを開いたときにデータが同期されます。
- **「ヘルスステータスを表示」**を有効にすると、アカウントカードにヘルスステータスインジケーター（正常/警告/エラー/不明）が表示されます。

### 5.2 チェックイン検出

- アカウント情報で**「チェックイン検出を有効にする」**にチェックを入れると、サイトのチェックインステータスを追跡できます。
- **カスタムチェックインURL**と**カスタムチャージURL**の設定をサポートし、カスタマイズされたサイトにも対応します。
- チェックインが必要なアカウントはリストにヒントが表示され、クリックするとチェックインページにジャンプできます。

### 5.3 WebDAVバックアップとマルチデバイス同期

- **設定 → WebDAVバックアップ**に進み、WebDAVアドレス、ユーザー名、パスワードを設定します。
- 同期ポリシー（マージ/アップロードのみ/ダウンロードのみ）を選択し、自動同期間隔を設定できます。
- JSONのインポート/エクスポートと組み合わせて、二重バックアップを実現することをお勧めします。

### 5.4 ソート優先順位

- **設定 → ソート優先順位設定**でアカウントのソートロジックを調整します。
- 現在のサイト、ヘルスステータス、チェックイン要件、カスタムフィールドなどの条件を組み合わせて並べ替えることをサポートします。
- ドラッグ＆ドロップで優先順位を調整でき、不要なソートルールはいつでも無効にできます。

### 5.5 データインポート/エクスポート

- **設定 → データ管理**で、現在のアカウント設定をすべてJSONとしてワンクリックでエクスポートできます。
- 旧バージョンや他のデバイスからエクスポートされたデータのインポートをサポートし、迅速な移行や復元に便利です。

### 5.6 New APIモデルリスト同期

New APIモデルリスト同期機能の詳細については、[New API モデルリスト同期](./new-api-model-sync.md)を参照してください。

## 6. よくある質問とサポート

- 認証方法、AnyRouterへの対応、機能の使用方法など、より詳細な[よくある質問](./faq.md)をご覧ください。
- 問題が発生した場合や新機能が必要な場合は、[GitHub Issues](https://github.com/qixing-jk/all-api-hub/issues)までフィードバックをお寄せください。
- 過去の更新履歴については、[更新履歴](https://github.com/qixing-jk/all-api-hub/blob/main/CHANGELOG.md)をご覧ください。

::: tip 次のステップ
基本設定が完了したら、自動更新、チェックイン検出、またはWebDAV同期を引き続き設定して、より完全な使用体験を得ることができます。
:::