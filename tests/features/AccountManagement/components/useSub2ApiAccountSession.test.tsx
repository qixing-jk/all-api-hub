import { act, createRef, useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  BROWSER_OAUTH_CONTENT_FAILURE_REASONS,
  BROWSER_OAUTH_REQUEST_FAILURE_REASONS,
} from "~/constants/browserOAuth"
import { DIALOG_MODES } from "~/constants/dialogModes"
import { SITE_TYPES } from "~/constants/siteType"
import { createAccountCredentialEvidence } from "~/features/AccountManagement/components/AccountDialog/form/accountCredentialEvidence"
import { useSub2ApiAccountSession } from "~/features/AccountManagement/components/AccountDialog/form/useSub2ApiAccountSession"
import {
  createEmptyAccountDialogDraft,
  type AccountDialogDraft,
} from "~/features/AccountManagement/components/AccountDialog/models"
import { useAccountDialogSaveWorkflow } from "~/features/AccountManagement/components/AccountDialog/saving/useAccountDialogSaveWorkflow"
import toast from "~/lib/notify"
import jaAccountDialog from "~/locales/ja/accountDialog.json"
import { createSub2ApiOAuthFlow } from "~/services/apiAdapters/sub2api/auth/browserOAuth"
import { ACCOUNT_KEY_AUTO_PROVISION_MODES } from "~/types/accountKeyAutoProvisioning"
import type { CheckInMethodSelection } from "~/types/checkIn"
import type { AccountSaveResponse } from "~/types/serviceResponse"
import { createDeferred } from "~~/tests/test-utils/deferred"
import { testI18n } from "~~/tests/test-utils/i18n"
import { renderHook, waitFor } from "~~/tests/test-utils/render"

const deps = vi.hoisted(() => ({
  hasPanelProof: vi.fn().mockResolvedValue(false),
  login: vi.fn(),
  readBrowser: vi.fn(),
  discard: vi.fn(),
  verify: vi.fn(),
  save: vi.fn(),
}))
vi.mock(
  "~/services/apiService/sub2api/auth/panelProofCapability",
  async (original) => ({
    ...(await original<
      typeof import("~/services/apiService/sub2api/auth/panelProofCapability")
    >()),
    hasSub2ApiPanelProof: deps.hasPanelProof,
  }),
)
vi.mock("~/services/accounts/editing/accountCreation", () => ({
  validateAndSaveAccount: deps.save,
}))
vi.mock("~/services/accounts/accountStorage/accountRefresh", () => ({
  accountRefresh: {
    refreshAccount: vi.fn().mockResolvedValue({ refreshed: false }),
  },
}))
vi.mock("~/services/accountLogin", () => ({ loginAccount: deps.login }))
vi.mock("~/lib/notify", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/lib/notify")>()
  return {
    ...actual,
    default: {
      ...actual.default,
      error: vi.fn(),
      success: vi.fn(),
      info: vi.fn(),
    },
  }
})
vi.mock("~/services/accountCredentialRecovery/result", () => ({
  verifyRecoveredCredential: deps.verify,
}))
vi.mock("~/services/apiAdapters/sub2api/auth/credentialCleanup", () => ({
  discardSub2ApiLoginCredential: deps.discard,
}))
vi.mock("~/services/accountBrowserSession", async (original) => ({
  ...(await original<typeof import("~/services/accountBrowserSession")>()),
  resolveAccountBrowserSession: deps.readBrowser,
}))

