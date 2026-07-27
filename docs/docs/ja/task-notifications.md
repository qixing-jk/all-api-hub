# タスク通知

> バックグラウンドのスケジュールタスク完了後に、ブラウザ通知またはサードパーティチャネルで結果を受け取ります。

<a id="channels"></a>
## 対応チャネル

**`設定 → 一般 → 通知`** でタスク通知を有効にすると、自動チェックイン、WebDAV 自動同期、モデル同期、利用履歴同期、残高履歴キャプチャ、サイト公告ごとに通知を設定できます。

現在対応しているチャネルは次のとおりです。

| チャネル | 向いている用途 | 必要な設定 |
|----------|----------------|------------|
| ブラウザシステム通知 | 現在の端末だけで通知を受け取る | ブラウザの `notifications` 権限 |
| Telegram Bot | Telegram のチャットやグループで通知を受け取る | Bot Token、Chat ID |
| Feishu Bot | Feishu グループでチーム通知を受け取る | Feishu カスタムボットの Webhook URL または key |
| DingTalk Bot | DingTalk グループでチーム通知を受け取る | DingTalk カスタムボットの Webhook URL または access_token、任意の署名 Secret |
| WeCom Bot | WeCom グループでチーム通知を受け取る | WeCom グループのメッセージプッシュ Webhook URL または key |
| ntfy | ntfy アプリ、自ホスト ntfy サーバー、購読中のトピックで通知を受け取る | Topic URL またはトピック名、任意のアクセストークン |
| 汎用 Webhook | 自ホストサービス、自動化プラットフォーム、互換サービスへ接続する | JSON リクエストを受け取れる HTTP(S) エンドポイント |

設定後は、各チャネルの **`テスト通知を送信`** をクリックして、通知が届くことを確認してください。

<a id="feishu"></a>
## Feishu Bot

Feishu チャネルは、Feishu グループのカスタムボットを使ってテキスト通知を送信します。最も簡単な設定方法は、Feishu が提供する Webhook URL 全体を貼り付けることです。

### Webhook URL を取得する

1. 通知を送りたい Feishu グループを開きます。
2. グループ設定またはボット入口から **カスタムボット** を追加します。
3. Feishu が生成した Webhook URL をコピーします。通常は次のような形式です。

```text
https://open.feishu.cn/open-apis/bot/v2/hook/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

4. All API Hub で **`設定 → 一般 → 通知 → Feishu Bot`** を開きます。
5. 完全な Webhook URL を **`Webhook URL または key`** に貼り付け、チャネルを有効にして **`テスト通知を送信`** をクリックします。

`/hook/` の後ろにある key だけをコピーした場合も、そのまま入力できます。All API Hub が Feishu Webhook URL を自動補完します。

### セキュリティ設定

Feishu カスタムボットは、キーワード、IP ホワイトリスト、署名検証などのセキュリティ設定に対応しています。ボットの作成とセキュリティ設定については、[Feishu カスタムボットガイド](https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot) を参照してください。

All API Hub で利用する際の注意点:

- キーワード検証を有効にしている場合は、通知タイトルまたは本文に設定済みキーワードが含まれるようにしてください。例: `All API Hub`。
- IP ホワイトリストは現在のネットワーク出口に依存します。モバイル回線、プロキシ、自宅回線の出口変更により送信に失敗することがあります。
- 現在の Feishu チャネルは Webhook URL または key のみを設定でき、署名シークレットの入力欄はありません。Feishu 側で署名検証を有効にしている場合、署名が送信されないためテスト通知が失敗する可能性があります。

### よくあるエラー

| エラー | 考えられる原因 | 対処方法 |
|--------|----------------|----------|
| `param invalid: incoming webhook access token invalid` | Webhook URL または key が間違っている、またはボットが削除 / 再作成された | Feishu ボット設定ページから完全な Webhook URL を再コピーする |
| `Bad Request` | Feishu がリクエスト本文を拒否した。多くの場合、ボットのセキュリティ設定と一致していない | キーワード、セキュリティ設定、ボットが対象グループに残っているかを確認する |
| テスト通知が届かない | チャネルが無効、URL が空、ネットワーク失敗、または Feishu のセキュリティポリシーにブロックされた | チャネルを有効化して再度テスト通知を送り、Feishu グループのボット設定を確認する |

<a id="dingtalk"></a>
## DingTalk Bot

DingTalk チャネルは、DingTalk グループのカスタムボットを使ってテキスト通知を送信します。最も簡単な設定方法は、DingTalk が提供する Webhook URL 全体を貼り付けることです。`access_token=` の後ろの値だけをコピーした場合も、そのまま入力できます。

### ボットを作成して Webhook URL を取得する

1. 通知を送りたい DingTalk グループを開きます。
2. グループ設定で **ボット** を選び、**カスタムボット** を追加します。
3. ボット名とセキュリティ設定を構成します。DingTalk はカスタムキーワード、署名、IP アドレス範囲に対応しています。
4. 作成後、カスタムボットの設定ページを開き、Webhook URL をコピーします。通常は次のような形式です。

```text
https://oapi.dingtalk.com/robot/send?access_token=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

