import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import ModelKeyDialog from "~/features/ModelList/components/ModelKeyDialog"
import { useModelKeyDialog } from "~/features/ModelList/components/ModelKeyDialog/hooks/useModelKeyDialog"
import { TOKEN_PROVISIONING_TEST_IDS } from "~/features/TokenProvisioning/testIds"
import type { AccountKeyCreationResult } from "~/services/accounts/accountKeyCreation"
import {
  createAccountKeyResourceCreatedRuntimeSecret,
  createUnattributedAccountCreatedRuntimeSecret,
} from "~/services/accounts/createdRuntimeSecret"
import { AccountKeyResourceError } from "~/services/apiAdapters/contracts/accountKeyResource"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { AuthTypeEnum } from "~/types"
import {
  buildNewApiKeyCreationResult,
  buildNewApiRuntimeKey,
} from "~~/tests/test-utils/accountKeyFixtures"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"
import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from "~~/tests/test-utils/render"

const {
  fetchAccountTokensMock,
  createKeyMock,
  prepareCreationMock,
  toastSuccessMock,
  toastErrorMock,
  resolveDisplayAccountRuntimeKeySecretMock,
  openKeysPageMock,
  startProductAnalyticsActionMock,
  completeProductAnalyticsActionMock,
  trackProductAnalyticsActionStartedMock,
  createApiCredentialProfileMock,
  captureApiCredentialProfileMock,
} = vi.hoisted(() => ({
  fetchAccountTokensMock: vi.fn(),
  createKeyMock: vi.fn(),
  prepareCreationMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  resolveDisplayAccountRuntimeKeySecretMock: vi.fn(),
  openKeysPageMock: vi.fn(),
  startProductAnalyticsActionMock: vi.fn(),
  completeProductAnalyticsActionMock: vi.fn(),
  trackProductAnalyticsActionStartedMock: vi.fn(),
  createApiCredentialProfileMock: vi.fn(),
  captureApiCredentialProfileMock: vi.fn(),
}))

vi.mock("~/lib/notify", () => ({
  default: {
    success: toastSuccessMock,
    error: toastErrorMock,
  },
}))

vi.mock(
  "~/services/accounts/utils/apiServiceRequest",
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import("~/services/accounts/utils/apiServiceRequest")
      >()
    return {
      ...original,
      fetchDisplayAccountRuntimeKeys: async (account: any) => {
        const inventory = await fetchAccountTokensMock(account)
        if (account.siteType === SITE_TYPES.SHAREDCHAT) {
          const { buildServiceCredentialRuntimeKey } = await import(
            "~/services/accounts/accountRuntimeKeys"
          )
          return [buildServiceCredentialRuntimeKey(account, inventory)]
        }
        if (!Array.isArray(inventory))
          throw new AccountKeyResourceError({ code: "unexpected" })
        return inventory.map((token) => buildNewApiRuntimeKey(account, token))
      },
      resolveDisplayAccountRuntimeKeySecret: (...args: any[]) =>
        resolveDisplayAccountRuntimeKeySecretMock(...args),
    }
  },
)

vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteTypeCapabilities: (siteType: string) => ({
    account:
      siteType === SITE_TYPES.SHAREDCHAT
        ? {
            serviceCredential: {
              fetch: fetchAccountTokensMock,
              rotate: vi.fn(),
            },
          }
        : {
            keyResourceManagement: {
              defaultCreation: "editor-defaults",
              inventorySecretAvailability:
                siteType === SITE_TYPES.AIHUBMIX
                  ? "create-response-only"
                  : "recoverable",
            },
          },
  }),
}))
vi.mock("~/services/accounts/accountKeyCreation", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("~/services/accounts/accountKeyCreation")
  >()),
  prepareDefaultAccountKeyCreation: prepareCreationMock,
}))
vi.mock("~/features/TokenProvisioning/components/AddTokenDialog", () => ({
  default: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div>Native key editor</div> : null,
}))

vi.mock("~/utils/navigation", () => ({
  openKeysPage: (...args: any[]) => openKeysPageMock(...args),
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: (...args: any[]) =>
    startProductAnalyticsActionMock(...args),
  trackProductAnalyticsActionStarted: (...args: any[]) =>
    trackProductAnalyticsActionStartedMock(...args),
}))

