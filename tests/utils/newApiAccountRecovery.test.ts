import type { ConsoleMessage, Page } from "@playwright/test"
import { describe, expect, it, vi } from "vitest"

import { installExtensionPageGuards } from "~~/e2e/utils/commonUserFlows"
import type { AccountAddDialog } from "~~/e2e/utils/realSite/accountAdd"
import { createNewApiAccountRecovery } from "~~/e2e/utils/realSite/newApiAccountRecovery"

describe("New API account recovery console guard", () => {
  const baseUrl = "https://new-api.example.invalid"

  it.each([
    ["token verification response", `${baseUrl}/api/user/token`, 403, false],
    ["other account endpoint", `${baseUrl}/api/user/self`, 403, true],
    ["other site", "https://other.example.invalid/api/user/token", 403, true],
    ["token server failure", `${baseUrl}/api/user/token`, 500, true],
    ["unrelated token request", `${baseUrl}/api/user/token/status`, 403, true],
  ])(
    "handles %s without hiding unrelated failures",
    (_label, url, status, throws) => {
      const handlers = new Map<string, (message: ConsoleMessage) => void>()
      const page = {
        on: vi.fn((event, handler) => handlers.set(event, handler)),
      } as unknown as Page
      const recovery = createNewApiAccountRecovery({
        page,
        config: {
          baseUrl,
          loginUrl: `${baseUrl}/login`,
          loginApiUrl: `${baseUrl}/api/user/login`,
          login2faApiUrl: `${baseUrl}/api/user/login/2fa`,
          username: "test-user",
          password: "test-password",
        },
      })
      installExtensionPageGuards(page, recovery.extensionPageGuardOptions)
      const message = {
        type: () => "error",
        text: () =>
          `Failed to load resource: the server responded with a status of ${status} ()`,
        location: () => ({ url, lineNumber: 0, columnNumber: 0 }),
      } as ConsoleMessage
      const emit = () => handlers.get("console")!(message)

      if (throws) expect(emit).toThrow(`status of ${status}`)
      else expect(emit).not.toThrow()
    },
  )
})

describe("New API account recovery dialog readiness", () => {
  const baseUrl = "https://new-api.example.invalid"
  const config = {
    baseUrl,
    loginUrl: `${baseUrl}/login`,
    loginApiUrl: `${baseUrl}/api/user/login`,
    login2faApiUrl: `${baseUrl}/api/user/login/2fa`,
    username: "test-user",
    password: "test-password",
  }

  function createDetectedDialog(
    failureText: string | null,
    overrides: { confirmAddButton?: Record<string, unknown> } = {},
  ) {
    const recoveryHeading = {
      isVisible: vi.fn().mockResolvedValue(false),
    }
    const failureBanner = {
      isVisible: vi.fn().mockResolvedValue(Boolean(failureText)),
      innerText: vi.fn().mockResolvedValue(failureText ?? ""),
      first: vi.fn(),
    }
    failureBanner.first.mockReturnValue(failureBanner)
    const dialogRoot = {
      getByText: vi.fn((matcher: unknown) =>
        matcher instanceof RegExp ? failureBanner : recoveryHeading,
      ),
    }

    return {
      dialog: {
        dialog: dialogRoot,
        confirmAddButton: {
          isVisible: vi.fn().mockResolvedValue(false),
          isEnabled: vi.fn().mockResolvedValue(false),
          ...overrides.confirmAddButton,
        },
      } as unknown as AccountAddDialog,
      dialogRoot,
    }
  }

  it("reports the visible auto-detection failure when the dialog never becomes ready", async () => {
    const { dialog } = createDetectedDialog(
      "Auto-detection failed: Could not get User ID",
    )
    const recovery = createNewApiAccountRecovery({
      page: {} as unknown as Page,
      config,
      dialogReadyTimeoutMs: 25,
    })

    await expect(recovery.prepareDetectedDialog(dialog)).rejects.toThrow(
      "Could not get User ID",
    )
  })

  it("falls back to the timeout detail when no failure banner is visible", async () => {
    const { dialog } = createDetectedDialog(null)
    const recovery = createNewApiAccountRecovery({
      page: {} as unknown as Page,
      config,
      dialogReadyTimeoutMs: 25,
    })

    await expect(recovery.prepareDetectedDialog(dialog)).rejects.toThrow(
      /never became confirmable/u,
    )
  })

  it("rethrows predicate failures instead of reporting a readiness timeout", async () => {
    const predicateError = new Error(
      "strict mode violation: ready button resolved to 2 elements",
    )
    const { dialog } = createDetectedDialog(null, {
      confirmAddButton: {
        isVisible: vi.fn().mockRejectedValue(predicateError),
      },
    })
    const recovery = createNewApiAccountRecovery({
      page: {} as unknown as Page,
      config,
      dialogReadyTimeoutMs: 25,
    })

    await expect(recovery.prepareDetectedDialog(dialog)).rejects.toBe(
      predicateError,
    )
  })
})
