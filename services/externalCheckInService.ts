import { RuntimeActionIds } from "~/constants/runtimeActions"
import { getSiteApiRouter } from "~/constants/siteType"
import { accountStorage } from "~/services/accountStorage"
import { createTab, createWindow, hasWindowsAPI } from "~/utils/browserApi"
import { getErrorMessage } from "~/utils/error"
import { joinUrl } from "~/utils/url"

/**
 * External custom check-in flow (background-only).
 *
 * Why this lives in background:
 * - The popup UI can be closed at any moment (including programmatically), which can interrupt
 *   in-flight async work when executed in the popup context.
 * - Opening tabs/windows and persisting "checked-in today" state must be atomic: we only mark
 *   the account after the check-in URL was opened successfully.
 *
 * Message contract:
 * - Request: `{ action: RuntimeActionIds.ExternalCheckInOpenAndMark, accountIds: string[], openInNewWindow?: boolean }`
 * - Response: `{ success: boolean, data?: { results, openedCount, markedCount, failedCount, totalCount }, error?: string }`
 *
 * Semantics:
 * - Redeem page opening is best-effort and never blocks the check-in marking.
 * - The account is marked as checked-in only when the check-in tab is created successfully.
 * - When `openInNewWindow` is enabled and the Windows API is available, pages are opened in a new browser window
 *   and subsequent pages are opened as tabs within that same window.
 */
type ExternalCheckInOpenResult = {
  accountId: string
  openedCheckIn: boolean
  openedRedeem: boolean | null
  markedCheckedIn: boolean
  error?: string
  redeemError?: string
}

/**
 * Handles runtime messages for the external check-in flow.
 * Designed to run in the background context so tab/window creation and state updates are not interrupted.
 */
export async function handleExternalCheckInMessage(
  request: any,
  sendResponse: (response: any) => void,
) {
  try {
    switch (request.action) {
      case RuntimeActionIds.ExternalCheckInOpenAndMark: {
        const accountIds: unknown = request.accountIds
        const openInNewWindow = Boolean(request.openInNewWindow)

        if (!Array.isArray(accountIds) || accountIds.length === 0) {
          sendResponse({ success: false, error: "Missing accountIds" })
          return
        }

        const results: ExternalCheckInOpenResult[] = []
        let targetWindowId: number | null = null

        /**
         * Opens a URL either as a tab (default) or inside a dedicated window when requested.
         *
         * This is best-effort: when window creation fails or the Windows API is unavailable,
         * it falls back to creating a normal tab.
         */
        const openExternalPage = async (url: string) => {
          if (openInNewWindow && hasWindowsAPI()) {
            if (targetWindowId == null) {
              const created = await createWindow({ url, focused: true })
              if (created?.id != null) {
                targetWindowId = created.id
                return true
              }
            } else {
              try {
                const tab = await createTab(url, true, {
                  windowId: targetWindowId,
                })
                if (tab?.id) return true
              } catch {
                // ignore and try to recreate the target window
              }

              const recreated = await createWindow({ url, focused: true })
              if (recreated?.id != null) {
                targetWindowId = recreated.id
                return true
              }
            }
          }

          const tab = await createTab(url, true)
          return Boolean(tab?.id)
        }

        for (const accountId of accountIds) {
          if (typeof accountId !== "string" || !accountId.trim()) {
            results.push({
              accountId: String(accountId),
              openedCheckIn: false,
              openedRedeem: null,
              markedCheckedIn: false,
              error: "Invalid accountId",
            })
            continue
          }

          try {
            const account = await accountStorage.getAccountById(accountId)
            if (!account) {
              results.push({
                accountId,
                openedCheckIn: false,
                openedRedeem: null,
                markedCheckedIn: false,
                error: "Account not found",
              })
              continue
            }

            const checkInUrl = account.checkIn?.customCheckIn?.url
            if (typeof checkInUrl !== "string" || !checkInUrl.trim()) {
              results.push({
                accountId,
                openedCheckIn: false,
                openedRedeem: null,
                markedCheckedIn: false,
                error: "Missing custom check-in URL",
              })
              continue
            }

            const shouldOpenRedeem =
              account.checkIn?.customCheckIn?.openRedeemWithCheckIn ?? true

            let openedRedeem: boolean | null = null
            let redeemError: string | undefined

            if (shouldOpenRedeem) {
              openedRedeem = false
              const redeemUrl =
                account.checkIn?.customCheckIn?.redeemUrl ||
                joinUrl(
                  account.site_url,
                  getSiteApiRouter(account.site_type).redeemPath,
                )

              try {
                openedRedeem = await openExternalPage(redeemUrl)
                if (!openedRedeem) {
                  redeemError = "Failed to open redeem tab"
                }
              } catch (error) {
                redeemError = getErrorMessage(error)
              }
            }

            const openedCheckIn = await openExternalPage(checkInUrl)

            if (!openedCheckIn) {
              results.push({
                accountId,
                openedCheckIn: false,
                openedRedeem,
                markedCheckedIn: false,
                error: "Failed to open check-in tab",
                redeemError,
              })
              continue
            }

            // Only mark the account after we are sure the check-in link was opened.
            const markedCheckedIn =
              await accountStorage.markAccountAsCustomCheckedIn(accountId)

            results.push({
              accountId,
              openedCheckIn: true,
              openedRedeem,
              markedCheckedIn,
              redeemError,
            })
          } catch (error) {
            results.push({
              accountId,
              openedCheckIn: false,
              openedRedeem: null,
              markedCheckedIn: false,
              error: getErrorMessage(error),
            })
          }
        }

        const openedCount = results.filter((r) => r.openedCheckIn).length
        const markedCount = results.filter((r) => r.markedCheckedIn).length
        const failedCount = results.length - openedCount

        sendResponse({
          success: failedCount === 0,
          data: {
            results,
            openedCount,
            markedCount,
            failedCount,
            totalCount: results.length,
          },
        })
        return
      }

      default:
        sendResponse({ success: false, error: "Unknown action" })
        return
    }
  } catch (error) {
    sendResponse({ success: false, error: getErrorMessage(error) })
  }
}
