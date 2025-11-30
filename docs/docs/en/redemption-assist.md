# Redemption Assist

> Helps you identify and redeem codes with one click, saving you from repetitive copying and pasting.

## Feature Overview

- **Automatic Redemption Code Recognition**: When you click or select text on a webpage, the plugin attempts to identify redemption codes, eliminating the need for manual character-by-character verification.
- **Thoughtful Pop-up Notifications**: Upon detecting a suspected redemption code, a small notification card will pop up in the lower right corner, asking if you want to redeem it immediately.
- **Smart Account Matching**: Based on the current page address, it automatically finds the most matching site account from All API Hub, so you don't have to search through lists yourself.
- **One-Click Redemption**: Click "Automatic Redemption," and the plugin will send a request in the background, displaying the redemption result as a tooltip.
- **Independent Switch**: Redemption Assist can be individually enabled/disabled in the settings, without affecting other functional modules.

## Prerequisites

1.  **A corresponding site account already exists in All API Hub**:
    - At least one account should be functional, with no issues regarding balance or permissions.
2.  **A redemption code genuinely exists on the page**:
    - Common forms include "Today's Redemption Code," "Gift Pack Code," "Check-in Code," etc., usually a 32-character combination.

---

## Usage Tutorial

### Tutorial One: Configuring Redemption Assist from Scratch

1.  **Add at least one target site account**
    - Add the site accounts you need to use redemption codes for in Account Management, and ensure they can log in and be accessed normally.

2.  **Enable the Redemption Assist switch (already enabled by default)**
    - Enable "Redemption Assist" on the "Basic Settings" page and keep other default settings for normal use.

3.  **Supplement accounts with custom check-in/redemption addresses (recommended)**
    - Open the account editing page and find "Custom Check-in/Redemption Address."
    - Fill in the address you usually visit directly for the redemption page to help the system match the current page with the account more accurately.

After completing the above steps, you can start experiencing the global redemption assistance capabilities.

### Tutorial Two: Typical Redemption Process in Daily Use

1.  **Open a page containing a redemption code**
    - For example: activity announcement pages, check-in reward pages, channel messages, etc.
    - A 32-character string usually appears on the page as the redemption code.

2.  **Trigger detection action**
    - Perform any of the following operations on the redemption code:
        - Drag the mouse to select the redemption code;
        - Click within the area where the redemption code is located to make it the currently selected text.

3.  **Observe the Redemption Assist prompt in the lower right corner**
    - When the system identifies a suspected redemption code, a prompt card will pop up in the lower right corner, displaying a desensitized preview of the redemption code.

4.  **Confirm and initiate automatic redemption**
    - Click "Automatic Redemption" on the card.
    - The plugin will automatically select the most suitable account based on the current page URL to send the redemption request.

5.  **View result prompts**
    - Upon success:
        - Usually, "Redemption successful" and information such as the credited quota will be displayed.
    - Upon failure:
        - The reason for failure will be displayed (e.g., invalid redemption code, redemption code already used), or a general failure message.

### Tutorial Three: How to Select the Right Account in Multi-Account Scenarios

1.  **When multiple available accounts exist for the same site**
    - Redemption Assist will pop up "Account Selection" instead of directly using any account.

2.  **View account information in the pop-up window**
    - You can see key information such as account name, site address, and remarks.
    - If there are many accounts, you can use the search filter to quickly locate the target account.

3.  **Select an account and confirm redemption**
    - After selecting the most suitable account, click confirm, and the system will perform the actual redemption operation for the chosen account.

### How to Improve the Success Rate of One-Click Redemption

If you want to achieve "one-click automatic redemption gets it done" as much as possible, you can focus on optimizing the following two points:

-   **Configure custom check-in/redemption addresses for frequently used accounts**:
    - On the account editing page, find "Custom Check-in/Redemption Address" and fill in the actual page address you use for redemption;
    - This will make the system more accurate when matching accounts based on the URL, reducing ambiguity with multiple accounts.

After meeting the above conditions, in most cases, clicking "Automatic Redemption" will succeed directly, rarely requiring manual account selection.

---

## Frequently Asked Questions

### Q1: Why is there no pop-up even though there's a redemption code on the page?

Possible reasons:

-   "Redemption Assist" is not enabled in the settings;
-   You did not perform selection or other operations on the redemption code, so the plugin had no opportunity to read the text;
-   The redemption code is not a standard 32-character string, or it contains spaces or special characters that prevent identification;
-   The browser or other plugins restrict script execution or clipboard access (e.g., extreme incognito mode, certain security plugin blocks).

Recommended troubleshooting steps:

1.  Confirm that "Redemption Assist" is enabled in the All API Hub settings;
2.  Confirm that the current site account has been added in Account Management and can be accessed normally;
3.  Retry in a common desktop browser (Chrome / Edge / Firefox);
4.  If still ineffective, you can provide site screenshots and debugging information in the repository Issues for feedback.

### Q2: Will automatic redemption affect account security?

-   The Redemption Assist logic is executed only within the local browser and will not upload account information or redemption codes to third-party servers;
-   All API requests are sent directly to the corresponding aggregate site;
-   It is recommended to use it in conjunction with the browser's own password and privacy protection strategies, such as browser password management and privacy mode.

## Related Documentation

-   [Auto Check-in and Check-in Monitoring](./auto-checkin.md)