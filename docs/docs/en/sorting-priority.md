# Sorting Priority Settings

> Customize the priority of various sorting rules in the account list, ensuring that the most important and attention-worthy accounts always appear at the top.

## Feature Overview

- **Multiple Sorting Rule Combinations**
  - Supports multi-dimensional sorting by disabled status, pinned status, current site, health status, check-in requirement, custom links, user fields, and more.
- **Drag-and-Drop Priority Adjustment**
  - Easily change the order of sorting rules by dragging them in the settings page.
- **Enable/Disable as Needed**
  - Each sorting rule can be individually toggled on or off to suit different usage habits.

## Accessing Settings

1. Open the extension → Go to the **Settings** page.
2. Switch to the **"Account Management"** tab.
3. Find the **"Sorting Priority Settings"** section at the bottom of the page.

> Tip: You may also see "Settings → Sorting Priority Settings" mentioned in the user documentation; this page provides a detailed explanation of this feature.

## Available Sorting Rules Explanation

The table below corresponds to `SortingCriteriaType` in the code, and will be displayed with more user-friendly descriptions in the UI:

- **Disabled Accounts at Bottom (disabledAccount)**
  - Description: Disabled accounts are always moved to the very bottom of the list to avoid interfering with daily use.

- **Pinned Priority (pinnedPriority)**
  - Description: All pinned accounts will be prioritized at the very top of the list, and ordered by their pinned sequence.
  - Suitable for placing frequently used or important sites at the top.

- **Current Site Priority (currentSitePriority)**
  - Description: When you open the extension on a specific hub page, accounts corresponding to that site will be prioritized.
  - Convenient for viewing corresponding account information while browsing the site.

- **Health Status (healthStatus)**
  - Description: Sorts by "Error > Warning > Unknown > Normal" order, bringing abnormal accounts to the forefront.
  - Recommended to always enable for quick detection of abnormal channels.

- **Check-in Requirement (checkInRequirement)**
  - Description: Accounts requiring check-in are prioritized, while those already checked in or not requiring check-in are placed later.
  - When combined with the automatic check-in feature, this allows prioritizing accounts pending check-in.

- **Manual Order (manualOrder)**
  - Description: Respects the order you manually adjust in the account list.
  - When enabled, dragging accounts in the list will remember their order and use it for sorting.

- **User Custom Field Sorting (userCustomSort)**
  - Description: Sorts based on the field you select in the account list (e.g., balance, spending, income).
  - For example, accounts with the lowest balance can be prioritized for timely top-ups.

- **Custom Check-in Link Priority (customCheckInUrl)**
  - Description: Accounts using a custom check-in URL are prioritized.
  - Applicable when some sites among many use special check-in addresses.

- **Custom Redeem Link Priority (customRedeemUrl)**
  - Description: Accounts using a custom redeem URL are prioritized.
  - Helps you quickly find sites with special top-up/redeem entry points.

- **Match Open Tabs (matchedOpenTabs)**
  - Description: If the browser's currently open tabs include a page from a specific site, the account corresponding to that site will be prioritized.
  - Suitable for "browse, troubleshoot/adjust configuration" workflows.

## How to Adjust Priority

1. In the **"Sorting Priority Settings"** panel, you will see a list of sorting rule cards.
2. Hover your mouse over a rule, then click and drag its handle up or down:
   - The higher up it is, the higher its priority.
3. After adjustment, changes will be immediately saved to local preferences and applied to the account list sorting logic.

## How to Enable or Disable a Rule

1. Locate the toggle switch on a rule card (usually on the right side of the card).
2. Turning the switch off means the rule will be ignored during sorting; turning it on includes it in the sorting calculation.
3. After toggling, changes will also be immediately saved and the account list display order updated.

## Sorting Examples

- **Example One: Focus on Anomalies + Current Site**
  - Rule order: Health Status → Current Site → Pinned Priority.
  - Effect:
    - Abnormal accounts always appear at the top;
    - Among abnormal accounts, the current site will be prioritized;
    - The rest will continue to be sorted by pinned status and other rules.

- **Example Two: Check-in Priority**
  - Rule order: Check-in Requirement → Pinned Priority → Health Status.
  - Effect:
    - Accounts requiring check-in will be prioritized regardless of their health status, making it convenient to complete daily check-ins all at once.

- **Example Three: Balance-Driven**
  - Rule order: User Custom Field Sorting (Balance) → Health Status.
  - Effect:
    - Accounts with the lowest balance are prioritized, allowing timely detection of nearly depleted quotas;
    - While also combining with health status to ensure abnormal accounts are still highlighted.

## Frequently Asked Questions

- **Sorting results do not match expectations?**
  - Confirm if a high-priority rule is being ignored (switch off) or if the sorting order is not as expected.
  - If you still have questions, please provide feedback with screenshots of the specific sorting results and desired logic in GitHub Issues.

## Related Documentation

- [Automatic Check-in and Check-in Monitoring](./auto-checkin.md)
- [Automatic Refresh and Real-time Data](./auto-refresh.md)