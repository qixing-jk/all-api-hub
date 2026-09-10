import { act, renderHook, waitFor } from "@testing-library/react"
import { useState, type ReactNode } from "react"
import { I18nextProvider } from "react-i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { useCopyKeyDialog } from "~/features/AccountManagement/components/CopyKeyDialog/hooks/useCopyKeyDialog"
import { useModelKeyDialog } from "~/features/ModelList/components/ModelKeyDialog/hooks/useModelKeyDialog"
import { useTokenData } from "~/features/TokenProvisioning/components/AddTokenDialog/hooks/useTokenData"
import type { FormData } from "~/features/TokenProvisioning/components/AddTokenDialog/hooks/useTokenForm"
import { useDefaultTokenQuickCreate } from "~/features/TokenProvisioning/hooks/useDefaultTokenQuickCreate"
import enKeyManagement from "~/locales/en/keyManagement.json"
import enMessages from "~/locales/en/messages.json"
import enModelList from "~/locales/en/modelList.json"
import enUi from "~/locales/en/ui.json"
import zhKeyManagement from "~/locales/zh-CN/keyManagement.json"
import zhMessages from "~/locales/zh-CN/messages.json"
import zhModelList from "~/locales/zh-CN/modelList.json"
import zhUi from "~/locales/zh-CN/ui.json"
import { buildDisplayAccountTokenRuntimeKey } from "~/services/accounts/accountRuntimeKeys"
import { TOKEN_PROVISIONING_BLOCK_REASONS } from "~/services/apiAdapters/contracts/tokenProvisioning"
import {
  buildApiToken,
  buildDisplaySiteData,
} from "~~/tests/test-utils/factories"
import { createResourceTestI18n } from "~~/tests/test-utils/i18n"

const mocks = vi.hoisted(() => ({
  keys: vi.fn(),
  models: vi.fn(),
  groups: vi.fn(),
  resolution: vi.fn(),
  create: vi.fn(),
}))

vi.mock(
  "~/services/accounts/utils/apiServiceRequest",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("~/services/accounts/utils/apiServiceRequest")
    >()),
    fetchDisplayAccountRuntimeKeys: mocks.keys,
    fetchDisplayAccountAvailableModels: mocks.models,
    createDisplayAccountApiContext: () => ({
      request: {},
      keyManagement: {
        createToken: mocks.create,
        userGroups: { fetch: mocks.groups },
      },
    }),
    requireDisplayAccountKeyManagement: (
      _account: unknown,
      capability: unknown,
    ) => capability,
  }),
)

vi.mock(
  "~/services/accounts/tokenQuickCreateResolution",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("~/services/accounts/tokenQuickCreateResolution")
    >()),
    resolveDefaultTokenQuickCreateResolution: mocks.resolution,
  }),
)

const i18n = await createResourceTestI18n({
  en: {
    ui: enUi,
    modelList: enModelList,
    keyManagement: enKeyManagement,
    messages: enMessages,
  },
  "zh-CN": {
    ui: zhUi,
    modelList: zhModelList,
    keyManagement: zhKeyManagement,
    messages: zhMessages,
  },
})
const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
)
const account = buildDisplaySiteData({ siteType: SITE_TYPES.NEW_API })
const runtimeKey = buildDisplayAccountTokenRuntimeKey(account, buildApiToken())

