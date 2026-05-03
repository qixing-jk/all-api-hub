# Web AI API Sniffing and Verification

> Sniff `Base URL` and `API Key` on webpages and verify them instantly. Supports right-click menu quick check and automatic detection for specific sites.

## Background

When browsing AI communities (e.g., Linux.do), GitHub Issues, or technical documentation, you often encounter shared test keys. The traditional approach is to copy the `Base URL`, copy the `Key`, open the extension, fill in the configuration, and click verify.

The **Web AI API Sniffing** feature simplifies this process into:
- Select text → Right-click "Check AI API" → Test directly.
- Or: On whitelisted sites, the extension automatically identifies the configuration on the page and pops up a prompt.

## Core Capabilities

### 1. Right-Click Menu Check (Context Menu)
Select text containing a `Base URL` or `API Key` on any webpage, right-click, and select **"Check AI API"**.
The extension will attempt to extract valid interface information from the selected text (or clipboard) and pop up a test overlay within the current page.

### 2. Automatic Sniffing (Auto Detect)
On specific whitelisted sites (e.g., `linux.do`), when you open a post containing a large number of keys, the extension will automatically scan the page content.
- If a likely valid `Base URL + Key` combination is extracted, a lightweight prompt will pop up in the upper right corner of the page.
- Click the prompt to open the test dialog.

### 3. In-page Test Dialog
Perform the following operations without leaving the current webpage:
- **Automatic Extraction**: Automatically separate `Base URL`, `Secret Key`, and `API Type` from the source text.
- **Instant Testing**: Click "Start Test" to verify the connectivity of the key and available models.
- **Get Model List**: Fetch the full list of model IDs supported by the upstream site with one click.
- **Save to Credentials**: Once verified, save it with one click to the extension's [API Credentials](./api-credential-profiles.md) for later export to tools like CherryStudio.

## Configuration and Customization

Navigate to **`Settings → Basic Settings → Web AI API Check`** to configure the following:

### 1. Basic Switches
- **Right-Click Menu**: Whether to show "Check AI API" in the browser's right-click menu.
- **Auto Detect**: Whether to enable background automatic scanning on matching sites.

### 2. Site Whitelist (URL Whitelist)
You can customize which sites the extension is allowed to automatically sniff.
- Supports **Regular Expression (RegExp)** matching (case-insensitive).
- **Default Configuration**: Usually includes built-in matching rules for common AI forums and communities.
- **Example**: Enter `linux\.do` to match all pages on that forum.

## Privacy and Security

- **Local Extraction**: The sniffing and extraction process is executed entirely locally in your browser.
- **Privacy Protection**: The extension does not automatically upload detected text to any server; API requests are only sent according to the `Base URL` you fill in when you click "Start Test".
- **Silent Scanning**: The automatic detection process is extremely lightweight and does not affect the scrolling or loading performance of the webpage.

## Related Documents

- [API Credential Profiles](./api-credential-profiles.md): Manage saved sniffing results.
- [Interface Verification and Health Status](./auto-refresh.md): Learn how the extension verifies interfaces.