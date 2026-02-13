# はじめに

New APIなどのAIハブアカウントの管理体験を最適化するために設計されたオープンソースのブラウザプラグインです。ユーザーは、アカウント残高、モデル、およびキーを簡単に一元管理・確認でき、新しいサイトを自動的に追加できます。Kiwiやモバイル版Firefoxブラウザを介して、モバイルデバイスでも使用可能です。

## 1. ダウンロード

### チャネルバージョンの比較

| チャネル | ダウンロードリンク | 現在のバージョン |
|------|----------|----------|
| GitHub Release | [Release ダウンロード](https://github.com/qixing-jk/all-api-hub/releases) | ![GitHub version](https://img.shields.io/github/v/release/qixing-jk/all-api-hub?label=GitHub&logo=github&style=flat) |
| Chrome 商店 | [Chrome 商店](https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo) | ![Chrome version](https://img.shields.io/chrome-web-store/v/lapnciffpekdengooeolaienkeoilfeo?label=Chrome&logo=googlechrome&style=flat) |
| Edge 商店 | [Edge 商店](https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa) | ![Edge version](https://img.shields.io/badge/dynamic/json?label=Edge&prefix=v&query=%24.version&url=https%3A%2F%2Fmicrosoftedge.microsoft.com%2Faddons%2Fgetproductdetailsbycrxid%2Fpcokpjaffghgipcgjhapgdpeddlhblaa&logo=microsoftedge&style=flat) |
| Firefox 商店 | [Firefox 商店](https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24}) | ![Firefox version](https://img.shields.io/amo/v/%7Bbc73541a-133d-4b50-b261-36ea20df0d24%7D?label=Firefox&logo=firefoxbrowser&style=flat) |

::: warning 提示
ストアバージョンは審査プロセスにより1〜3日遅延する場合があります。新機能や修正をいち早く体験したい場合は、GitHub Releaseバージョンを優先的に使用するか、リポジトリのソースコードからビルドすることをお勧めします。
:::

## 2. サポートされているサイト

以下のプロジェクトに基づいてデプロイされたハブをサポートしています。
- [one-api](https://github.com/songquanpeng/one-api)
- [new-api](https://github.com/QuantumNous/new-api)
- [Veloera](https://github.com/Veloera/Veloera)
- [one-hub](https://github.com/MartialBE/one-hub)
- [done-hub](https://github.com/deanxv/done-hub)
- [Sub2API](https://github.com/Wei-Shaw/sub2api)
- [VoAPI](https://github.com/VoAPI/VoAPI)
- [Super-API](https://github.com/SuperAI-Api/Super-API)

::: warning
サイトが二次開発され、一部の重要なインターフェース（例： `/api/user`）が変更されている場合、プラグインはこのサイトを正常に追加できない可能性があります。
:::

## 3. サイトの追加

::: info 提示
プラグインの自動認識機能がログイン情報を読み取り、アカウント情報を取得できるように、**まずブラウザを使用して対象ウェブサイトにログインする必要があります。**
:::

### 3.1 自動認識による追加

1. プラグインのメインページを開き、`新增账号` (アカウント新規追加) をクリックします。

![新增账号](./static/image/add-account-btn.png)

2. ハブのアドレスを入力し、`自动识别` (自動認識) をクリックします。

![自动识别](./static/image/add-account-dialog-btn.png)

3. 自動認識に誤りがないことを確認した後、`确认添加` (追加を確認) をクリックします。

::: info 提示
プラグインは、以下のようなアカウントのさまざまな情報を自動的に認識します。
- ユーザー名
- ユーザー ID
- [アクセス トークン (Access Token)](#manual-addition)
- チャージ金額の比率
:::

> 対象サイトで Cloudflare の5秒シールドが有効になっている場合、プラグインはシールドを通過するのを助けるために独立したウィンドウを自動的にポップアップします。通過後、認識プロセスを続行できます。
> IPの品質が悪い、またはその他の理由がある場合は、タイムアウトする前にポップアップウィンドウで手動でシールドを通過する必要があります。

### 3.2 Cloudflare シールド通過アシスタントの概要

- Cloudflare の5秒シールドが認識されると、プラグインは検証を完了させるために一時的なウィンドウを自動的に立ち上げます。チャレンジに手動での介入が必要な場合は、ポップアップ内で検証をクリックしてください。
- 検証が完了すると、自動的に元のプロセスに戻り、Access Tokenとサイト情報の取得を続行します。
- 詳細については、[Cloudflare 防護と一時ウィンドウのダウングレード](#cloudflare-window-downgrade)を参照してください。

<a id="manual-addition"></a>
### 3.3 手動追加

::: info 提示
自動認識が成功しなかった場合は、手動でサイトアカウントを追加できます。以下の情報を事前に取得する必要があります。（サイトによってUIが異なる場合があるため、ご自身で探してください）
:::
![ユーザー情報](./static/image/site-user-info.png)

対象サイトが改造バージョン（AnyRouterなど）である場合は、アカウントを追加する際に手動で **Cookie モード** に切り替えてから、自動認識または手動入力を実行してください。厳格な保護が施されたサイトに遭遇した場合は、Cloudflare シールド通過アシスタントと組み合わせて使用​​することもできます。詳細については、[よくある質問](./faq.md#anyrouter-error)を参照してください。

<a id="quick-export-sites"></a>
## 4. サイトのクイックエクスポート

本プラグインは、追加済みのサイトAPI設定を [CherryStudio](https://github.com/CherryHQ/cherry-studio)、[CC Switch](https://github.com/ccswitch/ccswitch)、および [New API](https://github.com/QuantumNous/new-api) へワンクリックでエクスポートすることをサポートしており、これらのプラットフォームでアップストリームプロバイダーを追加するプロセスを簡素化します。

### 4.1 設定

クイックエクスポート機能を使用する前に、プラグインの **基礎設定** ページで、対象プラットフォーム（New API）の **サーバーアドレス**、**管理者トークン**、および **ユーザー ID** を設定する必要があります。

### 4.2 エクスポート手順

1. **キー管理へのナビゲーション**：プラグインの **キー管理** ページで、エクスポートしたいサイトに対応する API キーを見つけます。
2. **エクスポートをクリック**：キー操作メニューで、**「CherryStudio / CC Switch / New APIへエクスポート」** を選択します。
3. **自動処理**：
   * **New APIの場合**：プラグインは、対象プラットフォームに同じ `Base URL` のチャネルが既に存在するかどうかを自動的に検出し、重複追加を防ぎます。存在しない場合は、新しいチャネルを作成し、サイト名、`Base URL`、APIキー、および利用可能なモデルリストを自動的に入力します。
   * **CherryStudio / CC Switchの場合**：プラグインは、対象アプリケーションのプロトコルに従って、サイトとキーをローカルプログラムまたはクリップボードに直接送信し、項目ごとの貼り付けの手間を省きます。

この機能により、APIプロバイダーの設定を他のプラットフォームに簡単にインポートでき、手動でのコピー＆ペーストが不要になり、作業効率が向上します。

## 5. 機能の概要

### 5.1 自動更新とヘルスステータス

- **設定 → 自動更新** を開き、アカウントデータの定期的な更新を有効にできます。デフォルトの間隔は6分（360秒）で、最短60秒をサポートしています。
- **「プラグインを開いたときに自動的に更新する」** にチェックを入れると、ポップアップを開いたときにデータが同期されます。
- **「ヘルスステータスを表示」** を有効にすると、アカウントカードにヘルスステータスインジケーター（正常/警告/エラー/不明）が表示されます。

### 5.2 チェックイン検出

- アカウント情報で **「チェックイン検出を有効にする」** にチェックを入れると、サイトのチェックインステータスを追跡できます。
- 改造サイトに対応するため、**カスタムチェックイン URL** および **カスタムチャージ URL** の設定をサポートしています。
- チェックインが必要なアカウントはリストにヒントが表示され、クリックするとチェックインページにジャンプします。

### 5.3 WebDAV バックアップとマルチデバイス同期

- **設定 → WebDAV バックアップ** に進み、WebDAVアドレス、ユーザー名、パスワードを設定します。
- 同期ポリシー（マージ/アップロードのみ/ダウンロードのみ）を選択し、自動同期間隔を設定できます。
- JSONインポート/エクスポートと組み合わせて、二重バックアップを実現することをお勧めします。

### 5.4 ソートの優先順位

- **設定 → ソート優先順位設定** でアカウントのソートロジックを調整します。
- 現在のサイト、ヘルスステータス、チェックイン要件、カスタムフィールドなどの条件を組み合わせて並べ替えることができます。
- ドラッグアンドドロップで優先順位を調整でき、不要なソートルールはいつでも無効にできます。

### 5.5 データインポート/エクスポート

- **設定 → データとバックアップ** の「インポートとエクスポート」エリアで、現在のすべてのアカウント設定をJSONとしてワンクリックでエクスポートできます。
- 旧バージョンまたは他のデバイスからエクスポートされたデータのインポートをサポートしており、迅速な移行や復元に便利です。

### 5.6 New API モデルリスト同期

New APIモデルリスト同期機能の詳細については、[New API モデルリスト同期](./new-api-model-sync.md)を参照してください。

### 5.7 New API チャネル管理（ベータ版）

プラグイン内で直接チャネルの作成/編集/削除を行い、モデルホワイトリストと単一チャネルの同期デバッグと組み合わせることで、New APIのバックエンドを行き来する頻度を大幅に減らすことができます。[New API チャネル管理](./new-api-channel-management.md)で詳細な操作と注意事項を確認してください。

<a id="cloudflare-window-downgrade"></a>
### 5.8 Cloudflare 保護と一時ウィンドウのダウングレード

- 認識またはAPI呼び出しがCloudflareによってブロックされた場合（一般的なステータスコード 401/403/429）、自動的に一時ウィンドウに切り替えて再試行し、ターゲットドメインのCookieを保持します。通常、手動操作は必要ありません。原理の詳細については、[Cloudflare シールド通過アシスタント](./cloudflare-helper.md)を参照してください。
- 人間による検証が必要なシナリオに遭遇した場合は、ポップアップされたアシスタントウィンドウでチャレンジを完了してください。頻繁に失敗する場合は、ネットワークを変更するか、リクエスト頻度を下げることを試みてください。

## 6. 詳細ドキュメント

- [Cloudflare シールド通過アシスタント](./cloudflare-helper.md)
- [サイト設定のクイックエクスポート](./quick-export.md)
- [自動更新とリアルタイムデータ](./auto-refresh.md)
- [自動チェックインとチェックイン監視](./auto-checkin.md)
- [WebDAV バックアップと自動同期](./webdav-sync.md)
- [データインポート/エクスポート](./data-management.md)
- [New API モデルリスト同期](./new-api-model-sync.md)
- [New API チャネル管理](./new-api-channel-management.md)
- [CLIProxyAPI 統合](./cliproxyapi-integration.md)
- [モデルリダイレクト](./model-redirect.md)
- [ソート優先順位設定](./sorting-priority.md)
- [権限管理（オプションの権限）](./permissions.md)

## 7. よくある質問とサポート

- 認証方法、AnyRouterへの対応、機能の使用テクニックなど、より詳細な [よくある質問](./faq.md) を確認してください。
- 問題が発生した場合や新機能が必要な場合は、[GitHub Issues](https://github.com/qixing-jk/all-api-hub/issues) までフィードバックをお寄せください。
- 過去の更新履歴については、[更新ログ](./changelog.md)をご覧ください。

::: tip 次のステップ
基本設定が完了したら、自動更新、チェックイン検出、またはWebDAV同期を引き続き設定して、より完全な使用体験を得ることができます。
:::