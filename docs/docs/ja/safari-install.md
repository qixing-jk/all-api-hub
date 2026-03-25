# Safari 拡張機能のインストールガイド

このドキュメントでは、Safari ブラウザに All API Hub 拡張機能をインストールする方法について説明します。

## まずは違いを確認

- Apple Developer Program の有料アカウントがない場合：Xcode を使用して自身の Mac 上で拡張機能をビルドし有効化することは引き続き可能です。開発デバッグや個人利用に適しています。一般ユーザーへの配布は通常できません。ローカルで正式に配布されていないバージョンは、Safari の開発者メニューで `署名されていない拡張機能を許可` を有効にする必要がある場合があります。
- Apple Developer Program の有料アカウントがある場合：正式な署名を行い、TestFlight / App Store を通じて配布できます。他のユーザーへのインストールに適しており、インストール体験も通常の Safari 拡張機能に近くなります。

## システム要件

- macOS 11.0 Big Sur 以降
- Safari 14.0 以降
- Xcode 13.0 以降（ビルド用）

## インストール方法

インストール方法は 2 つあります。

1. GitHub の最新 Release から、既にビルド済みの Safari Xcode プロジェクト圧縮ファイルをダウンロードし、解凍して Xcode で直接開く。
2. ソースコードから自分でビルドし、Xcode で実行する。

### 方法一：GitHub 最新 Release から Safari 添付ファイルをダウンロード

Safari 添付ファイルは、最新バージョンの Release ページにアップロードされます。