describe("Sub2API account draft credential acquisition", () => {
  it("preserves expiry when a manual refresh-token edit changes whitespace only", async () => {
    const { result } = renderAcquisitionWithSave()
    await waitFor(() => expect(result.current).not.toBeNull())
    await act(async () => result.current.session.handleAcquireSub2apiSession())
    act(() => result.current.session.setSub2apiRefreshToken(" new-refresh "))
    expect(result.current.draft.sub2apiTokenExpiresAt).toBe(2000000000000)
    expect(deps.discard).not.toHaveBeenCalled()
  })
  it("persists explicit login removal when saving the account", async () => {
    const { result } = renderAcquisitionWithSave()
    await waitFor(() => expect(result.current).not.toBeNull())
    act(() =>
      result.current.updateDraft((draft) => ({
        ...draft,
        accessToken: "manual-token",
        login: undefined,
        loginChanged: true,
      })),
    )
    await act(async () => result.current.save.handleSaveAccount())
    expect(deps.save).toHaveBeenCalledWith(
      expect.objectContaining({ loginChange: null }),
    )
  })
  it("reports a failed abandoned-credential cleanup without restoring the discarded draft", async () => {
    const { result } = renderAcquisitionWithSave()
    await waitFor(() => expect(result.current).not.toBeNull())
    await act(async () => result.current.session.handleAcquireSub2apiSession())
    deps.discard.mockRejectedValueOnce(new Error("Logout rejected"))
    await act(async () =>
      result.current.session.setSub2apiUseRefreshToken(false),
    )
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        testI18n.t("messages:errors.api.browserLoginCleanupUnconfirmed"),
      ),
    )
    expect(result.current.draft.accessToken).toBe("")
    expect(result.current.draft.sub2apiRefreshToken).toBe("")
  })
  it.each(["identity", "login"])(
    "requires valid %s configuration before acquiring a credential",
    async (missing) => {
      const { result } = renderAcquisitionWithSave()
      await waitFor(() => expect(result.current).not.toBeNull())
      act(() =>
        result.current.updateDraft((draft) => ({
          ...draft,
          ...(missing === "identity" ? { userId: "" } : { login: undefined }),
        })),
      )
      await act(async () =>
        result.current.session.handleAcquireSub2apiSession(),
      )
      expect(deps.login).not.toHaveBeenCalled()
      expect(toast.error).toHaveBeenCalledWith(
        testI18n.t("accountDialog:messages.sub2apiLoginSetupRequired"),
      )
    },
  )
  it("keeps provider failure detail and reports an unsuccessful acquisition cleanup", async () => {
    const { result } = renderAcquisitionWithSave()
    await waitFor(() => expect(result.current).not.toBeNull())
    deps.verify.mockResolvedValueOnce({
      status: "failed",
      message: "Provider verification failed",
    })
    deps.discard.mockRejectedValueOnce(new Error("Logout rejected"))
    await act(async () => result.current.session.handleAcquireSub2apiSession())
    expect(toast.error).toHaveBeenCalledWith("Provider verification failed")
    expect(toast.error).toHaveBeenCalledWith(
      testI18n.t("messages:errors.api.browserLoginCleanupUnconfirmed"),
    )
    expect(result.current.draft.accessToken).toBe("")
  })
  it("keeps the original import action reading website state even when login is configured", async () => {
    deps.login.mockResolvedValue({
      status: "authenticated",
      identity: "17",
      credential: {
        accessToken: "login-access",
        sub2apiAuth: { refreshToken: "login-refresh" },
      },
    })
    deps.readBrowser.mockResolvedValue({
      accessToken: "browser-access",
      userId: "17",
      sub2apiAuth: { refreshToken: "browser-refresh" },
    })
    const { result } = renderHook(() => {
      const [draft, updateDraft] = useState<AccountDialogDraft>({
        ...createEmptyAccountDialogDraft(SITE_TYPES.SUB2API),
        userId: "17",
        sub2apiUseRefreshToken: true,
        login: {
          methodId: "password",
          credentials: { username: "member@example.com", password: "secret" },
        },
      })
      return {
        draft,
        session: useSub2ApiAccountSession({
          isOpen: true,
          mode: DIALOG_MODES.EDIT,
          url: "https://ordinary.example",
          draft,
          updateDraft,
          updateAccessToken: (value) =>
            updateDraft((previous) => ({ ...previous, accessToken: value })),
          getCurrentTab: () => undefined,
        }),
      }
    })
    await waitFor(() => expect(result.current?.draft.userId).toBe("17"))
    await act(async () => {
      await result.current.session.handleImportSub2apiSession()
    })
    expect(result.current.draft.accessToken).toBe("browser-access")
    expect(deps.readBrowser).toHaveBeenCalledOnce()
    expect(deps.login).not.toHaveBeenCalled()
  })
  afterEach(async () => {
    await act(async () => {
      await testI18n.changeLanguage("en")
      testI18n.removeResourceBundle("ja", "accountDialog")
    })
  })
  beforeEach(() => {
    vi.clearAllMocks()
    deps.hasPanelProof.mockResolvedValue(false)
    deps.verify.mockImplementation(async (result) => result)
    deps.discard.mockResolvedValue(undefined)
    deps.save.mockResolvedValue({
      success: true,
      accountId: "saved",
      message: "saved",
    })
  })

  function renderAcquisitionWithSave(
    confirmDuplicateAccount: Parameters<
      typeof useAccountDialogSaveWorkflow
    >[0]["confirmDuplicateAccount"] = vi.fn(async () => ({
      isCurrent: () => true,
    })),
    accessToken = "",
  ) {
    const credential = {
      accessToken: "new-access",
      sub2apiAuth: {
        refreshToken: "new-refresh",
        tokenExpiresAt: 2000000000000,
      },
    }
    deps.login.mockResolvedValue({
      status: "authenticated",
      identity: "17",
      credential,
      evidence: { credentialIssued: true },
    })
    const initialProps: { isOpen: boolean; url?: string } = { isOpen: true }
    return renderHook(
      ({
        isOpen,
        url = "https://sub2api.example",
      }: {
        isOpen: boolean
        url?: string
      }) => {
        const [draft, updateDraft] = useState<AccountDialogDraft>({
          ...createEmptyAccountDialogDraft(SITE_TYPES.SUB2API),
          userId: "17",
          siteName: "Sub2API",
          accessToken,
          login: {
            methodId: "password",
            credentials: { username: "member@example.com", password: "secret" },
          },
        })
        const session = useSub2ApiAccountSession({
          isOpen,
          mode: DIALOG_MODES.ADD,
          url,
          draft,
          updateDraft,
          updateAccessToken: (value) =>
            updateDraft((previous) => ({ ...previous, accessToken: value })),
          getCurrentTab: () => undefined,
        })
        const save = useAccountDialogSaveWorkflow({
          mode: DIALOG_MODES.ADD,
          url,
          draft,
          sub2ApiSession: session,
          autoProvisionKeyOnAccountAdd: false,
          autoProvisionKeyOnAccountAddMode:
            ACCOUNT_KEY_AUTO_PROVISION_MODES.Default,
          confirmDuplicateAccount,
          confirmSavedOpenRouterCredential: vi.fn(),
          postSaveWorkflow: {
            beginProvisioning: vi.fn(),
            openDefaultKeyPrompt: vi.fn(),
          },
          checkInSelectionChangedRef: { current: false },
          checkInDiscoveryBaseSelectionRef: createRef<CheckInMethodSelection>(),
          credentialEvidence: createAccountCredentialEvidence(),
        })
        return { session, save, updateDraft, draft }
      },
      { initialProps },
    )
  }

  it("scopes confirmed browser import and stored panel-proof evidence to the current site", async () => {
    deps.hasPanelProof.mockImplementation(
      async (url) => url === "https://known.example",
    )
    const { result, rerender } = renderAcquisitionWithSave()
    await waitFor(() =>
      expect(result.current?.session.isWebsiteSessionBound).toBe(false),
    )
    deps.readBrowser.mockResolvedValue({ sub2apiWebsiteSessionBound: true })
    await act(async () => {
      await result.current.session.handleImportSub2apiSession()
    })
    expect(result.current.session.isWebsiteSessionBound).toBe(true)
    rerender({ isOpen: true, url: "file:///invalid" })
    expect(result.current.session.isWebsiteSessionBound).toBe(false)
    expect(deps.hasPanelProof).not.toHaveBeenCalledWith("file:///invalid")
    rerender({ isOpen: true, url: "https://known.example" })
    await waitFor(() =>
      expect(result.current.session.isWebsiteSessionBound).toBe(true),
    )
    rerender({ isOpen: true, url: "https://ordinary.example" })
    expect(result.current.session.isWebsiteSessionBound).toBe(false)
  })

  it.each(["reset", "close", "URL", "blank URL", "site type"] as const)(
    "drops website confirmation after a %s change even when returning to the same URL",
    async (change) => {
      const url = "https://sub2api.example"
      const { result, rerender } = renderAcquisitionWithSave()
      await waitFor(() => expect(result.current).toBeTruthy())
      act(() => result.current.session.rememberBoundSessionUrl(url))
      expect(result.current.session.isWebsiteSessionBound).toBe(true)
      if (change === "reset") {
        act(() => result.current.session.reset())
      } else if (change === "site type") {
        act(() =>
          result.current.updateDraft((draft) => ({
            ...draft,
            siteType: SITE_TYPES.NEW_API,
          })),
        )
        expect(result.current.session.isWebsiteSessionBound).toBe(false)
        act(() =>
          result.current.updateDraft((draft) => ({
            ...draft,
            siteType: SITE_TYPES.SUB2API,
          })),
        )
      } else {
        rerender({
          isOpen: change !== "close",
          url:
            change === "blank URL"
              ? ""
              : change === "URL"
                ? "https://other.example"
                : url,
        })
        expect(result.current.session.isWebsiteSessionBound).toBe(false)
        rerender({ isOpen: true, url })
      }
      expect(result.current.session.isWebsiteSessionBound).toBe(false)
    },
  )

  it("rejects website evidence and skips proof lookup for a blank or unsupported URL", async () => {
    const { result, rerender } = renderAcquisitionWithSave()
    await waitFor(() => expect(result.current).toBeTruthy())
    for (const url of ["", "file:///invalid"]) {
      rerender({ isOpen: true, url })
      act(() => result.current.session.rememberBoundSessionUrl(url))
      expect(result.current.session.isWebsiteSessionBound).toBe(false)
      expect(deps.hasPanelProof).not.toHaveBeenCalledWith(url)
    }
  })

  it("ignores a stale positive lookup and keeps current website evidence through a negative lookup", async () => {
    const old = createDeferred<boolean>()
    const current = createDeferred<boolean>()
    deps.hasPanelProof
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(current.promise)
    const { result, rerender } = renderAcquisitionWithSave()
    await waitFor(() => expect(deps.hasPanelProof).toHaveBeenCalledTimes(1))
    rerender({ isOpen: true, url: "https://current.example" })
    act(() =>
      result.current.session.rememberBoundSessionUrl("https://current.example"),
    )
    await act(async () => {
      current.resolve(false)
    })
    expect(result.current.session.isWebsiteSessionBound).toBe(true)
    await act(async () => {
      old.resolve(true)
    })
    expect(result.current.session.isWebsiteSessionBound).toBe(true)
    rerender({ isOpen: true, url: "https://sub2api.example" })
    expect(result.current.session.isWebsiteSessionBound).toBe(false)
  })

  it("ignores a positive lookup that completes after reset", async () => {
    const pending = createDeferred<boolean>()
    deps.hasPanelProof.mockReturnValueOnce(pending.promise)
    const { result } = renderAcquisitionWithSave()
    await waitFor(() => expect(deps.hasPanelProof).toHaveBeenCalledOnce())
    act(() => result.current.session.reset())
    await act(async () => {
      pending.resolve(true)
    })
    expect(result.current.session.isWebsiteSessionBound).toBe(false)
  })

  it.each([
    ["accessToken", "replacement-access", undefined],
    ["userId", "", undefined],
    ["url", "", undefined],
    ["siteType", "", undefined],
    [
      "import",
      "previous-access",
      { refreshToken: "imported-refresh", tokenExpiresAt: 2100000000000 },
    ],
  ] as const)(
    "clears owned draft credentials after editing %s before saving",
    async (change, savedAccess, savedAuth) => {
      const { result, rerender } = renderAcquisitionWithSave(
        undefined,
        "previous-access",
      )
      await waitFor(() => expect(result.current).toBeTruthy())
      await act(async () => {
        await result.current.session.handleAcquireSub2apiSession()
      })
      expect(result.current.draft.sub2apiTokenExpiresAt).toBe(2000000000000)
      if (change === "import") {
        deps.readBrowser.mockResolvedValueOnce({
          userId: "17",
          sub2apiAuth: savedAuth,
        })
        await act(async () => {
          await result.current.session.handleImportSub2apiSession()
        })
      } else if (change === "url") {
        rerender({ isOpen: true, url: "https://other-sub2api.example" })
      } else {
        const changes = {
          accessToken: { accessToken: "replacement-access" },
          userId: { userId: "23" },
          siteType: { siteType: SITE_TYPES.NEW_API },
        }
        act(() =>
          result.current.updateDraft((draft) => ({
            ...draft,
            ...changes[change],
          })),
        )
      }
      await waitFor(() => expect(deps.discard).toHaveBeenCalledOnce())
      expect(toast.info).toHaveBeenCalledOnce()
      expect(result.current.draft.sub2apiRefreshToken).toBe(
        savedAuth?.refreshToken ?? "",
      )
      expect(result.current.draft.accessToken).toBe(savedAccess)
      expect(result.current.draft.sub2apiTokenExpiresAt).toBe(
        savedAuth?.tokenExpiresAt ?? null,
      )
      await act(async () => {
        await result.current.save.handleSaveAccount()
      })
      expect(deps.save).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: savedAccess,
          sub2apiAuth: savedAuth,
        }),
      )
    },
  )

  it("releases draft ownership after successfully saving the acquired session", async () => {
    const { result } = renderAcquisitionWithSave(undefined, "previous-access")
    await waitFor(() => expect(result.current).toBeTruthy())
    await act(async () => {
      await result.current.session.handleAcquireSub2apiSession()
      await Promise.resolve()
    })
    await act(async () => {
      await result.current.save.handleSaveAccount()
    })
    act(() => result.current.session.setSub2apiRefreshToken("manual-refresh"))
    expect(result.current.draft.accessToken).toBe("new-access")
    expect(deps.discard).not.toHaveBeenCalled()
    expect(toast.info).not.toHaveBeenCalled()
  })

  it.each(["selecting Browser session", "editing the refresh token"] as const)(
    "saves the previous bearer after abandoning the acquired pair by %s",
    async (change) => {
      const { result } = renderAcquisitionWithSave(undefined, "previous-access")
      await waitFor(() => expect(result.current).toBeTruthy())
      await act(async () => {
        await result.current.session.handleAcquireSub2apiSession()
      })
      expect(result.current.draft.accessToken).toBe("new-access")
      act(() => {
        if (change === "selecting Browser session")
          result.current.session.handleSub2apiUseRefreshTokenChange(false)
        else result.current.session.setSub2apiRefreshToken("manual-refresh")
      })
      await waitFor(() => expect(deps.discard).toHaveBeenCalledOnce())
      await act(async () => {
        await result.current.save.handleSaveAccount()
      })
      expect(deps.save).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: "previous-access",
          sub2apiAuth:
            change === "selecting Browser session"
              ? undefined
              : { refreshToken: "manual-refresh" },
        }),
      )
    },
  )

  it("clears an abandoned bearer when the draft had no previous token", async () => {
    const { result } = renderAcquisitionWithSave()
    await waitFor(() => expect(result.current).toBeTruthy())
    await act(async () => {
      await result.current.session.handleAcquireSub2apiSession()
    })
    act(() => result.current.session.handleSub2apiUseRefreshTokenChange(false))
    expect(result.current.draft.accessToken).toBe("")
  })

  it("preserves a replacement website refresh token's equal expiry when abandoning the issued credential", async () => {
    const { result } = renderAcquisitionWithSave()
    await waitFor(() => expect(result.current).toBeTruthy())
    await act(async () => {
      await result.current.session.handleAcquireSub2apiSession()
    })
    const expiresAt = result.current.draft.sub2apiTokenExpiresAt
    deps.readBrowser.mockResolvedValue({
      accessToken: "website-replacement",
      userId: "17",
      sub2apiAuth: {
        refreshToken: "website-refresh",
        tokenExpiresAt: expiresAt,
      },
    })
    await act(async () => {
      await result.current.session.handleImportSub2apiSession()
    })
    expect(result.current.draft.sub2apiRefreshToken).toBe("website-refresh")
    expect(result.current.draft.sub2apiTokenExpiresAt).toBe(expiresAt)
    expect(deps.discard).toHaveBeenCalledOnce()
  })

  it("returns to Independent session without restoring the token revoked by selecting Browser session", async () => {
    const { result } = renderAcquisitionWithSave(undefined, "previous-access")
    await waitFor(() => expect(result.current).toBeTruthy())
    await act(async () => {
      await result.current.session.handleAcquireSub2apiSession()
    })
    act(() => result.current.session.handleSub2apiUseRefreshTokenChange(false))
    await waitFor(() => expect(deps.discard).toHaveBeenCalledOnce())
    act(() => result.current.session.handleSub2apiUseRefreshTokenChange(true))
    expect(result.current.draft.sub2apiRefreshToken).toBe("")
    expect(result.current.draft.accessToken).toBe("previous-access")
  })

  it("explains why the signed website session cannot supply a refresh token", async () => {
    const { result } = renderAcquisitionWithSave()
    const websiteSession = {
      accessToken: "website-access",
      userId: "17",
      sub2apiWebsiteSessionBound: true,
    }
    deps.readBrowser.mockImplementationOnce(async ({ isUsableSession }) =>
      isUsableSession(websiteSession) ? websiteSession : null,
    )
    await waitFor(() => expect(result.current).toBeTruthy())
    await act(async () => {
      await result.current.session.handleImportSub2apiSession()
    })
    expect(toast.error).toHaveBeenCalledWith(
      "accountDialog:messages.importSub2apiSessionBound",
    )
    expect(result.current.draft.accessToken).toBe("")
  })

  it.each([
    ["failed", "sub2apiLoginFailed"],
    ["identity_mismatch", "sub2apiLoginIdentityMismatch"],
    ["interaction_required", "sub2apiLoginInteractionRequired"],
    ["session_busy", "sub2apiLoginSessionBusy"],
    ["uncertain", "sub2apiLoginUncertain"],
    ["unsupported", "sub2apiLoginUnsupported"],
    ["authenticated", "sub2apiLoginSessionNotIssued"],
    ["cancelled", null],
  ] as const)("reports the acquisition outcome %s", async (status, key) => {
    const { result } = renderAcquisitionWithSave()
    deps.login.mockResolvedValueOnce({ status })
    await waitFor(() => expect(result.current).toBeTruthy())
    await act(async () => {
      await result.current.session.handleAcquireSub2apiSession()
    })
    if (key)
      expect(toast.error).toHaveBeenCalledExactlyOnceWith(
        `accountDialog:messages.${key}`,
      )
    else expect(toast.error).not.toHaveBeenCalled()
    expect(deps.readBrowser).not.toHaveBeenCalled()
  })

  it("confirms acquisition of an independent session before saving", async () => {
    const { result } = renderAcquisitionWithSave()
    await waitFor(() => expect(result.current).toBeTruthy())
    await act(async () => {
      await result.current.session.handleAcquireSub2apiSession()
    })
    expect(toast.success).toHaveBeenCalledExactlyOnceWith(
      "accountDialog:messages.sub2apiLoginSuccess",
    )
  })

  it("keeps cancellation quiet even when the result carries a message", async () => {
    const { result } = renderAcquisitionWithSave()
    deps.login.mockResolvedValueOnce({
      status: "cancelled",
      message: "User closed the sign-in window",
    })
    await waitFor(() => expect(result.current).toBeTruthy())
    await act(async () => {
      await result.current.session.handleAcquireSub2apiSession()
    })
    expect(toast.error).not.toHaveBeenCalled()
  })

  it("displays the localized busy message when the browser login supplies English text", async () => {
    await act(async () => {
      testI18n.addResourceBundle("ja", "accountDialog", jaAccountDialog)
      await testI18n.changeLanguage("ja")
    })
    const { result } = renderAcquisitionWithSave()
    deps.login.mockResolvedValueOnce({
      status: "session_busy",
      message:
        "Sub2API is waiting for another login that is already in progress.",
    })
    await waitFor(() => expect(result.current).toBeTruthy())
    await act(async () => {
      await result.current.session.handleAcquireSub2apiSession()
    })
    expect(toast.error).toHaveBeenCalledExactlyOnceWith(
      jaAccountDialog.messages.sub2apiLoginSessionBusy,
    )
  })

  it("replaces a draft credential with a non-issued session without clearing its expiry", async () => {
    const { result } = renderAcquisitionWithSave()
    await waitFor(() => expect(result.current).toBeTruthy())
    await act(async () => {
      await result.current.session.handleAcquireSub2apiSession()
    })
    const credential = {
      accessToken: "existing-access",
      sub2apiAuth: {
        refreshToken: "existing-refresh",
        tokenExpiresAt: 2000000000000,
      },
    }
    deps.login.mockResolvedValueOnce({
      status: "authenticated",
      identity: "17",
      credential,
    })
    vi.mocked(toast.success).mockClear()
    await act(async () => {
      await result.current.session.handleAcquireSub2apiSession()
    })
    expect(deps.discard).toHaveBeenCalledOnce()
    expect(result.current.draft.accessToken).toBe(credential.accessToken)
    expect(result.current.session.auth).toEqual(credential.sub2apiAuth)
    expect(toast.info).not.toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalledExactlyOnceWith(
      "accountDialog:messages.sub2apiLoginSuccess",
    )
  })

  it("adopts a replacement before the old logout finishes even if login settings are edited", async () => {
    const { result } = renderAcquisitionWithSave()
    await waitFor(() => expect(result.current).toBeTruthy())
    await act(async () => {
      await result.current.session.handleAcquireSub2apiSession()
    })
    const logout = createDeferred<void>()
    deps.discard.mockReturnValueOnce(logout.promise)
    const credential = {
      accessToken: "replacement-access",
      sub2apiAuth: { refreshToken: "replacement-refresh" },
    }
    deps.login.mockResolvedValueOnce({
      status: "authenticated",
      identity: "17",
      credential,
      evidence: { credentialIssued: true },
    })
    let replacement!: Promise<void>
    act(() => {
      replacement = result.current.session.handleAcquireSub2apiSession()
    })
    await waitFor(() => expect(deps.discard).toHaveBeenCalledOnce())
    const accessWhileLogoutPending = result.current.draft.accessToken
    act(() => {
      result.current.updateDraft((draft) => ({
        ...draft,
        login: {
          methodId: "password",
          credentials: { username: "member@example.com", password: "edited" },
        },
      }))
    })
    await act(async () => {
      logout.resolve()
      await replacement
    })
    expect(accessWhileLogoutPending).toBe(credential.accessToken)
    expect(deps.discard).toHaveBeenCalledOnce()
    await act(async () => {
      await result.current.save.handleSaveAccount()
    })
    expect(deps.save).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining(credential),
    )
  })

  it.each([
    [
      BROWSER_OAUTH_CONTENT_FAILURE_REASONS.InteractionRequired,
      jaAccountDialog.messages.sub2apiLoginInteractionRequired,
    ],
    [
      BROWSER_OAUTH_REQUEST_FAILURE_REASONS.Uncertain,
      jaAccountDialog.messages.sub2apiLoginUncertain,
    ],
    [
      "identity-mismatch",
      jaAccountDialog.messages.sub2apiLoginIdentityMismatch,
    ],
  ] as const)(
    "shows the Japanese acquisition message for OAuth %s",
    async (reason, message) => {
      await act(async () => {
        testI18n.addResourceBundle("ja", "accountDialog", jaAccountDialog)
        await testI18n.changeLanguage("ja")
      })
      const flow = createSub2ApiOAuthFlow({
        provider: "github",
        origin: "https://sub2api.example",
        requestId: "oauth",
        loginPath: "/login",
      })
      const response =
        reason === "identity-mismatch"
          ? {
              status: "identity_mismatch",
              message:
                "The OAuth login belongs to a different Sub2API account.",
            }
          : flow.parsePreparation({ success: false, reason })
      const { result } = renderAcquisitionWithSave()
      deps.login.mockResolvedValueOnce(response)
      await waitFor(() => expect(result.current).toBeTruthy())
      await act(async () => {
        await result.current.session.handleAcquireSub2apiSession()
      })
      expect(toast.error).toHaveBeenCalledExactlyOnceWith(message)
    },
  )

  it("holds an issued family while its save is pending after the dialog closes", async () => {
    const saved = createDeferred<AccountSaveResponse>()
    deps.save.mockReturnValue(saved.promise)
    const { result, rerender } = renderAcquisitionWithSave()
    await waitFor(() => expect(result.current).toBeTruthy())
    await act(async () => {
      await result.current.session.handleAcquireSub2apiSession()
    })
    let pending!: Promise<unknown>
    act(() => {
      pending = result.current.save.handleSaveAccount()
    })
    await waitFor(() => expect(deps.save).toHaveBeenCalledOnce())
    rerender({ isOpen: false })
    expect(deps.discard).not.toHaveBeenCalled()
    await act(async () => {
      saved.resolve({ success: true, accountId: "saved", message: "saved" })
      await pending
    })
    expect(deps.discard).not.toHaveBeenCalled()
  })

  it("keeps the selected issued family when the application's language changes", async () => {
    const { result } = renderAcquisitionWithSave()
    await waitFor(() => expect(result.current).toBeTruthy())
    await act(async () => {
      await result.current.session.handleAcquireSub2apiSession()
    })
    await act(async () => {
      await testI18n.changeLanguage("ja")
    })
    expect(result.current.draft.accessToken).toBe("new-access")
    expect(deps.discard).not.toHaveBeenCalled()
  })

  it("retains the saved snapshot when credentials are edited during persistence", async () => {
    const saved = createDeferred<AccountSaveResponse>()
    deps.save.mockReturnValue(saved.promise)
    const { result } = renderAcquisitionWithSave()
    await waitFor(() => expect(result.current).toBeTruthy())
    await act(async () => {
      await result.current.session.handleAcquireSub2apiSession()
    })
    let pending!: Promise<unknown>
    act(() => {
      pending = result.current.save.handleSaveAccount()
    })
    await waitFor(() => expect(deps.save).toHaveBeenCalledOnce())
    act(() => {
      result.current.updateDraft((previous) => ({
        ...previous,
        accessToken: "manual-replacement",
      }))
    })
    expect(deps.discard).not.toHaveBeenCalled()
    await act(async () => {
      saved.resolve({ success: true, accountId: "saved", message: "saved" })
      await pending
    })
    expect(deps.save).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "new-access",
        sub2apiAuth: {
          refreshToken: "new-refresh",
          tokenExpiresAt: 2000000000000,
        },
      }),
    )
    expect(result.current.draft.accessToken).toBe("manual-replacement")
    expect(deps.discard).not.toHaveBeenCalled()
  })

  it("cleans an abandoned pending snapshot after its save fails", async () => {
    const saved = createDeferred<AccountSaveResponse>()
    deps.save.mockReturnValue(saved.promise)
    const { result, rerender } = renderAcquisitionWithSave()
    await waitFor(() => expect(result.current).toBeTruthy())
    await act(async () => {
      await result.current.session.handleAcquireSub2apiSession()
    })
    let pending!: Promise<unknown>
    act(() => {
      pending = result.current.save.handleSaveAccount()
    })
    const rejected = expect(pending).rejects.toThrow("save unavailable")
    await waitFor(() => expect(deps.save).toHaveBeenCalledOnce())
    rerender({ isOpen: false })
    expect(deps.discard).not.toHaveBeenCalled()
    await act(async () => {
      saved.resolve({ success: false, message: "save unavailable" })
      await rejected
    })
    expect(deps.discard).toHaveBeenCalledOnce()
  })

  it.each(["close", "edit", "site"])(
    "does not persist a revoked snapshot after %s before save admission",
    async (reason) => {
      const duplicate = createDeferred<{ isCurrent: () => boolean }>()
      const confirm = vi.fn(() => duplicate.promise)
      const { result, rerender } = renderAcquisitionWithSave(confirm)
      await waitFor(() => expect(result.current).toBeTruthy())
      await act(async () => {
        await result.current.session.handleAcquireSub2apiSession()
      })
      let pending!: Promise<unknown>
      act(() => {
        pending = result.current.save.handleSaveAccount()
      })
      const rejected = expect(pending).rejects.toThrow(
        "messages.sub2apiLoginDraftChanged",
      )
      await waitFor(() => expect(confirm).toHaveBeenCalledOnce())
      if (reason === "close") rerender({ isOpen: false })
      else if (reason === "site")
        act(() => {
          result.current.updateDraft((previous) => ({
            ...previous,
            siteType: SITE_TYPES.NEW_API,
          }))
        })
      else
        act(() => {
          result.current.updateDraft((previous) => ({
            ...previous,
            accessToken: "manual-replacement",
          }))
        })
      await waitFor(() => expect(deps.discard).toHaveBeenCalledOnce())
      await act(async () => {
        duplicate.resolve({ isCurrent: () => true })
        await rejected
      })
      expect(deps.save).not.toHaveBeenCalled()
    },
  )
  it("revokes a newly issued credential when the dialog closes before acquisition finishes", async () => {
    let complete!: (result: unknown) => void
    deps.login.mockReturnValue(
      new Promise((resolve) => {
        complete = resolve
      }),
    )
    const updateAccessToken = vi.fn()
    const draft = {
      ...createEmptyAccountDialogDraft(SITE_TYPES.SUB2API),
      userId: "17",
      login: {
        methodId: "password" as const,
        credentials: { username: "member@example.com", password: "secret" },
      },
    }
    const { result, rerender } = renderHook(
      ({ isOpen }) =>
        useSub2ApiAccountSession({
          isOpen,
          mode: DIALOG_MODES.EDIT,
          url: "https://sub2api.example",
          draft,
          updateDraft: vi.fn(),
          updateAccessToken,
          getCurrentTab: () => undefined,
        }),
      { initialProps: { isOpen: true } },
    )
    let pending!: Promise<void>
    await waitFor(() => expect(result.current).toBeTruthy())
    act(() => {
      pending = result.current.handleAcquireSub2apiSession()
    })
    await waitFor(() => expect(deps.login).toHaveBeenCalled())
    rerender({ isOpen: false })
    const credential = {
      accessToken: "issued",
      sub2apiAuth: { refreshToken: "issued-refresh" },
    }
    await act(async () => {
      complete({
        status: "authenticated",
        identity: "17",
        credential,
        evidence: { credentialIssued: true },
      })
      await pending
    })
    expect(updateAccessToken).not.toHaveBeenCalled()
    expect(deps.discard).toHaveBeenCalledWith(
      "https://sub2api.example",
      credential,
    )
  })
  it("uses configured login to acquire a renewable credential instead of importing website state", async () => {
    deps.login.mockResolvedValue({
      status: "authenticated",
      identity: "17",
      evidence: { credentialIssued: true },
      credential: {
        accessToken: "new-access",
        sub2apiAuth: {
          refreshToken: "new-refresh",
          tokenExpiresAt: 2000000000000,
        },
      },
    })
    const { result } = renderHook(() => {
      const [draft, updateDraft] = useState<AccountDialogDraft>({
        ...createEmptyAccountDialogDraft(SITE_TYPES.SUB2API),
        userId: "17",
        accessToken: "old-access",
        sub2apiUseRefreshToken: true,
        login: {
          methodId: "password" as const,
          credentials: { username: "member@example.com", password: "secret" },
        },
      })
      const session = useSub2ApiAccountSession({
        isOpen: true,
        mode: DIALOG_MODES.EDIT,
        url: "https://sub2api.example",
        draft,
        updateDraft,
        updateAccessToken: (value) =>
          updateDraft((previous) => ({ ...previous, accessToken: value })),
        getCurrentTab: () => undefined,
      })
      return { session, draft }
    })
    await waitFor(() => expect(result.current?.session).toBeTruthy())
    await act(async () => {
      await result.current.session.handleAcquireSub2apiSession()
    })
    expect(result.current.draft.accessToken).toBe("new-access")
    expect(result.current.session.auth).toMatchObject({
      refreshToken: "new-refresh",
      tokenExpiresAt: 2000000000000,
    })
    expect(deps.login).toHaveBeenCalledWith(
      expect.objectContaining({ captureCredential: true, attended: true }),
    )
    expect(deps.readBrowser).not.toHaveBeenCalled()
  })
  it("cleans an acquired draft family on close unless ownership was transferred by save", async () => {
    const credential = {
      accessToken: "new-access",
      sub2apiAuth: { refreshToken: "new-refresh" },
    }
    deps.login.mockResolvedValue({
      status: "authenticated",
      identity: "17",
      credential,
      evidence: { credentialIssued: true },
    })
    const { result, rerender } = renderHook(
      ({ isOpen }) => {
        const [draft, updateDraft] = useState<AccountDialogDraft>({
          ...createEmptyAccountDialogDraft(SITE_TYPES.SUB2API),
          userId: "17",
          login: {
            methodId: "password",
            credentials: { username: "member@example.com", password: "secret" },
          },
        })
        return useSub2ApiAccountSession({
          isOpen,
          mode: DIALOG_MODES.EDIT,
          url: "https://sub2api.example",
          draft,
          updateDraft,
          updateAccessToken: (value) =>
            updateDraft((previous) => ({ ...previous, accessToken: value })),
          getCurrentTab: () => undefined,
        })
      },
      { initialProps: { isOpen: true } },
    )
    await waitFor(() => expect(result.current).toBeTruthy())
    await act(async () => {
      await result.current.handleAcquireSub2apiSession()
    })
    rerender({ isOpen: false })
    await waitFor(() =>
      expect(deps.discard).toHaveBeenCalledWith(
        "https://sub2api.example",
        credential,
      ),
    )
  })
})
