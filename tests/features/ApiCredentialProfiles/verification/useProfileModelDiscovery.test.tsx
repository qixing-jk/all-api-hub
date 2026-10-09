import { useRef, useState } from "react"
import { describe, expect, it, vi } from "vitest"

import { useProfileModelDiscovery } from "~/features/ApiCredentialProfiles/verification/useProfileModelDiscovery"
import type { ProbeItemState } from "~/features/Verification/api/types"
import { fetchApiCredentialModelIds } from "~/services/apiCredentialProfiles/modelCatalog"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"
import { act, renderHook, waitFor } from "~~/tests/test-utils/render"

vi.mock(
  "~/services/apiCredentialProfiles/modelCatalog",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("~/services/apiCredentialProfiles/modelCatalog")
    >()),
    fetchApiCredentialModelIds: vi.fn(),
  }),
)

describe("useProfileModelDiscovery", () => {
  it("preserves active probe state when catalog discovery supplies the first model", async () => {
    vi.mocked(fetchApiCredentialModelIds).mockResolvedValueOnce(["gpt-test"])
    const preserveCurrentProbeStateForModel = vi.fn()
    const profile: ApiCredentialProfile = {
      id: "profile",
      name: "Profile",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://example.com",
      apiKey: "test-key",
      tagIds: [],
      notes: "",
      createdAt: 1,
      updatedAt: 1,
    }
    const { result } = renderHook(() => {
      const [modelId, setModelId] = useState("")
      const probesRef = useRef<ProbeItemState[]>([
        {
          definition: { id: "models", requiresModelId: false },
          isRunning: true,
          attempts: 1,
          result: null,
        },
      ])
      const apiTypeRef = useRef(profile.apiType)
      const discovery = useProfileModelDiscovery({
        profile,
        setModelId,
        probesRef,
        apiTypeRef,
        preserveCurrentProbeStateForModel,
      })
      return { ...discovery, modelId }
    })
    await waitFor(() => expect(result.current).not.toBeNull())

    await act(async () => {
      await result.current.fetchModels(API_TYPES.OPENAI_COMPATIBLE)
    })

    expect(result.current.modelId).toBe("gpt-test")
    expect(result.current.modelOptions).toEqual(["gpt-test"])
    expect(preserveCurrentProbeStateForModel).toHaveBeenCalledWith(
      "gpt-test",
      API_TYPES.OPENAI_COMPATIBLE,
    )
    expect(result.current.isFetchingModels).toBe(false)
  })
})
