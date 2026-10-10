import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { CursorPlusExportDialog } from "~/features/CredentialExport/CursorPlusExportDialog"
import { CURSOR_PLUS_EXPORT_TEST_IDS } from "~/features/CredentialExport/CursorPlusExportDialog.testIds"
import { createAccountRuntimeKeyExportSource } from "~/services/accounts/utils/credentialExport"
import { createProfileCredentialExportSource } from "~/services/apiCredentialProfiles/credentialExport"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { AuthTypeEnum } from "~/types"
import { buildNewApiRuntimeKey } from "~~/tests/test-utils/accountKeyFixtures"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"
import { createDeferred } from "~~/tests/test-utils/deferred"
import { buildApiCredentialProfile } from "~~/tests/test-utils/factories"
import { atIndex } from "~~/tests/test-utils/indexedAccess"
import { act, render, screen, waitFor } from "~~/tests/test-utils/render"

const {
  fetchModelIdsMock,
  resolveRuntimeKeyMock,
  startActionMock,
  completeActionMock,
  toastSuccessMock,
  toastErrorMock,
} = vi.hoisted(() => ({
  fetchModelIdsMock: vi.fn(),
  resolveRuntimeKeyMock: vi.fn(),
  startActionMock: vi.fn(),
  completeActionMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}))

vi.mock("~/services/aiApi/openaiCompatible", () => ({
  fetchOpenAICompatibleModelIds: (...args: unknown[]) =>
    fetchModelIdsMock(...args),
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
      resolveDisplayAccountRuntimeKeySecret: (...args: unknown[]) =>
        resolveRuntimeKeyMock(...args),
    }
  },
)

vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: startActionMock,
}))

vi.mock("~/lib/notify", () => ({
  default: {
    success: toastSuccessMock,
    error: toastErrorMock,
  },
}))

const ACCOUNT = {
  id: "example-account",
  name: "Example Account",
  username: "tester",
  siteType: "new-api",
  baseUrl: "https://api.example.invalid",
  token: "account-access-token",
  userId: "1",
  authType: AuthTypeEnum.AccessToken,
  checkIn: buildCheckInConfig(),
  tagIds: [],
} as any

const TOKEN = {
  id: 7,
  name: "Example key",
  key: "masked-key",
  status: 1,
} as any

