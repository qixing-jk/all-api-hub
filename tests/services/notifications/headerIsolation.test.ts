import { afterEach, expect, it, vi } from "vitest"

import { fetchWithHeaderOverrides } from "~/services/apiTransport/headerOverrides"
import { sendDingtalkNotification } from "~/services/notifications/delivery/dingtalk"
import { sendFeishuNotification } from "~/services/notifications/delivery/feishu"
import { sendNtfyNotification } from "~/services/notifications/delivery/ntfy"
import { sendWebhookNotification } from "~/services/notifications/delivery/webhook"
import { sendWecomNotification } from "~/services/notifications/delivery/wecom"
import {
  TASK_NOTIFICATION_STATUSES,
  TASK_NOTIFICATION_TASKS,
} from "~/types/taskNotifications"
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

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it.each(deliveries)(
  "keeps $name notifications from inheriting a concurrent Origin override",
  async ({ send }) => {
    isolateWebLocks()
    vi.spyOn(browser.runtime, "getURL").mockReturnValue(
      "chrome-extension://extension-id/",
    )
    let activeOrigin: string | undefined
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
            activeOrigin = addRules?.[0].action.requestHeaders?.find(
              (header) => header.header === "origin",
            )?.value
          },
        ),
      },
    })
    const sentOrigins: (string | undefined)[] = []
    const dispatched = Promise.withResolvers<void>()
    const response = Promise.withResolvers<Response>()
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
  },
)
