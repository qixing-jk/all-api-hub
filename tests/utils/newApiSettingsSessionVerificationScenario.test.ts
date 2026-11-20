import type { Page } from "@playwright/test"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { runNewApiSettingsSessionVerificationScenario } from "~~/e2e/scenarios/newApiSettingsSessionVerification"

const { annotations } = vi.hoisted(() => ({
  annotations: [] as Array<{ type: string; description: string }>,
}))

vi.mock("~~/e2e/fixtures/extensionTest", () => ({
  expect: vi.fn(),
  test: {
    info: () => ({ annotations }),
    step: async (_name: string, run: () => Promise<void>) => run(),
  },
}))

const config = {
  baseUrl: "https://managed.example",
  adminToken: "fixture-management-token",
  userId: "1",
  username: "admin",
  password: "fixture-password",
  totpSecret: "JBSWY3DPEHPK3PXP",
}

describe("New API settings real-site verification prerequisites", () => {
  beforeEach(() => {
    annotations.length = 0
  })

  it.each([
    { username: "" },
    { password: "" },
    { totpSecret: "" },
    { totpSecret: "   " },
  ])(
    "omits settings verification when administrator credentials are incomplete: %j",
    async (missing) => {
      const page = {
        url: vi.fn(() => "about:blank"),
        goto: vi.fn().mockResolvedValue(undefined),
        context: vi.fn(() => ({ on: vi.fn(), off: vi.fn() })),
      }
      await expect(
        runNewApiSettingsSessionVerificationScenario({
          page: page as unknown as Page,
          extensionId: "fixture-extension",
          config: { ...config, ...missing },
        }),
      ).resolves.toBeUndefined()
      expect(page.goto).not.toHaveBeenCalled()
      expect(page.context).not.toHaveBeenCalled()
      expect(annotations).toMatchObject([
        { type: "session-verification-not-tested" },
      ])
    },
  )
})