5. All API Hub で **`設定 → 一般 → 通知 → DingTalk Bot`** を開きます。
6. 完全な Webhook URL を **`Webhook URL または access_token`** に貼り付けます。DingTalk 側で署名セキュリティを有効にしている場合は、生成された `SEC...` の値を **`署名 Secret`** に貼り付けます。
7. チャネルを有効にして **`テスト通知を送信`** をクリックします。

### セキュリティ設定

All API Hub で DingTalk のセキュリティ設定を使う際の注意点:

- キーワード検証を有効にしている場合は、通知タイトルまたは本文に設定済みキーワードが含まれるようにしてください。例: `All API Hub`。
- 署名セキュリティを有効にしている場合は、DingTalk の `SEC...` Secret を入力してください。All API Hub は送信ごとに `timestamp` と HMAC-SHA256 の `sign` を生成します。
- IP アドレス範囲は現在のネットワーク出口に依存します。モバイル回線、プロキシ、自宅回線の出口変更により送信に失敗することがあります。
- Webhook URL と署名 Secret は公開しないでください。公開リポジトリ、公開ドキュメント、スクリーンショットに含めないようにしてください。

DingTalk の公式手順は、[カスタムボットの作成](https://open.dingtalk.com/document/dingstart/custom-bot-creation-and-installation)、[カスタムボットのセキュリティ設定](https://open.dingtalk.com/document/dingstart/customize-robot-security-settings)、[カスタムボット Webhook URL の取得](https://open.dingtalk.com/document/dingstart/obtain-the-webhook-address-of-a-custom-robot) を参照してください。

### API の動作

DingTalk カスタムボット API は `POST /robot/send?access_token=...` でメッセージを送信します。All API Hub はテキストメッセージを送信します。

```json
{
  "msgtype": "text",
  "text": {
    "content": "通知タイトル\n通知内容"
  },
  "at": {
    "isAtAll": false
  }
}
```

署名 Secret を設定している場合、リクエスト URL には `timestamp` と `sign` も含まれます。All API Hub は `errcode: 0` を成功として扱います。DingTalk が別の `errcode` を返した場合、テスト通知では返された `errmsg` を表示し、設定確認に使えるようにします。

### よくあるエラー

| エラー | 考えられる原因 | 対処方法 |
|--------|----------------|----------|
| `keywords not in content` または類似のキーワードエラー | キーワード検証が有効だが、通知内容にキーワードが含まれていない | DingTalk のキーワードを調整するか、通知タイトル/本文にそのキーワードを含める |
| `sign not match` または類似の署名エラー | 署名セキュリティが有効だが、Secret が未入力または間違っている | DingTalk ボット設定ページから `SEC...` Secret を再コピーする |
| `msgtype is null` | DingTalk がリクエスト本文を有効なボットメッセージとして解析できなかった | `msgtype` を含む DingTalk テキスト payload を送信するバージョンに All API Hub を更新し、再度テスト通知を送る |
| `access_token` 関連のエラー | Webhook URL または access_token が間違っている、またはボットが削除 / 再作成された | DingTalk ボット設定ページから完全な Webhook URL を再コピーする |
| テスト通知が届かない | チャネルが無効、URL が空、ネットワーク失敗、または DingTalk のセキュリティポリシーにブロックされた | チャネルを有効化して再度テスト通知を送り、DingTalk グループのボット設定を確認する |

<a id="wecom"></a>
## WeCom Bot

WeCom チャネルは、WeCom グループのメッセージプッシュ設定を使ってテキスト通知を送信します。最も簡単な設定方法は、WeCom が提供する Webhook URL 全体を貼り付けることです。

### Webhook URL を取得する

1. 通知を送りたい WeCom グループを開きます。
2. グループ設定を開き、**メッセージプッシュ** を探します。
3. 新しいメッセージプッシュ設定を作成するか、既存の設定を開きます。
4. WeCom が生成した Webhook URL をコピーします。通常は次のような形式です。

```text
https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

5. All API Hub で **`設定 → 一般 → 通知 → WeCom Bot`** を開きます。
6. 完全な Webhook URL を **`Webhook URL または key`** に貼り付け、チャネルを有効にして **`テスト通知を送信`** をクリックします。

`key=` の後ろにある key だけをコピーした場合も、そのまま入力できます。All API Hub が WeCom Webhook URL を自動補完します。

### API の動作

WeCom のメッセージプッシュ API は `POST /cgi-bin/webhook/send?key=...` でメッセージを送信します。All API Hub はテキストメッセージを送信します。

```json
{
  "msgtype": "text",
  "text": {
    "content": "通知タイトル\n通知内容"
  }
}
```

All API Hub は `errcode: 0` を成功として扱います。WeCom が別の `errcode` を返した場合、テスト通知では返された `errmsg` を表示し、設定確認に使えるようにします。

### 制限

メッセージ形式と送信頻度制限は [WeCom メッセージプッシュ設定ドキュメント](https://developer.work.weixin.qq.com/document/path/99110) に従います。

All API Hub で利用する際の注意点:

- WeCom メッセージプッシュには送信頻度制限があります。多数のタスクが同時に完了すると、プラットフォーム側のレート制限にかかる可能性があります。
- テスト通知で `invalid webhook url`、`key not found`、または類似のエラーが返る場合は、WeCom のメッセージプッシュ設定から完全な Webhook URL を再コピーしてください。

<a id="ntfy"></a>
## ntfy

ntfy チャネルは、ntfy のトピック公開 API を使ってプレーンテキスト通知を送信します。公開サービス `ntfy.sh` を使うことも、自ホスト ntfy サーバーのトピック URL を入力することもできます。

### トピックを設定する

1. ntfy アプリ、Web アプリ、または自ホストサーバーで、`all-api-hub-alerts` のようなトピック名を用意します。
2. All API Hub で **`設定 → 一般 → 通知 → ntfy`** を開きます。
3. **`Topic URL またはトピック名`** に完全なトピック URL を入力します。

```text
https://ntfy.sh/all-api-hub-alerts
```

トピック名だけを入力することもできます。

```text
all-api-hub-alerts
```

トピック名だけを入力した場合、All API Hub は `https://ntfy.sh/<トピック名>` に送信します。自ホスト ntfy サーバーを使う場合は、次のように完全な URL を入力してください。

```text
https://ntfy.example.com/all-api-hub-alerts
```

4. トピックで認証が必要な場合は、**`アクセストークン（任意）`** に ntfy access token を入力します。公開トピックでは空のままで構いません。
5. チャネルを有効にして **`テスト通知を送信`** をクリックします。

### API の動作

All API Hub は ntfy の公開 API を使い、トピック URL に `POST` リクエストを送信します。通知本文はプレーンテキストのリクエスト本文として送信し、通知タイトルは `Title` リクエストヘッダーに入れます。非 ASCII のタイトルは、ブラウザ拡張バックグラウンドのリクエストヘッダー制限に対応するため、送信前に RFC 2047 形式へエンコードします。アクセストークンを設定している場合は、`Authorization: Bearer <token>` も送信します。

ntfy の公開 API、リクエストヘッダー、認証方式については、公式ドキュメント [Publishing messages](https://docs.ntfy.sh/publish/) を参照してください。

### 制限

- 公開 `ntfy.sh` のトピックはプライベート名前空間ではありません。推測されにくいトピック名を使うか、自ホストサーバーとアクセストークンを利用してください。
- 自ホストサーバーで非公開トピックを使う場合は、アクセストークンに公開権限があることを確認してください。
- テスト通知で `401`、`403`、または類似の認証エラーが返る場合は、トピック URL、アクセストークン、サーバー側の権限設定を確認してください。

## 関連ドキュメント

- [権限説明](./permissions.md)
- [自動チェックインフロー](./auto-checkin.md)
- [WebDAV 同期と暗号化](./webdav-sync.md)
