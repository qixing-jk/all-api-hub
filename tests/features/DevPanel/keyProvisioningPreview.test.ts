import { describe, expect, it, vi } from "vitest"

import { ACCOUNT_SITE_TYPES } from "~/constants/siteType"
import {
  createKeyProvisioningPreviewAccount,
  getKeyProvisioningPreviewProfile,
  prepareKeyProvisioningPreview,
} from "~/features/DevPanel/keyProvisioningPreview"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"

describe("key provisioning preview plans", () => {
  it.each(["default", "all-groups"] as const)(
    "previews FreeModel one-time secrets in %s mode",
    async (mode) => {
      const plan = await prepareKeyProvisioningPreview(
        createKeyProvisioningPreviewAccount("freemodel"),
        mode,
      )
      expect(plan.entries).toHaveLength(1)
      expect(plan.entries[0]?.editor).toBeUndefined()
      expect(
        (await plan.entries[0]!.create()).createdSecret?.secret,
      ).toBeTruthy()
    },
  )
  it.each(["default", "all-groups"] as const)(
    "previews a single Grsai key without input or one-time secret in %s mode",
    async (mode) => {
      const plan = await prepareKeyProvisioningPreview(
        createKeyProvisioningPreviewAccount("grsai"),
        mode,
      )
      expect(plan.entries).toHaveLength(1)
      expect(plan.entries[0]?.editor).toBeUndefined()
      const result = await plan.entries[0]!.create()
      expect(result.createdSecret).toBeUndefined()
    },
  )
  it.each(["sub2api", "RightCode", "ModelFlare", "voapi-v2"] as const)(
    "automatically handles a single target for %s",
    async (siteType) => {
      const plan = await prepareKeyProvisioningPreview(
        createKeyProvisioningPreviewAccount(siteType),
        "default",
        { scenario: "single-target" },
      )
      expect(plan.entries[0]?.editor).toBeUndefined()
    },
  )
  it("retains confirmed writes before the last simulated uncertain write", async () => {
    const created = vi.fn()
    const plan = await prepareKeyProvisioningPreview(
      createKeyProvisioningPreviewAccount("new-api"),
      "all-groups",
      { scenario: "uncertain", onCreated: created },
    )
    await plan.entries[0]!.create()
    await expect(plan.entries[1]!.create()).rejects.toMatchObject({
      failure: { code: "mutation_state_uncertain" },
    })
    expect(created).toHaveBeenCalledOnce()
  })
  it.each(ACCOUNT_SITE_TYPES)(
    "can preview both modes for %s without requests",
    async (siteType) => {
      const fetchSpy = vi.spyOn(globalThis, "fetch")
      try {
        const account = createKeyProvisioningPreviewAccount(siteType)
        for (const mode of ["default", "all-groups"] as const) {
          expect(
            getKeyProvisioningPreviewProfile(siteType, mode).description,
          ).toMatch(/key|group|channel/i)
          if (
            !getSiteTypeCapabilities(siteType).account?.keyResourceManagement
          ) {
            await expect(
              prepareKeyProvisioningPreview(account, mode),
            ).rejects.toThrow()
            continue
          }
          const plan = await prepareKeyProvisioningPreview(account, mode)
          expect(plan.entries.length).toBeGreaterThan(0)
          for (const entry of plan.entries) {
            if (entry.editor?.loadOptions) {
              for (const field of entry.editor.fields) {
                if ("optionLoader" in field)
                  await entry.editor.loadOptions(
                    field.fieldId,
                    entry.editor.initialValues,
                  )
              }
            }
          }
        }
        expect(fetchSpy).not.toHaveBeenCalled()
      } finally {
        fetchSpy.mockRestore()
      }
    },
  )
  it("automatically creates unlimited VoAPI keys for all missing groups", async () => {
    const plan = await prepareKeyProvisioningPreview(
      createKeyProvisioningPreviewAccount("voapi-v2"),
      "all-groups",
    )
    expect(plan.entries).toHaveLength(2)
    for (const entry of plan.entries) {
      expect(entry.editor).toBeUndefined()
      await expect(entry.create()).resolves.toMatchObject({
        facts: { status: "enabled" },
      })
    }
  })
  it("shows a group choice only for the Sub2API default scope", async () => {
    const account = createKeyProvisioningPreviewAccount("sub2api")
    expect(
      (await prepareKeyProvisioningPreview(account, "default")).entries[0]
        ?.editor,
    ).toBeDefined()
    expect(
      (
        await prepareKeyProvisioningPreview(account, "all-groups")
      ).entries.every((entry) => !entry.editor),
    ).toBe(true)
  })

  it("simulates inventory and native option failures without sending requests", async () => {
    const covered = await prepareKeyProvisioningPreview(
      createKeyProvisioningPreviewAccount("new-api"),
      "all-groups",
      { scenario: "covered" },
    )
    expect(covered).toEqual({ coveredCount: 2, entries: [] })
    const account = createKeyProvisioningPreviewAccount("voapi-v2")
    await expect(
      prepareKeyProvisioningPreview(account, "default", {
        scenario: "inventory-failure",
      }),
    ).rejects.toMatchObject({ failure: { code: "unavailable" } })
    const plan = await prepareKeyProvisioningPreview(account, "default", {
      scenario: "option-failure",
    })
    await expect(
      plan.entries[0]!.editor!.loadOptions!("groups", {}),
    ).rejects.toMatchObject({ failure: { code: "unavailable" } })
  })

  it("validates and submits native preview input without remote writes", async () => {
    const created = vi.fn()
    const plan = await prepareKeyProvisioningPreview(
      createKeyProvisioningPreviewAccount("voapi-v2"),
      "default",
      { onCreated: created },
    )
    const target = plan.entries[0]!
    expect(
      target.editor!.resolveDestinationScopeKey(target.editor!.initialValues),
    ).toBe("preview")
    await expect(target.create()).rejects.toMatchObject({
      failure: { code: "validation_failed" },
    })
    expect(created).not.toHaveBeenCalled()
    const result = await target.create({
      ...target.editor!.initialValues,
      groups: ["1"],
    })
    expect(result.ref).toBeTruthy()
    expect(created).toHaveBeenCalledOnce()
  })
})
