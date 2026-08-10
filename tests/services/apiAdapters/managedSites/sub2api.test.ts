import { beforeEach, describe, expect, it, vi } from "vitest"

import { ChannelType } from "~/constants/managedSite"
import { SITE_TYPES } from "~/constants/siteType"
import {
  sub2ApiManagedSiteCapabilities,
  sub2ApiManagedSiteChannels,
} from "~/services/apiAdapters/managedSites/sub2api"
import { MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS } from "~/services/managedSites/channelMatch"
import {
  createSub2ApiApiKeyAccount,
  deleteSub2ApiApiKeyAccount,
  getSub2ApiApiKeyAccount,
  revealSub2ApiApiKey,
  SUB2API_STEP_UP_ADMIN_KEY_FORBIDDEN_CODE,
  Sub2ApiAdminApiError,
  updateSub2ApiApiKeyAccount,
} from "~/services/managedSites/providers/sub2api"
import {
  createManagedUpstreamResourceRef,
  normalizeManagedUpstreamResourceScopeKey,
} from "~/types/managedUpstreamResource"

vi.mock("~/services/managedSites/providers/sub2api", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/managedSites/providers/sub2api")
    >()
  return {
    ...actual,
    createSub2ApiApiKeyAccount: vi.fn(),
    deleteSub2ApiApiKeyAccount: vi.fn(),
    getSub2ApiApiKeyAccount: vi.fn(),
    revealSub2ApiApiKey: vi.fn(),
    updateSub2ApiApiKeyAccount: vi.fn(),
  }
})

const config = {
  baseUrl: "https://sub2api.example.invalid",
  adminToken: "admin-key",
}
const candidates = [
  { id: 11, name: "First", key: "********" },
  { id: 12, name: "Second", key: "********" },
] as any

const resourceRef = (resourceId: string | number) =>
  createManagedUpstreamResourceRef({
    managedSiteType: SITE_TYPES.SUB2API,
    scopeKey: normalizeManagedUpstreamResourceScopeKey(config.baseUrl),
    resourceId,
  })

const createPayload = (key: string) => ({
  mode: "single" as const,
  channel: {
    name: "Imported account",
    type: ChannelType.OpenAI,
    key,
    base_url: "https://api.example.invalid/v1",
    models: "",
    groups: [],
    priority: 8,
    weight: 3,
    status: 1 as const,
    remark: "Imported note",
  },
})

