# Cloudflare Shield Bypass Assistant

> Helps with supported website verification pages, including Cloudflare and Aliyun. When the operation, permissions and settings allow it, the extension waits for clearance and resumes safe reads. Continuing after manual verification depends on the active operation and browser session.

## Feature Overview

- **Verification detection**: Shared request and login flows identify known challenge pages and response signals. A 401, 403, 429 or ordinary CAPTCHA widget alone does not establish a protection challenge.
- **Policy-based recovery**: Eligible reads can use a temporary page that respects the account and browser storage context. Automatic tasks follow the master and feature switches; manual operations still require appropriate permissions and environment support. Direct requests with isolated credentials do not switch to another browser login session.
- **No duplicate submission**: Operations with side effects, including login, check-in and token creation, are not automatically replayed after a challenge or lost response, even when they use GET. Unconfirmed outcomes remain unconfirmed; clearance alone does not prove business success.
- **Login verification handoff**: Password and OAuth login first wait for page verification. If it persists, the original window stays available for a bounded continuation period and uses the configured reminder channels. Background windows do not take focus automatically. Open the reminder to handle verification in that page; closing the window or cancelling the task ends the wait.

## Usage Steps

1. **Log in to the target site**, add an account in the plugin → fill in the site address → click "Auto Identify".
2. If the operation reports website verification, wait for the page scripts to finish. When a reminder requests manual action, open its page and follow the site's instructions.
3. Tasks that support continuation resume safe steps after clearance and independently confirm identity and the operation result. Check the final refresh, login or check-in status.
4. If settings, missing permissions or the environment prevent recovery, review the relevant settings and shield bypass history. Rate limits and ordinary network failures do not unconditionally trigger a browser retry.

## Troubleshoot with shield bypass history

To find out why a temporary page opened, or why it did not open, go to **Settings → Data Refresh** and select **Shield bypass history** beside the **Website verification assistance** heading. The history dialog stays closed until you open it.

You can also select **View shield bypass history** from account warnings about shield bypass, automatic-bypass restriction reminders, check-in results that mention failed verification or a closed temporary page, and the helper prompt on a temporary page.

1. Search by site, operation, or diagnostic information, or filter by processing status. Search and filters cover all retained records.
2. Expand a record to see the triggering operation, its source, available HTTP status or error codes, and whether a temporary page was created or reused.
3. If settings or permissions blocked the request, select **View related settings** to find the relevant option and adjust it as needed.
4. Select **Copy diagnostic details** to keep troubleshooting information. To delete local records, choose **Clear history** from the history dialog's upper-right menu and confirm.

History retains the latest **100 records** on this device. It records new temporary-page requests and does not backfill operations from before the upgrade. Site addresses retain only their origin; URL paths, query parameters, tokens, cookies, and request or response bodies are not stored.

**Completed** means that the temporary-page task returned a completion result. Use the final refresh, check-in, or other operation result to confirm whether the account is working again.

## Notes

- **Wait limits**: Each automatic page check has a 20-second limit. Login sessions supporting manual continuation have a separate bounded wait. Closing the window cancels that login.
- **Permissions and settings**: Use the extension's specific reason to check optional permissions, automatic bypass settings and browser support.
- **Repeated restrictions**: Follow the site's guidance for rate limits such as 429. Reopening pages or resubmitting operations is not a substitute for waiting.

## Common Issues

| Scenario | Solution |
|------|----------|
| Verification window closes | Check the task result and bypass history to distinguish completion, cancellation, timeout and environment limits. |
| Stuck on "Just a moment" | If a continuation reminder is available, open the original page to handle verification; check the final result after the task deadline. |
| Operation still reports 403 | Review verification and permission reasons. If the operation was already submitted, confirm its result before repeating it. |
| No pop-up but identification fails | Check the specific error and settings. Direct requests, missing permissions or an ineligible recovery may leave the browser closed. |
| Verification page does not fit | Adjust and save the width and height under **Settings → Data Refresh → Website Verification Assistance → Verification Window Size**. Applies to newly created verification windows. |

## Related Documents

- [Quick Site Export](./quick-export.md)
- [Self-Hosted Site Management](./self-hosted-site-management.md)
- [Permission Management (Optional Permissions)](./permissions.md)
