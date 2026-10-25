# Chromium 自己更新インストール（.crx）

このページは、GitHub 版を長期的に使いながら、毎回パッケージを手動で差し替えたくない Chromium ユーザー向けです。`.crx` をインストールすると、ブラウザーがリリースページの更新マニフェストから新しいバージョンを自動取得します。

::: tip この方法が必要か確認する
Chrome ウェブストア、Edge アドオン、Firefox Add-ons からインストールできるなら、ストア版を優先してください。ブラウザーが自動更新し、設定は不要です。

自分更新インストールが意味を持つのは、次のいずれかに当てはまる場合のみです:

- Linux で Chromium / Chrome を使っている。
- QQ ブラウザー、360 系、Brave、Vivaldi など外部拡張を許可する Chromium 系ブラウザーを使っている。
- stock Chrome / Edge で拡張機能の許可リストポリシーを一度設定してもよい。
:::

## stock Chrome / Edge に追加設定が必要な理由

Google は Chrome 33（Windows）と Chrome 44（macOS）以降、ストア外の拡張機能のインストールを段階的にブロックしています。管理者レベルのポリシーがない場合、Chrome は:

- `CRX_REQUIRED_PROOF_MISSING` で `.crx` のインストールを拒否するか、
- 「Chrome ウェブストア以外から提供されています」として無効化し、恒久的な再有効化を許しません。

ブラウザーが自己ホストインストールに対応し、デバイス管理の前提条件を満たしている場合、必要なポリシーを設定すると `.crx` がリリースのマニフェスト経由で自己更新できます。Windows Edge には下記のドメイン参加要件もあり、ポリシーのインポートだけでは満たせません。

::: warning インストール元ポリシーの信頼範囲
テンプレートの `ExtensionInstallSources` は本プロジェクトの GitHub ページと、他のリポジトリの添付ファイルも配信する共有ホスト `release-assets.githubusercontent.com` を許可します。CRX のダウンロード URL とダウンロード元ページ（referrer）の両方が許可パターンに一致する必要がありますが、本プロジェクトのパス内のページから共有ホスト上の別の CRX へリンクすることも可能です。

`ExtensionInstallAllowlist` は指定した拡張機能をブロックリストの対象外にするだけで、インストールを本拡張機能だけに制限しません。テンプレートはグローバルな `ExtensionInstallBlocklist` を設定しないため、これらのインストール元の信頼範囲は本拡張機能の ID に限定されません。この範囲を受け入れる場合のみインポートし、ダウンロード元とインストール後の拡張機能 ID を確認してください。既存の組織ポリシーは上書きせず、管理者に統合を依頼してください。
:::

## インストール手順

### 1. リリース添付ファイルをダウンロード

