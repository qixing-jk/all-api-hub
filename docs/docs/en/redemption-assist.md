# Redemption Assist

> Helps you recognize redemption codes and redeem them with one click, eliminating repetitive copy-pasting.

## Feature Overview

- **Automatic Redemption Code Recognition**: When you click, select, or copy text on a webpage, the plugin will attempt to identify redemption codes from it, eliminating the need for manual character-by-character verification.
- **Thoughtful Pop-up Notifications**: Upon detecting a suspected redemption code, a small notification card will pop up in the bottom right corner, prompting you whether to redeem it immediately.
- **Intelligent Account Matching**: Based on the current page URL, it automatically finds the most matching site account from All API Hub, eliminating the need to manually search through lists.
- **One-Click Redemption Completion**: Click "Auto Redeem", and the plugin will initiate a request in the background, displaying the redemption result as a notification bubble.
- **Independent Switch**: You can enable/disable Redemption Assist independently in the settings, without affecting other functional modules.

## Prerequisites

1. **Corresponding Site Account Exists in All API Hub**:
   - At least one account is functional, with no issues regarding balance or permissions.
2. **Redemption Code Actually Exists on the Page**:
   - Common forms include "Today's Redemption Code", "Gift Pack Code", "Check-in Code", etc., usually a 32-character combination.

---

## Usage Tutorial

### Tutorial One: Configuring Redemption Assist from Scratch

1. **Add at least one target site account**
   - Add the site account that requires redemption codes in account management, and ensure it can log in and access normally.

2. **Enable Redemption Assist Switch (Enabled by default)**
   - On the "Basic Settings" page, enable "Redemption Assist" and keep other default settings to use it normally.

3. **Add Custom Check-in/Redemption URL for Accounts (Recommended)**
   - Open the account editing page and find "Custom Check-in/Redemption URL".
   - Enter the URL you normally use to access the redemption page, making it easier for the system to more accurately match the current page with the account.

After completing the above steps, you can start experiencing the global redemption assistance capability.

### Tutorial Two: Typical Redemption Process in Daily Use

1. **Open the page containing the redemption code**
   - For example: activity announcement page, check-in reward page, channel messages, etc.
   - A 32-character string usually appears on the page as the redemption code.

2. **Trigger detection action**
   - Perform any of the following actions on the redemption code:
     - Drag the mouse to select the redemption code;
     - Use a shortcut key to copy the redemption code;
     - Click on a copyable area on some pages.

3. **Observe the Redemption Assist prompt in the bottom right corner**
   - When the system identifies a suspected redemption code, a notification card will pop up in the bottom right corner, displaying a de-sensitized preview of the redemption code.

4. **Confirm and initiate auto-redemption**
   - Click "Auto Redeem" on the card.
   - The plugin will automatically select the most suitable account based on the current page URL to initiate the redemption request.

5. **View result prompt**
   - On success:
     - It usually displays "Redemption successful" and information such as the credited quota.
   - On failure:
     - It will display the reason for failure (e.g., invalid redemption code, redemption code already used, etc.), or a general failure prompt.

### Tutorial Three: How to Select the Appropriate Account in Multi-Account Scenarios

1. **When multiple accounts are available for the same site**
   - Redemption Assist will pop up "Account Selection" instead of directly using any account.

2. **View account information in the pop-up window**
   - You can see key information such as account name, site address, and remarks.
   - If there are many accounts, you can use search filtering to quickly locate the target account.

3. **Select an account and confirm redemption**
   - After selecting the most suitable account, click confirm, and the system will perform the actual redemption operation for the selected account.

---

### How to Improve the Success Rate of One-Click Redemption

If you wish to achieve "one-click auto-redemption" as much as possible, you can focus on optimizing the following two points:

- **Configure custom check-in/redemption URLs for frequently used accounts**:
  - On the account editing page, find "Custom Check-in/Redemption URL" and enter the actual page URL you use for redemption;
  - This will make the system more accurate when matching accounts based on the URL, reducing ambiguity among multiple accounts.

Once the above conditions are met, in most cases, clicking "Auto Redeem" will lead to direct success, rarely requiring you to manually select an account.

---

## Frequently Asked Questions

### Q1: There's clearly a redemption code on the page, but no prompt appears?

Possible reasons:

- Redemption Assist is not enabled in the settings;
- You did not perform selection or copy operations on the redemption code, so the plugin had no opportunity to read the text;
- The redemption code is not a standard 32-character string, or it contains spaces or special characters, making it unrecognizable;
- The browser or other plugins restrict script execution or clipboard access (e.g., extreme incognito mode, certain security plugin blocks).

Suggested troubleshooting steps:

1. Confirm that "Redemption Assist" is enabled in All API Hub settings;
2. Confirm that the current site account has been added in account management and can be accessed normally;
3. Retry in a common desktop browser (Chrome / Edge / Firefox);
4. If still ineffective, you can provide feedback in the repository Issues with a site screenshot and debugging information.

### Q2: Does auto-redemption affect account security?

- The Redemption Assist logic is executed only within the local browser and does not upload account information or redemption codes to third-party servers;
- All API requests are sent directly to the corresponding aggregate site;
- It is recommended to use it in conjunction with the browser's own password and privacy protection policies, such as browser password management, privacy mode, etc.

## Related Documents

- [Automatic Check-in and Check-in Monitoring](./auto-checkin.md)