describe("key workflow language changes", () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    mocks.keys.mockResolvedValue([runtimeKey])
    mocks.groups.mockResolvedValue({ default: { desc: "Default", ratio: 1 } })
    await i18n.changeLanguage("en")
  })

  it.each(["copy", "model"] as const)(
    "retranslates %s inventory errors without another request",
    async (dialog) => {
      mocks.keys.mockRejectedValue(new Error("Inventory unavailable"))
      const useDialog: () => { error: string | null } =
        dialog === "copy"
          ? () => useCopyKeyDialog(true, account)
          : () =>
              useModelKeyDialog({ isOpen: true, account, modelId: "gpt-4o" })
      const { result } = renderHook(useDialog, { wrapper })
      const key =
        dialog === "copy"
          ? "ui:dialog.copyKey.loadFailed"
          : "modelList:keyDialog.loadFailed"
      await waitFor(() =>
        expect(result.current.error).toBe(
          i18n.t(key, { error: "Inventory unavailable" }),
        ),
      )
      const english = result.current.error

      await act(async () => {
        await i18n.changeLanguage("zh-CN")
      })

      expect(result.current.error).toBe(
        i18n.t(key, { error: "Inventory unavailable" }),
      )
      expect(result.current.error).not.toBe(english)
      expect(mocks.keys).toHaveBeenCalledTimes(1)
    },
  )

  it("keeps copy-key expansion and post-create feedback through language changes", async () => {
    const { result } = renderHook(() => useCopyKeyDialog(true, account), {
      wrapper,
    })
    await waitFor(() => expect(result.current.runtimeKeys).toHaveLength(1))
    act(() => result.current.toggleRuntimeKeyExpansion(runtimeKey.id))
    await act(async () => {
      await i18n.changeLanguage("zh-CN")
    })
    expect(result.current.expandedRuntimeKeys.has(runtimeKey.id)).toBe(true)
    expect(mocks.keys).toHaveBeenCalledTimes(1)

    mocks.keys.mockResolvedValue([])
    await act(async () => result.current.refreshRuntimeKeysAfterCreate())
    expect(result.current.postCreateError).toBe(
      i18n.t("ui:dialog.copyKey.noKeyFoundAfterCreate"),
    )
    await act(async () => {
      await i18n.changeLanguage("en")
    })
    expect(result.current.postCreateError).toBe(
      i18n.t("ui:dialog.copyKey.noKeyFoundAfterCreate"),
    )
    expect(mocks.keys).toHaveBeenCalledTimes(2)
  })

  it("keeps model-key selection and retranslates validation without creating a key", async () => {
    const { result } = renderHook(
      () => useModelKeyDialog({ isOpen: true, account, modelId: "gpt-4o" }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.runtimeKeys).toHaveLength(1))
    act(() => result.current.setSelectedRuntimeKeyId(runtimeKey.id))
    await act(async () => result.current.createDefaultKey(""))
    await act(async () => {
      await i18n.changeLanguage("zh-CN")
    })

    expect(result.current.createError).toBe(
      i18n.t("modelList:keyDialog.createGroupRequired"),
    )
    expect(result.current.selectedRuntimeKeyId).toBe(runtimeKey.id)
    expect(mocks.keys).toHaveBeenCalledTimes(1)
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it.each([
    [
      TOKEN_PROVISIONING_BLOCK_REASONS.AvailableGroupRequired,
      "createRequiresAvailableGroup",
    ],
    [TOKEN_PROVISIONING_BLOCK_REASONS.GroupRequired, "createRequiresGroup"],
    [
      TOKEN_PROVISIONING_BLOCK_REASONS.OneTimeSecretRequired,
      "createRequiresOneTimeSecretHandling",
    ],
  ] as const)(
    "retranslates %s without repeating policy checks or creating a key",
    async (reason, messageKey) => {
      mocks.resolution.mockResolvedValue({
        kind: "blocked",
        reason,
        message: i18n.t(`messages:tokenProvisioning.${messageKey}`),
      })
      const { result } = renderHook(
        () =>
          useDefaultTokenQuickCreate({
            isActive: true,
            account,
            canCreate: true,
            onCreated: vi.fn(),
          }),
        { wrapper },
      )
      await act(async () => result.current.start())
      await act(async () => {
        await i18n.changeLanguage("zh-CN")
      })

      expect(result.current.view.error).toBe(
        i18n.t(`messages:tokenProvisioning.${messageKey}`),
      )
      expect(mocks.resolution).toHaveBeenCalledTimes(1)
      expect(mocks.create).not.toHaveBeenCalled()
    },
  )

  it("retranslates a failed quick-create attempt without repeating it", async () => {
    mocks.resolution.mockRejectedValue(new Error("Creation unavailable"))
    const onCreated = vi.fn()
    const { result } = renderHook(
      () =>
        useDefaultTokenQuickCreate({
          isActive: true,
          account,
          canCreate: true,
          onCreated,
        }),
      { wrapper },
    )
    await act(async () => result.current.start())
    const english = result.current.view.error
    await act(async () => {
      await i18n.changeLanguage("zh-CN")
    })

    expect(result.current.view.error).toBe(
      i18n.t("ui:dialog.copyKey.createFailed", {
        error: "Creation unavailable",
      }),
    )
    expect(result.current.view.error).not.toBe(english)
    expect(mocks.resolution).toHaveBeenCalledTimes(1)
    expect(onCreated).not.toHaveBeenCalled()
  })

  it("retranslates empty model discovery and preserves the draft without reloading groups", async () => {
    mocks.models.mockResolvedValue([])
    const { result } = renderHook(
      () => {
        const [draft, setDraft] = useState({
          group: "default",
          name: "My draft",
          modelLimits: ["saved-model"],
          modelLimitsEnabled: true,
        } as FormData)
        return {
          ...useTokenData(true, account, setDraft, undefined, true),
          draft,
        }
      },
      { wrapper },
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    await act(async () => {
      await result.current.loadAvailableModels()
    })
    await act(async () => {
      await i18n.changeLanguage("zh-CN")
    })

    expect(result.current.modelLoadErrorMessage).toBe(
      i18n.t("keyManagement:dialog.modelLoadFailed", {
        reason: i18n.t("keyManagement:dialog.noAvailableModels"),
      }),
    )
    expect(result.current.draft).toMatchObject({
      name: "My draft",
      modelLimits: ["saved-model"],
      modelLimitsEnabled: true,
    })
    expect(mocks.models).toHaveBeenCalledTimes(1)
    expect(mocks.groups).toHaveBeenCalledTimes(1)
  })
})
