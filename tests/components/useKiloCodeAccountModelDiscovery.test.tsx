import { beforeEach, describe, expect, it, vi } from "vitest"

import type { KiloCodeAccountExportSelection } from "~/components/kiloCodeAccountExport"
import { useKiloCodeAccountModelDiscovery } from "~/components/useKiloCodeAccountModelDiscovery"
import { SITE_TYPES } from "~/constants/siteType"
import { AuthTypeEnum, type ApiToken, type DisplaySiteData } from "~/types"
import { act, renderHook, waitFor } from "~~/tests/test-utils/render"

const resolveExportTokenForSecretMock = vi.fn()
const fetchOpenAICompatibleModelIdsMock = vi.fn()

vi.mock("~/services/accounts/utils/exportTokenSecret", () => ({
  resolveExportTokenForSecret: (...args: unknown[]) =>
    resolveExportTokenForSecretMock(...args),
}))

vi.mock("~/services/aiApi/openaiCompatible", () => ({
  fetchOpenAICompatibleModelIds: (...args: unknown[]) =>
    fetchOpenAICompatibleModelIdsMock(...args),
}))

function createSelection({
  baseUrl,
  tokenKey,
  accountAccessToken,
}: {
  baseUrl: string
  tokenKey: string
  accountAccessToken: string
}): KiloCodeAccountExportSelection {
  const site = {
    id: "account-a",
    name: "Example",
    siteType: SITE_TYPES.UNKNOWN,
    baseUrl,
    authType: AuthTypeEnum.AccessToken,
    userId: "user-a",
    token: accountAccessToken,
  } as DisplaySiteData
  const token = {
    id: 7,
    name: "Default",
    key: tokenKey,
  } as ApiToken

  return {
    selectionId: "account-a:7",
    site,
    token,
    providerName: "Example - Default",
    runtimeKey: {
      accountId: site.id,
      siteName: site.name,
      baseUrl,
      tokenId: token.id,
      tokenName: token.name,
      tokenKey,
    },
  }
}

