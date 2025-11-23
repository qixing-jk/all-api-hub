# 使用開始

New APIなどのAIハブアカウントの管理体験を最適化するために設計された、オープンソースのブラウザ拡張機能です。ユーザーはアカウント残高、モデル、APIキーを簡単に一元管理・確認でき、新しいサイトを自動的に追加できます。Kiwiブラウザやモバイル版Firefoxブラウザを介してモバイルデバイスでも使用可能です。

## 1. ダウンロード

### チャネルバージョン比較

| チャネル | ダウンロードリンク | 現在のバージョン |
|------|----------|----------|
| GitHub Release | [Release ダウンロード](https://github.com/qixing-jk/all-api-hub/releases) | ![GitHub version](https://img.shields.io/github/v/release/qixing-jk/all-api-hub?label=GitHub&logo=github&style=flat) |
| Chrome ストア | [Chrome ストア](https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo) | ![Chrome version](https://img.shields.io/chrome-web-store/v/lapnciffpekdengooeolaienkeoilfeo?label=Chrome&logo=googlechrome&style=flat) |
| Edge ストア | [Edge ストア](https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa) | ![Edge version](https://img.shields.io/badge/dynamic/json?label=Edge&prefix=v&query=%24.version&url=https%3A%2F%2Fmicrosoftedge.microsoft.com%2Faddons%2Fgetproductdetailsbycrxid%2Fpcokpjaffghgipcgjhapgdpeddlhblaa&logo=microsoftedge&style=flat) |
| Firefox ストア | [Firefox ストア](https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24}) | ![Firefox version](https://img.shields.io/amo/v/%7Bbc73541a-133d-4b50-b261-36ea20df0d24%7D?label=Firefox&logo=firefoxbrowser&style=flat) |

::: warning ヒント
ストア版は審査プロセスで1〜3日遅延します。新機能や修正をいち早く体験したい場合は、GitHub Release版の使用、またはリポジトリのソースコードからのビルドを推奨します。
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
もしサイトが二次開発によって一部の重要なAPI（例：`/api/user`）が変更されている場合、この拡張機能ではそのサイトを正常に追加できない可能性があります。
:::

## 3. サイトの追加

::: info ヒント
まずブラウザで目的のハブにログインする必要があります。そうすることで、拡張機能の自動認識機能がCookieを介してあなたのアカウントの[アクセストークン](#_3-3-手動追加)を取得できます。
:::

### 3.1 自動認識による追加

1. 拡張機能のメインページを開き、`アカウントを追加`をクリックします

![新增账号](../static/image/add-account-btn.png)

2. ハブのアドレスを入力し、`自動認識`をクリックします

![自动识别](../static/image/add-account-dialog-btn.png)

3. 自動認識が正しいことを確認したら、`追加を確定`をクリックします

::: info ヒント
拡張機能はあなたのアカウントの様々な情報を自動的に認識します。例：
- ユーザー名
- ユーザーID
- [アクセストークン](#_3-3-手動追加)
- チャージ金額の倍率
:::

> ターゲットサイトがCloudflareの5秒シールドを有効にしている場合、拡張機能は自動的に独立したウィンドウをポップアップ表示し、シールドを突破するのを助けます。突破後、認識プロセスを続行できます。
> IPの品質が悪い、またはその他の理由により、タイムアウト前にポップアップウィンドウで手動でシールドを突破する必要がある場合があります。

### 3.2 Cloudflareシールド突破アシスタントの概要

- Cloudflareの5秒シールドが検出された場合、拡張機能は一時的なウィンドウを自動的に起動し、検証の完了を支援します。チャレンジに手動介入が必要な場合は、ポップアップ内で検証をクリックしてください。
- 検証が完了すると、元のプロセスに自動的に戻り、アクセストークンとサイト情報の取得を続行します。
- 詳細については、[Cloudflare保護と一時ウィンドウのフォールバック](#_5-8-cloudflare-防护与临时窗口降级)を参照してください。

### 3.3 手動追加

::: info ヒント
自動認識が成功しなかった場合、手動でサイトアカウントを追加できます。以下の情報を事前に取得する必要があります。（各サイトでUIが異なる場合があるため、ご自身で探してください）
:::
![用户信息](../static/image/site-user-info.png)

ターゲットサイトがカスタマイズされたバージョン（例：AnyRouter）の場合、アカウント追加時に手動で**Cookieモード**に切り替えてから、自動認識または手動入力を実行してください。厳重な保護が施されたサイトに遭遇した場合は、Cloudflareシールド突破アシスタントと組み合わせて使用することもできます。詳細については、[よくある質問](./faq.md#anyrouter-网站报错怎么办)を参照してください。

## 4. サイトのクイックエクスポート

この拡張機能は、追加済みのサイトAPI設定を[CherryStudio](https://github.com/CherryHQ/cherry-studio)、[CC Switch](https://github.com/ccswitch/ccswitch)、および[New API](https://github.com/QuantumNous/new-api)にワンクリックでエクスポートすることをサポートしており、これらのプラットフォームでアップストリームプロバイダーを追加するプロセスを簡素化します。

### 4.1 設定

クイックエクスポート機能を使用する前に、拡張機能の**基本設定**ページで、ターゲットプラットフォーム（New API）の**サーバーアドレス**、**管理者トークン**、および**ユーザーID**を設定する必要があります。

### 4.2 エクスポートプロセス

1. **APIキー管理へ移動**：拡張機能の**APIキー管理**ページで、エクスポートしたいサイトに対応するAPIキーを見つけます。
2. **エクスポートをクリック**：APIキー操作メニューで、**「CherryStudio / CC Switch / New APIにエクスポート」**を選択します。
3. **自動処理**：
   * **New APIの場合**：拡張機能は、ターゲットプラットフォームに同じ`Base URL`のチャネルが既に存在するかどうかを自動的に検出し、重複追加を回避します。存在しない場合は、新しいチャネルを作成し、サイト名、`Base URL`、APIキー、および利用可能なモデルリストを自動的に入力します。
   * **CherryStudio / CC Switchの場合**：拡張機能は、ターゲットアプリケーションのプロトコルに基づいて、サイトとAPIキーを直接ローカルプログラムまたはクリップボードに送信し、項目ごとの貼り付けの手間を省きます。

この機能により、APIプロバイダーの設定を他のプラットフォームに簡単にインポートでき、手動でのコピー＆ペーストが不要になり、作業効率が向上します。

## 5. 機能概要

### 5.1 自動更新とヘルスステータス

- **設定 → 自動更新**を開くと、アカウントデータの定期的な更新を有効にできます。デフォルトの間隔は6分（360秒）で、最短60秒をサポートしています。
- **「拡張機能を開いたときに自動更新」**にチェックを入れると、ポップアップを開いたときにデータが同期されます。
- **「ヘルスステータスを表示」**を有効にすると、アカウントカードにヘルスステータスインジケーター（正常/警告/エラー/不明）が表示されます。

### 5.2 チェックイン検出

- アカウント情報で**「チェックイン検出を有効にする」**にチェックを入れると、サイトのチェックインステータスを追跡できます。
- **カスタムチェックインURL**と**カスタムチャージURL**の設定をサポートし、カスタマイズされたサイトに適応します。
- チェックインが必要なアカウントはリストにヒントが表示され、クリックするとチェックインページにジャンプします。

### 5.3 WebDAVバックアップとマルチデバイス同期

- **設定 → WebDAVバックアップ**に入り、WebDAVアドレス、ユーザー名、パスワードを設定します。
- 同期ポリシー（マージ/アップロードのみ/ダウンロードのみ）を選択し、自動同期間隔を設定できます。
- JSONインポート/エクスポートと組み合わせて、二重バックアップを実現することをお勧めします。

### 5.4 ソート優先順位

- **設定 → ソート優先順位設定**でアカウントのソートロジックを調整します。
- 現在のサイト、ヘルスステータス、チェックイン要件、カスタムフィールドなどの条件の組み合わせをサポートします。
- ドラッグ＆ドロップで優先順位を調整でき、不要なソートルールはいつでも無効にできます。

### 5.5 データインポート/エクスポート

- **設定 → データ管理**で、現在のアカウント設定すべてをJSONとしてワンクリックでエクスポートできます。
- 旧バージョンまたは他のデバイスからエクスポートされたデータのインポートをサポートし、迅速な移行や復元に便利です。

### 5.6 New APIモデルリスト同期

New APIモデルリスト同期機能の詳細については、[New API モデルリスト同期](./new-api-model-sync.md)を参照してください。

### 5.7 New APIチャネル管理（ベータ版）

拡張機能内で直接チャネルを作成/編集/削除し、モデルホワイトリストとシングルチャネル同期デバッグを組み合わせることで、New APIバックエンドへの往復頻度を大幅に削減できます。[New API チャネル管理](./new-api-channel-management.md)を参照して、詳細な操作と注意事項を確認してください。

### 5.8 Cloudflare保護と一時ウィンドウのフォールバック

- CloudflareによってAPI呼び出しが検出またはブロックされた場合（一般的なステータスコード401/403/429）、一時的なウィンドウに自動的に切り替えて再試行し、ターゲットドメインのCookieを保持します。通常、手動操作は不要です。原理の詳細については、[Cloudflareシールド突破アシスタント](./cloudflare-helper.md)を参照してください。
- 人間による検証が必要なシナリオに遭遇した場合は、ポップアップ表示されたアシスタントウィンドウでチャレンジを完了してください。頻繁に失敗する場合は、ネットワークを変更するか、リクエスト頻度を下げることを試みてください。

## 6. 詳細ドキュメント

- [Cloudflareシールド突破アシスタント](./cloudflare-helper.md)
- [サイト設定のクイックエクスポート](./quick-export.md)
- [自動更新とリアルタイムデータ](./auto-refresh.md)
- [自動チェックインとチェックイン監視](./auto-checkin.md)
- [WebDAVバックアップと自動同期](./webdav-sync.md)
- [データインポート/エクスポート](./data-management.md)
- [New APIモデルリスト同期](./new-api-model-sync.md)
- [New APIチャネル管理](./new-api-channel-management.md)

## 7. よくある質問とサポート

- 認証方法、AnyRouterへの適応、機能の使用方法など、より詳細な[よくある質問](./faq.md)をご覧ください。
- 問題が発生した場合や新機能が必要な場合は、[GitHub Issues](https://github.com/qixing-jk/all-api-hub/issues)でフィードバックをお寄せください。
- 過去の更新については、[更新履歴](https://github.com/qixing-jk/all-api-hub/blob/main/CHANGELOG.md)をご覧ください。

::: tip 次のステップ
基本設定が完了したら、自動更新、チェックイン検出、またはWebDAV同期を引き続き設定して、より完全な使用体験を得ることができます。
:::