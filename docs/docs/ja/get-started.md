# 開始方法

AI プロキシステーションアカウント（New API など）の管理体験を最適化するために設計されたオープンソースのブラウザ拡張機能です。ユーザーは、アカウント残高、モデル、キーを一元管理・表示し、新しいサイトを自動的に追加することができます。Kiwi またはモバイル版 Firefox ブラウザ経由でモバイルデバイスでも利用可能です。

## 1. ダウンロード


### チャンネル別バージョン比較

| チャンネル | ダウンロードリンク | 現在のバージョン |
|------|----------|----------|
| Chrome ウェブストア | [Chrome ウェブストア](https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo) | ![Chrome version](https://img.shields.io/chrome-web-store/v/lapnciffpekdengooeolaienkeoilfeo?label=Chrome&logo=googlechrome&style=flat) |
| Edge ウェブストア | [Edge ウェブストア](https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa) | ![Edge version](https://img.shields.io/badge/dynamic/json?label=Edge&prefix=v&query=%24.version&url=https%3A%2F%2Fmicrosoftedge.microsoft.com%2Faddons%2Fgetproductdetailsbycrxid%2Fpcokpjaffghgipcgjhapgdpeddlhblaa&logo=microsoftedge&style=flat) |
| Firefox ウェブストア | [Firefox ウェブストア](https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24}) | ![Firefox version](https://img.shields.io/amo/v/%7Bbc73541a-133d-4b50-b261-36ea20df0d24%7D?label=Firefox&logo=firefoxbrowser&style=flat) |
| GitHub Release | [Release ダウンロード](https://github.com/qixing-jk/all-api-hub/releases) | ![GitHub version](https://img.shields.io/github/v/release/qixing-jk/all-api-hub?label=GitHub&logo=github&style=flat) |

::: warning ヒント
ストア版は審査に 1～3 日遅延します。新機能や修正をいち早く体験したい場合は、GitHub Release 版を優先するか、リポジトリのソースコードからビルドすることをお勧めします。
:::

## 2. 対応サイト

以下のプロジェクトに基づいてデプロイされたプロキシステーションに対応しています：
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
サイトが二次開発され、一部の重要なインターフェース（例: `/api/user`）が変更された場合、拡張機能がサイトを正常に追加できない可能性があります。
:::

## 3. サイトの追加

::: info ヒント
拡張機能の自動認識機能がログイン情報を読み取り、アカウント情報を取得できるように、必ず事前にブラウザで対象ウェブサイトにログインしてください。
:::

### 3.1 自動認識による追加

1. 拡張機能のメインページを開き、「アカウントを追加」をクリックします。

![新增账号](../static/image/add-account-btn.png)

2. プロキシステーションのアドレスを入力し、「自動認識」をクリックします。

![自动识别](../static/image/add-account-dialog-btn.png)

3. 自動認識された内容に誤りがないことを確認し、「追加を確定」をクリックします。

::: info ヒント
拡張機能は、アカウントの様々な情報（例：
- ユーザー名
- ユーザー ID
- [アクセストークン](#manual-addition)
- チャージ金額の倍率
）を自動的に認識します。
:::

> 対象サイトで Cloudflare の 5 秒ルールが有効になっている場合、拡張機能は自動的に独立したウィンドウを表示して盾越えを支援します。完了後、認識プロセスを続行できます。
> IP の品質が低い場合やその他の理由で、タイムアウト前に表示されるウィンドウで手動で盾越えを完了する必要がある場合があります。

### 3.2 Cloudflare 盾越えヘルパーの概要

- Cloudflare の 5 秒ルールが認識された場合、拡張機能は自動的に一時的なウィンドウを起動して検証を完了します。チャレンジに手動介入が必要な場合は、ポップアップウィンドウ内で検証をクリックしてください。
- 検証が完了すると、元のプロセスに戻り、アクセストークンとサイト情報の取得を続行します。
- 詳細については、[Cloudflare 保護と一時ウィンドウのダウングレード](#cloudflare-window-downgrade) を参照してください。

<a id="manual-addition"></a>
### 3.3 手動追加

::: info ヒント
自動認識が成功しなかった場合、サイトアカウントを手動で入力して追加できます。以下の情報を事前に取得する必要があります。（各サイトで UI が異なる場合があるため、ご自身で探してください。）
:::
![用户信息](../static/image/site-user-info.png)

対象サイトがカスタマイズ版（例：AnyRouter）の場合は、アカウント追加時に手動で **Cookie モード** に切り替えてから、自動認識または手動入力を実行してください。厳格な保護が施されたサイトに遭遇した場合は、Cloudflare 盾越えヘルパーと組み合わせて使用することもできます。詳細は [よくある質問](./faq.md#anyrouter-error) を参照してください。

<a id="quick-export-sites"></a>
## 4. サイトのクイックエクスポート

この拡張機能は、追加されたサイトの API 設定をワンクリックで [CherryStudio](https://github.com/CherryHQ/cherry-studio)、[CC Switch](https://github.com/ccswitch/ccswitch)、および [New API](https://github.com/QuantumNous/new-api) にエクスポートすることをサポートしており、これらのプラットフォームでアップストリームプロバイダーを追加するプロセスを簡素化します。

### 4.1 設定

クイックエクスポート機能を使用する前に、拡張機能の **基本設定** ページで、ターゲットプラットフォーム（New API）の **サーバーアドレス**、**管理者トークン**、および **ユーザー ID** を設定する必要があります。

### 4.2 エクスポートプロセス

1. **キー管理に移動**：拡張機能の **キー管理** ページで、エクスポートしたいサイトに対応する API キーを見つけます。
2. **エクスポートをクリック**：キー操作メニューで、「**CherryStudio / CC Switch / New API にエクスポート**」を選択します。
3. **自動処理**：
   * **New API の場合**：拡張機能は、ターゲットプラットフォームに同じ `Base URL` のチャンネルが既に存在するかどうかを自動的に検出して、重複追加を回避します。存在しない場合は、新しいチャンネルが作成され、サイト名、`Base URL`、API キー、および利用可能なモデルリストが自動的に入力されます。
   * **CherryStudio / CC Switch の場合**：拡張機能は、ターゲットアプリケーションのプロトコルに基づいて、サイトとキーをローカルプログラムまたはクリップボードに直接送信し、個別の貼り付けの手間を省きます。

この機能により、API プロバイダーの設定を他のプラットフォームに簡単にインポートでき、手動でのコピー＆ペーストなしで作業効率を向上させることができます。

## 5. 機能概要

### 5.1 自動リフレッシュとヘルスステータス

- **設定 → 自動リフレッシュ** を開くと、アカウントデータの定期的なリフレッシュを有効にできます。デフォルトの間隔は 6 分（360 秒）で、最短 60 秒までサポートします。
- **「プラグインを開いたときに自動リフレッシュ」** にチェックを入れると、ポップアップウィンドウを開いたときにデータを同期できます。
- **「ヘルスステータスを表示」** を有効にすると、アカウントカードにヘルスステータスインジケーター（正常/警告/エラー/不明）が表示されます。

### 5.2 チェックイン検出

- アカウント情報で **「チェックイン検出を有効にする」** にチェックを入れると、サイトのチェックインステータスを追跡できます。
- **カスタムチェックイン URL** および **カスタムチャージ URL** を設定して、カスタマイズされたサイトに対応できます。
- チェックインが必要なアカウントはリストにプロンプトが表示され、クリックするとチェックインページにジャンプします。

### 5.3 WebDAV バックアップとマルチデバイス同期

- **設定 → WebDAV バックアップ** に移動し、WebDAV アドレス、ユーザー名、パスワードを設定します。
- 同期ポリシー（マージ/アップロードのみ/ダウンロードのみ）を選択し、自動同期間隔を設定できます。
- JSON のインポート/エクスポートと組み合わせて、二重バックアップを実現することをお勧めします。

### 5.4 ソート優先度

- **設定 → ソート優先度設定** でアカウントのソートロジックを調整します。
- 現在のサイト、ヘルスステータス、チェックイン要件、カスタムフィールドなどの条件を組み合わせて並べ替えることができます。
- ドラッグ＆ドロップで優先度を調整し、不要なソートルールはいつでも無効にできます。

### 5.5 データインポート/エクスポート

- **設定 → データとバックアップ** の「インポートとエクスポート」セクションで、現在のアカウント設定をすべてワンクリックで JSON にエクスポートできます。
- 旧バージョンや他のデバイスからエクスポートされたデータをインポートして、迅速な移行や復元を容易にすることができます。

### 5.6 New API モデルリスト同期

New API モデルリスト同期機能の詳細については、[New API モデルリスト同期](./new-api-model-sync.md) を参照してください。

### 5.7 New API チャンネル管理（ベータ版）

拡張機能内で直接チャンネルを作成/編集/削除し、モデルホワイトリストと単一チャンネル同期デバッグと組み合わせることで、New API バックエンドへの往復回数を大幅に削減できます。[New API チャンネル管理](./new-api-channel-management.md) で詳細な操作と注意事項を確認してください。

<a id="cloudflare-window-downgrade"></a>
### 5.8 Cloudflare 保護と一時ウィンドウのダウングレード

- Cloudflare によってリクエストがブロックされた場合（一般的なステータスコード 401/403/429）、自動的に一時ウィンドウに切り替えてリトライします。ターゲットドメインの Cookie は保持され、通常は手動操作は不要です。原理については [Cloudflare 盾越えヘルパー](./cloudflare-helper.md) を参照してください。
- 人間による検証が必要なシナリオに遭遇した場合は、表示されるヘルプウィンドウでチャレンジを完了してください。頻繁に失敗する場合は、ネットワークを変更するか、リクエスト頻度を下げることを試みてください。

## 6. 詳細ドキュメント

- [Cloudflare 盾越えヘルパー](./cloudflare-helper.md)
- [サイト設定のクイックエクスポート](./quick-export.md)
- [自動リフレッシュとリアルタイムデータ](./auto-refresh.md)
- [自動チェックインとチェックイン監視](./auto-checkin.md)
- [WebDAV バックアップと自動同期](./webdav-sync.md)
- [データインポート/エクスポート](./data-management.md)
- [New API モデルリスト同期](./new-api-model-sync.md)
- [New API チャンネル管理](./new-api-channel-management.md)
- [CLIProxyAPI 統合](./cliproxyapi-integration.md)
- [モデルリダイレクト](./model-redirect.md)
- [ソート優先度設定](./sorting-priority.md)
- [権限管理（オプション権限）](./permissions.md)

## 7. よくある質問とサポート

- より詳細な [よくある質問](./faq.md) を参照して、認証方法、AnyRouter の適合性、機能の使用方法などを確認してください。
- 問題が発生した場合や新機能が必要な場合は、[GitHub Issues](https://github.com/qixing-jk/all-api-hub/issues) でフィードバックを歓迎します。
- 過去の更新については、[更新履歴](./changelog.md) を参照してください。

::: tip 次のステップ
基本設定が完了したら、自動リフレッシュ、チェックイン検出、または WebDAV 同期を設定して、より完全な使用体験を得ることができます。
:::