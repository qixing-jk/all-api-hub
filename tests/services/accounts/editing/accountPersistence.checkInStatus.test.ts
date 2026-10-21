import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { validateAndSaveAccount } from "~/services/accounts/editing/accountCreation"
import { validateAndUpdateAccount } from "~/services/accounts/editing/accountUpdate"
import { createCompatibilityCheckInConfig } from "~/services/checkin/autoCheckin/configuration/compatibilityConfig"
import { getSelectedCheckInStatus } from "~/services/checkin/autoCheckin/discovery/inspection"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { accountStorageTestSurface as accounts } from "~~/tests/test-utils/accountStorageTestSurface"

const origin = "https://save-checkin.example.invalid"

describe("account saving through the shared check-in update", () => {
  beforeEach(async () => {
    server.resetHandlers()
    await accounts.clearAllData()
  })

  it("queries once on add and edit, persists today's result, and never executes check-in when automation is off", async () => {
    let checked = true
    const readStatus = vi.fn(() =>
      HttpResponse.json({
        success: true,
        data: { enabled: true, stats: { checked_in_today: checked } },
      }),
    )
    const execute = vi.fn(() => HttpResponse.json({ success: true }))
    server.use(
      http.get(`${origin}/api/user/self`, () =>
        HttpResponse.json({
          success: true,
          data: { quota: 123, id: 1, username: "tester" },
        }),
      ),
      http.get(`${origin}/api/log/self/stat`, () =>
        HttpResponse.json({ success: true, data: { quota: 0 } }),
      ),
      http.get(`${origin}/api/log/self`, () =>
        HttpResponse.json({ success: true, data: { items: [], total: 0 } }),
      ),
      http.get(`${origin}/api/user/checkin`, readStatus),
      http.post(`${origin}/api/user/checkin`, execute),
    )
    const input = {
      url: origin,
      siteName: "Example",
      username: "tester",
      accessToken: "test-token",
      userId: "1",
      exchangeRate: "7.0",
      notes: "",
      tagIds: [],
      checkInConfig: createCompatibilityCheckInConfig({
        siteType: SITE_TYPES.NEW_API,
        supported: true,
        automaticExecutionEnabled: false,
      }),
      siteType: SITE_TYPES.NEW_API,
      authType: AuthTypeEnum.AccessToken,
      cookieAuthSessionCookie: "",
    }
    const created = await validateAndSaveAccount({
      ...input,
      options: { skipAutoProvisionKeyOnAccountAdd: true },
    })
    expect(created.success).toBe(true)
    expect(readStatus).toHaveBeenCalledTimes(1)
    const saved = await accounts.getAccountById(created.accountId!)
    expect(saved?.account_info.quota).toBe(123)
    expect(
      getSelectedCheckInStatus({
        config: saved!.checkIn,
        siteType: SITE_TYPES.NEW_API,
      }),
    ).toMatchObject({ outcome: "known", today: "checked" })
    checked = false
    const updated = await validateAndUpdateAccount({
      ...input,
      accountId: created.accountId!,
    })
    expect(updated.success).toBe(true)
    expect(readStatus).toHaveBeenCalledTimes(2)
    const reread = await accounts.getAccountById(created.accountId!)
    expect(
      getSelectedCheckInStatus({
        config: reread!.checkIn,
        siteType: SITE_TYPES.NEW_API,
      }),
    ).toMatchObject({ outcome: "known", today: "not_checked" })
    expect(reread?.checkIn.automaticExecutionEnabled).toBe(false)
    expect(execute).not.toHaveBeenCalled()
  })
})
