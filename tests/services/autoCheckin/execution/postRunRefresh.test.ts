// Install shared mocks before loading scheduler dependencies.
import "~~/tests/services/autoCheckin/schedulerTestHarness"

import { beforeEach, describe, expect, it, vi } from "vitest"

import { accountCheckinRunWorkflow } from "~/services/checkin/autoCheckin/execution/runAccountWorkflow"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import {
  createDeferred,
  mockedAccountStorage,
} from "~~/tests/services/autoCheckin/schedulerTestHarness"
import { type accountStorageTestSurface as accountStorage } from "~~/tests/test-utils/accountStorageTestSurface"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

describe("execution/postRunRefresh", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  it("dispatches post-checkin refreshes concurrently with best-effort isolation", async () => {
    type ObservableRefreshResult = Pick<
      NonNullable<Awaited<ReturnType<typeof accountStorage.refreshAccount>>>,
      "refreshed"
    > | null
    const deferredRefreshes = Array.from({ length: 4 }, () =>
      createDeferred<ObservableRefreshResult>(),
    )
    let refreshIndex = 0
    mockedAccountStorage.refreshAccount.mockImplementation(
      () => atIndex(deferredRefreshes, refreshIndex++).promise,
    )

    const refreshPromise =
      accountCheckinRunWorkflow.refreshAccountsAfterSuccessfulCheckins({
        accountIds: ["a", "a", " ", "b", "c", "d"],
        force: false,
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
      })

    await vi.waitFor(() => {
      expect(mockedAccountStorage.refreshAccount).toHaveBeenCalledTimes(4)
    })

    expect(mockedAccountStorage.refreshAccount).toHaveBeenNthCalledWith(
      1,
      "a",
      false,
      {
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
      },
    )
    expect(mockedAccountStorage.refreshAccount).toHaveBeenNthCalledWith(
      2,
      "b",
      false,
      {
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
      },
    )
    expect(mockedAccountStorage.refreshAccount).toHaveBeenNthCalledWith(
      3,
      "c",
      false,
      {
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
      },
    )
    expect(mockedAccountStorage.refreshAccount).toHaveBeenNthCalledWith(
      4,
      "d",
      false,
      {
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
      },
    )

    atIndex(deferredRefreshes, 0).resolve({ refreshed: true })
    atIndex(deferredRefreshes, 1).resolve(null)
    atIndex(deferredRefreshes, 2).reject(new Error("refresh failed"))
    atIndex(deferredRefreshes, 3).resolve({ refreshed: false })

    await expect(refreshPromise).resolves.toBeUndefined()
  })

  it("defaults post-checkin refreshes to force=true when no force flag is provided", async () => {
    mockedAccountStorage.refreshAccount.mockResolvedValueOnce({
      refreshed: false,
    })

    await expect(
      accountCheckinRunWorkflow.refreshAccountsAfterSuccessfulCheckins({
        accountIds: ["account-1"],
      }),
    ).resolves.toBeUndefined()

    expect(mockedAccountStorage.refreshAccount).toHaveBeenCalledWith(
      "account-1",
      true,
    )
  })

  it("returns early when there are no valid accounts to refresh", async () => {
    await expect(
      accountCheckinRunWorkflow.refreshAccountsAfterSuccessfulCheckins({
        accountIds: ["", "   "],
      }),
    ).resolves.toBeUndefined()

    expect(mockedAccountStorage.refreshAccount).not.toHaveBeenCalled()
  })
})
