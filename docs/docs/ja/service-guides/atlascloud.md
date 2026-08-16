# Atlas Cloud の API 資産を All API Hub で管理する

> Atlas Cloud と All API Hub を組み合わせてモデル価格を比較し、よく使う AI ツールへ認証情報をすばやくエクスポートします。

Atlas Cloud は、動画生成、画像生成、LLM API を 1 つの API で提供するマルチモーダル AI 推論プラットフォームです。300 以上の厳選モデルに対応しています。複数の Atlas Cloud アカウントや AI API プラットフォームを使っている場合、All API Hub で認証情報を 1 つのローカル管理画面にまとめられます。

Atlas Cloud の認証情報を追加すると、モデル価格の確認と、Cherry Studio、CC Switch、Kilo Code、CLIProxyAPI、Claude Code Router、セルフホスト型バックエンドへのエクスポートができます。

![All API Hub ホーム画面のプレビュー](../../static/image/sponsor-guides/atlascloud/all-api-hub-home-preview.png)

---

## 1. All API Hub でできること

**All API Hub**（[GitHub で公開](https://github.com/qixing-jk/all-api-hub)）は、複数の AI API アカウント、サイト、クライアント設定を管理するブラウザ拡張機能です。Atlas Cloud ユーザーは、API キー、モデル価格、エクスポート設定を 1 つの流れで扱えます。

Atlas Cloud と組み合わせると、次の用途に役立ちます。

- **API 認証情報の一元管理**：Atlas Cloud のキーを **API 認証情報プロファイル** で他の認証情報とまとめて管理できます。
- **アカウント間の価格比較**：Atlas Cloud のモデル価格を追加済みの他アカウントと比較できます。
- **認証情報の再利用**：`Base URL + API Key` をクライアント、CLI ツール、セルフホスト型チャネルへエクスポートできます。
- **クライアントへの直接エクスポート**：API 認証情報プロファイルから Cherry Studio、CC Switch、Kilo Code などへ出力できます。
- **複数端末での継続利用**：インポート / エクスポートや WebDAV 同期で設定を移行できます。

Atlas Cloud がモデル API を提供し、All API Hub が認証情報、価格、下流ツール設定を整理します。

---

## 2. All API Hub をインストールする

可能であれば利用中のブラウザに対応した公式ストアからインストールしてください。

- **Chrome**：[Chrome ウェブストア](https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo)
- **Edge**：[Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa)
- **Firefox**：[Firefox Add-ons](https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24})
- **その他のブラウザ**：[その他のブラウザへのインストールガイド](../other-browser-install.md)
- **Mac の Safari**：[Safari インストールガイド](../safari-install.md)
- **モバイルブラウザ**：[モバイルブラウザ FAQ](../faq.md#mobile-browser-support)
- **代替手段**：[GitHub Releases](https://github.com/qixing-jk/all-api-hub/releases/latest) から Stable パッケージを取得できます。手動インストール版は自動更新されません。

---

## 3. Atlas Cloud API 認証情報を追加する

Atlas Cloud は現在、自動認識に対応していません。Atlas Cloud コンソールで API キーを作成してから、All API Hub に手動で保存してください。

### 3.1 手動で認証情報を追加する

1. ブラウザで [Atlas Cloud](https://www.atlascloud.ai/console/coding-plan?utm_source=github&utm_medium=link&utm_campaign=all-api-hub) にログインします。
2. プロフィールの **API Keys** でキーを作成または管理します。

   ![Atlas Cloud コンソールで API キーを作成](../../static/image/sponsor-guides/atlascloud/atlascloud-api-key-create.png)
   ![Atlas Cloud API キー一覧を確認](../../static/image/sponsor-guides/atlascloud/atlascloud-api-key-list.png)

3. ブラウザ右上の All API Hub 拡張機能アイコンをクリックします。
4. **アカウントを追加** をクリックし、スポンサー一覧から **Atlas Cloud** を選びます。

   ![アカウント追加で Atlas Cloud を選択](../../static/image/sponsor-guides/atlascloud/atlascloud-add-account-select.png)

5. キーを入力して保存します。

   ![Atlas Cloud API キーを入力して保存](../../static/image/sponsor-guides/atlascloud/atlascloud-add-account-save.png)

:::: tip
保存後、拡張機能はインポートされた API キーを使ってモデル一覧と価格情報を読み取ります。
::::

---

## 4. Atlas Cloud ユーザー向けの主な使い方

### 4.1 AI クライアントへエクスポートする

1. **API 認証情報プロファイル** で Atlas Cloud のキーを見つけます。
2. エクスポートボタンをクリックします。
3. **Cherry Studio**、**CC Switch**、**Kilo Code**、**CLIProxyAPI**、**Claude Code Router**、または設定済みのセルフホスト型チャネルを選びます。

![API 認証情報プロファイルから Atlas Cloud キーをエクスポート](../../static/image/sponsor-guides/atlascloud/atlascloud-credential-export-menu.png)

`Base URL + API Key` のコピー、API / CLI 互換性確認、利用可能モデル一覧の確認、複数クライアントへの出力、セルフホスト型サイトへのインポート、インポート / エクスポートや WebDAV 同期による移行も可能です。

::: warning 認証情報の転送範囲
ブラウザのローカルストレージはデフォルトの保存場所にすぎません。クライアントへのエクスポート、セルフホスト型サイトへのインポート、API / CLI テスト、WebDAV 同期では、認証情報がそれぞれの宛先に送信されます。信頼できる宛先にのみキーを送信し、不要になったら失効させてください。
:::

### 4.2 セルフホスト型チャネルへインポートする

AI 分配バックエンドを運用している場合、Atlas Cloud を上流プロバイダーとして利用できます。**基本設定 → セルフホスト型サイト管理** でバックエンドを設定し、**API 認証情報プロファイル** から現在のサイトへ認証情報をインポートします。複数の認証情報を一括処理することもできます。

### 4.3 バックアップと端末移行

All API Hub のデータは既定では現在のブラウザ内に保存されます。複数端末で使う場合は、データのインポート / エクスポートまたは明示的に設定した WebDAV 同期を利用してください。

---

## 5. All API Hub と API クライアントの違い

| 項目 | All API Hub（管理側） | Cherry Studio / NextChat など（利用側） |
| --- | --- | --- |
| 主な役割 | Atlas Cloud と他の AI API アカウント、キー、価格、チャネルを管理する | チャット、推論、プロンプトや Agent ワークフローを実行する |
| 主な操作 | 認証情報管理、価格比較、エクスポート、チャネルインポート | チャット、ファイル分析、Agent ワークフロー |
| 関係 | キー、Base URL、価格などの元設定を整理する | 管理済みの認証情報を使ってモデルを呼び出す |

おすすめの使い方は、All API Hub で Atlas Cloud のキー、価格、エクスポート設定を管理し、実際のリクエストは普段使っているクライアントから送ることです。

---

## 6. FAQ

**Q: All API Hub は API キーをアップロードしますか？**

A: 既定では、アカウントとキーの情報はブラウザ内に保存されます。エクスポート、セルフホスト型サイトへのインポート、API / CLI テスト、WebDAV 同期では認証情報が対応する宛先へ送信されます。信頼できる宛先にのみキーを送信し、不要になったら失効させてください。

**Q: どのようなユーザーに適していますか？**

A: 複数の Atlas Cloud アカウントや他の AI API プラットフォームを使う場合、または複数のクライアントや端末に設定する場合に便利です。

**Q: セルフホスト型バックエンドがなくても使えますか？**

A: はい。認証情報を追加すれば、キー管理、モデル価格比較、クライアントへのエクスポートを利用できます。

**Q: エクスポート後、クライアントは単独で動作しますか？**

A: はい。All API Hub は設定の生成や入力を支援するだけで、実際のモデル呼び出しは対象クライアントが行います。

**Q: Atlas Cloud コンソールとの関係は？**

A: 両者は併用するものです。公式のアカウント、チャージ、サービス操作は Atlas Cloud コンソールが担当し、All API Hub はキー、価格、クライアント設定の日常管理を担当します。

---

## リンク

- [Atlas Cloud](https://www.atlascloud.ai/console/coding-plan?utm_source=github&utm_medium=link&utm_campaign=all-api-hub)
- [All API Hub GitHub リポジトリ](https://github.com/qixing-jk/all-api-hub)
- [All API Hub ドキュメント](https://all-api-hub.qixing1217.top/ja/)
