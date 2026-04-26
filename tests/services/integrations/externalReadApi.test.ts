import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ACCOUNT_STORAGE_KEYS } from "~/services/core/storageKeys"
import {
  EXTERNAL_READ_API_EVENT_NAME,
  EXTERNAL_READ_API_NAMESPACE,
} from "~/services/integrations/externalReadApi/constants"

type RuntimeMessageExternalListener = (
  request: unknown,
  sender: browser.runtime.MessageSender,
  sendResponse: (response: unknown) => void,
) => boolean

type StorageChangedListener = (
  changes: Record<string, browser.storage.StorageChange>,
  areaName: string,
) => void

const {
  exportAccountsMock,
  exportProfilesMock,
  getPreferencesMock,
  getAllTabsMock,
  sendTabMessageWithRetryMock,
  isMessageReceiverUnavailableErrorMock,
} = vi.hoisted(() => ({
  exportAccountsMock: vi.fn(),
  exportProfilesMock: vi.fn(),
  getPreferencesMock: vi.fn(),
  getAllTabsMock: vi.fn(),
  sendTabMessageWithRetryMock: vi.fn(),
  isMessageReceiverUnavailableErrorMock: vi.fn(),
}))

describe("externalReadApi integration", () => {
  let messageExternalListener: RuntimeMessageExternalListener | undefined
  let storageChangedListener: StorageChangedListener | undefined
  let stateStore: Record<string, unknown>

  beforeEach(() => {
    vi.resetModules()

    stateStore = {}
    messageExternalListener = undefined
    storageChangedListener = undefined

    exportAccountsMock.mockReset()
    exportProfilesMock.mockReset()
    getPreferencesMock.mockReset()
    getAllTabsMock.mockReset()
    sendTabMessageWithRetryMock.mockReset()
    isMessageReceiverUnavailableErrorMock.mockReset()

    exportAccountsMock.mockResolvedValue({
      accounts: [
        {
          id: "acct-1",
          site_url: "https://site.example",
          account_info: { access_token: "token-1" },
          cookieAuth: { sessionCookie: "session-1" },
          sub2apiAuth: { refreshToken: "refresh-1" },
        },
      ],
      bookmarks: [],
      pinnedAccountIds: ["acct-1"],
      orderedAccountIds: ["acct-1"],
    })
    exportProfilesMock.mockResolvedValue({
      profiles: [
        {
          id: "profile-1",
          baseUrl: "https://api.example",
          apiKey: "key-1",
          apiType: "openai",
        },
      ],
    })
    getPreferencesMock.mockResolvedValue({
      externalReadApi: {
        enabled: true,
        notificationsEnabled: true,
        tokens: [
          {
            id: "token-1",
            name: "metapi-sync",
            token: "secret-token",
            createdAt: 1,
            enabled: true,
          },
        ],
      },
    })
    sendTabMessageWithRetryMock.mockResolvedValue(undefined)
    isMessageReceiverUnavailableErrorMock.mockReturnValue(false)
    getAllTabsMock.mockResolvedValue([
      { id: 1, url: "https://alpha.example/page" },
      { id: 2, url: "https://beta.example/page" },
    ])

    vi.doMock("@plasmohq/storage", () => ({
      Storage: class {
        async get(key: string) {
          return stateStore[key]
        }
        async set(key: string, value: unknown) {
          stateStore[key] = value
        }
      },
    }))

    vi.doMock("~/services/accounts/accountStorage", () => ({
      accountStorage: {
        exportData: exportAccountsMock,
      },
    }))

    vi.doMock(
      "~/services/apiCredentialProfiles/apiCredentialProfilesStorage",
      () => ({
        apiCredentialProfilesStorage: {
          exportConfig: exportProfilesMock,
        },
      }),
    )

    vi.doMock("~/services/preferences/userPreferences", () => ({
      userPreferences: {
        getPreferences: getPreferencesMock,
      },
    }))

    vi.doMock("~/utils/browser/browserApi", async (importOriginal) => {
      const actual =
        await importOriginal<typeof import("~/utils/browser/browserApi")>()

      return {
        ...actual,
        getAllTabs: getAllTabsMock,
        sendTabMessageWithRetry: sendTabMessageWithRetryMock,
        isMessageReceiverUnavailableError:
          isMessageReceiverUnavailableErrorMock,
      }
    })
    ;(globalThis as any).browser = {
      runtime: {
        onMessageExternal: {
          addListener: vi.fn((listener: RuntimeMessageExternalListener) => {
            messageExternalListener = listener
          }),
        },
      },
      storage: {
        onChanged: {
          addListener: vi.fn((listener: StorageChangedListener) => {
            storageChangedListener = listener
          }),
        },
      },
    }
  })

  afterEach(() => {
    vi.doUnmock("@plasmohq/storage")
    vi.doUnmock("~/services/accounts/accountStorage")
    vi.doUnmock("~/services/apiCredentialProfiles/apiCredentialProfilesStorage")
    vi.doUnmock("~/services/preferences/userPreferences")
    vi.doUnmock("~/utils/browser/browserApi")
    vi.restoreAllMocks()
  })

  async function setupIntegration() {
    const module = await import("~/services/integrations/externalReadApi")
    module.__resetExternalReadApiForTests()
    module.setupExternalReadApi()
    expect(messageExternalListener).toBeTypeOf("function")
    expect(storageChangedListener).toBeTypeOf("function")
  }

  async function callExternal(
    request: Record<string, unknown>,
    sender: Partial<browser.runtime.MessageSender> = {},
  ) {
    const sendResponse = vi.fn()

    const result = messageExternalListener?.(
      request,
      sender as browser.runtime.MessageSender,
      sendResponse,
    )

    expect(result).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 0))

    return sendResponse.mock.calls[0]?.[0]
  }

  it("rejects external requests when the feature is disabled", async () => {
    getPreferencesMock.mockResolvedValueOnce({
      externalReadApi: {
        enabled: false,
        notificationsEnabled: true,
        tokens: [],
      },
    })

    await setupIntegration()

    await expect(
      callExternal({
        namespace: EXTERNAL_READ_API_NAMESPACE,
        method: "getCapabilities",
        params: {
          token: "secret-token",
        },
      }),
    ).resolves.toEqual({
      success: false,
      data: null,
      error: "External read API is disabled.",
    })
  })

  it("returns the full snapshot for a valid token", async () => {
    await setupIntegration()

    const response = await callExternal({
      namespace: EXTERNAL_READ_API_NAMESPACE,
      method: "getSnapshot",
      params: {
        token: "secret-token",
      },
    })

    expect(response).toEqual({
      success: true,
      data: {
        generatedAt: expect.any(Number),
        accounts: {
          accounts: [
            expect.objectContaining({
              account_info: { access_token: "token-1" },
              cookieAuth: { sessionCookie: "session-1" },
              sub2apiAuth: { refreshToken: "refresh-1" },
            }),
          ],
          bookmarks: [],
          pinnedAccountIds: ["acct-1"],
          orderedAccountIds: ["acct-1"],
        },
        apiCredentialProfiles: {
          profiles: [
            expect.objectContaining({
              baseUrl: "https://api.example",
              apiKey: "key-1",
            }),
          ],
        },
      },
      error: null,
    })
  })

  it("tracks storage changes and broadcasts coarse events to all tabs", async () => {
    await setupIntegration()

    storageChangedListener?.(
      {
        [ACCOUNT_STORAGE_KEYS.ACCOUNTS]: {
          oldValue: undefined,
          newValue: {
            accounts: [
              {
                id: "acct-1",
                site_url: "https://site.example",
              },
            ],
            bookmarks: [],
            pinnedAccountIds: [],
            orderedAccountIds: [],
          },
        },
      },
      "local",
    )
    await new Promise((resolve) => setTimeout(resolve, 0))

    const capabilities = await callExternal({
      namespace: EXTERNAL_READ_API_NAMESPACE,
      method: "getCapabilities",
      params: {
        token: "secret-token",
      },
    })

    expect(capabilities).toEqual({
      success: true,
      data: {
        version: 1,
        supportedMethods: ["getCapabilities", "getSnapshot"],
        notificationEventName: EXTERNAL_READ_API_EVENT_NAME,
        exposureMode: "full-readonly",
        authMode: "token",
      },
      error: null,
    })

    expect(sendTabMessageWithRetryMock).toHaveBeenCalledTimes(2)
    expect(sendTabMessageWithRetryMock).toHaveBeenNthCalledWith(1, 1, {
      action: "externalReadApi:notifyContent",
      payload: {
        topics: ["accounts"],
        changedAt: expect.any(Number),
        eventName: EXTERNAL_READ_API_EVENT_NAME,
        events: [
          {
            type: "account.created",
            topic: "accounts",
          },
        ],
      },
    })
  })

  it("broadcasts pinned/order metadata changes", async () => {
    await setupIntegration()

    storageChangedListener?.(
      {
        [ACCOUNT_STORAGE_KEYS.ACCOUNTS]: {
          oldValue: {
            accounts: [
              {
                id: "acct-1",
                site_url: "https://site.example",
              },
            ],
            bookmarks: [],
            pinnedAccountIds: [],
            orderedAccountIds: [],
          },
          newValue: {
            accounts: [
              {
                id: "acct-1",
                site_url: "https://site.example",
              },
            ],
            bookmarks: [],
            pinnedAccountIds: ["acct-1"],
            orderedAccountIds: ["acct-1"],
          },
        },
      },
      "local",
    )
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(sendTabMessageWithRetryMock).toHaveBeenCalledTimes(2)
    expect(sendTabMessageWithRetryMock).toHaveBeenNthCalledWith(1, 1, {
      action: "externalReadApi:notifyContent",
      payload: {
        topics: ["accounts"],
        changedAt: expect.any(Number),
        eventName: EXTERNAL_READ_API_EVENT_NAME,
        events: [
          {
            type: "accounts.pinned.changed",
            topic: "accounts",
            changedKeys: ["pinnedAccountIds"],
          },
          {
            type: "accounts.ordered.changed",
            topic: "accounts",
            changedKeys: ["orderedAccountIds"],
          },
        ],
      },
    })
  })

  it("broadcasts bookmark changes because they affect the exported snapshot", async () => {
    await setupIntegration()

    storageChangedListener?.(
      {
        [ACCOUNT_STORAGE_KEYS.ACCOUNTS]: {
          oldValue: {
            accounts: [],
            bookmarks: [],
            pinnedAccountIds: [],
            orderedAccountIds: [],
          },
          newValue: {
            accounts: [],
            bookmarks: [
              {
                id: "bookmark-1",
                name: "Linux DO",
                url: "https://linux.do",
                created_at: 1,
                updated_at: 1,
              },
            ],
            pinnedAccountIds: [],
            orderedAccountIds: [],
          },
        },
      },
      "local",
    )
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(sendTabMessageWithRetryMock).toHaveBeenCalledTimes(2)
    expect(sendTabMessageWithRetryMock).toHaveBeenNthCalledWith(1, 1, {
      action: "externalReadApi:notifyContent",
      payload: {
        topics: ["accounts"],
        changedAt: expect.any(Number),
        eventName: EXTERNAL_READ_API_EVENT_NAME,
        events: [
          {
            type: "bookmark.created",
            topic: "accounts",
          },
        ],
      },
    })
  })

  it("rejects invalid tokens", async () => {
    await setupIntegration()

    await expect(
      callExternal({
        namespace: EXTERNAL_READ_API_NAMESPACE,
        method: "getSnapshot",
        params: {
          token: "bad-token",
        },
      }),
    ).resolves.toEqual({
      success: false,
      data: null,
      error: "Invalid or disabled external access token.",
    })
  })
})
