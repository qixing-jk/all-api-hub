# Safari 拡張機能のインストールガイド

このドキュメントでは、Safari ブラウザに All API Hub 拡張機能をインストールする方法について説明します。

## まず違いを確認する

- Apple Developer Program の有料アカウントがない場合：Xcode を使用して自身の Mac 上で拡張機能をビルドして有効化することは引き続き可能で、開発デバッグや自己利用に適しています。通常、一般ユーザーへの配布はできません。ローカルで正式に配布されていないバージョンは、Safari の開発者メニューで `署名されていない拡張機能を許可` を有効にする必要がある場合があります。
- Apple Developer Program の有料アカウントがある場合：正式な署名を行い、TestFlight / App Store を通じて配布できます。他のユーザーへのインストールに適しており、インストール体験も通常の Safari 拡張機能に近くなります。

## システム要件

- macOS 11.0 Big Sur 以降
- Safari 14.0 以降
- Xcode 13.0 以降（ビルド用）

## インストール方法

Safari では、現在以下の 2 つの方法での利用が推奨されています。

1. ソースコードから自分でビルドし、Xcode で実行する
2. GitHub Releases から既にビルド済みの Safari Xcode bundle をダウンロードし、解凍して直接 Xcode で開く

> **推奨**
> 自身の Mac でできるだけ早く実行したい場合は、「方法二：Release bundle をダウンロード」を優先してください。
> コードを変更したり、デバッグしたり、ローカルの変更を検証したりする場合は、「方法一：ソースコードからビルド」を使用してください。

### 方法一：ソースコードからビルドしてインストール

#### 1. ソースコードを取得して Safari 用の成果物をビルドする

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

出力ディレクトリ、App 名、Bundle Identifier をカスタマイズしたい場合は、次のように使用することもできます。

```bash
xcrun safari-web-extension-converter .output/safari-mv2/ \
  --project-location /path/to/all-api-hub-safari-project \
  --app-name "All API Hub" \
  --bundle-identifier "io.github.qixingjk.allapihub"
```

このステップで、Safari 拡張機能を格納するための Xcode プロジェクトが生成されます。

#### 3. Xcode でビルドして実行する

1. 生成された Xcode プロジェクトを開きます。
2. ターゲットデバイスが自身の Mac に選択されていることを確認します。
3. `Product > Run` をクリックするか、`Cmd + R` を押します。
4. 初めて実行する際に、Xcode は署名の処理を要求します。有料アカウントがない場合は、通常 `Personal Team` を使用してローカルデバッグが可能です。
5. ビルドが成功すると、Safari から拡張機能を有効にするように促されます。

#### 4. Safari で拡張機能を有効にする

1. Safari を開きます。
2. メニューバーの `Safari > 設定` をクリックします。
3. ローカルで正式に配布されていないバージョンである場合は、さらに `開発` メニューで `署名されていない拡張機能を許可` を有効にします。
4. `拡張機能` タブを開きます。
5. `All API Hub` を見つけて有効にします。
6. 必要に応じて権限を付与します。

### 方法二：GitHub Releases から Safari Xcode bundle をダウンロードする

#### 1. 正しい Safari アセットをダウンロードする

Releases ページを開き、以下のような名前のファイル（例：`all-api-hub-<version>-safari-xcode-bundle.zip`）をダウンロードします。

```text
all-api-hub-<version>-safari-xcode-bundle.zip
```

例：

```text
all-api-hub-3.29.0-safari-xcode-bundle.zip
```

`all-api-hub-<version>-safari.zip` だけをダウンロードしないでください。

理由：
`all-api-hub-<version>-safari.zip` は Safari のビルド成果物そのものであり、直接実行可能な Xcode プロジェクトは含まれていません。直接解凍して Xcode で開くのに適しているのは `safari-xcode-bundle.zip` です。

#### 2. 解凍すると何が見えるか

`all-api-hub-<version>-safari-xcode-bundle.zip` を解凍すると、通常、ディレクトリ内に以下が含まれています。

- `all-api-hub-<version>-safari.zip`
- `safari-mv2/`
- コンバーターによって生成された Xcode プロジェクトディレクトリ

このように設計されているのは、「ビルド済みの Safari 拡張ファイル」と「Xcode プロジェクト」を同じ bundle 内に配置し、プロジェクトを開いたときに拡張リソースが見つからずにファイル紛失のエラーが発生するのを防ぐためです。

