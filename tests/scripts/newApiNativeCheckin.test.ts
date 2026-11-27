import { EventEmitter } from "node:events"
import { setImmediate } from "node:timers/promises"
import type { Locator, Page } from "@playwright/test"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  readNewApiNativeCheckin,
  runNewApiNativeCheckin,
} from "~~/scripts/flows/new-api-native-checkin.mjs"

const { toHaveAttribute } = vi.hoisted(() => ({
  toHaveAttribute: vi.fn(),
}))
vi.mock("@playwright/test", () => ({
  expect: () => ({ toHaveAttribute }),
}))

const origin = "https://example.test"
const identityPath = "/api/user/auth/refresh"
const checkinPath = "/api/user/checkin"

function response(path: string, method: string, json: () => Promise<unknown>) {
  const request = { url: () => origin + path, method: () => method }
  return { url: request.url, request: () => request, status: () => 200, json }
}

function nativePageFixture() {
  const page = Object.assign(new EventEmitter(), {
    url: () => origin + "/profile",
    reload: vi.fn().mockResolvedValue(undefined),
    waitForResponse: vi.fn(),
  })
  page.waitForResponse
    .mockResolvedValueOnce(
      response(identityPath, "POST", async () => ({
        success: true,
        data: { user: { id: 42 } },
      })),
    )
    .mockResolvedValueOnce(
      response(checkinPath, "GET", async () => ({
        success: true,
        data: {
          enabled: true,
          stats: { checked_in_today: false, records: [] },
        },
      })),
    )
  return page
}

describe("native New API check-in acceptance flow", () => {
  beforeEach(() => {
    toHaveAttribute.mockReset()
  })

  it("reports a waiter rejection that occurs while reloading the native page", async () => {
    const error = new Error("Native identity response was unavailable")
    const page = nativePageFixture()
    page.waitForResponse.mockReset()
    page.waitForResponse
      .mockRejectedValueOnce(error)
      .mockImplementationOnce(() => new Promise(() => {}))
    page.reload.mockImplementation(async () => {
      await setImmediate()
      throw new Error("Reload also failed")
    })

    await expect(
      readNewApiNativeCheckin(page as unknown as Page, 42),
    ).rejects.toBe(error)
  })

  it.each([
    [identityPath, "POST"],
    [checkinPath, "POST"],
  ])(
    "reports malformed JSON from %s and removes response listeners",
    async (path, method) => {
      const parseError = new SyntaxError("Response was HTML")
      const nativePage = nativePageFixture()
      const context = Object.assign(new EventEmitter(), {
        pages: () => [nativePage],
      })
      const pressMenuItem = async () => {
        context.emit(
          "response",
          response(path, method, async () => {
            throw parseError
          }),
        )
        await setImmediate()
      }
      const optionsPage = {
        context: () => context,
        bringToFront: vi.fn(),
        getByTestId: () => ({ click: pressMenuItem }),
      }
      const accountRow = {
        hover: vi.fn(),
        getByTestId: () => ({ click: vi.fn() }),
      }
      const uiError = new Error("Check-in did not reach the expected UI state")
      toHaveAttribute.mockRejectedValue(uiError)

      const run = runNewApiNativeCheckin({
        optionsPage: optionsPage as unknown as Page,
        accountRow: accountRow as unknown as Locator,
        nativePage: nativePage as unknown as Page,
        expectedUserId: 42,
      })
      await expect(run).rejects.toMatchObject({ errors: [uiError, parseError] })
      expect(context.listenerCount("response")).toBe(0)
      expect(nativePage.listenerCount("response")).toBe(0)
    },
  )
})