vi.mock("~/services/apiCredentialProfiles/apiCredentialProfileLinks", () => ({
  apiCredentialProfileLinks: {
    capture: async (input: { profile: unknown }) => {
      captureApiCredentialProfileMock(input)
      return {
        status: "captured",
        profile: await createApiCredentialProfileMock(input.profile),
      }
    },
  },
}))

const ACCOUNT = {
  id: "acc-1",
  name: "Example",
  username: "tester",
  siteType: "new-api",
  baseUrl: "https://example.com",
  token: "token",
  userId: "1",
  authType: AuthTypeEnum.AccessToken,
  checkIn: buildCheckInConfig(),
  tagIds: ["tag-a"],
} as any

const AIHUBMIX_ACCOUNT = {
  ...ACCOUNT,
  id: "aihubmix-1",
  name: "AIHubMix",
  siteType: SITE_TYPES.AIHUBMIX,
  baseUrl: "https://aihubmix.com",
}

const TOKEN = {
  id: 1,
  user_id: 1,
  key: "sk-test",
  status: 1,
  name: "default",
  created_time: 0,
  accessed_time: 0,
  expired_time: -1,
  remain_quota: 0,
  unlimited_quota: true,
  used_quota: 0,
  allow_ips: "",
  model_limits_enabled: false,
  model_limits: "",
  group: "",
} as any

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })

  return { promise, resolve, reject }
}