#### 3. bundle 内のプロジェクトを直接 Xcode で開く

1. 解凍ディレクトリ内で Xcode プロジェクトを見つけます。
2. プロジェクトファイルをダブルクリックするか、Xcode で開きます。
3. ターゲットデバイスが自身の Mac に選択されていることを確認します。
4. `Product > Run` をクリックします。
5. Safari からプロンプトが表示されたら、`Safari > 設定 > 拡張機能` で拡張機能を有効にします。

#### 4. bundle 内の他のファイルが必要になるのはいつか

- `safari-mv2/`：Xcode プロジェクトが参照する、ビルド済みの拡張機能ディレクトリ。
- `all-api-hub-<version>-safari.zip`：アーカイブ、比較、またはビルド成果物の再配布を容易にするため。

通常、bundle 全体を解凍し、特定のディレクトリだけを個別に移動する必要はありません。

### 方法三：一時的なデバッグ（開発用途のみ）

一部の macOS / Safari バージョンでは、一時的なデバッグロードがサポートされていますが、正式なインストールまたは配布方法としては適していません。

```bash
pnpm run build:safari
```

その後、Safari で開発者モードを有効にします。

1. `Safari > 設定 > 高度な設定` を開きます。
2. 「メニューバーに開発メニューを表示する」にチェックを入れます。
3. メニューバーの `開発 > 署名されていない拡張機能を許可` をクリックします。
4. `Safari > 設定 > 拡張機能` で拡張機能を有効にします。

> **注意**
> この方法が利用できない場合は、上記の Xcode の手順に戻ってください。正式なリリースには、署名付き配布を使用してください。

## 開発モードのデバッグ

### 開発ビルド

```bash
# 開発モードビルド（ホットリロード）
pnpm run dev -- -b safari
```

### 拡張機能のデバッグ

1. **バックグラウンドスクリプト / ポップアップのデバッグ**：
   - Safari で、拡張機能アイコンを右クリックします。
   - `検証` を選択するか、Web Inspector を開きます。

2. **コンテンツスクリプトのデバッグ**：
   - 任意のウェブページで、ページを右クリックします。
   - `要素を検証` を選択します。
   - コンソールで拡張機能関連のログを確認します。

## よくある質問

### Q: なぜ Safari は特別な処理が必要なのですか？

A: Safari 拡張機能は、インストールおよび配布のために macOS アプリケーションとしてパッケージ化する必要があります。これは、Chrome / Edge / Firefox が `.crx` または `.xpi` ファイルを直接インストールするのとは異なります。

### Q: 開発者アカウントの有無で、どのような違いがありますか？

A:
- アカウントなし：自身でビルドして使用できますが、開発デバッグ / 自己利用が中心となり、通常は一般ユーザーに直接配布できません。
- アカウントあり：正式な署名を行い、TestFlight / App Store を通じて配布できます。長期的なメンテナンスと正式なリリースに適しています。

### Q: Chrome のように直接インストールできますか？

A: できません。Safari では、Chrome のように直接解凍して読み込んで正式なインストールを行うことはできません。ローカルでの使用は通常 Xcode を介し、正式な配布は TestFlight / App Store を介します。

### Q: ビルド中にエラーが発生した場合はどうすればよいですか？

A: 以下を確認してください。
- Xcode コマンドラインツールがインストールされていること：`xcode-select --install`
- Xcode のライセンスに同意していること：`sudo xcodebuild -license accept`
- Node.js のバージョンが 18 以上であること

### Q: 拡張機能の機能は Chrome バージョンと異なりますか？

A: 基本的な機能は完全に一致しています。ただし、Safari の WebExtensions API の一部の制限により、一部の機能には若干の違いがある場合があります。
- `sidePanel` API は Safari では利用できません（ポップアップウィンドウで代用します）。
- 一部の権限要求方法が異なる場合があります。

### Q: 拡張機能を更新するにはどうすればよいですか？

A:
- ソースコードからインストールした場合：Safari の成果物を再ビルドし、Xcode プロジェクトを再度実行します。
- Releases から bundle をダウンロードした場合：新しい `safari-xcode-bundle.zip` をダウンロードし、解凍してから新しい Xcode プロジェクトを開いて実行します。

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