import type { ConsoleMessage, Page } from "@playwright/test"
import { describe, expect, it, vi } from "vitest"

import { installExtensionPageGuards } from "~~/e2e/utils/commonUserFlows"
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
