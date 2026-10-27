import { beforeEach, describe, expect, it, vi } from "vitest"

import { DIALOG_MODES } from "~/constants/dialogModes"
import { SITE_TYPES } from "~/constants/siteType"
import { useAccountDialog } from "~/features/AccountManagement/components/AccountDialog/workspace/useAccountDialog"
import { act, renderHook, waitFor } from "~~/tests/test-utils/render"

const { browserDetect, fetchPreparedJsonResponse, getActiveTabs } = vi.hoisted(
  () => ({
    browserDetect: vi.fn(),
    fetchPreparedJsonResponse: vi.fn(),
    getActiveTabs: vi.fn(),
  }),
)
vi.mock("~/utils/browser/tabs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/utils/browser/tabs")>()),
  getActiveTabs,
  onTabActivated: vi.fn(() => vi.fn()),
  onTabUpdated: vi.fn(() => vi.fn()),
}))
vi.mock("~/services/siteDetection/autoDetectService", () => ({
  autoDetectSmart: browserDetect,
}))
vi.mock("~/services/apiTransport/requestExecution", () => ({
  fetchPreparedJsonResponse,
}))

describe("Novita account dialog", () => {
  it("verifies only the API key while retaining an unrelated expired console token", async () => {
    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
      }),
    )
    await waitFor(() => expect(result.current).toBeTruthy())
    await act(async () =>
      result.current.handlers.handleUrlChange("https://novita.ai"),
    )
    await act(async () => result.current.handlers.handleAutoDetect())
    const credential =
      'novita-credentials:{"apiKey":"sk_valid","consoleToken":"expired-session"}'
    await act(async () => result.current.setters.setAccessToken(credential))
    fetchPreparedJsonResponse.mockImplementation(async (_request, prepared) =>
      prepared.options.headers.Authorization === "Bearer sk_valid"
        ? {
            ok: true,
            status: 200,
            body: { uuid: "same-user", email: "user@example.com" },
          }
        : { ok: false, status: 401, body: {} },
    )
    await act(async () =>
      result.current.handlers.handleVerifyNovitaCredential(),
    )
    expect(fetchPreparedJsonResponse).toHaveBeenCalledTimes(1)
    expect(result.current.state.credentialVerification?.status).toBe("success")
    expect(result.current.state.novitaCredentialOperation).toBe("api-key")
    expect(result.current.state.accessToken).toBe(credential)
  })
  it("recovers expired console credentials through ordinary automatic detection", async () => {
    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
      }),
    )
    await waitFor(() => expect(result.current).toBeTruthy())
    await act(async () =>
      result.current.handlers.handleUrlChange("https://novita.ai"),
    )
    await act(async () => result.current.handlers.handleAutoDetect())
    await act(async () =>
      result.current.setters.setAccessToken("novita-console:expired-session"),
    )
    fetchPreparedJsonResponse
      .mockResolvedValueOnce({ ok: false, status: 401, body: {} })
      .mockResolvedValue({
        ok: true,
        status: 200,
        body: { uuid: "same-user", email: "user@example.com" },
      })
    browserDetect.mockClear().mockResolvedValueOnce({
      success: true,
      data: {
        siteType: SITE_TYPES.NOVITA,
        userId: "same-user",
        user: { id: "same-user", username: "user@example.com" },
        accessToken: "novita-console:renewed-session",
      },
    })
    await act(async () =>
      result.current.handlers.handleVerifyNovitaCredential(),
    )
    expect(browserDetect).not.toHaveBeenCalled()
    expect(result.current.state.accessToken).toBe(
      "novita-console:expired-session",
    )
    fetchPreparedJsonResponse
      .mockReset()
      .mockResolvedValueOnce({ ok: false, status: 401, body: {} })
      .mockResolvedValue({
        ok: true,
        status: 200,
        body: { uuid: "same-user", email: "user@example.com" },
      })
    await act(async () => result.current.handlers.handleAutoDetect())
    expect(browserDetect).toHaveBeenCalledOnce()
    expect(result.current.state.accessToken).toBe(
      "novita-console:renewed-session",
    )
    expect(result.current.state.detectionError).toBeNull()
  })
  it.each(["", "sk_existing"])(
    "reports unavailable console acquisition as a login recovery and preserves the API key (%s)",
    async (apiKey) => {
      const { result } = renderHook(() =>
        useAccountDialog({
          mode: DIALOG_MODES.ADD,
          isOpen: true,
          onClose: vi.fn(),
        }),
      )
      await waitFor(() => expect(result.current).toBeTruthy())
      await act(async () =>
        result.current.handlers.handleUrlChange("https://novita.ai"),
      )
      await act(async () => result.current.handlers.handleAutoDetect())
      vi.useFakeTimers()
      try {
        await act(async () => result.current.setters.setAccessToken(apiKey))
        browserDetect.mockClear()
        await act(async () =>
          result.current.handlers.handleAcquireNovitaConsole(),
        )
        expect(browserDetect).toHaveBeenCalledTimes(1)
        expect(fetchPreparedJsonResponse).not.toHaveBeenCalled()
        expect(result.current.state.accessToken).toBe(apiKey)
        expect(result.current.state.novitaCredentialOperation).toBe("console")
        expect(result.current.state.detectionError?.message).toBe(
          "messages:novita.consoleAcquisitionFailed",
        )
        await act(async () => vi.advanceTimersByTimeAsync(1200))
        expect(browserDetect).toHaveBeenCalledTimes(1)
        expect(fetchPreparedJsonResponse).not.toHaveBeenCalled()
      } finally {
        vi.useRealTimers()
      }
    },
  )
  it("automatically verifies the latest edited key after a pause and ignores an obsolete response", async () => {
    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
      }),
    )
    await waitFor(() => expect(result.current).toBeTruthy())
    await act(async () =>
      result.current.handlers.handleUrlChange("https://novita.ai"),
    )
    await act(async () => result.current.handlers.handleAutoDetect())
    vi.useFakeTimers()
    try {
      await act(async () => result.current.setters.setAccessToken("sk_first"))
      await act(async () => vi.advanceTimersByTimeAsync(400))
      expect(fetchPreparedJsonResponse).not.toHaveBeenCalled()
      await act(async () => result.current.setters.setAccessToken("sk_second"))
      await act(async () => vi.advanceTimersByTimeAsync(599))
      expect(fetchPreparedJsonResponse).not.toHaveBeenCalled()
      let resolveFirst!: (value: unknown) => void
      fetchPreparedJsonResponse.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirst = resolve
        }),
      )
      await act(async () => vi.advanceTimersByTimeAsync(1))
      expect(fetchPreparedJsonResponse).toHaveBeenCalledOnce()
      expect(result.current.state.isDetecting).toBe(true)
      await act(async () => result.current.setters.setAccessToken("sk_latest"))
      await act(async () =>
        resolveFirst({
          ok: true,
          status: 200,
          body: { uuid: "obsolete-user", email: "obsolete@example.com" },
        }),
      )
      expect(result.current.state.userId).not.toBe("obsolete-user")
      expect(result.current.state.credentialVerification).toBeNull()
      fetchPreparedJsonResponse.mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: { uuid: "latest-user", email: "latest@example.com" },
      })
      await act(async () => vi.advanceTimersByTimeAsync(600))
      expect(result.current.state.credentialVerification).toMatchObject({
        status: "success",
        accessToken: "sk_latest",
        accountLabel: "latest@example.com",
      })
      expect(result.current.state.userId).toBe("latest-user")
      await act(async () => vi.advanceTimersByTimeAsync(2000))
      expect(fetchPreparedJsonResponse).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })
  it("reports accepted API-key verification and clears feedback when the key changes", async () => {
    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    )
    await waitFor(() => expect(result.current).toBeTruthy())
    await act(async () =>
      result.current.handlers.handleUrlChange("https://novita.ai"),
    )
    await act(async () => result.current.handlers.handleAutoDetect())
    await act(async () => result.current.setters.setAccessToken("sk_valid"))
    fetchPreparedJsonResponse.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: { uuid: "novita-user", email: "user@example.com" },
    })
    await act(async () => result.current.handlers.handleAutoDetect())
    expect(result.current.state.credentialVerification).toMatchObject({
      status: "success",
      accessToken: "sk_valid",
      userId: "novita-user",
      accountLabel: "user@example.com",
    })
    await act(async () => result.current.setters.setAccessToken("sk_invalid"))
    expect(result.current.state.credentialVerification).toBeNull()
    fetchPreparedJsonResponse.mockResolvedValueOnce({
      ok: false,
      status: 401,
      body: { reason: "UNAUTHORIZED", message: "key not found" },
    })
    await act(async () => result.current.handlers.handleAutoDetect())
    expect(result.current.state.credentialVerification).toMatchObject({
      status: "error",
      message: "messages:novita.credentialInvalid",
    })
    await act(async () => result.current.setters.setAccessToken(""))
    expect(result.current.state.credentialVerification).toBeNull()
  })
  it.each(["clear", "site", "close"])(
    "cancels a pending automatic check on %s",
    async (change) => {
      const { result } = renderHook(() =>
        useAccountDialog({
          mode: DIALOG_MODES.ADD,
          isOpen: true,
          onClose: vi.fn(),
        }),
      )
      await waitFor(() => expect(result.current).toBeTruthy())
      await act(async () =>
        result.current.handlers.handleUrlChange("https://novita.ai"),
      )
      await act(async () => result.current.handlers.handleAutoDetect())
      vi.useFakeTimers()
      try {
        await act(async () =>
          result.current.setters.setAccessToken("sk_pending"),
        )
        await act(async () => {
          if (change === "clear") result.current.setters.setAccessToken("")
          if (change === "site")
            result.current.handlers.handleUrlChange("https://other.example")
          if (change === "close") await result.current.handlers.handleClose()
        })
        await act(async () => vi.advanceTimersByTimeAsync(1000))
        expect(fetchPreparedJsonResponse).not.toHaveBeenCalled()
      } finally {
        vi.useRealTimers()
      }
    },
  )
  it("lets API-key onboarding wait for a pasted key and add console credentials without losing the API key or account edits", async () => {
    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    )
    await waitFor(() => expect(result.current).toBeTruthy())
    await act(async () =>
      result.current.handlers.handleUrlChange("https://novita.ai"),
    )
    await act(async () => result.current.handlers.handleAutoDetect())
    await act(async () => {
      result.current.setters.setSiteName("My Novita")
    })
    await act(async () =>
      result.current.setters.setAccessToken("sk_pasted-key"),
    )
    fetchPreparedJsonResponse.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: { uuid: "novita-user", email: "user@example.com" },
    })
    await act(async () => result.current.handlers.handleAutoDetect())
    expect(result.current.state.userId).toBe("novita-user")
    fetchPreparedJsonResponse.mockClear()
    browserDetect.mockResolvedValueOnce({
      success: true,
      data: {
        siteType: SITE_TYPES.NOVITA,
        userId: "novita-user",
        user: { id: "novita-user", username: "user@example.com" },
        accessToken: "novita-console:console-session",
      },
    })
    fetchPreparedJsonResponse.mockResolvedValue({
      ok: true,
      status: 200,
      body: { uuid: "novita-user", email: "user@example.com" },
    })
    await act(async () => result.current.handlers.handleAcquireNovitaConsole())
    expect(fetchPreparedJsonResponse).toHaveBeenCalledTimes(1)
    expect(fetchPreparedJsonResponse.mock.calls[0]?.[1]).toMatchObject({
      url: "https://api-server.novita.ai/v1/user/info",
      options: { headers: { Authorization: "Bearer console-session" } },
    })
    expect(result.current.state).toMatchObject({
      siteName: "My Novita",
      userId: "novita-user",
      accessToken:
        'novita-credentials:{"apiKey":"sk_pasted-key","consoleToken":"console-session"}',
    })
    const pairedCredential = result.current.state.accessToken
    browserDetect.mockResolvedValueOnce({
      success: true,
      data: {
        siteType: SITE_TYPES.NOVITA,
        userId: "different-user",
        user: { id: "different-user", username: "different@example.com" },
        accessToken: "novita-console:other-session",
      },
    })
    await act(async () => result.current.handlers.handleAcquireNovitaConsole())
    expect(result.current.state.accessToken).toBe(pairedCredential)
    expect(result.current.state.userId).toBe("novita-user")
    expect(result.current.state.detectionError?.message).toBe(
      "accountDialog:messages.autoDetectIdentityMismatch",
    )
    browserDetect.mockResolvedValueOnce({ success: false })
    await act(async () => result.current.handlers.handleAcquireNovitaConsole())
    expect(result.current.state.accessToken).toBe(pairedCredential)
    expect(result.current.state.userId).toBe("novita-user")
  })
  beforeEach(() => {
    vi.clearAllMocks()
    browserDetect.mockReset().mockResolvedValue({ success: false })
    fetchPreparedJsonResponse.mockReset()
    getActiveTabs.mockReset().mockResolvedValue([])
  })

  it.each([undefined, "My Novita"])(
    "uses the provider name from the active key page and preserves a manual name (%s)",
    async (customName) => {
      getActiveTabs.mockResolvedValue([
        {
          id: 1,
          url: "https://novita.ai/settings/key-management",
          title: "Key Management | Novita AI",
        },
      ])
      browserDetect.mockResolvedValueOnce({
        success: true,
        data: {
          siteType: SITE_TYPES.NOVITA,
          userId: "signed-in-user",
          user: { id: "signed-in-user", username: "signed-in@example.com" },
          rawUser: {},
          accessToken: "novita-console:opaque-session",
        },
      })
      fetchPreparedJsonResponse.mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: { uuid: "signed-in-user", email: "signed-in@example.com" },
      })
      const { result } = renderHook(() =>
        useAccountDialog({
          mode: DIALOG_MODES.ADD,
          isOpen: true,
          onClose: vi.fn(),
          onSuccess: vi.fn(),
        }),
      )
      await waitFor(() =>
        expect(result.current.state.siteName).toBe("Novita AI"),
      )
      await act(async () => result.current.handlers.handleUseCurrentTabUrl())
      if (customName) act(() => result.current.setters.setSiteName(customName))
      await act(async () => result.current.handlers.handleAutoDetect())
      expect(result.current.state.siteName).toBe(customName ?? "Novita AI")
      expect(result.current.state.detectionError).toBeNull()
    },
  )

  it("uses the website login to prefill account identity before asking for an API key", async () => {
    browserDetect.mockResolvedValueOnce({
      success: true,
      data: {
        siteType: SITE_TYPES.NOVITA,
        userId: "signed-in-user",
        user: { id: "signed-in-user", username: "signed-in@example.com" },
        rawUser: {},
      },
    })
    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    )
    await waitFor(() => expect(result.current).toBeTruthy())
    await act(async () =>
      result.current.handlers.handleUrlChange("https://novita.ai"),
    )
    await act(async () => result.current.handlers.handleAutoDetect())
    expect(result.current.state).toMatchObject({
      siteType: SITE_TYPES.NOVITA,
      siteName: "Novita AI",
      exchangeRate: "7.2",
      userId: "signed-in-user",
      username: "signed-in@example.com",
      accessToken: "",
      showManualForm: true,
    })
    expect(result.current.state.detectionError).toBeTruthy()
    expect(fetchPreparedJsonResponse).not.toHaveBeenCalled()
  })

  it("prefills the manual fallback and completes a pasted key on retry", async () => {
    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    )
    await waitFor(() => expect(result.current).toBeTruthy())
    await act(async () =>
      result.current.handlers.handleUrlChange("https://novita.ai/console"),
    )
    await act(async () => result.current.handlers.handleAutoDetect())
    await waitFor(() => expect(result.current.state.showManualForm).toBe(true))
    expect(result.current.state).toMatchObject({
      siteType: SITE_TYPES.NOVITA,
      siteName: "Novita AI",
      exchangeRate: "7.2",
      url: "https://novita.ai",
    })

    await act(async () => {
      result.current.setters.setSiteName("My Novita")
      result.current.setters.setExchangeRate("7.35")
      result.current.setters.setAccessToken("sk_pasted-key")
    })
    fetchPreparedJsonResponse.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: { uuid: "novita-user", email: "user@example.com" },
    })
    await act(async () => result.current.handlers.handleAutoDetect())

    expect(result.current.state).toMatchObject({
      userId: "novita-user",
      username: "user@example.com",
      accessToken: "sk_pasted-key",
      siteName: "My Novita",
      exchangeRate: "7.35",
    })
    expect(result.current.state.detectionError).toBeNull()
  })

  it("keeps user edits on an invalid-key retry", async () => {
    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    )
    await waitFor(() => expect(result.current).toBeTruthy())
    await act(async () =>
      result.current.handlers.handleUrlChange("https://novita.ai"),
    )
    await act(async () => result.current.handlers.handleAutoDetect())
    await act(async () => {
      result.current.setters.setSiteName("My Novita")
      result.current.setters.setExchangeRate("7.35")
      result.current.setters.setAccessToken("sk_invalid")
    })
    fetchPreparedJsonResponse.mockResolvedValueOnce({
      ok: false,
      status: 401,
      body: { reason: "UNAUTHORIZED", message: "key not found" },
    })
    await act(async () => result.current.handlers.handleAutoDetect())
    expect(result.current.state).toMatchObject({
      siteName: "My Novita",
      exchangeRate: "7.35",
      accessToken: "sk_invalid",
      userId: "",
      showManualForm: true,
    })
    expect(result.current.state.detectionError?.message).toBe(
      "messages:novita.credentialInvalid",
    )
  })

  it("discards a completed Novita identity after switching sites", async () => {
    let resolveIdentity!: (value: unknown) => void
    const identity = new Promise((resolve) => {
      resolveIdentity = resolve
    })
    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      }),
    )
    await waitFor(() => expect(result.current).toBeTruthy())
    await act(async () =>
      result.current.handlers.handleUrlChange("https://novita.ai"),
    )
    await act(async () => result.current.handlers.handleAutoDetect())
    await act(async () => result.current.setters.setAccessToken("sk_key"))
    fetchPreparedJsonResponse.mockReturnValueOnce(identity)
    let pending!: Promise<void>
    await act(async () => {
      pending = result.current.handlers.handleAutoDetect()
    })
    await waitFor(() =>
      expect(fetchPreparedJsonResponse).toHaveBeenCalledOnce(),
    )
    await act(async () =>
      result.current.setters.setSiteType(SITE_TYPES.NEW_API),
    )
    await act(async () =>
      result.current.handlers.handleUrlChange("https://other.example"),
    )
    await act(async () => {
      resolveIdentity({
        ok: true,
        status: 200,
        body: { uuid: "late-user", email: "late@example.com" },
      })
      await pending
    })
    expect(result.current.state.siteType).toBe(SITE_TYPES.NEW_API)
    expect(result.current.state.userId).not.toBe("late-user")
    expect(result.current.state.username).not.toBe("late@example.com")
  })
})
