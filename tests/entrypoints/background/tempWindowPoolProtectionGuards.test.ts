import { beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { checkTempContextProtectionGuards } from "~/entrypoints/background/tempWindowPool"

describe("checkTempContextProtectionGuards", () => {
  const browserAny = globalThis.browser as any

  beforeEach(() => {
    browserAny.tabs.sendMessage = vi.fn()
  })

  it("returns passed when both CAP and Cloudflare guards pass", async () => {
    browserAny.tabs.sendMessage.mockImplementation(
      (_tabId: number, msg: any) => {
        if (msg.action === RuntimeActionIds.ContentCheckCapGuard) {
          return Promise.resolve({ success: true, passed: true })
        }
        if (msg.action === RuntimeActionIds.ContentCheckCloudflareGuard) {
          return Promise.resolve({ success: true, passed: true })
        }
        return Promise.reject(new Error("unexpected action"))
      },
    )

    const result = await checkTempContextProtectionGuards({
      tabId: 123,
      requestId: "req-1",
    })

    expect(result.passed).toBe(true)
    expect(result.capPassed).toBe(true)
    expect(result.cloudflarePassed).toBe(true)
  })

  it("returns not passed when Cloudflare guard fails", async () => {
    browserAny.tabs.sendMessage.mockImplementation(
      (_tabId: number, msg: any) => {
        if (msg.action === RuntimeActionIds.ContentCheckCapGuard) {
          return Promise.resolve({ success: true, passed: true })
        }
        if (msg.action === RuntimeActionIds.ContentCheckCloudflareGuard) {
          return Promise.resolve({ success: true, passed: false })
        }
        return Promise.reject(new Error("unexpected action"))
      },
    )

    const result = await checkTempContextProtectionGuards({
      tabId: 123,
      requestId: "req-2",
    })

    expect(result.passed).toBe(false)
    expect(result.capPassed).toBe(true)
    expect(result.cloudflarePassed).toBe(false)
  })

  it("treats rejected guard checks as not passed", async () => {
    browserAny.tabs.sendMessage.mockImplementation(
      (_tabId: number, msg: any) => {
        if (msg.action === RuntimeActionIds.ContentCheckCapGuard) {
          return Promise.reject(new Error("cap failed"))
        }
        if (msg.action === RuntimeActionIds.ContentCheckCloudflareGuard) {
          return Promise.resolve({ success: true, passed: true })
        }
        return Promise.reject(new Error("unexpected action"))
      },
    )

    const result = await checkTempContextProtectionGuards({
      tabId: 123,
      requestId: "req-3",
    })

    expect(result.passed).toBe(false)
    expect(result.capPassed).toBe(false)
    expect(result.cloudflarePassed).toBe(true)
  })

  it("treats invalid guard responses as not passed", async () => {
    browserAny.tabs.sendMessage.mockImplementation(
      (_tabId: number, msg: any) => {
        if (msg.action === RuntimeActionIds.ContentCheckCapGuard) {
          return Promise.resolve(null)
        }
        if (msg.action === RuntimeActionIds.ContentCheckCloudflareGuard) {
          return Promise.resolve({ success: true, passed: true })
        }
        return Promise.reject(new Error("unexpected action"))
      },
    )

    const result = await checkTempContextProtectionGuards({
      tabId: 123,
      requestId: "req-4",
    })

    expect(result.passed).toBe(false)
    expect(result.capPassed).toBe(false)
    expect(result.cloudflarePassed).toBe(true)
  })
})
