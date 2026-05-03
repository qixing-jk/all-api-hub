# はじめに

わずか数分で、AIアセットのインテリジェント管理の旅を始めましょう。All API Hub は、残高の自動同期、毎日のチェックイン、および一般的なAIツールへのワンクリック統合を支援します。

## 1. プラグインのインストール

最適な体験（自動更新を含む）を得るために、**各ブラウザの公式ストアからのインストールを強くお勧めします**。

| チャネル | ダウンロードリンク | 現在のバージョン | ユーザー数 |
|---|---|---|---|
| Chrome ウェブストア | [Chrome ウェブストア](https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo) | [![Chrome version](https://img.shields.io/chrome-web-store/v/lapnciffpekdengooeolaienkeoilfeo?label=Chrome&logo=googlechrome&style=flat)](https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo) | [![Chrome Web Store Users](https://img.shields.io/chrome-web-store/users/lapnciffpekdengooeolaienkeoilfeo?label=Chrome%20Users)](https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo) |
| Edge ウェブストア | [Edge ウェブストア](https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa) | [![Edge version](https://img.shields.io/badge/dynamic/json?label=Edge&prefix=v&query=%24.version&url=https%3A%2F%2Fmicrosoftedge.microsoft.com%2Faddons%2Fgetproductdetailsbycrxid%2Fpcokpjaffghgipcgjhapgdpeddlhblaa&logo=microsoftedge&style=flat)](https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa) | [![Edge Add-ons Users](https://img.shields.io/badge/dynamic/json?label=Edge%20Users&query=$.activeInstallCount&url=https://microsoftedge.microsoft.com/addons/getproductdetailsbycrxid/pcokpjaffghgipcgjhapgdpeddlhblaa)](https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa) |
| Firefox ウェブストア | [Firefox ウェブストア](https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24}) | [![Firefox version](https://img.shields.io/amo/v/%7Bbc73541a-133d-4b50-b261-36ea20df0d24%7D?label=Firefox&logo=firefoxbrowser&style=flat)](https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24}) | [![Mozilla Add-on Users](https://img.shields.io/amo/users/%7Bbc73541a-133d-4b50-b261-36ea20df0d24%7D?label=Firefox%20Users)](https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24}) |
| GitHub Releases | [すべてのリリースを見る](https://github.com/qixing-jk/all-api-hub/releases) | [![GitHub version](https://img.shields.io/github/v/release/qixing-jk/all-api-hub?label=GitHub&logo=github&style=flat)](https://github.com/qixing-jk/all-api-hub/releases/latest) | [![GitHub Downloads (all assets, all releases)](https://img.shields.io/github/downloads/qixing-jk/all-api-hub/total?label=Total%20Downloads)](https://github.com/qixing-jk/all-api-hub/releases) |

<details>
<summary>📦 手動インストール、Safari、またはモバイルデバイスが必要ですか？（クリックして展開）</summary>

- **GitHub Release**：ストアにアクセスできない場合は、[GitHub Releases](https://github.com/qixing-jk/all-api-hub/releases) にアクセスして、正式版または Nightly 版をダウンロードできます。
- **Safari (Mac)**：Xcode を介してインストールする必要があります。詳細は [Safari インストールガイド](./safari-install.md) を参照してください。
- **QQ / 360 など**：Chromium ベースのブラウザで手動ロードをサポートしています。詳細は [手動インストールガイド](./other-browser-install.md) を参照してください。
- **モバイルデバイス**：Edge モバイル版、Firefox Android、Kiwi などに対応しています。詳細は [モバイル FAQ](./faq.md#mobile-browser-support) を参照してください。

</details>

<a id="add-site"></a>
## 2. 最初のアカウントを追加する

これは、プラグインを使用する上で最も重要なステップです。**「自動認識」機能の使用を強くお勧めします**。これは、QR コードでログインするのと同じくらい簡単です。

### 2.1 自動認識（推奨）

::: tip ステップ 1
まず、ブラウザで AI 中継ステーションのウェブサイトを開き、ログインしてください。
:::

1. ブラウザの右上にあるプラグインアイコンをクリックして、メインページを開きます。
2. **`アカウントを追加`** をクリックします。
3. 表示されるダイアログボックスに、サイトの URL を入力します。
4. **`自動認識`** をクリックします。
5. 情報に誤りがないことを確認したら、**`追加を確定`** をクリックします。

> **盾越えのヒント**：サイトに Cloudflare 認証（5 秒ルール）がある場合、プラグインは自動的にウィンドウを表示して盾越えを支援します。認証が完了すると、自動的に認識を続行します。

<a id="manual-addition"></a>
### 2.2 手動追加（代替）

自動認識がうまくいかない場合や、正確に制御したい場合は、手動で入力できます：
- **ユーザー名 / ID**：サイトに表示される名前。
- **アクセス トークン (Access Token)**：通常、サイトの「設定」または「トークン」ページで見つけることができます。
- **モード選択**：デフォルトでは `Access Token` モードを推奨します。

---

## 3. サポートされているサイトタイプ

All API Hub は、市場のほぼすべての主要な AI 中継ステーションアーキテクチャをサポートしています。これらには以下が含まれます：
- **One API / New API** シリーズ（最も一般的）
- **Sub2API**
- **AnyRouter / VoAPI / Super-API** などの特殊アーキテクチャ

::: tip 互換性に関するヒント
これら上記のオープンソースシステムに基づいて構築されたサイトは、通常、完全にサポートされます。完全な互換性リストについては、[サポートされているサイトとシステムタイプ](./supported-sites.md) を参照してください。
:::

<a id="quick-export-sites"></a>
## 4. クイックエクスポートと統合

アカウントを追加した後、これらの設定をワンクリックで他の AI ツールに「プッシュ」でき、手動でのコピー＆ペーストは不要になります。

1. **`キー管理`** ページに移動します。
2. エクスポートしたいキーを見つけ、メニューから **`CherryStudio にエクスポート`**、**`CC Switch にエクスポート`** などを選択します。
3. AI クライアントが自動的に起動し、設定が完了します。

> 完全なリストについては、[サポートされているエクスポートツールと統合ターゲット](./supported-export-tools.md) を参照してください。

---

## 5. コア機能の詳細ガイド

### 📊 アセットダッシュボードと統計
- **5.1 [アセット概要とリアルタイム更新](./auto-refresh.md)**：複数サイトの残高、使用量、健全状態を一元管理。
- **5.2 [残高履歴](./balance-history.md)**：資産の変動トレンドを直感的に表示。
- **5.3 [使用量統計分析](./usage-analytics.md)**：消費量、モデル分布、遅延を多角的に分析。

### 🔑 キー管理とクイック統合
- **5.4 [トークン管理](./key-management.md)**：サイトのトークンを一元管理し、ワンクリックで補完可能。
- **5.5 [独立 API 資格情報プロファイル](./api-credential-profiles.md)**：アカウントなしで URL+Key を保存し、一括検証可能。
- **5.6 [Web API スニッフィング](./web-ai-api-check.md)**：Web ページ内で API 設定を迅速に識別・テスト。

### ⚡ 自動化と残高収益
- **5.7 [自動チェックインフロー](./auto-checkin.md)**：すべてのサイトのチェックインを毎日自動的に実行。
- **5.8 [引き換えアシスタント](./redemption-assist.md)**：Web ページ上の引き換えコードを自動認識し、ワンクリックで取得。
- **5.9 [ブックマーク整理](./bookmark-management.md)**：コンソール、ドキュメント、チャージ入口を一元管理。

### 🛡️ 安定性とセキュリティ保護
- **5.10 [Cloudflare 盾越えアシスタント](./cloudflare-helper.md)**：検証を支援し、リフレッシュやチェックインの中断を防ぎます。
- **5.11 [WebDAV 同期と暗号化](./webdav-sync.md)**：クロスデバイスでの暗号化バックアップをサポートし、データを失わないようにします。

### 🛠️ セルフホスト型サイト運用ツール
- **5.12 [セルフホスト型サイト管理](./self-hosted-site-management.md)**：プラグイン内で直接チャネルの追加、削除、変更、クエリを実行。
- **5.13 [モデル同期とリダイレクト](./managed-site-model-sync.md)**：アップストリームモデルを一括同期し、マッピングロジックを設定。

---

## 6. その他の説明

- [よくある質問 FAQ](./faq.md)
- [更新ログ](./changelog.md)
- [権限説明](./permissions.md)
- [データ管理](./data-management.md)

</latest_source_markdown>