describe("useKiloCodeAccountModelDiscovery", () => {
  beforeEach(() => {
    resolveExportTokenForSecretMock.mockReset()
    resolveExportTokenForSecretMock.mockImplementation(
      async (_site: DisplaySiteData, token: ApiToken) => token,
    )
    fetchOpenAICompatibleModelIdsMock.mockReset()
  })

  it("reloads the same selection ID when primitive runtime source facts change and ignores the old result", async () => {
    let resolveOld: ((modelIds: string[]) => void) | undefined
    let resolveNew: ((modelIds: string[]) => void) | undefined
    const oldModels = new Promise<string[]>((resolve) => {
      resolveOld = resolve
    })
    const newModels = new Promise<string[]>((resolve) => {
      resolveNew = resolve
    })
    fetchOpenAICompatibleModelIdsMock
      .mockReturnValueOnce(oldModels)
      .mockReturnValueOnce(newModels)
    const oldSelection = createSelection({
      baseUrl: "https://old.example.invalid",
      tokenKey: "old-runtime-key",
      accountAccessToken: "old-account-token",
    })
    const newSelection = createSelection({
      baseUrl: "https://new.example.invalid",
      tokenKey: "new-runtime-key",
      accountAccessToken: "new-account-token",
    })

    const { result, rerender } = renderHook(
      ({ selections }) =>
        useKiloCodeAccountModelDiscovery({
          isOpen: true,
          selections,
        }),
      { initialProps: { selections: [oldSelection] } },
    )
    await waitFor(() => {
      expect(fetchOpenAICompatibleModelIdsMock).toHaveBeenCalledTimes(1)
    })

    rerender({ selections: [newSelection] })
    await waitFor(() => {
      expect(fetchOpenAICompatibleModelIdsMock).toHaveBeenCalledTimes(2)
    })
    expect(fetchOpenAICompatibleModelIdsMock).toHaveBeenLastCalledWith({
      baseUrl: "https://new.example.invalid",
      apiKey: "new-runtime-key",
    })

    await act(async () => {
      resolveOld?.(["old-model"])
      await oldModels
    })
    expect(result.current.v7Selections[0]?.discoveredModelIds).toEqual([])

    await act(async () => {
      resolveNew?.(["new-model"])
      await newModels
    })
    await waitFor(() => {
      expect(result.current.v7Selections[0]).toMatchObject({
        baseUrl: "https://new.example.invalid",
        tokenKey: "new-runtime-key",
        discoveredModelIds: ["new-model"],
      })
    })
  })

  it("invalidates a pending generation on unmount without post-unmount errors", async () => {
    let resolveModels: ((modelIds: string[]) => void) | undefined
    const models = new Promise<string[]>((resolve) => {
      resolveModels = resolve
    })
    fetchOpenAICompatibleModelIdsMock.mockReturnValueOnce(models)
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    const selection = createSelection({
      baseUrl: "https://api.example.invalid",
      tokenKey: "runtime-key",
      accountAccessToken: "account-token",
    })

    const selections = [selection]
    const { unmount } = renderHook(() =>
      useKiloCodeAccountModelDiscovery({
        isOpen: true,
        selections,
      }),
    )
    await waitFor(() => {
      expect(fetchOpenAICompatibleModelIdsMock).toHaveBeenCalledTimes(1)
    })

    unmount()
    await act(async () => {
      resolveModels?.(["late-model"])
      await models
    })

    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it("stores only custom provider and global-default models as manual catalog entries", async () => {
    fetchOpenAICompatibleModelIdsMock.mockResolvedValueOnce([
      "model-b",
      "model-a",
    ])
    const selection = createSelection({
      baseUrl: "https://api.example.invalid",
      tokenKey: "runtime-key",
      accountAccessToken: "account-token",
    })

    const { result } = renderHook(() =>
      useKiloCodeAccountModelDiscovery({
        isOpen: true,
        selections: [selection],
      }),
    )
    await waitFor(() => {
      expect(result.current.preparedCatalog?.providers[0]?.modelIds).toEqual([
        "model-a",
        "model-b",
      ])
    })

    act(() => {
      result.current.selectV7ManualModel(selection.selectionId, "model-b")
    })
    expect(result.current.v7Selections[0]?.manualModelId).toBeUndefined()

    act(() => {
      result.current.selectV7ManualModel(selection.selectionId, "custom/row")
    })
    expect(result.current.v7Selections[0]?.manualModelId).toBe("custom/row")

    act(() => {
      result.current.selectV7DefaultModel("custom/default")
    })
    expect(result.current.v7DefaultModel).toEqual({
      selectionId: selection.selectionId,
      modelId: "custom/default",
    })
    expect(result.current.v7Selections[0]?.manualModelId).toBe("custom/default")
  })

  it("keeps the discovered catalog when changing the V7 provider protocol", async () => {
    fetchOpenAICompatibleModelIdsMock.mockResolvedValueOnce([
      "model-b",
      "model-a",
    ])
    const selection = createSelection({
      baseUrl: "https://api.example.invalid",
      tokenKey: "runtime-key",
      accountAccessToken: "account-token",
    })

    const { result } = renderHook(() =>
      useKiloCodeAccountModelDiscovery({
        isOpen: true,
        selections: [selection],
      }),
    )

    await waitFor(() => {
      expect(result.current.v7Selections[0]?.discoveredModelIds).toEqual([
        "model-a",
        "model-b",
      ])
    })
    expect(result.current.v7Selections[0]?.protocol).toBe("openai-compatible")

    act(() => {
      result.current.selectV7Protocol(
        selection.selectionId,
        "anthropic-messages",
      )
    })

    expect(result.current.v7Selections[0]).toMatchObject({
      protocol: "anthropic-messages",
      discoveredModelIds: ["model-a", "model-b"],
    })
    expect(fetchOpenAICompatibleModelIdsMock).toHaveBeenCalledTimes(1)
  })
})
