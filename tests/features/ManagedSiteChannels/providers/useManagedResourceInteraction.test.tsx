import { renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { useManagedResourceInteraction } from "~/features/ManagedSiteChannels/providers/useManagedResourceInteraction"
import type { executeManagedSiteMigration } from "~/services/managedSites/channelMigration"
import type { ManagedSiteMigrationCanonicalPreview } from "~/types/managedSiteMigrationCapability"

const mocks = vi.hoisted(() => ({
  executeMigration: vi.fn(async (_params: unknown) => ({
    outcome: "succeeded",
  })),
  resolveCredential: vi.fn(async () => "resolved-credential"),
  runRead: vi.fn(async (read: () => Promise<unknown>) => await read()),
  useVerification: vi.fn(),
}))

vi.mock(
  "~/features/ManagedSiteChannels/hooks/useNewApiNativeSecretVerification",
  () => ({
    useNewApiNativeSecretVerification: mocks.useVerification,
  }),
)
vi.mock("~/services/managedSites/channelMigration", () => ({
  executeManagedSiteMigration: mocks.executeMigration,
}))
vi.mock("~/services/apiAdapters/managedResources/newApiMigration", () => ({
  resolveNewApiMigrationCredential: mocks.resolveCredential,
}))
vi.mock(
  "~/features/ManagedSiteVerification/NewApiManagedVerificationDialog",
  () => ({ NewApiManagedVerificationDialog: () => null }),
)

const verification = {
  dialogState: {
    isOpen: false,
    step: "idle",
    request: null,
    code: "",
    errorMessage: "",
    isBusy: false,
    busyMessage: "",
  },
  setCode: vi.fn(),
  submitCode: vi.fn(),
  retryVerification: vi.fn(),
  openBaseUrl: vi.fn(),
  patchRequestConfig: vi.fn(),
}

type ExecuteMigrationParams = Parameters<typeof executeManagedSiteMigration>[0]

const createMigrationParams = (
  sourceSiteType: ManagedSiteMigrationCanonicalPreview["sourceSiteType"],
): ExecuteMigrationParams => ({
  preview: {
    sourceSiteType,
    targetSiteType: SITE_TYPES.DONE_HUB,
    generalWarningCodes: [],
    items: [],
    totalCount: 0,
    readyCount: 0,
    blockedCount: 0,
  },
})

describe("managed resource interaction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("keeps direct providers on the shared migration executor", async () => {
    mocks.useVerification.mockReturnValue({
      verification,
      runVerifiedRead: mocks.runRead,
      closeVerification: vi.fn(),
    })
    const { result } = renderHook(() =>
      useManagedResourceInteraction({ siteType: SITE_TYPES.AXON_HUB }),
    )
    const params = createMigrationParams(SITE_TYPES.AXON_HUB)

    await result.current.executeMigration(params)

    expect(mocks.useVerification).toHaveBeenCalledWith({
      enabled: false,
      config: undefined,
    })
    expect(mocks.executeMigration).toHaveBeenCalledWith(params)
  })

  it("adds New API credential verification behind the interaction seam", async () => {
    mocks.useVerification.mockReturnValue({
      verification,
      runVerifiedRead: mocks.runRead,
      closeVerification: vi.fn(),
    })
    const newApiConfig = {
      baseUrl: "https://gateway.example.invalid",
      adminToken: "example-credential",
      userId: "42",
    }
    const { result } = renderHook(() =>
      useManagedResourceInteraction({
        siteType: SITE_TYPES.NEW_API,
        newApiConfig,
      }),
    )

    await result.current.executeMigration(
      createMigrationParams(SITE_TYPES.NEW_API),
    )
    const migrationParams = mocks.executeMigration.mock.calls.at(-1)?.[0] as {
      resolveSourceCredential: (
        selection: { displayName: string },
        options: object,
      ) => Promise<unknown>
    }
    const selection = { displayName: "Example channel" }
    await migrationParams.resolveSourceCredential(selection, {})

    expect(mocks.useVerification).toHaveBeenCalledWith({
      enabled: true,
      config: newApiConfig,
    })
    expect(mocks.resolveCredential).toHaveBeenCalledWith(selection, {})
    expect(mocks.runRead).toHaveBeenCalledWith(
      expect.any(Function),
      "Example channel",
      undefined,
    )
  })
})
