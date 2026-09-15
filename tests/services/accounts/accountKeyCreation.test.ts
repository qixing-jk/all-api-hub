import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  ensureAccountKey,
  getCreatedAccountRuntimeKey,
  prepareDefaultAccountKeyCreation,
  resolveCreatedAccountRuntimeKey,
} from "~/services/accounts/accountKeyCreation"
import {
  AccountKeyResourceError,
  type AccountKeyResourceFacts,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { AuthTypeEnum, type DisplaySiteData } from "~/types"
import { createDeferred } from "~~/tests/test-utils/deferred"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"

const { context, inventory } = vi.hoisted(() => ({
  context: vi.fn(),
  inventory: vi.fn(),
}))
vi.mock("~/services/accounts/utils/apiServiceRequest", () => ({
  createDisplayAccountApiContext: context,
  fetchDisplayAccountRuntimeKeys: inventory,
}))

let sequence = 0
const account = (): DisplaySiteData =>
  buildDisplaySiteData({
    id: `native-create-${++sequence}`,
    name: "Example",
    siteType: "new-api",
    baseUrl: "https://example.invalid",
    authType: AuthTypeEnum.AccessToken,
    userId: "1",
    token: "access",
  })
const facts = (owner: DisplaySiteData): AccountKeyResourceFacts => ({
  ref: {
    accountId: owner.id,
    siteType: owner.siteType,
    scopeKey: "account",
    resourceId: "7",
  },
  displayName: "Native key",
  maskedLabel: "masked-key",
  status: "enabled",
  fields: [],
  actions: { canUpdate: true, canDelete: true },
  runtimeKey: {
    modelAccess: {
      groups: null,
      allowedModelIds: ["model-a"],
      suggestedModelIds: ["model-a"],
    },
  },
})
const setup = (owner: DisplaySiteData, policy = "editor-defaults") => {
  const submit = vi.fn().mockResolvedValue({ facts: facts(owner) })
  const editor = {
    initialValues: { native: "initial" },
    validate: vi.fn().mockReturnValue({ valid: true, issues: [] }),
    submit,
  }
  const get = vi.fn().mockResolvedValue(facts(owner))
  const requirements = ["one", "two"].map((key) => ({
    requirementKey: `opaque-${key}`,
    displayName: "Same label",
    provisioning: { kind: "automatic" },
  }))
  const provision = vi.fn().mockResolvedValue({
    certainty: "applied",
    value: { ref: facts(owner).ref },
  })
  const session = {
    resolveDefaultScope: vi.fn().mockResolvedValue({ scopeKey: "account" }),
    openCreateEditor: vi.fn().mockResolvedValue(editor),
    openCollection: vi.fn().mockResolvedValue({ get }),
    provisioning: {
      inspect: vi.fn().mockResolvedValue({ requirements, items: [] }),
      provision,
    },
  }
  const capability = {
    defaultCreation: policy,
    inventorySecretAvailability: "recoverable",
    open: vi.fn().mockResolvedValue(session),
  }
  context.mockReturnValue({ accountKeyResources: capability, request: {} })
  inventory.mockResolvedValue([])
  return { editor, submit, session, get, provision, capability, requirements }
}

describe("native account key creation", () => {
  beforeEach(() => {
    context.mockReset()
    inventory.mockReset()
  })

  it("uses provider defaults and dispatches a prepared creation only once", async () => {
    const owner = account()
    const { submit, session } = setup(owner)
    const plan = await prepareDefaultAccountKeyCreation(owner)
    expect(plan.kind).toBe("ready")
    if (plan.kind !== "ready") throw new Error("Expected ready creation")
    const [first, second] = await Promise.all([plan.create(), plan.create()])
    expect(first).toEqual({ facts: facts(owner), ref: facts(owner).ref })
    expect(second).toEqual(first)
    expect(submit).toHaveBeenCalledTimes(1)
    expect(submit).toHaveBeenCalledWith({ native: "initial" }, {})
    expect(session.provisioning.inspect).not.toHaveBeenCalled()
  })

  it("forwards model and group intent to the provider editor without constructing a write DTO", async () => {
    const owner = account()
    const { session } = setup(owner, "select-requirement")
    const intent = {
      preferredGroup: "group",
      allowedGroups: ["group"],
      modelContext: { modelId: "model-a" },
    }
    await prepareDefaultAccountKeyCreation(owner, { intent })
    expect(session.openCreateEditor).toHaveBeenCalledWith(
      "account",
      { intent },
      intent,
    )
    expect(session.provisioning.inspect).not.toHaveBeenCalled()
  })

  it("opens manual input when the provider defaults are invalid", async () => {
    const owner = account()
    const { editor, submit } = setup(owner)
    editor.validate.mockReturnValue({ valid: false, issues: [] })
    expect(await prepareDefaultAccountKeyCreation(owner)).toEqual({
      kind: "input-required",
    })
    expect(submit).not.toHaveBeenCalled()
  })

  it("keeps duplicate group labels separate by opaque requirement identity", async () => {
    const owner = account()
    const { requirements, provision } = setup(owner, "select-requirement")
    const plan = await prepareDefaultAccountKeyCreation(owner)
    if (plan.kind !== "selection-required")
      throw new Error("Expected selection")
    expect(plan.requirements).toEqual(requirements)
    await plan.create("opaque-two")
    expect(provision).toHaveBeenCalledWith("opaque-two", {})
    await plan.create("opaque-one")
    expect(provision).toHaveBeenCalledTimes(1)
  })

  it("retains confirmed identity when the follow-up detail read fails", async () => {
    const owner = account()
    const { get, provision } = setup(owner, "select-requirement")
    get.mockRejectedValue(new Error("offline"))
    const plan = await prepareDefaultAccountKeyCreation(owner)
    if (plan.kind !== "selection-required")
      throw new Error("Expected selection")
    const result = await plan.create("opaque-one")
    expect(result).toEqual({ ref: facts(owner).ref, facts: null })
    expect(getCreatedAccountRuntimeKey(owner, result)).toBeNull()
    expect(provision).toHaveBeenCalledTimes(1)
  })

  it("does not dispatch a plan after its caller cancels", async () => {
    const owner = account()
    const { submit } = setup(owner)
    const controller = new AbortController()
    const plan = await prepareDefaultAccountKeyCreation(owner, {
      signal: controller.signal,
    })
    controller.abort()
    if (plan.kind !== "ready") throw new Error("Expected ready")
    await expect(plan.create()).rejects.toThrow()
    expect(submit).not.toHaveBeenCalled()
  })

  it("shares concurrent ensure operations across inventory and dispatch", async () => {
    const owner = account()
    const { submit } = setup(owner)
    const results = await Promise.all([
      ensureAccountKey(owner),
      ensureAccountKey(owner),
    ])
    expect(results.map((item) => item.kind)).toEqual(["created", "created"])
    expect(inventory).toHaveBeenCalledTimes(1)
    expect(submit).toHaveBeenCalledTimes(1)
  })

  it("requires a foreground owner before creating a response-only secret", async () => {
    const owner = account()
    const { capability, submit } = setup(owner)
    capability.inventorySecretAvailability = "create-response-only"
    expect(await ensureAccountKey(owner)).toEqual({
      kind: "input-required",
      reason: "one-time-secret",
    })
    expect(submit).not.toHaveBeenCalled()
    expect(
      (await ensureAccountKey(owner, { allowOneTimeSecret: true })).kind,
    ).toBe("created")
  })

  it("rechecks disclosure policy for a foreground caller waiting on background inventory", async () => {
    const owner = account()
    const { capability, submit } = setup(owner)
    capability.inventorySecretAvailability = "create-response-only"
    const read = createDeferred<never[]>()
    inventory.mockReturnValueOnce(read.promise)
    const background = ensureAccountKey(owner)
    const foreground = ensureAccountKey(owner, { allowOneTimeSecret: true })
    read.resolve([])
    expect(await background).toEqual({
      kind: "input-required",
      reason: "one-time-secret",
    })
    expect((await foreground).kind).toBe("created")
    expect(submit).toHaveBeenCalledTimes(1)
  })

  it("lets a waiting caller cancel without aborting another owner's write", async () => {
    const owner = account()
    const { submit } = setup(owner)
    const read = createDeferred<never[]>()
    inventory.mockReturnValueOnce(read.promise)
    const background = ensureAccountKey(owner)
    const controller = new AbortController()
    const foreground = ensureAccountKey(owner, { signal: controller.signal })
    const cancelled = expect(foreground).rejects.toMatchObject({
      failure: { code: "aborted" },
    })
    controller.abort()
    await cancelled
    read.resolve([])
    expect((await background).kind).toBe("created")
    expect(submit).toHaveBeenCalledTimes(1)
  })

  it("does not repeat confirmed creation while inventory has not caught up", async () => {
    const owner = account()
    const { submit } = setup(owner)
    const first = await ensureAccountKey(owner)
    expect(first.kind).toBe("created")
    expect(await ensureAccountKey(owner)).toEqual({
      kind: "input-required",
      reason: "editor",
    })
    expect(submit).toHaveBeenCalledTimes(1)
    const runtimeKey = getCreatedAccountRuntimeKey(owner, {
      ref: facts(owner).ref,
      facts: facts(owner),
    })!
    inventory.mockResolvedValue([runtimeKey])
    expect(await ensureAccountKey(owner)).toEqual({ kind: "ready", runtimeKey })
  })

  it("reads to reconcile an uncertain write and never automatically repeats it", async () => {
    const owner = account()
    const { submit } = setup(owner)
    submit.mockRejectedValue(
      new AccountKeyResourceError({ code: "mutation_state_uncertain" }),
    )
    await expect(ensureAccountKey(owner)).rejects.toMatchObject({
      failure: { code: "mutation_state_uncertain" },
    })
    await expect(ensureAccountKey(owner)).rejects.toMatchObject({
      failure: { code: "mutation_state_uncertain" },
    })
    expect(submit).toHaveBeenCalledTimes(1)
    const runtime = getCreatedAccountRuntimeKey(owner, {
      ref: facts(owner).ref,
      facts: facts(owner),
    })!
    inventory.mockResolvedValue([runtime])
    expect(await ensureAccountKey(owner)).toEqual({
      kind: "ready",
      runtimeKey: runtime,
    })
    expect(submit).toHaveBeenCalledTimes(1)
  })

  it("recovers only the returned ref and preserves its observed model policy", async () => {
    const owner = account()
    setup(owner)
    const runtime = getCreatedAccountRuntimeKey(owner, {
      ref: facts(owner).ref,
      facts: facts(owner),
    })!
    inventory.mockResolvedValue([{ ...runtime, id: "different" }, runtime])
    expect(
      await resolveCreatedAccountRuntimeKey(owner, {
        ref: facts(owner).ref,
        facts: null,
      }),
    ).toEqual(runtime)
    inventory.mockResolvedValue([{ ...runtime, id: "different" }])
    expect(
      await resolveCreatedAccountRuntimeKey(owner, {
        ref: facts(owner).ref,
        facts: null,
      }),
    ).toBeNull()
    expect(
      await resolveCreatedAccountRuntimeKey(owner, { ref: null, facts: null }),
    ).toBeNull()
  })

  it("does not infer runtime permissions from creation facts without a runtime projection", () => {
    const owner = account()
    const managementFacts = { ...facts(owner), runtimeKey: undefined }
    expect(
      getCreatedAccountRuntimeKey(owner, {
        ref: managementFacts.ref,
        facts: managementFacts,
      }),
    ).toBeNull()
  })
})

describe("definite creation failure recovery", () => {
  it("allows a new group confirmation after a definitely not-applied failure", async () => {
    const owner = account()
    const { provision } = setup(owner, "select-requirement")
    provision.mockResolvedValueOnce({
      certainty: "not-applied",
      failure: { code: "validation_failed" },
    })
    const plan = await prepareDefaultAccountKeyCreation(owner)
    if (plan.kind !== "selection-required")
      throw new Error("Expected selection")
    await expect(plan.create("opaque-one")).rejects.toThrow()
    await expect(plan.create("opaque-two")).resolves.toMatchObject({
      ref: facts(owner).ref,
    })
    expect(provision).toHaveBeenCalledTimes(2)
  })
})

it.each(["possibly-applied", "partially-applied"] as const)(
  "never replays a %s creation after another group confirmation",
  async (certainty) => {
    const owner = account()
    const { provision } = setup(owner, "select-requirement")
    provision.mockResolvedValueOnce({
      certainty,
      failure: { code: "unavailable" },
    })
    const plan = await prepareDefaultAccountKeyCreation(owner)
    if (plan.kind !== "selection-required")
      throw new Error("Expected selection")
    await expect(plan.create("opaque-one")).rejects.toThrow()
    await expect(plan.create("opaque-two")).rejects.toThrow()
    expect(provision).toHaveBeenCalledTimes(1)
  },
)