describe("Sub2API managed-site adapter", () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it("re-reads selected keys for duplicate comparison and normal key viewing", async () => {
    vi.mocked(revealSub2ApiApiKey)
      .mockResolvedValueOnce("sk-first")
      .mockResolvedValueOnce("sk-second")
      .mockResolvedValueOnce("sk-selected")

    await expect(
      sub2ApiManagedSiteChannels.hydrateComparableKeys!(config, candidates),
    ).resolves.toEqual([
      expect.objectContaining({ id: 11, key: "sk-first" }),
      expect.objectContaining({ id: 12, key: "sk-second" }),
    ])
    await expect(
      sub2ApiManagedSiteChannels.fetchSecretKey!(config, 12),
    ).resolves.toBe("sk-selected")
  })

  it("keeps failed key resolution unknown instead of claiming no duplicate", async () => {
    vi.mocked(revealSub2ApiApiKey).mockRejectedValueOnce(
      new Error("key export unavailable"),
    )

    await expect(
      sub2ApiManagedSiteChannels.hydrateComparableKeys!(config, candidates),
    ).rejects.toMatchObject({
      reason:
        MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS.KEY_RESOLUTION_FAILED,
    })
  })

  it("hydrates comparable keys with bounded concurrency while preserving input order", async () => {
    const manyCandidates = Array.from({ length: 6 }, (_, index) => ({
      id: index + 1,
      name: `Candidate ${index + 1}`,
      key: "********",
    })) as any
    let active = 0
    let maxActive = 0
    vi.mocked(revealSub2ApiApiKey).mockImplementation(async (_config, id) => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await Promise.resolve()
      active -= 1
      return `sk-${id}`
    })

    await expect(
      sub2ApiManagedSiteChannels.hydrateComparableKeys!(config, manyCandidates),
    ).resolves.toEqual(
      manyCandidates.map((candidate: { id: number }) => ({
        ...candidate,
        key: `sk-${candidate.id}`,
      })),
    )
    expect(maxActive).toBe(1)
  })

  it("preserves reveal abort errors instead of downgrading them to unknown", async () => {
    const abortError = new DOMException("cancelled", "AbortError")
    vi.mocked(revealSub2ApiApiKey).mockRejectedValueOnce(abortError)

    await expect(
      sub2ApiManagedSiteChannels.hydrateComparableKeys!(config, candidates),
    ).rejects.toBe(abortError)
  })

  it("maps step-up reveal failures to verification-required matching", async () => {
    vi.mocked(revealSub2ApiApiKey).mockRejectedValueOnce(
      new Sub2ApiAdminApiError(
        "Step-up authentication required",
        403,
        SUB2API_STEP_UP_ADMIN_KEY_FORBIDDEN_CODE,
        {
          dispatch: "dispatched",
          responseReceived: true,
          confirmedNonApplication: true,
        },
      ),
    )

    await expect(
      sub2ApiManagedSiteChannels.hydrateComparableKeys!(config, candidates),
    ).rejects.toMatchObject({
      reason:
        MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS.VERIFICATION_REQUIRED,
    })
  })

  it("forwards imported notes and routing fields to native account creation", async () => {
    vi.mocked(createSub2ApiApiKeyAccount).mockImplementationOnce(
      async (_config, _input, options) => {
        options?.observer?.onDispatch()
        options?.observer?.onResponse()
        return {
          id: 17,
          name: "Imported account",
          platform: "openai",
          type: "apikey",
          credentials_status: { has_api_key: true },
          status: "active",
        }
      },
    )

    await sub2ApiManagedSiteChannels.create(config, {
      mode: "single",
      channel: {
        name: "Imported account",
        type: ChannelType.OpenAI,
        key: "import-secret",
        base_url: "https://api.example.invalid/v1",
        models: "",
        groups: [],
        priority: 8,
        weight: 3,
        status: 1,
        remark: "Imported note",
      },
    })

    expect(createSub2ApiApiKeyAccount).toHaveBeenCalledWith(
      config,
      expect.objectContaining({
        name: "Imported account",
        platform: "openai",
        baseUrl: "https://api.example.invalid/v1",
        apiKey: "import-secret",
        concurrency: 3,
        priority: 8,
        notes: "Imported note",
      }),
      expect.any(Object),
    )
  })

  it.each(["", "********", "sk-****", "••••••••"])(
    "rejects unusable create key %j before dispatch",
    async (key) => {
      await expect(
        sub2ApiManagedSiteChannels.create(config, createPayload(key)),
      ).rejects.toThrow()
      expect(createSub2ApiApiKeyAccount).not.toHaveBeenCalled()
    },
  )

  it.each(["", "********", "sk-****", "••••••••"])(
    "marks unusable legacy draft key %j invalid",
    (key) => {
      expect(
        sub2ApiManagedSiteCapabilities.resources.drafts.validateDraft({
          name: "Imported account",
          type: ChannelType.OpenAI,
          key,
          base_url: "https://api.example.invalid/v1",
          models: [],
          groups: [],
          priority: 1,
          weight: 1,
          status: 1,
        }),
      ).toMatchObject({
        valid: false,
        errors: expect.arrayContaining([
          expect.objectContaining({ field: "key" }),
        ]),
      })
    },
  )

  it("omits masked keys from legacy updates", async () => {
    vi.mocked(updateSub2ApiApiKeyAccount).mockImplementationOnce(
      async (_config, _id, _input, options) => {
        options?.observer?.onDispatch()
        options?.observer?.onResponse()
        return {
          id: 17,
          name: "Existing account",
          platform: "openai",
          type: "apikey",
          credentials_status: { has_api_key: true },
          status: "active",
        }
      },
    )

    await sub2ApiManagedSiteChannels.update(config, {
      id: 17,
      key: "sk-********",
    })

    expect(updateSub2ApiApiKeyAccount).toHaveBeenCalledWith(
      config,
      17,
      {},
      expect.any(Object),
    )
  })

  it("rejects invalid resource ids before any provider request", async () => {
    const resources = sub2ApiManagedSiteCapabilities.resources

    for (const invalidId of [
      "",
      "abc",
      "0",
      "-1",
      "1.5",
      String(Number.MAX_SAFE_INTEGER + 1),
    ]) {
      await expect(
        resources.items.getDetail(config, resourceRef(invalidId)),
      ).rejects.toThrow()
    }
    await expect(
      resources.items.delete(config, resourceRef("abc")),
    ).rejects.toThrow()
    await expect(
      resources.secrets!.revealSecret(config, resourceRef("abc")),
    ).rejects.toThrow()

    expect(getSub2ApiApiKeyAccount).not.toHaveBeenCalled()
    expect(deleteSub2ApiApiKeyAccount).not.toHaveBeenCalled()
    expect(revealSub2ApiApiKey).not.toHaveBeenCalled()
  })

  it("suppresses provider diagnostics when step-up reveal is unsupported", async () => {
    vi.mocked(revealSub2ApiApiKey).mockRejectedValueOnce(
      new Sub2ApiAdminApiError(
        "Long provider-specific step-up instructions",
        403,
        SUB2API_STEP_UP_ADMIN_KEY_FORBIDDEN_CODE,
        {
          dispatch: "dispatched",
          responseReceived: true,
          confirmedNonApplication: true,
        },
      ),
    )

    await expect(
      sub2ApiManagedSiteCapabilities.resources.secrets!.revealSecret(
        config,
        resourceRef(17),
      ),
    ).resolves.toEqual({ status: "unsupported" })
  })
})
