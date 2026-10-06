import { describe, expect, it, vi } from "vitest"

import { ACCOUNT_SITE_TYPES } from "~/constants/siteType"
import { createKeyProvisioningFixtureSession } from "~/features/DevPanel/keyProvisioningFixtures"
import {
  createKeyProvisioningPreviewAccount,
  getKeyProvisioningPreviewProfile,
  prepareKeyProvisioningPreview,
} from "~/features/DevPanel/keyProvisioningPreview"
import { OPENROUTER_KEY_FIELD_IDS } from "~/services/apiAdapters/openrouter/keyResourceFields"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"

describe("key provisioning preview plans", () => {
  const openFixture = async (
    siteType: Parameters<typeof createKeyProvisioningPreviewAccount>[0],
    options: Parameters<typeof createKeyProvisioningFixtureSession>[3] = {},
  ) => {
    const account = createKeyProvisioningPreviewAccount(siteType)
    return createKeyProvisioningFixtureSession(
      account,
      getSiteTypeCapabilities(siteType).account!.keyResourceManagement!,
      "all-groups",
      options,
    )
  }

  it.each([
    ["new-api", "group", "Premium"],
    ["voapi-v2", "groups", ["2"]],
    ["sub2api", "group_id", "2"],
  ] as const)(
    "binds the selected %s requirement to its native editor",
    async (siteType, field, value) => {
      const session = await openFixture(siteType)
      const scope = await session.resolveDefaultScope()
      const snapshot = await session.provisioning!.inspect()
      const selected = snapshot.requirements[1]!
      const editor = await session.openCreateEditor(
        scope.scopeKey,
        {},
        undefined,
        selected.requirementKey,
      )
      expect(editor.initialValues[field]).toEqual(value)
      expect(editor.validate(editor.initialValues)).toEqual({ valid: true })
      const created = await editor.submit(editor.initialValues)
      expect(created.facts?.displayName).toBe(selected.displayName)
    },
  )

  it("lists created local resources and rejects missing or unsupported mutations", async () => {
    const session = await openFixture("new-api")
    const scope = await session.resolveDefaultScope()
    expect(await session.listScopes()).toEqual([scope])
    const collection = await session.openCollection(scope.scopeKey)
    expect(await collection.list()).toEqual({ items: [] })
    const snapshot = await session.provisioning!.inspect()
    const result = await session.provisioning!.provision(
      snapshot.requirements[0]!.requirementKey,
    )
    expect(result.certainty).toBe("applied")
    if (result.certainty !== "applied")
      throw new Error("Expected a confirmed local write")
    const { ref } = result.value
    expect((await collection.list()).items).toEqual([await collection.get(ref)])
    await expect(
      collection.get({ ...ref, resourceId: "missing" }),
    ).rejects.toMatchObject({ failure: { code: "unavailable" } })
    expect(() => collection.openEditEditor(ref)).toThrow()
    expect(() => collection.delete(ref)).toThrow()
  })

  it("propagates cancellation during local provisioning without recording a write", async () => {
    const controller = new AbortController()
    const created = vi.fn()
    const session = await openFixture("new-api", {
      signal: controller.signal,
      delayMs: 1,
      onCreated: created,
    })
    const snapshot = await session.provisioning!.inspect()
    const pending = session.provisioning!.provision(
      snapshot.requirements[0]!.requirementKey,
    )
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: "AbortError" })
    expect(created).not.toHaveBeenCalled()
  })

  it("rejects invalid fixture input before creation and accepts a corrected native selection", async () => {
    const created = vi.fn()
    const session = await openFixture("voapi-v2", { onCreated: created })
    const scope = await session.resolveDefaultScope()
    const editor = await session.openCreateEditor(scope.scopeKey)
    await expect(editor.submit(editor.initialValues)).rejects.toMatchObject({
      failure: { code: "validation_failed" },
    })
    expect(created).not.toHaveBeenCalled()
    await editor.submit({ ...editor.initialValues, groups: ["1"] })
    expect(created).toHaveBeenCalledOnce()
  })

  it("accepts the OpenRouter creator option offered by its local native fixture", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    try {
      const account = createKeyProvisioningPreviewAccount("openrouter")
      const resources = getSiteTypeCapabilities(account.siteType).account!
        .keyResourceManagement!
      const session = await createKeyProvisioningFixtureSession(
        account,
        resources,
        "default",
        {},
      )
      const scope = await session.resolveDefaultScope()
      const editor = await session.openCreateEditor(scope.scopeKey)
      const choices = await editor.loadOptions!(
        OPENROUTER_KEY_FIELD_IDS.Creator,
        editor.initialValues,
      )
      expect(choices).toHaveLength(1)
      const values = {
        ...editor.initialValues,
        [OPENROUTER_KEY_FIELD_IDS.Creator]: choices[0]!.value,
      }
      expect(editor.validate(values)).toEqual({ valid: true })
      await expect(editor.submit(values)).resolves.toMatchObject({
        ref: { accountId: account.id, scopeKey: scope.scopeKey },
      })
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it("deduplicates creation within a preview plan", async () => {
    const created = vi.fn()
    const plan = await prepareKeyProvisioningPreview(
      createKeyProvisioningPreviewAccount("new-api"),
      "all-groups",
      { onCreated: created },
    )
    const entry = plan.entries[0]!
    await Promise.all([entry.create(), entry.create()])
    expect(created).toHaveBeenCalledOnce()
  })

  it("does not replay an uncertain preview write", async () => {
    const plan = await prepareKeyProvisioningPreview(
      createKeyProvisioningPreviewAccount("new-api"),
      "all-groups",
      { scenario: "uncertain" },
    )
    const entry = plan.entries.at(-1)!
    await expect(entry.create()).rejects.toMatchObject({
      failure: { code: "mutation_state_uncertain" },
    })
    await expect(entry.create()).rejects.toMatchObject({
      failure: { code: "mutation_state_uncertain" },
    })
  })

  it("honors cancellation after a plan was prepared", async () => {
    const controller = new AbortController()
    const created = vi.fn()
    const plan = await prepareKeyProvisioningPreview(
      createKeyProvisioningPreviewAccount("new-api"),
      "all-groups",
      { signal: controller.signal, onCreated: created },
    )
    controller.abort()
    await expect(plan.entries[0]!.create()).rejects.toMatchObject({
      name: "AbortError",
    })
    expect(created).not.toHaveBeenCalled()
  })

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