[最新リリース](https://github.com/qixing-jk/all-api-hub/releases/latest) を開き、次をダウンロードします:

```text
all-api-hub-chrome.crx
```

ファイル名にバージョンがないのは、`releases/latest` が常に最新の安定版を指すためです。Nightly ユーザーは [Nightly リリース](https://github.com/qixing-jk/all-api-hub/releases/tag/nightly) から `all-api-hub-nightly-chrome.crx` をダウンロードしてください。

::: warning ZIP 版と同時にインストールしない
`.crx` 版と ZIP 解凍ロード版は拡張機能 ID が異なり、データは共有されません。「Load unpacked」で ZIP 版を導入済みの場合は、バックアップをエクスポートし、旧版を削除してから `.crx` をインストールし、最後にバックアップを復元してください。
:::

### 2. ブラウザーに外部拡張のインストールを許可する

#### Linux

設定は不要です。Linux の Chromium / Chrome は自己ホスト拡張機能を許可しています。

#### Windows

**Edge のデバイス要件：** [Microsoft の公式文書](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-manage-extensions-webstore#prerequisites)では Windows デバイスの Microsoft Active Directory ドメインへの参加が必要です。Microsoft Entra への参加のみでは不十分で、Microsoft Entra ハイブリッド参加が必要です。ドメイン未参加の通常の PC に `edge-install-policy.reg` をインポートするだけでは自己ホストインストールの条件を満たせないため、Edge アドオン版を使用してください。

管理者レベルのレジストリポリシーが必要です。すぐ使えるテンプレートが `resources/crx-self-update/` にあります（Chrome は `chrome-install-policy.reg`、Edge は `edge-install-policy.reg`）。テンプレートにはこの拡張機能の ID が入力済みです。管理者権限でインポートしてから、ブラウザーを完全に終了して再起動します。

テンプレートの中身は次の 2 つのポリシーです:

```reg
Windows Registry Editor Version 5.00

[HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Google\Chrome\ExtensionInstallAllowlist]
"1"="oligofghjlogjhmnhnhccnobbginfgmp"

[HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Google\Chrome\ExtensionInstallSources]
"1"="https://github.com/qixing-jk/all-api-hub/*"
"2"="https://release-assets.githubusercontent.com/*"
```

Edge の場合は `Google\Chrome` を `Microsoft\Edge` に置き換えてください。

拡張機能 ID `oligofghjlogjhmnhnhccnobbginfgmp` は署名公開鍵から派生し、リリースの `updates.xml` の `appid` と一致します。インストール後に拡張機能ページでも確認できます。

#### macOS

同じポリシー（`ExtensionInstallAllowlist`、`ExtensionInstallSources`）を MDM または構成プロファイルで配布します。テンプレートは `resources/crx-self-update/chrome-install-policy.mobileconfig` と `edge-install-policy.mobileconfig` です。MDM で配布するか、ダブルクリックしてシステムプロファイルとしてインストールします。ユーザーレベルの plist の変更だけでは強制ポリシーと見なされず、ブラウザーは無視します。

### 3. インストールと確認

1. `chrome://extensions/`（Edge は `edge://extensions/`）を開き、デベロッパーモードを有効にします。
2. ダウンロードした `.crx` を拡張機能ページにドラッグしてインストールを確定します。
3. 拡張機能カードに「Chrome ウェブストア以外」と表示されていないことを確認します。

### 4. 自動更新の確認

ブラウザーは数時間ごとに `update_url` を確認します。すぐ確認するには:

1. `chrome://extensions/` を開く。
2. ページの「更新」ボタンをクリックする。
3. 新しいバージョンがあれば拡張機能のバージョンが変わります。

All API Hub の **設定 → バージョン情報** の「更新を確認」でも確認できます。自己更新インストールでは ZIP のダウンロードではなく「ブラウザーが自動的にインストールします」と表示されます。

## よくある質問

### 「Chrome ウェブストアからのものではありません」と表示され無効になる

ポリシーが反映されていません。レジストリが `HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Google\Chrome`（64 ビットでは `Wow6432Node` の場合あり）にあり、値の型が文字列であることを確認してください。変更後はブラウザーを完全に終了して再起動します。

### `CRX_REQUIRED_PROOF_MISSING` と表示される

同じくポリシーが未設定または無効です。このエラーは Chrome がパッケージの出所を検証できないことを意味し、`ExtensionInstallAllowlist` と `ExtensionInstallSources` の設定で解消されます。

### 更新がいつまでも来ない

- ブラウザーは起動時と定期チェック時にだけ `update_url` を読みます。長時間再起動しないと遅れます。
- 管理対象デバイスでは拡張機能ポリシーが管理者によって上書きされることがあります。
- Nightly の `.crx` は UTC のビルド時刻から増加するブラウザーバージョン（`年.月日.時分.秒ミリ秒`、例：`2026.1026.459.59999`）を生成し、表示名にはパッケージバージョンを残します。ブラウザーはこの数値を比較し、拡張機能内の更新通知はビルドコミットを比較します。
- Nightly の `.crx` から Stable の `.crx` に戻す場合は、バックアップをエクスポートし、アンインストールしてからインストールと復元を行ってください。署名 ID は同じですが、Stable のバージョン番号は Nightly より小さいため、そのまま上書きできません。

### ストア版に戻したい

バックアップをエクスポートし、`.crx` 版をアンインストールしてからストア版をインストールし、バックアップをインポートしてください。拡張機能の ID が異なるため、データは自動的に引き継がれません。

## 関連ドキュメント

- [インストールチャンネルと更新](./extension-update-install.md)
- [他のブラウザーへのインストール](./other-browser-install.md)
- [Safari 拡張機能インストールガイド](./safari-install.md)
