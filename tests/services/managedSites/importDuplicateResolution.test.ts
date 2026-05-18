import { describe, expect, it, vi } from "vitest"

import {
  MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS,
  MatchResolutionUnresolvedError,
} from "~/services/managedSites/channelMatch"
import { resolveManagedSiteImportDuplicate } from "~/services/managedSites/importDuplicateResolution"
import { CHANNEL_STATUS } from "~/types/managedSite"

const managedConfig = {
  baseUrl: "https://managed.example",
  token: "managed-token",
  userId: "1",
}

const formData = {
  name: "Imported Channel",
  type: "openai",
  key: "test-key",
  base_url: "https://api.example.com",
  models: ["gpt-4o"],
  groups: ["default"],
  priority: 0,
  weight: 1,
  status: CHANNEL_STATUS.Enable,
}

describe("resolveManagedSiteImportDuplicate", () => {
  it("defaults unresolved exact-model hidden-key duplicates to verification required", async () => {
    const service = {
      searchChannel: vi.fn().mockResolvedValue({
        items: [
          {
            id: 42,
            name: "Masked Duplicate",
            key: "",
            base_url: "https://api.example.com",
            models: "gpt-4o",
          },
        ],
      }),
    }

    await expect(
      resolveManagedSiteImportDuplicate({
        service,
        managedConfig,
        formData,
      }),
    ).rejects.toMatchObject({
      name: MatchResolutionUnresolvedError.name,
      reason:
        MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS.VERIFICATION_REQUIRED,
    })
  })

  it("preserves provider unresolved reasons for exact-model hidden-key duplicates", async () => {
    const service = {
      searchChannel: vi.fn().mockResolvedValue({
        items: [
          {
            id: 43,
            name: "Masked Duplicate",
            key: "",
            base_url: "https://api.example.com",
            models: "gpt-4o",
          },
        ],
      }),
      hydrateComparableChannelKeys: vi.fn(async () => {
        throw new MatchResolutionUnresolvedError(
          MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS.KEY_RESOLUTION_FAILED,
        )
      }),
    }

    await expect(
      resolveManagedSiteImportDuplicate({
        service,
        managedConfig,
        formData,
      }),
    ).rejects.toMatchObject({
      name: MatchResolutionUnresolvedError.name,
      reason:
        MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS.KEY_RESOLUTION_FAILED,
    })
  })

  it("returns null when hidden-key comparison is unavailable without an exact model match", async () => {
    const service = {
      searchChannel: vi.fn().mockResolvedValue({
        items: [
          {
            id: 44,
            name: "Masked Different Models",
            key: "",
            base_url: "https://api.example.com",
            models: "claude-3",
          },
        ],
      }),
    }

    await expect(
      resolveManagedSiteImportDuplicate({
        service,
        managedConfig,
        formData,
      }),
    ).resolves.toBeNull()
  })

  it("returns exact duplicate channels", async () => {
    const service = {
      searchChannel: vi.fn().mockResolvedValue({
        items: [
          {
            id: 45,
            name: "Exact Duplicate",
            key: "test-key",
            base_url: "https://api.example.com",
            models: "gpt-4o",
          },
        ],
      }),
    }

    await expect(
      resolveManagedSiteImportDuplicate({
        service,
        managedConfig,
        formData,
      }),
    ).resolves.toMatchObject({
      id: 45,
      name: "Exact Duplicate",
    })
  })

  it("passes through non-hidden-key non-matches", async () => {
    const service = {
      searchChannel: vi.fn().mockResolvedValue({
        items: [
          {
            id: 46,
            name: "Different Key",
            key: "test-other-key",
            base_url: "https://api.example.com",
            models: "gpt-4o",
          },
        ],
      }),
    }

    await expect(
      resolveManagedSiteImportDuplicate({
        service,
        managedConfig,
        formData,
      }),
    ).resolves.toBeNull()
  })
})
