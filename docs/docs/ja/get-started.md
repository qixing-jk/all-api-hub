# 開始方法

New API などの AI プロキシサービスアカウントの管理体験を最適化するために設計された、オープンソースのブラウザ拡張機能です。ユーザーはアカウント残高、モデル、API キーを一元的に管理・確認でき、新しいサイトを自動的に追加できます。Kiwi またはモバイル版 Firefox ブラウザ経由でモバイルデバイスでも利用可能です。

## 1. ダウンロード

### チャネル別バージョン比較

| チャネル | ダウンロードリンク | 現在のバージョン | ユーザー数 |
|---|---|---|---|
| Chrome ウェブストア | [Chrome ウェブストア](https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo) | [![Chrome version](https://img.shields.io/chrome-web-store/v/lapnciffpekdengooeolaienkeoilfeo?label=Chrome&logo=googlechrome&style=flat)](https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo) | [![Chrome Web Store Users](https://img.shields.io/chrome-web-store/users/lapnciffpekdengooeolaienkeoilfeo?label=Chrome%20Users)](https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo) |
| Edge アドオン | [Edge ウェブストア](https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa) | [![Edge version](https://img.shields.io/badge/dynamic/json?label=Edge&prefix=v&query=%24.version&url=https%3A%2F%2Fmicrosoftedge.microsoft.com%2Faddons%2Fgetproductdetailsbycrxid%2Fpcokpjaffghgipcgjhapgdpeddlhblaa&logo=microsoftedge&style=flat)](https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa) | [![Edge Add-ons Users](https://img.shields.io/badge/dynamic/json?label=Edge%20Users&query=$.activeInstallCount&url=https://microsoftedge.microsoft.com/addons/getproductdetailsbycrxid/pcokpjaffghgipcgjhapgdpeddlhblaa)](https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa) |
| Firefox アドオン | [Firefox ウェブストア](https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24}) | [![Firefox version](https://img.shields.io/amo/v/%7Bbc73541a-133d-4b50-b261-36ea20df0d24%7D?label=Firefox&logo=firefoxbrowser&style=flat)](https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24}) | [![Mozilla Add-on Users](https://img.shields.io/amo/users/%7Bbc73541a-133d-4b50-b261-36ea20df0d24%7D?label=Firefox%20Users)](https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24}) |
| GitHub Release | [Release ダウンロード](https://github.com/qixing-jk/all-api-hub/releases) | [![GitHub version](https://img.shields.io/github/v/release/qixing-jk/all-api-hub?label=GitHub&logo=github&style=flat)](https://github.com/qixing-jk/all-api-hub/releases) | [![GitHub Downloads (all assets, all releases)](https://img.shields.io/github/downloads/qixing-jk/all-api-hub/total?label=Total%20Downloads)](https://github.com/qixing-jk/all-api-hub/releases) |

::: warning 注意
ストア版は審査に 1～3 日遅延します。新機能や修正をいち早く体験したい場合は、GitHub Release 版またはリポジトリソースからのビルドを優先することをお勧めします。
:::

## 2. サポートされているサイト

以下のプロジェクトに基づいてデプロイされたプロキシサービスをサポートしています。
- [one-api](https://github.com/songquanpeng/one-api)
- [new-api](https://github.com/QuantumNous/new-api)
- [Veloera](https://github.com/Veloera/Veloera)
- [one-hub](https://github.com/MartialBE/one-hub)
- [done-hub](https://github.com/deanxv/done-hub)
- [Sub2API](https://github.com/Wei-Shaw/sub2api)
- [AnyRouter](https://anyrouter.top)
- [VoAPI](https://github.com/VoAPI/VoAPI)
- [Super-API](https://github.com/SuperAI-Api/Super-API)

::: warning
サイトが二次開発され、`/api/user` のような重要なインターフェースが変更された場合、拡張機能はサイトを正常に追加できない可能性があります。
:::

## 3. サイトの追加

::: info ヒント
拡張機能の自動認識機能がログイン情報を読み取り、アカウント情報を取得できるように、**必ず事前にブラウザで対象サイトにログインしてください**。
:::

### 3.1 自動認識による追加

1. 拡張機能のメインページを開き、「`新規アカウント`」をクリックします。

![新規アカウント](./static/image/add-account-btn.png)

2. プロキシサービスのURLを入力し、「`自動認識`」をクリックします。

![自動認識](./static/image/add-account-dialog-btn.png)

3. 自動認識された内容に誤りがないことを確認し、「`追加を確定`」をクリックします。

::: info ヒント
拡張機能は、アカウントの様々な情報を自動的に認識します。例：
- ユーザー名
- ユーザー ID
- [アクセス トークン](#manual-addition)
- チャージ金額の倍率
:::

> 対象サイトで Cloudflare の 5 秒間チャレンジが有効になっている場合、拡張機能は自動的に独立したウィンドウを開いてチャレンジをクリアするのを支援します。クリア後、認識プロセスを続行できます。
> IP の品質が低いなどの理由でタイムアウト前に手動でチャレンジを完了する必要がある場合は、表示されるウィンドウで完了してください。

### 3.2 Cloudflare チャレンジヘルパーの概要

- Cloudflare の 5 秒間チャレンジが検出されると、拡張機能は自動的に一時ウィンドウを起動して検証を完了します。チャレンジに手動介入が必要な場合は、ポップアップウィンドウ内で検証をクリックしてください。
- 検証が成功すると、元のプロセスに戻り、アクセス トークンとサイト情報の取得を続行します。
- 詳細については、[Cloudflare 保護と一時ウィンドウのダウングレード](#cloudflare-window-downgrade) を参照してください。

<a id="manual-addition"></a>
### 3.3 手動追加

::: info ヒント
自動認識が成功しなかった場合は、手動でサイトアカウントを追加できます。以下の情報を事前に取得する必要があります。（サイトごとに UI が異なる場合があるため、ご自身で探してください。）
:::
![ユーザー情報](./static/image/site-user-info.png)

対象サイトがカスタマイズ版（例: AnyRouter）の場合は、アカウント追加時に **Cookie モード** に手動で切り替えてから、自動認識または手動入力を実行してください。厳格な保護が施されているサイトに遭遇した場合は、Cloudflare チャレンジヘルパーと組み合わせて使用することもできます。詳細は [よくある質問](./faq.md#anyrouter-error) を参照してください。

<a id="quick-export-sites"></a>
## 4. サイトのクイックエクスポート

この拡張機能は、追加されたサイトの API 設定を [CherryStudio](https://github.com/CherryHQ/cherry-studio)、[CC Switch](https://github.com/ccswitch/ccswitch)、および [New API](https://github.com/QuantumNous/new-api) にワンクリックでエクスポートする機能をサポートしており、これらのプラットフォームでアップストリームプロバイダーを追加するプロセスを簡素化します。

### 4.1 設定

クイックエクスポート機能を使用する前に、拡張機能の **基本設定** ページで、対象プラットフォーム（New API）の **サーバーアドレス**、**管理者トークン**、および **ユーザー ID** を設定する必要があります。

### 4.2 エクスポートプロセス

1. **API キー管理に移動**：拡張機能の **API キー管理** ページで、エクスポートしたいサイトに対応する API キーを見つけます。
2. **エクスポートをクリック**：キー操作メニューで、「**CherryStudio / CC Switch / New API にエクスポート**」を選択します。
3. **自動処理**：
   * **New API の場合**：拡張機能は、対象プラットフォームに同じ `Base URL` を持つチャネルが既に存在するかどうかを自動的に検出して、重複追加を回避します。存在しない場合は、新しいチャネルが作成され、サイト名、`Base URL`、API キー、および利用可能なモデルのリストが自動的に入力されます。
   * **CherryStudio / CC Switch の場合**：拡張機能は、対象アプリケーションのプロトコルに基づいて、サイトと API キーをローカルプログラムまたはクリップボードに直接送信し、個別の貼り付け作業を不要にします。

この機能により、API プロバイダーの設定を他のプラットフォームに簡単にインポートでき、手動でのコピー＆ペースト作業が不要になり、作業効率が向上します。

## 5. 機能概要

### 5.1 自動リフレッシュとヘルスステータス

- **設定 → 自動リフレッシュ** を開くと、アカウントデータの定期的なリフレッシュを有効にできます。デフォルトの間隔は 6 分（360 秒）で、最短 60 秒までサポートします。
- **「拡張機能を開いたときに自動リフレッシュ」** にチェックを入れると、ポップアップウィンドウを開いたときにデータを同期できます。
- **「ヘルスステータスを表示」** を有効にすると、アカウントカードにヘルスステータスインジケーター（正常/警告/エラー/不明）が表示されます。

### 5.2 チェックイン検出

- アカウント情報で **「チェックイン検出を有効にする」** にチェックを入れると、サイトのチェックインステータスを追跡できます。
- **カスタムチェックイン URL** および **カスタムチャージ URL** を設定して、カスタマイズされたサイトに対応できます。
- チェックインが必要なアカウントはリストに通知が表示され、クリックするとチェックインページにジャンプします。

### 5.3 WebDAV バックアップとマルチデバイス同期

- **設定 → WebDAV バックアップ** に移動し、WebDAV アドレス、ユーザー名、パスワードを設定します。
- 同期ポリシー（マージ/アップロードのみ/ダウンロードのみ）を選択し、自動同期間隔を設定できます。
- JSON のインポート/エクスポートと組み合わせることで、二重バックアップを実現することをお勧めします。

### 5.4 ソート優先度

- **設定 → ソート優先度設定** でアカウントのソートロジックを調整します。
- 現在のサイト、ヘルスステータス、チェックイン要件、カスタムフィールドなどの条件を組み合わせて並べ替えることができます。
- ドラッグ＆ドロップで優先度を調整し、不要なソートルールはいつでも無効にできます。

### 5.5 データインポート/エクスポート

- **設定 → データとバックアップ** の「インポートとエクスポート」セクションで、現在のアカウント設定すべてを JSON としてワンクリックでエクスポートできます。
- 旧バージョンまたは他のデバイスからエクスポートされたデータをインポートして、迅速な移行や復元が可能です。

### 5.6 New API モデルリスト同期

New API モデルリスト同期機能の詳細については、[New API モデルリスト同期](./new-api-model-sync.md) を参照してください。

### 5.7 New API チャネル管理（ベータ版）

拡張機能内で直接チャネルを作成/編集/削除できます。モデルのホワイトリストと単一チャネル同期デバッグと組み合わせることで、New API バックエンドへの往復回数を大幅に削減できます。詳細な操作と注意事項については、[New API チャネル管理](./new-api-channel-management.md) を参照してください。

<a id="cloudflare-window-downgrade"></a>
### 5.8 Cloudflare 保護と一時ウィンドウのダウングレード

- Cloudflare によってリクエストがブロックされた場合（一般的なステータスコード 401/403/429）、一時ウィンドウに切り替えてリトライします。ターゲットドメインの Cookie は保持され、通常は手動操作は不要です。原理については [Cloudflare チャレンジヘルパー](./cloudflare-helper.md) を参照してください。
- 人間による検証が必要なシナリオに遭遇した場合は、表示されるヘルパーウィンドウでチャレンジを完了してください。頻繁に失敗する場合は、ネットワークを変更したり、リクエスト頻度を下げたりしてみてください。

## 6. 詳細ドキュメント

- [Cloudflare チャレンジヘルパー](./cloudflare-helper.md)
- [サイト設定のクイックエクスポート](./quick-export.md)
- [自動リフレッシュとリアルタイムデータ](./auto-refresh.md)
- [自動チェックインとチェックイン監視](./auto-checkin.md)
- [WebDAV バックアップと自動同期](./webdav-sync.md)
- [データインポート/エクスポート](./data-management.md)
- [New API モデルリスト同期](./new-api-model-sync.md)
- [New API チャネル管理](./new-api-channel-management.md)
- [CLIProxyAPI 統合](./cliproxyapi-integration.md)
- [モデルリダイレクト](./model-redirect.md)
- [ソート優先度設定](./sorting-priority.md)
- [権限管理（オプション権限）](./permissions.md)

## 7. よくある質問とサポート

- より詳細な [よくある質問](./faq.md) を参照して、認証方法、AnyRouter の適合性、機能の使用方法などを確認してください。
- 問題が発生した場合や新機能が必要な場合は、[GitHub Issues](https://github.com/qixing-jk/all-api-hub/issues) までお気軽にごフィードバックください。
- 過去の更新については、[更新履歴](./changelog.md) を参照してください。

::: tip 次のステップ
基本設定が完了したら、自動リフレッシュ、チェックイン検出、または WebDAV 同期を設定して、より完全な使用体験を得ることができます。
:::