- [最新バージョン Release](https://github.com/qixing-jk/all-api-hub/releases/latest)

#### 1. 対応バージョンの Release ページを開く

上記の「最新バージョン Release」を直接開いてください。

#### 2. 正しい Safari 添付ファイルをダウンロードする

ページの添付ファイルの中から、以下のファイル名をダウンロードしてください。

```text
all-api-hub-<version>-safari-xcode-bundle.zip
```

例：

```text
all-api-hub-3.29.0-safari-xcode-bundle.zip
```

この圧縮ファイルには、Xcode で直接開くことができるプロジェクトと、必要な Safari ファイルが含まれています。

このファイルをダウンロードしてください。`all-api-hub-<version>-safari.zip` はダウンロードしないでください。

<details>
<summary>なぜこのファイルが必要なのですか？</summary>

`all-api-hub-<version>-safari-xcode-bundle.zip` には通常、以下のものが含まれています。

- `all-api-hub-<version>-safari.zip`
- `safari-mv2/`
- コンバーターによって生成された Xcode プロジェクトディレクトリ

これにより、解凍後に Xcode で直接プロジェクトを開くことができ、プロジェクトが参照する Safari ファイルを自分で補完する必要がなくなります。

</details>

#### 3. 解凍後、Xcode で直接プロジェクトを開く

1. 解凍ディレクトリ内で Xcode プロジェクトを探します。
2. プロジェクトファイルをダブルクリックするか、Xcode で開きます。
3. ターゲットデバイスがご自身の Mac に設定されていることを確認します。
4. `Product > Run` をクリックします。
5. Safari でプロンプトが表示されたら、`Safari > 設定 > 拡張機能` で拡張機能を有効にします。

圧縮ファイルには実行に必要なファイルが既に含まれているため、解凍後に直接開くだけで通常はディレクトリを個別に移動する必要はありません。

### 方法二：ソースコードからビルドしてインストール

#### 1. ソースコードを取得し、Safari 用の成果物をビルドする

```bash
# プロジェクトのソースコードをクローンまたはダウンロード
git clone https://github.com/qixing-jk/all-api-hub.git
cd all-api-hub

# 依存関係をインストール
pnpm install

# Safari バージョンをビルド
pnpm run build:safari
```

ビルドが完了すると、コンパイルされた成果物は `.output/safari-mv2/` に出力されます。

#### 2. Safari コンバーターを使用して Xcode プロジェクトを生成する

```bash
xcrun safari-web-extension-converter .output/safari-mv2/
```

出力ディレクトリ、アプリケーション名、バンドル識別子をカスタマイズしたい場合は、次のように使用することもできます。

```bash
xcrun safari-web-extension-converter .output/safari-mv2/ \
  --project-location /path/to/all-api-hub-safari-project \
  --app-name "All API Hub" \
  --bundle-identifier "io.github.qixingjk.allapihub"
```

この手順により、Safari 拡張機能を格納するための Xcode プロジェクトが生成されます。

#### 3. Xcode でビルドして実行する

1. 生成された Xcode プロジェクトを開きます。
2. ターゲットデバイスがご自身の Mac に設定されていることを確認します。
3. `Product > Run` をクリックするか、`Cmd + R` を押します。
4. 初回実行時、Xcode は署名の処理を要求します。有料アカウントがない場合は、通常 `Personal Team` を使用してローカルデバッグが可能です。
5. ビルドが成功すると、Safari は拡張機能を有効にするように促します。

#### 4. Safari で拡張機能を有効にする

1. Safari を開きます。
2. メニューバーで `Safari > 設定` をクリックします。
3. ローカルで正式に配布されていないバージョンである場合は、`開発` メニューで `署名されていない拡張機能を許可` を有効にします。
4. `拡張機能` タブを開きます。
5. `All API Hub` を見つけて有効にします。
6. 必要に応じて権限を付与します。

### 方法三：一時的なデバッグ（開発用途のみ）

一部の macOS / Safari バージョンでは一時的なデバッグ読み込みがサポートされていますが、正式なインストールや配布方法としては適していません。

```bash
pnpm run build:safari
```

その後、Safari で開発者モードを有効にします。

1. `Safari > 設定 > 高度な設定` を開きます。
2. 「メニューバーに開発メニューを表示」にチェックを入れます。
3. メニューバーで `開発 > 署名されていない拡張機能を許可` をクリックします。
4. `Safari > 設定 > 拡張機能` で拡張機能を有効にします。

> **注意**
> この方法が利用できない場合は、上記の Xcode の手順に戻ってください。正式なリリースには、署名付き配布を使用してください。

## 開発モードでのデバッグ

### 開発ビルド

```bash
# 開発モードビルド（ホットリロード）
pnpm run dev -- -b safari
```

### 拡張機能のデバッグ

1. **バックグラウンドスクリプト / ポップアップのデバッグ**：
   - Safari で、拡張機能アイコンを右クリックします。
   - `検証` または Web Inspector を開くを選択します。

2. **コンテンツスクリプトのデバッグ**：
   - いずれかのウェブページで、ページを右クリックします。
   - `要素を検証` を選択します。
   - コンソールで拡張機能に関連するログを確認します。

## よくある質問

### なぜ Safari は特別な処理が必要なのですか？

Safari 拡張機能は、macOS アプリケーションとしてパッケージ化してインストールおよび配布する必要があります。これは、Chrome、Edge、Firefox が `.crx` または `.xpi` ファイルを直接インストールするのとは異なります。

### 開発者アカウントの有無で何が違いますか？

- アカウントなし：ローカルでビルドして使用できますが、開発デバッグ / 個人利用が中心となり、一般ユーザーへの直接配布は通常できません。
- アカウントあり：正式な署名を行い、TestFlight / App Store を通じて配布できます。長期的なメンテナンスや正式リリースに適しています。

### Chrome のように直接インストールできますか？

できません。Safari では、Chrome のように直接解凍して読み込んで正式なインストールを行うことはできません。ローカルでの使用は通常 Xcode を介し、正式な配布は TestFlight / App Store を介します。

### ビルド中にエラーが発生した場合はどうすればよいですか？

まず、以下を確認してください。
- Xcode コマンドラインツールがインストールされていること：`xcode-select --install`
- Xcode のライセンスに同意していること：`sudo xcodebuild -license accept`
- Node.js のバージョンが 18 以上であること

### 拡張機能の機能は Chrome バージョンと異なりますか？

基本的な機能は完全に一致しています。ただし、Safari WebExtensions API の一部の制限により、一部の機能が若干異なる場合があります。
- `sidePanel` API は Safari では利用できません（ポップアップウィンドウで代用します）。
- 一部の権限要求方法が異なる場合があります。

### 拡張機能を更新するにはどうすればよいですか？

- ソースコードからインストールした場合：Safari 用の成果物を再ビルドし、Xcode プロジェクトを再度実行します。
- 最新 Release からインストールした場合：最新の `all-api-hub-<version>-safari-xcode-bundle.zip` を再度ダウンロードし、解凍して新しい Xcode プロジェクトを開き直して実行します。

## アンインストール

1. Safari を開きます。
2. `Safari > 設定 > 拡張機能` に移動します。
3. `All API Hub` のチェックを外します。
4. Xcode によって生成された macOS アプリケーションを削除します。

## 参考資料

- [Apple Safari Web Extensions 公式ドキュメント](https://developer.apple.com/documentation/safari-extensions/safari-web-extensions)
- [Safari Web Extension Converter 使用説明](https://developer.apple.com/documentation/safari-extensions/converting-a-web-extension-for-safari)
- [WXT フレームワーク Safari サポートドキュメント](https://wxt.dev/guide/browsers/safari.html)

---

問題がある場合は、[GitHub Issues](https://github.com/qixing-jk/all-api-hub/issues) でフィードバックしてください。