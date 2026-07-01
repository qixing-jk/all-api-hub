import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { runBookmarkAccountImport } from "~/features/AccountManagement/bookmarkImport/importAccounts"
import { createEmptyAccountDialogDraft } from "~/features/AccountManagement/components/AccountDialog/models"
import { AuthTypeEnum } from "~/types"

describe("runBookmarkAccountImport", () => {
  it("waits for the current candidate save before detecting the next candidate", async () => {
    let resolveFirstSave:
      | ((value: { success: true; message: string; accountId: string }) => void)
      | undefined
    const firstSave = new Promise<{
      success: true
      message: string
      accountId: string
    }>((resolve) => {
      resolveFirstSave = resolve
    })
    const draft = createEmptyAccountDialogDraft()
    const autoDetectAccount = vi.fn().mockResolvedValue({
      success: true,
      message: "detected",
      data: {
        username: "user",
        accessToken: "token",
        userId: "id",
        exchangeRate: null,
        checkIn: draft.checkIn,
        siteName: "Example",
        siteType: SITE_TYPES.UNKNOWN,
        authType: AuthTypeEnum.AccessToken,
      },
    })
    const validateAndSaveAccount = vi
      .fn()
      .mockReturnValueOnce(firstSave)
      .mockResolvedValueOnce({
        success: true,
        message: "saved",
        accountId: "account-2",
      })

    const importRun = runBookmarkAccountImport({
      candidates: [
        {
          id: "bookmark-import:https://one.example.invalid",
          url: "https://one.example.invalid",
          normalizedOrigin: "https://one.example.invalid",
          status: "ready",
          selectedByDefault: true,
          sourceBookmarkCount: 1,
        },
        {
          id: "bookmark-import:https://two.example.invalid",
          url: "https://two.example.invalid",
          normalizedOrigin: "https://two.example.invalid",
          status: "ready",
          selectedByDefault: true,
          sourceBookmarkCount: 1,
        },
      ],
      autoDetectAccount,
      validateAndSaveAccount,
    })

    await Promise.resolve()

    expect(autoDetectAccount).toHaveBeenCalledTimes(1)
    expect(validateAndSaveAccount).toHaveBeenCalledTimes(1)

    resolveFirstSave?.({
      success: true,
      message: "saved",
      accountId: "account-1",
    })
    await importRun

    expect(autoDetectAccount.mock.calls.map((call) => call[0])).toEqual([
      "https://one.example.invalid",
      "https://two.example.invalid",
    ])
    expect(validateAndSaveAccount).toHaveBeenCalledTimes(2)
  })

  it("runs selected candidates sequentially through auto-detect and deferred save", async () => {
    const draft = createEmptyAccountDialogDraft()
    const autoDetectAccount = vi
      .fn()
      .mockResolvedValueOnce({
        success: true,
        message: "detected",
        data: {
          username: "alpha-user",
          accessToken: "alpha-token",
          userId: "alpha-id",
          exchangeRate: 7,
          checkIn: draft.checkIn,
          siteName: "Alpha",
          siteType: SITE_TYPES.NEW_API,
          authType: AuthTypeEnum.AccessToken,
        },
      })
      .mockResolvedValueOnce({
        success: false,
        message: "private backend detail",
      })
    const validateAndSaveAccount = vi.fn().mockResolvedValue({
      success: true,
      message: "saved",
      accountId: "account-alpha",
    })
    const onProgress = vi.fn()

    const result = await runBookmarkAccountImport({
      candidates: [
        {
          id: "bookmark-import:https://alpha.example.invalid",
          url: "https://alpha.example.invalid",
          normalizedOrigin: "https://alpha.example.invalid",
          status: "ready",
          selectedByDefault: true,
          sourceBookmarkCount: 1,
        },
        {
          id: "bookmark-import:https://beta.example.invalid",
          url: "https://beta.example.invalid",
          normalizedOrigin: "https://beta.example.invalid",
          status: "ready",
          selectedByDefault: true,
          sourceBookmarkCount: 1,
        },
      ],
      autoDetectAccount,
      validateAndSaveAccount,
      onProgress,
    })

    expect(autoDetectAccount.mock.calls.map((call) => call[0])).toEqual([
      "https://alpha.example.invalid",
      "https://beta.example.invalid",
    ])
    expect(validateAndSaveAccount).toHaveBeenCalledWith(
      "https://alpha.example.invalid",
      "Alpha",
      "alpha-user",
      "alpha-token",
      "alpha-id",
      "7",
      "",
      [],
      draft.checkIn,
      SITE_TYPES.NEW_API,
      AuthTypeEnum.AccessToken,
      "",
      "",
      false,
      false,
      undefined,
      {
        deferDataRefresh: true,
      },
    )
    expect(onProgress).toHaveBeenCalledTimes(2)
    expect(onProgress.mock.calls.map(([progress]) => progress)).toEqual([
      {
        completedCount: 1,
        totalCount: 2,
        currentCandidateId: "bookmark-import:https://alpha.example.invalid",
      },
      {
        completedCount: 2,
        totalCount: 2,
        currentCandidateId: "bookmark-import:https://beta.example.invalid",
      },
    ])
    expect(result).toMatchObject({
      successCount: 1,
      failureCount: 1,
      skippedCount: 0,
      rows: [
        {
          candidateId: "bookmark-import:https://alpha.example.invalid",
          status: "success",
          accountId: "account-alpha",
          failureCategory: undefined,
        },
        {
          candidateId: "bookmark-import:https://beta.example.invalid",
          status: "failed",
          failureCategory: "detection",
          safeMessageKey: "ui:dialog.bookmarkAccountImport.failures.detection",
        },
      ],
    })
  })

  it("records save failures locally and continues with the next candidate", async () => {
    const draft = createEmptyAccountDialogDraft()
    const autoDetectAccount = vi.fn().mockResolvedValue({
      success: true,
      message: "detected",
      data: {
        username: "user",
        accessToken: "token",
        userId: "id",
        exchangeRate: null,
        checkIn: draft.checkIn,
        siteName: "Example",
        siteType: SITE_TYPES.UNKNOWN,
        authType: AuthTypeEnum.AccessToken,
      },
    })
    const validateAndSaveAccount = vi
      .fn()
      .mockResolvedValueOnce({
        success: false,
        message: "private save failure",
      })
      .mockResolvedValueOnce({
        success: true,
        message: "saved",
        accountId: "account-2",
      })

    const result = await runBookmarkAccountImport({
      candidates: [
        {
          id: "bookmark-import:https://one.example.invalid",
          url: "https://one.example.invalid",
          normalizedOrigin: "https://one.example.invalid",
          status: "ready",
          selectedByDefault: true,
          sourceBookmarkCount: 1,
        },
        {
          id: "bookmark-import:https://two.example.invalid",
          url: "https://two.example.invalid",
          normalizedOrigin: "https://two.example.invalid",
          status: "ready",
          selectedByDefault: true,
          sourceBookmarkCount: 1,
        },
      ],
      autoDetectAccount,
      validateAndSaveAccount,
    })

    expect(validateAndSaveAccount).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(result)).not.toContain("private save failure")
    expect(result.failureCount).toBe(1)
    expect(result.successCount).toBe(1)
    expect(result.rows[0]).toMatchObject({
      status: "failed",
      failureCategory: "save",
      safeMessageKey: "ui:dialog.bookmarkAccountImport.failures.save",
    })
  })
})
