# Share Snapshot

> The Share Snapshot feature lets you generate card-style images of your "Overview" or "Account Status" for one-click sharing to communities, social media, or friends. Snapshots include built-in privacy protection that automatically hides sensitive info like API Keys.

## Use Cases

- You want to show others your current asset overview without manually taking screenshots and redacting sensitive data.
- During community discussions (e.g., [Linux.do](https://linux.do)), display your balance heatmap or model distribution.
- Quickly record account usage at a specific moment as a reference image.

## How to Generate a Snapshot

### 1. Share Overview Snapshot
1. Click the extension icon to open the **Overview** page.
2. Find the **Share Overview Snapshot** button (camera or share icon) in the top right corner.
3. Click it, and the extension will generate a beautiful card with a mesh gradient background based on your current balance, usage, and account count.

### 2. Share Account Snapshot
1. Open the extension settings page and go to **Account Management**.
2. Locate the account card you want to share.
3. Click the operation menu (three dots or right-click) and select **Share Account Snapshot**.
4. The generated snapshot will include the account name, site address, balance, today's income/outcome, and current health status.

## Privacy

- **Auto redaction**: Full API Keys or Tokens are never shown in the image.
- **Site masking**: Only the domain or name is displayed; full paths that could contain private identifiers are hidden.
- **Local generation**: Images render entirely in your browser and are never uploaded.

## Interaction & Saving

- **Copy to Clipboard**: The extension prioritizes copying the generated image directly to your clipboard. You can then paste it (`Ctrl+V` or `Cmd+V`) into a chat box.
- **Auto Download**: If your browser does not support direct image copying, the extension will automatically download a `.png` file.
- **Copy Text Caption**: A button to copy a text caption is usually provided below the snapshot for easy posting along with the image.

## Custom Styles (Experimental)

Snapshots use a dynamic **Mesh Gradient** background. Each generated image has subtle color variations, giving every snapshot a distinct look.

## Related Documentation

- [Account Management](./README.md)
- [Usage Analytics](./usage-analytics.md)