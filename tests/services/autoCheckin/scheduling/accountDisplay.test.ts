// Install shared mocks before loading scheduler dependencies.
import "~~/tests/services/autoCheckin/schedulerTestHarness"

import { beforeEach, describe, expect, it, vi } from "vitest"

import { autoCheckinScheduler } from "~/services/checkin/autoCheckin/scheduling/schedulerCore"
import { mockedAccountStorage } from "~~/tests/services/autoCheckin/schedulerTestHarness"

describe("autoCheckinScheduler.getAccountDisplayData", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it("returns persisted display data when available", async () => {
    const account: any = {
      id: "account-1",
      disabled: false,
      site_name: "Display Site",
      account_info: { username: "user" },
    }
    const displayData = {
      id: "account-1",
      name: "Display Site · user",
      username: "user",
    }

    mockedAccountStorage.getAccountById.mockResolvedValueOnce(account)
    mockedAccountStorage.getDisplayDataById.mockResolvedValueOnce(displayData)

    await expect(
      autoCheckinScheduler.getAccountDisplayData("account-1"),
    ).resolves.toEqual(displayData as any)
    expect(mockedAccountStorage.convertToDisplayData).not.toHaveBeenCalled()
  })

  it("falls back to converting the raw account when persisted display data is unavailable", async () => {
    const account: any = {
      id: "account-2",
      disabled: false,
      site_name: "Fallback Site",
      account_info: { username: "fallback-user" },
    }
    const displayData = {
      id: "account-2",
      name: "Fallback Site · fallback-user",
      username: "fallback-user",
    }

    mockedAccountStorage.getAccountById.mockResolvedValueOnce(account)
    mockedAccountStorage.getDisplayDataById.mockResolvedValueOnce(null)
    mockedAccountStorage.convertToDisplayData.mockReturnValueOnce(displayData)

    await expect(
      autoCheckinScheduler.getAccountDisplayData("account-2"),
    ).resolves.toEqual(displayData as any)
    expect(mockedAccountStorage.convertToDisplayData).toHaveBeenCalledWith(
      account,
    )
  })

  it("throws when the requested account does not exist", async () => {
    mockedAccountStorage.getAccountById.mockResolvedValueOnce(null)

    await expect(
      autoCheckinScheduler.getAccountDisplayData("missing-account"),
    ).rejects.toThrow()
    expect(mockedAccountStorage.getDisplayDataById).not.toHaveBeenCalled()
  })

  it("throws when the requested account is disabled", async () => {
    mockedAccountStorage.getAccountById.mockResolvedValueOnce({
      id: "disabled-account",
      disabled: true,
      site_name: "Disabled Site",
      account_info: { username: "user" },
    })

    await expect(
      autoCheckinScheduler.getAccountDisplayData("disabled-account"),
    ).rejects.toThrow()
    expect(mockedAccountStorage.getDisplayDataById).not.toHaveBeenCalled()
  })

  it("returns disabled account display data when includeDisabled is enabled", async () => {
    const account: any = {
      id: "disabled-account",
      disabled: true,
      site_name: "Disabled Site",
      account_info: { username: "user" },
    }
    const displayData = {
      id: "disabled-account",
      name: "Disabled Site · user",
      username: "user",
      disabled: true,
    }

    mockedAccountStorage.getAccountById.mockResolvedValueOnce(account)
    mockedAccountStorage.getDisplayDataById.mockResolvedValueOnce(displayData)

    await expect(
      autoCheckinScheduler.getAccountDisplayData("disabled-account", {
        includeDisabled: true,
      }),
    ).resolves.toEqual(displayData as any)
    expect(mockedAccountStorage.getDisplayDataById).toHaveBeenCalledWith(
      "disabled-account",
    )
  })
})
