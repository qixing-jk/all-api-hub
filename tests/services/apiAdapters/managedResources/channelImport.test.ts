import { afterEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import {
  MANAGED_RESOURCE_CREATE_SEED_KINDS,
  type ManagedResourceRegistration,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  openNativeManagedChannelImportEditor,
  openNativeManagedChannelImportSession,
} from "~/services/apiAdapters/managedResources/channelImport"
import * as managedResourceRegistry from "~/services/apiAdapters/managedResources/registry"
import { type ManagedSiteChannelDraft } from "~/types/managedSiteChannelDraft"

const draft: ManagedSiteChannelDraft = {
  name: "Imported channel",
  type: "openai",
  key: "sk-placeholder",
  base_url: "https://upstream.example.invalid",
  models: ["model-a"],
  groups: [],
  priority: 0,
  weight: 7,
  enabled: true,
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("native managed-channel import", () => {
  it("discovers import support from the exact registration without provider branching", async () => {
    const editor = {
      fields: [],
      initialValues: { providerOwned: "seeded" },
      validate: vi.fn(() => ({ valid: true as const })),
      submit: vi.fn(),
    }
    const openCreateEditor = vi.fn(async () => editor)
    const registration = {
      siteType: SITE_TYPES.NEW_API,
      kind: MANAGED_RESOURCE_KINDS.Channel,
      createSeedKinds: [
        MANAGED_RESOURCE_CREATE_SEED_KINDS.ManagedChannelImport,
      ],
      open: vi.fn(async () => ({ openCreateEditor })),
    } as unknown as ManagedResourceRegistration
    vi.spyOn(
      managedResourceRegistry,
      "getManagedResourceRegistration",
    ).mockReturnValue(registration)

    const prepared = await openNativeManagedChannelImportEditor(
      SITE_TYPES.NEW_API,
      draft,
    )

    expect(prepared).toMatchObject({
      siteType: SITE_TYPES.NEW_API,
      kind: MANAGED_RESOURCE_KINDS.Channel,
      editor,
    })
    expect(openCreateEditor).toHaveBeenCalledWith({
      seed: {
        kind: MANAGED_RESOURCE_CREATE_SEED_KINDS.ManagedChannelImport,
        name: "Imported channel",
        channelType: "openai",
        credential: "sk-placeholder",
        baseUrl: "https://upstream.example.invalid",
        enabled: true,
        models: ["model-a"],
        orderingWeight: 7,
        priority: 0,
        notes: "",
      },
    })
  })

  it("rejects registrations without import support", async () => {
    vi.spyOn(
      managedResourceRegistry,
      "getManagedResourceRegistration",
    ).mockReturnValue({
      siteType: SITE_TYPES.OCTOPUS,
      kind: MANAGED_RESOURCE_KINDS.Channel,
      open: vi.fn(),
    } as unknown as ManagedResourceRegistration)

    await expect(
      openNativeManagedChannelImportSession(SITE_TYPES.OCTOPUS),
    ).rejects.toMatchObject({ failure: { code: "unavailable" } })
  })

  it("rejects a provider without the import capability", async () => {
    vi.spyOn(
      managedResourceRegistry,
      "getManagedResourceRegistration",
    ).mockReturnValue({
      siteType: SITE_TYPES.AXON_HUB,
      kind: MANAGED_RESOURCE_KINDS.Channel,
      open: vi.fn(),
    } as unknown as ManagedResourceRegistration)

    await expect(
      openNativeManagedChannelImportSession(SITE_TYPES.AXON_HUB),
    ).rejects.toMatchObject({ failure: { code: "unavailable" } })
  })

  it("rejects a missing native registration", async () => {
    vi.spyOn(
      managedResourceRegistry,
      "getManagedResourceRegistration",
    ).mockReturnValue(null)

    await expect(
      openNativeManagedChannelImportSession(SITE_TYPES.AXON_HUB),
    ).rejects.toMatchObject({ failure: { code: "unavailable" } })
  })

  it("reconciles through the same native workspace without replaying creation", async () => {
    const list = vi.fn(async () => ({ items: [] }))
    const openCreateEditor = vi.fn()
    const open = vi.fn(async () => ({ list, openCreateEditor }))
    vi.spyOn(
      managedResourceRegistry,
      "getManagedResourceRegistration",
    ).mockReturnValue({
      siteType: SITE_TYPES.NEW_API,
      kind: MANAGED_RESOURCE_KINDS.Channel,
      createSeedKinds: [
        MANAGED_RESOURCE_CREATE_SEED_KINDS.ManagedChannelImport,
      ],
      open,
    } as unknown as ManagedResourceRegistration)
    const session = await openNativeManagedChannelImportSession(
      SITE_TYPES.NEW_API,
    )
    const signal = new AbortController().signal
    await session.reconcile({ signal })
    expect(open).toHaveBeenCalledOnce()
    expect(list).toHaveBeenCalledWith(undefined, { signal })
    expect(openCreateEditor).not.toHaveBeenCalled()
  })

  it("normalizes a disabled draft into a disabled provider-neutral seed", async () => {
    const openCreateEditor = vi.fn(async () => ({
      fields: [],
      initialValues: {},
      validate: vi.fn(() => ({ valid: true as const })),
      submit: vi.fn(),
    }))
    vi.spyOn(
      managedResourceRegistry,
      "getManagedResourceRegistration",
    ).mockReturnValue({
      siteType: SITE_TYPES.NEW_API,
      kind: MANAGED_RESOURCE_KINDS.Channel,
      createSeedKinds: [
        MANAGED_RESOURCE_CREATE_SEED_KINDS.ManagedChannelImport,
      ],
      open: vi.fn(async () => ({ openCreateEditor })),
    } as unknown as ManagedResourceRegistration)

    await openNativeManagedChannelImportEditor(SITE_TYPES.NEW_API, {
      ...draft,
      enabled: false,
    })

    expect(openCreateEditor).toHaveBeenCalledWith({
      seed: expect.objectContaining({ enabled: false }),
    })
  })

  it("submits the provider-owned normalized projection through the same session", async () => {
    const submit = vi.fn().mockResolvedValue({
      outcome: "succeeded",
      data: { displayName: "Imported channel" },
      confirmedEffects: [],
    })
    const initialValues = { providerOwned: "normalized" }
    const openCreateEditor = vi.fn(async () => ({
      fields: [],
      initialValues,
      validate: vi.fn(() => ({ valid: true as const })),
      submit,
    }))
    vi.spyOn(
      managedResourceRegistry,
      "getManagedResourceRegistration",
    ).mockReturnValue({
      siteType: SITE_TYPES.NEW_API,
      kind: MANAGED_RESOURCE_KINDS.Channel,
      createSeedKinds: [
        MANAGED_RESOURCE_CREATE_SEED_KINDS.ManagedChannelImport,
      ],
      open: vi.fn(async () => ({ openCreateEditor })),
    } as unknown as ManagedResourceRegistration)
    const controller = new AbortController()

    const session = await openNativeManagedChannelImportSession(
      SITE_TYPES.NEW_API,
    )
    await session?.submit(draft, { signal: controller.signal })

    expect(openCreateEditor).toHaveBeenCalledWith({
      signal: controller.signal,
      seed: expect.objectContaining({
        kind: MANAGED_RESOURCE_CREATE_SEED_KINDS.ManagedChannelImport,
      }),
    })
    expect(submit).toHaveBeenCalledWith(initialValues, {
      signal: controller.signal,
    })
  })
})