describe("ModelKeyDialog", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    fetchAccountTokensMock.mockReset()
    createKeyMock.mockReset()
    prepareCreationMock.mockReset()
    prepareCreationMock.mockResolvedValue({
      kind: "ready",
      create: createKeyMock,
    })
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()
    resolveDisplayAccountRuntimeKeySecretMock.mockReset()
    openKeysPageMock.mockReset()
    startProductAnalyticsActionMock.mockReset()
    completeProductAnalyticsActionMock.mockReset()
    trackProductAnalyticsActionStartedMock.mockReset()
    createApiCredentialProfileMock.mockReset()
    captureApiCredentialProfileMock.mockReset()
    startProductAnalyticsActionMock.mockReturnValue({
      complete: completeProductAnalyticsActionMock,
    })
    resolveDisplayAccountRuntimeKeySecretMock.mockImplementation(
      async (_account, runtimeKey) => runtimeKey,
    )
  })

  it("opens the current account in key management", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([TOKEN])

    const user = userEvent.setup()

    render(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={ACCOUNT}
        modelId="gpt-4"
        modelEnableGroups={["default"]}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "modelList:keyDialog.openKeyManagement",
      }),
    )

    expect(openKeysPageMock).toHaveBeenCalledWith("acc-1")
    expect(trackProductAnalyticsActionStartedMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.OpenAccountKeyManagementFromModel,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsModelListKeyDialog,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
  })

  it("copies selected key when exactly one compatible runtime key exists", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([TOKEN])

    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    render(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={ACCOUNT}
        modelId="gpt-4"
        modelEnableGroups={["default"]}
      />,
    )

    await user.click(
      await screen.findByRole("button", { name: "common:actions.copyKey" }),
    )

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("sk-test")
    })
    expect(trackProductAnalyticsActionStartedMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ModelList,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.CopySelectedModelKey,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsModelListKeyDialog,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
  })

  it("shows the resolver error message when copying the selected key fails", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([TOKEN])
    resolveDisplayAccountRuntimeKeySecretMock.mockRejectedValueOnce(
      new Error("resolver failed"),
    )

    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    render(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={ACCOUNT}
        modelId="gpt-4"
        modelEnableGroups={["default"]}
      />,
    )

    await user.click(
      await screen.findByRole("button", { name: "common:actions.copyKey" }),
    )

    await waitFor(() => {
      expect(writeText).not.toHaveBeenCalled()
      expect(toastErrorMock).toHaveBeenCalledWith("resolver failed")
    })
  })

  it("shows token groups when choosing an existing compatible key", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([
      { ...TOKEN, id: 1, name: "shared key", group: "default" },
      { ...TOKEN, id: 2, name: "shared key", group: "vip" },
    ])

    const user = userEvent.setup()

    render(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={ACCOUNT}
        modelId="gpt-4"
        modelEnableGroups={["default", "vip"]}
      />,
    )

    await user.click(
      await screen.findByRole("combobox", {
        name: "modelList:keyDialog.selectLabel",
      }),
    )

    expect(screen.getByText("shared key · default")).toBeInTheDocument()
    expect(screen.getByText("shared key · vip")).toBeInTheDocument()
  })

  it("copies the runtime key selected from multiple compatible options", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([
      { ...TOKEN, id: 1, key: "sk-default", name: "shared key", group: null },
      { ...TOKEN, id: 2, key: "sk-vip", name: "shared key", group: "vip" },
    ])

    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    render(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={ACCOUNT}
        modelId="gpt-4"
        modelEnableGroups={["default", "vip"]}
      />,
    )

    await user.click(
      await screen.findByRole("combobox", {
        name: "modelList:keyDialog.selectLabel",
      }),
    )
    expect(screen.getByText("shared key · default")).toBeInTheDocument()

    await user.click(
      await screen.findByRole("option", { name: "shared key · vip" }),
    )
    await user.click(
      screen.getByRole("button", { name: "common:actions.copyKey" }),
    )

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("sk-vip")
    })
  })

  it("shows empty state and explicit create actions when no compatible runtime keys exist", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])

    render(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={ACCOUNT}
        modelId="gpt-4"
        modelEnableGroups={["default"]}
      />,
    )

    expect(
      await screen.findByText("modelList:keyDialog.noCompatibleTitle"),
    ).toBeInTheDocument()

    expect(
      screen.getByRole("button", { name: "modelList:keyDialog.createKey" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "modelList:keyDialog.createCustomKey",
      }),
    ).toBeInTheDocument()
  })

  it("shows a read-only auto-selected group when only one create group is available", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])

    render(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={ACCOUNT}
        modelId="gpt-4"
        modelEnableGroups={["vip"]}
      />,
    )

    expect(
      await screen.findByText("modelList:keyDialog.noCompatibleTitle"),
    ).toBeInTheDocument()

    expect(screen.getByText("vip")).toBeInTheDocument()
    expect(
      screen.getByText("modelList:keyDialog.createGroupAutoSelectedHint"),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("combobox", {
        name: "modelList:keyDialog.createGroupLabel",
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "modelList:keyDialog.createKey" }),
    ).toBeInTheDocument()
  })

  const createdKey = (
    overrides: Partial<typeof TOKEN> = {},
    oneTimeSecret?: string,
  ): AccountKeyCreationResult => {
    const token = { ...TOKEN, id: 8, name: "model-key", ...overrides }
    const creation = buildNewApiKeyCreationResult(AIHUBMIX_ACCOUNT, token)
    return {
      ...creation,
      ...(oneTimeSecret
        ? {
            createdSecret: createAccountKeyResourceCreatedRuntimeSecret({
              ref: creation.ref!,
              displayName: token.name,
              secret: oneTimeSecret,
              credential: {
                accountName: AIHUBMIX_ACCOUNT.name,
                baseUrl: AIHUBMIX_ACCOUNT.baseUrl,
                siteType: SITE_TYPES.AIHUBMIX,
                apiType: API_TYPES.OPENAI_COMPATIBLE,
                tagIds: AIHUBMIX_ACCOUNT.tagIds,
              },
            }),
          }
        : {}),
    }
  }
  const beginCreate = async (account = AIHUBMIX_ACCOUNT) => {
    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)
    const view = render(
      <ModelKeyDialog
        isOpen
        onClose={() => {}}
        account={account}
        modelId="gpt-4"
        modelEnableGroups={["default"]}
      />,
    )
    await user.click(
      await screen.findByRole("button", {
        name: "modelList:keyDialog.createKey",
      }),
    )
    return { user, writeText, ...view }
  }

  it.each(["sk-created-full-secret", "created-full-secret"])(
    "preserves a provider-native one-time secret unchanged: %s",
    async (secret) => {
      fetchAccountTokensMock.mockResolvedValue([])
      createKeyMock.mockResolvedValue(createdKey({}, secret))
      const { writeText } = await beginCreate()
      expect(
        await screen.findByLabelText("keyManagement:oneTimeKey.keyLabel"),
      ).toHaveValue(secret)
      await waitFor(() => expect(writeText).toHaveBeenCalledWith(secret))
      expect(createKeyMock).toHaveBeenCalledTimes(1)
      expect(fetchAccountTokensMock).toHaveBeenCalledTimes(1)
      expect(prepareCreationMock).toHaveBeenCalledWith(
        AIHUBMIX_ACCOUNT,
        expect.objectContaining({
          signal: expect.any(AbortSignal),
          intent: expect.objectContaining({
            preferredGroup: "default",
            allowedGroups: ["default"],
          }),
        }),
      )
      expect(startProductAnalyticsActionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          actionId: PRODUCT_ANALYTICS_ACTION_IDS.CreateCompatibleModelKey,
        }),
      )
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Success,
      )
    },
  )

  it("saves the one-time secret with its native resource association", async () => {
    fetchAccountTokensMock.mockResolvedValue([])
    const creation = createdKey({}, "sk-created-full-secret")
    createKeyMock.mockResolvedValue(creation)
    createApiCredentialProfileMock.mockResolvedValue({ id: "profile-1" })
    const { user } = await beginCreate()
    await user.click(
      await screen.findByTestId(
        TOKEN_PROVISIONING_TEST_IDS.oneTimeKeySaveButton,
      ),
    )
    await waitFor(() =>
      expect(createApiCredentialProfileMock).toHaveBeenCalledWith({
        name: "AIHubMix - model-key",
        apiType: API_TYPES.OPENAI_COMPATIBLE,
        baseUrl: AIHUBMIX_ACCOUNT.baseUrl,
        apiKey: "sk-created-full-secret",
        tagIds: AIHUBMIX_ACCOUNT.tagIds,
      }),
    )
    expect(captureApiCredentialProfileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        locator: { source: "account_key_resource", ref: creation.ref },
        linkedBy: "creation-response",
      }),
    )
    expect(
      screen.getByLabelText("keyManagement:oneTimeKey.keyLabel"),
    ).toHaveValue("sk-created-full-secret")
  })

  it("retains the one-time secret when observed model policy denies the requested model", async () => {
    fetchAccountTokensMock.mockResolvedValue([])
    createKeyMock.mockResolvedValue(
      createdKey({ group: "vip" }, "sk-created-full-secret"),
    )
    await beginCreate()
    expect(
      await screen.findByLabelText("keyManagement:oneTimeKey.keyLabel"),
    ).toHaveValue("sk-created-full-secret")
    expect(
      await screen.findByText(
        "modelList:keyDialog.noCompatibleFoundAfterCreate",
      ),
    ).toBeInTheDocument()
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown },
    )
  })

  it("waits for the returned reference rather than accepting an unrelated compatible key", async () => {
    const token = { ...TOKEN, id: 8, name: "Returned key" }
    const creation = buildNewApiKeyCreationResult(ACCOUNT, token)
    fetchAccountTokensMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...TOKEN, id: 9, name: "Other key" }])
      .mockResolvedValueOnce([token])
    createKeyMock.mockResolvedValue({ ref: creation.ref, facts: null })
    await beginCreate(ACCOUNT)
    await waitFor(() => expect(fetchAccountTokensMock).toHaveBeenCalledTimes(3))
    expect(
      await screen.findByRole("button", { name: "common:actions.copyKey" }),
    ).toBeVisible()
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
    )
  })

  it("reports an unreconciled creation without issuing another write", async () => {
    fetchAccountTokensMock
      .mockResolvedValueOnce([])
      .mockResolvedValue([{ ...TOKEN, id: 9 }])
    createKeyMock.mockResolvedValue({
      ref: buildNewApiKeyCreationResult(ACCOUNT, { ...TOKEN, id: 8 }).ref,
      facts: null,
    })
    await beginCreate(ACCOUNT)
    expect(
      await screen.findByText(
        "modelList:keyDialog.noCompatibleFoundAfterCreate",
        {},
        { timeout: 7000 },
      ),
    ).toBeVisible()
    expect(fetchAccountTokensMock).toHaveBeenCalledTimes(6)
    expect(createKeyMock).toHaveBeenCalledTimes(1)
  })

  it("retains an unattributed one-time secret when inventory recovery fails", async () => {
    fetchAccountTokensMock
      .mockResolvedValueOnce([])
      .mockRejectedValue(new Error("offline"))
    const original = createdKey({}, "sk-created-full-secret").createdSecret!
    createKeyMock.mockResolvedValue({
      ref: null,
      facts: null,
      createdSecret: createUnattributedAccountCreatedRuntimeSecret({
        accountId: AIHUBMIX_ACCOUNT.id,
        displayName: original.displayName,
        secret: original.secret,
        credential: original.credential,
      }),
    })
    await beginCreate()
    expect(
      await screen.findByLabelText("keyManagement:oneTimeKey.keyLabel"),
    ).toHaveValue(original.secret)
    expect(
      await screen.findByText("modelList:keyDialog.createFailed"),
    ).toBeInTheDocument()
    expect(createKeyMock).toHaveBeenCalledTimes(1)
  })

  it("allows a definite failure to retry but never repeats an uncertain native write", async () => {
    fetchAccountTokensMock.mockResolvedValue([])
    createKeyMock
      .mockRejectedValueOnce(new Error("not submitted"))
      .mockRejectedValue(
        new AccountKeyResourceError({ code: "mutation_state_uncertain" }),
      )
    const { result } = renderHook(() =>
      useModelKeyDialog({
        isOpen: true,
        account: ACCOUNT,
        modelId: "gpt-4",
        modelEnableGroups: ["default"],
      }),
    )
    await waitFor(() => expect(result.current).not.toBeNull())
    await act(async () => {
      expect(await result.current.createDefaultKey("default")).toBe("failure")
    })
    await act(async () => {
      expect(await result.current.createDefaultKey("default")).toBe("failure")
    })
    await act(async () => {
      expect(await result.current.createDefaultKey("default")).toBe("skipped")
    })
    expect(createKeyMock).toHaveBeenCalledTimes(2)
  })

  it("drops a late create result after the authentication source changes", async () => {
    fetchAccountTokensMock.mockResolvedValue([])
    const pending = createDeferred<AccountKeyCreationResult>()
    createKeyMock.mockReturnValue(pending.promise)
    const { rerender } = await beginCreate()
    rerender(
      <ModelKeyDialog
        isOpen
        onClose={() => {}}
        account={{ ...AIHUBMIX_ACCOUNT, token: "new-login" }}
        modelId="gpt-4"
        modelEnableGroups={["default"]}
      />,
    )
    await act(async () => {
      pending.resolve(createdKey({}, "sk-obsolete"))
      await pending.promise
    })
    expect(
      screen.queryByText("keyManagement:oneTimeKey.title"),
    ).not.toBeInTheDocument()
    expect(toastSuccessMock).not.toHaveBeenCalled()
  })

  it.each(["resolve", "reject"] as const)(
    "ignores a stale copy %s after closing the dialog",
    async (outcome) => {
      fetchAccountTokensMock.mockResolvedValue([TOKEN])
      const pending = createDeferred<any>()
      resolveDisplayAccountRuntimeKeySecretMock.mockReturnValue(pending.promise)
      const user = userEvent.setup()
      const writeText = vi
        .spyOn(navigator.clipboard, "writeText")
        .mockResolvedValue(undefined)
      const { rerender } = render(
        <ModelKeyDialog
          isOpen
          onClose={() => {}}
          account={ACCOUNT}
          modelId="gpt-4"
        />,
      )
      await user.click(
        await screen.findByRole("button", { name: "common:actions.copyKey" }),
      )
      rerender(
        <ModelKeyDialog
          isOpen={false}
          onClose={() => {}}
          account={ACCOUNT}
          modelId="gpt-4"
        />,
      )
      await act(async () => {
        if (outcome === "resolve") pending.resolve({ secret: "sk-obsolete" })
        else pending.reject(new Error("obsolete"))
        await pending.promise.catch(() => {})
      })
      expect(writeText).not.toHaveBeenCalled()
      expect(toastSuccessMock).not.toHaveBeenCalled()
      expect(toastErrorMock).not.toHaveBeenCalled()
    },
  )

  it("treats group mismatch as incompatible and shows empty state", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([{ ...TOKEN, group: "vip" }])

    render(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={ACCOUNT}
        modelId="gpt-4"
        modelEnableGroups={["default"]}
      />,
    )

    expect(
      await screen.findByText("modelList:keyDialog.noCompatibleTitle"),
    ).toBeInTheDocument()
  })

  it("disables create actions and explains when the account is ineligible", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])

    render(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={{ ...ACCOUNT, disabled: true }}
        modelId="gpt-4"
        modelEnableGroups={["default"]}
      />,
    )

    expect(
      await screen.findByText("modelList:keyDialog.ineligible.accountDisabled"),
    ).toBeInTheDocument()

    expect(
      screen.getByRole("button", { name: "modelList:keyDialog.createKey" }),
    ).toBeDisabled()
    expect(
      screen.getByRole("button", {
        name: "modelList:keyDialog.createCustomKey",
      }),
    ).toBeDisabled()
  })

  it("explains missing auth when an account has no auth mode", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])

    render(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={{ ...ACCOUNT, authType: AuthTypeEnum.None, token: "" }}
        modelId="gpt-4"
        modelEnableGroups={["default"]}
      />,
    )

    expect(
      await screen.findByText("modelList:keyDialog.ineligible.missingAuth"),
    ).toBeInTheDocument()
    expect(fetchAccountTokensMock).not.toHaveBeenCalled()
  })

  it("explains missing credentials when token management credentials are incomplete", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])

    render(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={{ ...ACCOUNT, token: "", cookieAuthSessionCookie: "" }}
        modelId="gpt-4"
        modelEnableGroups={["default"]}
      />,
    )

    expect(
      await screen.findByText(
        "modelList:keyDialog.ineligible.missingCredentials",
      ),
    ).toBeInTheDocument()
    expect(fetchAccountTokensMock).not.toHaveBeenCalled()
  })

  it("explains service-credential accounts as read-only instead of missing credentials", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce({
      key: "sk-sharedchat",
      updatedAt: "2026-07-02T00:00:00.000Z",
    })

    render(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={{ ...ACCOUNT, siteType: SITE_TYPES.SHAREDCHAT }}
        modelId="gpt-4"
        modelEnableGroups={["default"]}
      />,
    )

    expect(
      await screen.findByText(
        "modelList:keyDialog.ineligible.readOnlyRuntimeKeys",
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByText("modelList:keyDialog.ineligible.missingCredentials"),
    ).not.toBeInTheDocument()
  })

  it("clears loaded runtime-key state when the selected account becomes ineligible", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([TOKEN])

    const { rerender } = render(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={ACCOUNT}
        modelId="gpt-4"
        modelEnableGroups={["default"]}
      />,
    )

    expect(
      await screen.findByRole("button", { name: "common:actions.copyKey" }),
    ).toBeInTheDocument()

    rerender(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={{ ...ACCOUNT, authType: AuthTypeEnum.None, token: "" }}
        modelId="gpt-4"
        modelEnableGroups={["default"]}
      />,
    )

    expect(
      await screen.findByText("modelList:keyDialog.ineligible.missingAuth"),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "common:actions.copyKey" }),
    ).not.toBeInTheDocument()
    expect(fetchAccountTokensMock).toHaveBeenCalledTimes(1)
  })

  it("clears runtime-key hook state when the dialog closes", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([TOKEN])

    const { result, rerender } = renderHook(
      ({ isOpen }: { isOpen: boolean }) =>
        useModelKeyDialog({
          isOpen,
          account: ACCOUNT,
          modelId: "gpt-4",
          modelEnableGroups: ["default"],
        }),
      {
        initialProps: { isOpen: true },
      },
    )

    await waitFor(() => expect(result.current.runtimeKeys).toHaveLength(1))

    rerender({ isOpen: false })

    await waitFor(() => {
      expect(result.current.runtimeKeys).toEqual([])
      expect(result.current.selectedRuntimeKeyId).toBeNull()
      expect(result.current.isLoading).toBe(false)
    })
  })

  it("ignores stale runtime-key fetch completions after the selected account becomes ineligible", async () => {
    const pendingTokens = createDeferred<(typeof TOKEN)[]>()
    fetchAccountTokensMock.mockReturnValueOnce(pendingTokens.promise)

    const { rerender } = render(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={ACCOUNT}
        modelId="gpt-4"
        modelEnableGroups={["default"]}
      />,
    )

    await screen.findByText("modelList:keyDialog.loading")

    rerender(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={{ ...ACCOUNT, authType: AuthTypeEnum.None, token: "" }}
        modelId="gpt-4"
        modelEnableGroups={["default"]}
      />,
    )

    expect(
      await screen.findByText("modelList:keyDialog.ineligible.missingAuth"),
    ).toBeInTheDocument()

    await act(async () => {
      pendingTokens.resolve([TOKEN])
      await pendingTokens.promise
    })

    expect(
      screen.queryByRole("button", { name: "common:actions.copyKey" }),
    ).not.toBeInTheDocument()
    expect(fetchAccountTokensMock).toHaveBeenCalledTimes(1)
  })

  it("uses the unknown fallback when runtime-key inventory payload is invalid", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce(null)

    render(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={ACCOUNT}
        modelId="gpt-4"
        modelEnableGroups={["default"]}
      />,
    )

    expect(
      await screen.findByText("modelList:keyDialog.loadFailed"),
    ).toBeInTheDocument()
  })

  it("shows a create error when native preparation rejects the request", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])
    prepareCreationMock.mockRejectedValueOnce(
      new AccountKeyResourceError({ code: "validation_failed" }),
    )

    const user = userEvent.setup()

    render(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={ACCOUNT}
        modelId="gpt-4"
        modelEnableGroups={["default"]}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "modelList:keyDialog.createKey",
      }),
    )

    expect(
      await screen.findByText("modelList:keyDialog.createFailed"),
    ).toBeInTheDocument()
    expect(createKeyMock).not.toHaveBeenCalled()
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown },
    )
  })

  it("supports retry when runtime-key loading fails", async () => {
    fetchAccountTokensMock
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce([TOKEN])

    const user = userEvent.setup()

    render(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={ACCOUNT}
        modelId="gpt-4"
        modelEnableGroups={["default"]}
      />,
    )

    expect(
      await screen.findByText("modelList:keyDialog.loadFailed"),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", { name: "common:actions.retry" }),
    )

    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ModelList,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshModelKeyCandidates,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsModelListKeyDialog,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(trackProductAnalyticsActionStartedMock).not.toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ModelList,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshModelKeyCandidates,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsModelListKeyDialog,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    await waitFor(() => {
      expect(fetchAccountTokensMock).toHaveBeenCalledTimes(2)
    })
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
    )

    expect(
      await screen.findByRole("button", { name: "common:actions.copyKey" }),
    ).toBeInTheDocument()
  })

  it("tracks retry completion when runtime-key loading fails again", async () => {
    fetchAccountTokensMock
      .mockRejectedValueOnce(new Error("first boom"))
      .mockRejectedValueOnce(new Error("retry boom"))

    const user = userEvent.setup()

    render(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={ACCOUNT}
        modelId="gpt-4"
        modelEnableGroups={["default"]}
      />,
    )

    expect(
      await screen.findByText("modelList:keyDialog.loadFailed"),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", { name: "common:actions.retry" }),
    )

    await waitFor(() => {
      expect(fetchAccountTokensMock).toHaveBeenCalledTimes(2)
    })
    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ModelList,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshModelKeyCandidates,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsModelListKeyDialog,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown },
    )
  })

  it("tracks opening the custom key creation flow from both key states", async () => {
    fetchAccountTokensMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([TOKEN])

    const user = userEvent.setup()

    const { unmount } = render(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={ACCOUNT}
        modelId="gpt-4"
        modelEnableGroups={["default"]}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "modelList:keyDialog.createCustomKey",
      }),
    )

    expect(trackProductAnalyticsActionStartedMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ModelList,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.CreateCustomModelKey,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsModelListKeyDialog,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })

    unmount()
    trackProductAnalyticsActionStartedMock.mockReset()

    render(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={ACCOUNT}
        modelId="gpt-4"
        modelEnableGroups={["default"]}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "modelList:keyDialog.createAnotherKey",
      }),
    )

    expect(trackProductAnalyticsActionStartedMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ModelList,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.CreateCustomModelKey,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsModelListKeyDialog,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
  })
})
