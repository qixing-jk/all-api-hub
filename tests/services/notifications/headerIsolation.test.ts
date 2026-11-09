import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { fetchWithHeaderOverrides } from "~/services/apiTransport/headerOverrides"
import { sendDingtalkNotification } from "~/services/notifications/delivery/dingtalk"
import { sendFeishuNotification } from "~/services/notifications/delivery/feishu"
import { fetchNotification } from "~/services/notifications/delivery/http"
import { sendNtfyNotification } from "~/services/notifications/delivery/ntfy"
import { sendWebhookNotification } from "~/services/notifications/delivery/webhook"
import { sendWecomNotification } from "~/services/notifications/delivery/wecom"
import {
  TASK_NOTIFICATION_STATUSES,
  TASK_NOTIFICATION_TASKS,
} from "~/types/taskNotifications"
import { createDeferred } from "~~/tests/test-utils/deferred"
import { isolateWebLocks } from "~~/tests/test-utils/webLocks"

const url = "http://192.168.1.20:3430/api/provider/save"
const content = { title: "Task complete", message: "Finished" }
const webhookConfig = { enabled: true, webhookKey: url }
const deliveries = [
  {
    name: "webhook",
    send: () =>
      sendWebhookNotification(
        {
          task: TASK_NOTIFICATION_TASKS.AutoCheckin,
          status: TASK_NOTIFICATION_STATUSES.Success,
        },
        content,
        { enabled: true, url },
      ),
  },
  {
    name: "Feishu",
    send: () => sendFeishuNotification(content, webhookConfig),
  },
  {
    name: "DingTalk",
    send: () =>
      sendDingtalkNotification(content, { ...webhookConfig, secret: "" }),
  },
  { name: "WeCom", send: () => sendWecomNotification(content, webhookConfig) },
  {
    name: "ntfy",
    send: () =>
      sendNtfyNotification(content, {
        enabled: true,
        topicUrl: url,
        accessToken: "",
      }),
  },
]

let activeOrigin: string | undefined
beforeEach(() => {
  isolateWebLocks()
  vi.spyOn(browser.runtime, "getURL").mockReturnValue(
    "chrome-extension://extension-id/",
  )
  activeOrigin = undefined
  vi.stubGlobal("chrome", {
    runtime: { id: "extension-id" },
    permissions: { contains: vi.fn().mockResolvedValue(true) },
    declarativeNetRequest: {
      updateSessionRules: vi.fn(
        async ({
          addRules,
        }: {
          addRules?: browser.declarativeNetRequest.Rule[]
        }) => {
          activeOrigin = addRules?.[0]?.action.requestHeaders?.find(
            (header) => header.header === "origin",
          )?.value
        },
      ),
    },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

it.each(deliveries)(
  "keeps $name notifications from inheriting a concurrent Origin override",
  async ({ send }) => {
    vi.useFakeTimers()
    const sentOrigins: (string | undefined)[] = []
    const dispatched = createDeferred<void>()
    const response = createDeferred<Response>()
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string, init: RequestInit) => {
        expect(input).toBe(url)
        expect(init.method).toBe("POST")
        sentOrigins.push(activeOrigin)
        if (sentOrigins.length === 1) {
          dispatched.resolve()
          return response.promise
        }
        return Promise.resolve(Response.json({ code: 0, errcode: 0 }))
      }),
    )
    const management = fetchWithHeaderOverrides(
      url,
      { method: "POST" },
      undefined,
      { matchRequestOrigin: true },
    )
    await dispatched.promise
    const notification = send()
    response.resolve(Response.json({}))
    await expect(notification).resolves.toBe(true)
    await management
    expect(sentOrigins).toEqual(["http://192.168.1.20:3430", undefined])
    expect(activeOrigin).toBeUndefined()
    expect(vi.getTimerCount()).toBe(0)
  },
)

it("does not dispatch a notification after its caller cancels", async () => {
  vi.useFakeTimers()
  const controller = new AbortController()
  const reason = new Error("Notification cancelled")
  controller.abort(reason)
  const fetchMock = vi.fn()
  vi.stubGlobal("fetch", fetchMock)
  await expect(
    fetchNotification(url, { method: "POST", signal: controller.signal }),
  ).rejects.toBe(reason)
  expect(fetchMock).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})

it.each(deliveries)(
  "aborts a stalled $name fetch so a waiting Origin request can proceed",
  async ({ send }) => {
    vi.useFakeTimers()
    const started = createDeferred<void>()
    const stalled = createDeferred<Response>()
    let requestSignal: AbortSignal | null | undefined
    const fetchMock = vi
      .fn()
      .mockImplementationOnce((_url, init: RequestInit) => {
        requestSignal = init.signal
        requestSignal?.addEventListener(
          "abort",
          () => stalled.reject(requestSignal?.reason),
          { once: true },
        )
        started.resolve()
        return stalled.promise
      })
      .mockImplementation(async () => {
        expect(activeOrigin).toBe("http://192.168.1.20:3430")
        return Response.json({})
      })
    vi.stubGlobal("fetch", fetchMock)
    let outcome: unknown
    const notification = send().then(
      (value) => {
        outcome = value
      },
      (error) => {
        outcome = error
      },
    )
    await started.promise
    const management = fetchWithHeaderOverrides(
      url,
      { method: "POST" },
      undefined,
      { matchRequestOrigin: true },
    )
    try {
      await vi.waitFor(async () => {
        const locks = await navigator.locks.query()
        expect(
          locks.pending?.some((lock) =>
            lock.name?.endsWith("request-header-overrides"),
          ),
        ).toBe(true)
      })
      await vi.advanceTimersByTimeAsync(30_000)
      await vi.waitFor(() =>
        expect(outcome).toMatchObject({ name: "TimeoutError" }),
      )
      expect(requestSignal?.aborted).toBe(true)
      await expect(management).resolves.toBeInstanceOf(Response)
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(activeOrigin).toBeUndefined()
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      stalled.reject(new Error("test cleanup"))
      await Promise.all([notification, management])
    }
  },
)