describe("CursorPlusExportDialog", () => {
  beforeEach(() => {
    fetchModelIdsMock.mockReset()
    resolveRuntimeKeyMock.mockReset()
    startActionMock.mockReset()
    completeActionMock.mockReset()
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()
    startActionMock.mockReturnValue({ complete: completeActionMock })
  })

  it("announces model loading without focusing the selector and clears the status when ready", async () => {
    const discovery = createDeferred<string[]>()
    fetchModelIdsMock.mockReturnValueOnce(discovery.promise)
    render(
      <CursorPlusExportDialog
        isOpen
        onClose={vi.fn()}
        source={createProfileCredentialExportSource(
          buildApiCredentialProfile(),
        )}
      />,
    )

    const loading = await screen.findByText(
      "ui:dialog.cursorPlus.status.loading",
    )
    expect(loading).toHaveAttribute("role", "status")
    expect(loading).toHaveAttribute("aria-live", "polite")
    expect(loading).toHaveClass("sr-only")
    const selector = screen.getByRole("combobox", {
      name: "ui:dialog.cursorPlus.labels.models",
    })
    expect(selector).toHaveAttribute("aria-busy", "true")
    expect(selector).not.toHaveFocus()

    await act(async () => discovery.resolve(["model-a"]))
    await screen.findByText("ui:dialog.cursorPlus.status.loaded")
    expect(loading).toBeEmptyDOMElement()
    expect(selector).not.toHaveAttribute("aria-busy", "true")
    expect(screen.getByText("model-a")).toBeVisible()
  })

  it("discovers models and copies a Cursor++ provider fragment", async () => {
    const runtimeKey = buildNewApiRuntimeKey(ACCOUNT, TOKEN)
    resolveRuntimeKeyMock.mockImplementation(async (_account, key) => ({
      ...key,
      secret: "resolved-key",
    }))
    fetchModelIdsMock.mockResolvedValue(["model-b", "model-a"])
    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    render(
      <CursorPlusExportDialog
        isOpen={true}
        onClose={() => {}}
        source={createAccountRuntimeKeyExportSource(ACCOUNT, runtimeKey)}
      />,
    )

    expect(
      await screen.findByText("ui:dialog.cursorPlus.status.loaded"),
    ).toBeVisible()
    await user.click(screen.getByTestId(CURSOR_PLUS_EXPORT_TEST_IDS.copyButton))

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    const payload = JSON.parse(atIndex(writeText.mock.calls, 0)[0])
    expect(payload).toMatchObject({
      name: "Example Account - Example key",
      type: "openai-chat",
      baseUrl: "https://api.example.invalid/v1",
      auth: { kind: "apiKey", value: "resolved-key" },
      models: [
        { id: "model-a", apiModel: "model-a", defaultOn: true },
        { id: "model-b", apiModel: "model-b", defaultOn: true },
      ],
    })
    expect(startActionMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ImportExport,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.CopyCursorPlusProviderConfig,
      surfaceId:
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountRuntimeKeyCursorPlusExportDialog,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(completeActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
      { insights: { itemCount: 1, modelCount: 2 } },
    )
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "ui:dialog.cursorPlus.messages.copySuccess",
    )
  })

  it("exports a profile directly with its existing Cursor++ provider id", async () => {
    const profile = buildApiCredentialProfile({
      name: "Profile Provider",
      baseUrl: "https://profile.example.invalid",
      apiKey: "profile-test-key",
    })
    resolveRuntimeKeyMock.mockRejectedValue(
      new Error("account context unavailable"),
    )
    fetchModelIdsMock.mockResolvedValue(["profile-model"])
    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    render(
      <CursorPlusExportDialog
        isOpen={true}
        onClose={() => {}}
        source={createProfileCredentialExportSource(profile)}
      />,
    )

    await screen.findByText("profile-model")
    await user.click(screen.getByTestId(CURSOR_PLUS_EXPORT_TEST_IDS.copyButton))

    await waitFor(() => expect(writeText).toHaveBeenCalledOnce())
    expect(JSON.parse(atIndex(writeText.mock.calls, 0)[0])).toMatchObject({
      id: "profile-provider-profile-provider-1aaa1c25",
      name: "Profile Provider - Profile Provider",
      baseUrl: "https://profile.example.invalid/v1",
      auth: { kind: "apiKey", value: "profile-test-key" },
    })
    expect(resolveRuntimeKeyMock).not.toHaveBeenCalled()
  })

  it("allows multiple manual models after discovery fails", async () => {
    const runtimeKey = buildNewApiRuntimeKey(ACCOUNT, TOKEN)
    resolveRuntimeKeyMock.mockImplementation(async (_account, key) => ({
      ...key,
      secret: "resolved-key",
    }))
    fetchModelIdsMock.mockRejectedValue(new Error("network unavailable"))
    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    render(
      <CursorPlusExportDialog
        isOpen={true}
        onClose={() => {}}
        source={createAccountRuntimeKeyExportSource(ACCOUNT, runtimeKey)}
      />,
    )

    expect(
      await screen.findByText("ui:dialog.cursorPlus.status.error"),
    ).toBeVisible()
    await user.click(
      screen.getByTestId(CURSOR_PLUS_EXPORT_TEST_IDS.modelSelectorInput),
    )
    await user.paste("manual/one, manual/two")
    await user.click(screen.getByTestId(CURSOR_PLUS_EXPORT_TEST_IDS.copyButton))

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    expect(JSON.parse(atIndex(writeText.mock.calls, 0)[0]).models).toEqual([
      { id: "manual/one", apiModel: "manual/one", defaultOn: true },
      { id: "manual/two", apiModel: "manual/two", defaultOn: true },
    ])
  })

  it("retries an empty discovery result", async () => {
    const runtimeKey = buildNewApiRuntimeKey(ACCOUNT, TOKEN)
    resolveRuntimeKeyMock.mockImplementation(async (_account, key) => ({
      ...key,
      secret: "resolved-key",
    }))
    fetchModelIdsMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(["model-a"])
    const user = userEvent.setup()

    render(
      <CursorPlusExportDialog
        isOpen={true}
        onClose={() => {}}
        source={createAccountRuntimeKeyExportSource(ACCOUNT, runtimeKey)}
      />,
    )

    expect(
      await screen.findByText("ui:dialog.cursorPlus.status.empty"),
    ).toBeVisible()
    await user.click(
      screen.getByTestId(CURSOR_PLUS_EXPORT_TEST_IDS.retryButton),
    )

    expect(await screen.findByText("model-a")).toBeVisible()
    expect(fetchModelIdsMock).toHaveBeenCalledTimes(2)
  })

  it("closes from the cancel action", async () => {
    const runtimeKey = buildNewApiRuntimeKey(ACCOUNT, TOKEN)
    const onClose = vi.fn()
    resolveRuntimeKeyMock.mockImplementation(async (_account, key) => ({
      ...key,
      secret: "resolved-key",
    }))
    fetchModelIdsMock.mockResolvedValue(["model-a"])
    const user = userEvent.setup()

    render(
      <CursorPlusExportDialog
        isOpen={true}
        onClose={onClose}
        source={createAccountRuntimeKeyExportSource(ACCOUNT, runtimeKey)}
      />,
    )

    await screen.findByText("model-a")
    await user.click(
      screen.getByRole("button", { name: "common:actions.cancel" }),
    )

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("copies only the models the user keeps selected", async () => {
    const runtimeKey = buildNewApiRuntimeKey(ACCOUNT, TOKEN)
    resolveRuntimeKeyMock.mockImplementation(async (_account, key) => ({
      ...key,
      secret: "resolved-key",
    }))
    fetchModelIdsMock.mockResolvedValue(["model-a", "model-b"])
    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)
    const analyticsContext = {
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ApiCredentialProfiles,
      actionId:
        PRODUCT_ANALYTICS_ACTION_IDS.CopyApiCredentialProfileCursorPlusProviderConfig,
      surfaceId:
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsApiCredentialProfilesRowActions,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    } as const

    render(
      <CursorPlusExportDialog
        isOpen={true}
        onClose={() => {}}
        source={createAccountRuntimeKeyExportSource(ACCOUNT, runtimeKey)}
        analyticsContext={analyticsContext}
      />,
    )

    const modelInput = await screen.findByTestId(
      CURSOR_PLUS_EXPORT_TEST_IDS.modelSelectorInput,
    )
    expect(await screen.findByText("model-a")).toBeVisible()
    await user.click(modelInput)
    await user.click(await screen.findByRole("option", { name: "model-a" }))
    await user.click(screen.getByTestId(CURSOR_PLUS_EXPORT_TEST_IDS.copyButton))

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    expect(JSON.parse(atIndex(writeText.mock.calls, 0)[0]).models).toEqual([
      { id: "model-b", apiModel: "model-b", defaultOn: true },
    ])
    expect(startActionMock).toHaveBeenCalledWith(analyticsContext)
  })

  it("exports the protocol selected for Cursor++", async () => {
    const runtimeKey = buildNewApiRuntimeKey(ACCOUNT, TOKEN)
    resolveRuntimeKeyMock.mockImplementation(async (_account, key) => ({
      ...key,
      secret: "resolved-key",
    }))
    fetchModelIdsMock.mockResolvedValue(["model-a"])
    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    render(
      <CursorPlusExportDialog
        isOpen={true}
        onClose={() => {}}
        source={createAccountRuntimeKeyExportSource(ACCOUNT, runtimeKey)}
      />,
    )

    await screen.findByText("model-a")
    await user.click(
      screen.getByRole("combobox", {
        name: "ui:dialog.cursorPlus.labels.protocol",
      }),
    )
    await user.click(
      await screen.findByRole("option", {
        name: "ui:dialog.cursorPlus.protocols.gemini",
      }),
    )
    const baseUrlInput = screen.getByTestId(
      CURSOR_PLUS_EXPORT_TEST_IDS.baseUrlInput,
    )
    await user.clear(baseUrlInput)
    await user.type(baseUrlInput, "https://api.example.invalid/gemini/v1beta")
    await user.click(screen.getByTestId(CURSOR_PLUS_EXPORT_TEST_IDS.copyButton))

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    expect(JSON.parse(atIndex(writeText.mock.calls, 0)[0])).toMatchObject({
      type: "gemini",
      baseUrl: "https://api.example.invalid/gemini/v1beta",
    })
  })

  // The selected protocol decides which SDK receives the address, and those SDKs
  // disagree about who writes the version segment: the OpenAI SDK appends only
  // `/chat/completions` or `/responses`, while the Anthropic and Google SDKs add
  // `/v1/messages` and `/v1beta` themselves.
  it.each([
    {
      protocolLabel: "ui:dialog.cursorPlus.protocols.openAIResponses",
      expectedBaseUrl: "https://api.example.invalid/v1",
    },
    {
      protocolLabel: "ui:dialog.cursorPlus.protocols.anthropic",
      expectedBaseUrl: "https://api.example.invalid",
    },
    {
      protocolLabel: "ui:dialog.cursorPlus.protocols.gemini",
      expectedBaseUrl: "https://api.example.invalid",
    },
  ])(
    "prefills the address $protocolLabel expects without an edit",
    async ({ protocolLabel, expectedBaseUrl }) => {
      const runtimeKey = buildNewApiRuntimeKey(ACCOUNT, TOKEN)
      resolveRuntimeKeyMock.mockImplementation(async (_account, key) => ({
        ...key,
        secret: "resolved-key",
      }))
      fetchModelIdsMock.mockResolvedValue(["model-a"])
      const user = userEvent.setup()

      render(
        <CursorPlusExportDialog
          isOpen={true}
          onClose={() => {}}
          source={createAccountRuntimeKeyExportSource(ACCOUNT, runtimeKey)}
        />,
      )

      await screen.findByText("model-a")
      await user.click(
        screen.getByRole("combobox", {
          name: "ui:dialog.cursorPlus.labels.protocol",
        }),
      )
      await user.click(
        await screen.findByRole("option", { name: protocolLabel }),
      )

      await waitFor(() => {
        expect(
          screen.getByTestId(CURSOR_PLUS_EXPORT_TEST_IDS.baseUrlInput),
        ).toHaveValue(expectedBaseUrl)
      })
    },
  )

  it("prefers a declared Anthropic endpoint for the Anthropic protocol", async () => {
    const kimiAccount = {
      ...ACCOUNT,
      siteType: SITE_TYPES.KIMI_GLOBAL,
      baseUrl: "https://platform.kimi.ai",
    }
    const runtimeKey = buildNewApiRuntimeKey(kimiAccount, TOKEN)
    resolveRuntimeKeyMock.mockImplementation(async (_account, key) => ({
      ...key,
      secret: "resolved-key",
    }))
    fetchModelIdsMock.mockResolvedValue(["model-a"])
    const user = userEvent.setup()

    render(
      <CursorPlusExportDialog
        isOpen={true}
        onClose={() => {}}
        source={createAccountRuntimeKeyExportSource(kimiAccount, runtimeKey)}
      />,
    )

    await screen.findByText("model-a")
    await user.click(
      screen.getByRole("combobox", {
        name: "ui:dialog.cursorPlus.labels.protocol",
      }),
    )
    await user.click(
      await screen.findByRole("option", {
        name: "ui:dialog.cursorPlus.protocols.anthropic",
      }),
    )

    await waitFor(() => {
      expect(
        screen.getByTestId(CURSOR_PLUS_EXPORT_TEST_IDS.baseUrlInput),
      ).toHaveValue("https://api.moonshot.ai/anthropic")
    })
  })

  it("keeps a user-edited address when the protocol changes", async () => {
    const runtimeKey = buildNewApiRuntimeKey(ACCOUNT, TOKEN)
    resolveRuntimeKeyMock.mockImplementation(async (_account, key) => ({
      ...key,
      secret: "resolved-key",
    }))
    fetchModelIdsMock.mockResolvedValue(["model-a"])
    const user = userEvent.setup()

    render(
      <CursorPlusExportDialog
        isOpen={true}
        onClose={() => {}}
        source={createAccountRuntimeKeyExportSource(ACCOUNT, runtimeKey)}
      />,
    )

    await screen.findByText("model-a")
    const baseUrlInput = screen.getByTestId(
      CURSOR_PLUS_EXPORT_TEST_IDS.baseUrlInput,
    )
    await user.clear(baseUrlInput)
    await user.type(baseUrlInput, "https://custom.example.invalid/router")

    await user.click(
      screen.getByRole("combobox", {
        name: "ui:dialog.cursorPlus.labels.protocol",
      }),
    )
    await user.click(
      await screen.findByRole("option", {
        name: "ui:dialog.cursorPlus.protocols.gemini",
      }),
    )

    await waitFor(() => {
      expect(baseUrlInput).toHaveValue("https://custom.example.invalid/router")
    })
  })

  it("drops a delayed copy after the provider name changes", async () => {
    const runtimeKey = buildNewApiRuntimeKey(ACCOUNT, TOKEN)
    let resolveSecret: ((value: typeof runtimeKey) => void) | undefined
    resolveRuntimeKeyMock
      .mockResolvedValueOnce({ ...runtimeKey, secret: "discovery-key" })
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveSecret = resolve
        }),
      )
    fetchModelIdsMock.mockResolvedValue(["model-a"])
    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    render(
      <CursorPlusExportDialog
        isOpen={true}
        onClose={() => {}}
        source={createAccountRuntimeKeyExportSource(ACCOUNT, runtimeKey)}
      />,
    )

    await screen.findByText("model-a")
    await user.click(screen.getByTestId(CURSOR_PLUS_EXPORT_TEST_IDS.copyButton))
    await user.clear(
      screen.getByTestId(CURSOR_PLUS_EXPORT_TEST_IDS.providerNameInput),
    )
    await user.type(
      screen.getByTestId(CURSOR_PLUS_EXPORT_TEST_IDS.providerNameInput),
      "Changed Provider",
    )
    resolveSecret?.({ ...runtimeKey, secret: "resolved-key" })

    await waitFor(() => expect(resolveRuntimeKeyMock).toHaveBeenCalledTimes(2))
    expect(writeText).not.toHaveBeenCalled()
    expect(toastSuccessMock).not.toHaveBeenCalled()
    expect(completeActionMock).not.toHaveBeenCalled()
  })

  it("discards a pending copy and refreshes models after account credentials change", async () => {
    const runtimeKey = buildNewApiRuntimeKey(ACCOUNT, TOKEN)
    let resolveSecret: ((value: typeof runtimeKey) => void) | undefined
    const pendingSecret = new Promise<typeof runtimeKey>((resolve) => {
      resolveSecret = resolve
    })
    resolveRuntimeKeyMock
      .mockResolvedValue({ ...runtimeKey, secret: "rotated-key" })
      .mockResolvedValueOnce({ ...runtimeKey, secret: "old-key" })
      .mockReturnValueOnce(pendingSecret)
    fetchModelIdsMock.mockResolvedValue(["model-a"])
    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)
    const { rerender } = render(
      <CursorPlusExportDialog
        isOpen={true}
        onClose={() => {}}
        source={createAccountRuntimeKeyExportSource(ACCOUNT, runtimeKey)}
      />,
    )

    await screen.findByText("model-a")
    await user.click(screen.getByTestId(CURSOR_PLUS_EXPORT_TEST_IDS.copyButton))
    rerender(
      <CursorPlusExportDialog
        isOpen={true}
        onClose={() => {}}
        source={createAccountRuntimeKeyExportSource(
          { ...ACCOUNT, token: "changed-account-auth" },
          runtimeKey,
        )}
      />,
    )

    await waitFor(() =>
      expect(fetchModelIdsMock).toHaveBeenLastCalledWith({
        baseUrl: ACCOUNT.baseUrl,
        apiKey: "rotated-key",
      }),
    )
    await act(async () => {
      resolveSecret?.({ ...runtimeKey, secret: "old-key" })
      await pendingSecret
    })
    expect(writeText).not.toHaveBeenCalled()

    await user.click(screen.getByTestId(CURSOR_PLUS_EXPORT_TEST_IDS.copyButton))
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce())
    expect(JSON.parse(atIndex(writeText.mock.calls, 0)[0]).auth).toEqual({
      kind: "apiKey",
      value: "rotated-key",
    })
  })

  it("reports a clipboard failure without exposing provider details to analytics", async () => {
    const runtimeKey = buildNewApiRuntimeKey(ACCOUNT, TOKEN)
    resolveRuntimeKeyMock.mockImplementation(async (_account, key) => ({
      ...key,
      secret: "resolved-key",
    }))
    fetchModelIdsMock.mockResolvedValue(["model-a"])
    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
      new Error("clipboard unavailable"),
    )

    render(
      <CursorPlusExportDialog
        isOpen={true}
        onClose={() => {}}
        source={createAccountRuntimeKeyExportSource(ACCOUNT, runtimeKey)}
      />,
    )

    await screen.findByText("ui:dialog.cursorPlus.status.loaded")
    await user.click(screen.getByTestId(CURSOR_PLUS_EXPORT_TEST_IDS.copyButton))

    await waitFor(() =>
      expect(completeActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown },
      ),
    )
    expect(toastErrorMock).toHaveBeenCalledWith(
      "ui:dialog.cursorPlus.messages.copyFailed",
    )
  })

  it("explains an invalid provider base URL before export", async () => {
    const runtimeKey = buildNewApiRuntimeKey(ACCOUNT, TOKEN)
    resolveRuntimeKeyMock.mockImplementation(async (_account, key) => ({
      ...key,
      secret: "resolved-key",
    }))
    fetchModelIdsMock.mockResolvedValue(["model-a"])
    const user = userEvent.setup()

    render(
      <CursorPlusExportDialog
        isOpen={true}
        onClose={() => {}}
        source={createAccountRuntimeKeyExportSource(ACCOUNT, runtimeKey)}
      />,
    )

    await screen.findByText("model-a")
    const baseUrlInput = screen.getByTestId(
      CURSOR_PLUS_EXPORT_TEST_IDS.baseUrlInput,
    )
    await user.clear(baseUrlInput)
    await user.type(baseUrlInput, "not-a-url")

    expect(baseUrlInput).toHaveAttribute("aria-invalid", "true")
    expect(
      screen.getByText("ui:dialog.cursorPlus.messages.invalidBaseUrl"),
    ).toBeVisible()
    expect(
      screen.getByTestId(CURSOR_PLUS_EXPORT_TEST_IDS.copyButton),
    ).toBeDisabled()
  })
})
