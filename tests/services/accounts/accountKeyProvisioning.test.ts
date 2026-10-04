import { beforeEach, describe, expect, it, vi } from "vitest"

import { prepareAccountKeyProvisioning } from "~/services/accounts/accountKeyProvisioning"
import { AccountKeyResourceError } from "~/services/apiAdapters/contracts/accountKeyResource"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"

const { context, inventory, prepareDefault } = vi.hoisted(() => ({
  context: vi.fn(),
  inventory: vi.fn(),
  prepareDefault: vi.fn(),
}))
vi.mock("~/services/accounts/utils/apiServiceRequest", () => ({
  createDisplayAccountApiContext: context,
  fetchDisplayAccountRuntimeKeys: inventory,
}))
vi.mock("~/services/accounts/accountKeyCreation", () => ({
  accountKeySourceSignature: (owner: { id: string }) => owner.id,
  prepareDefaultAccountKeyCreation: prepareDefault,
}))

let account = buildDisplaySiteData({ siteType: "voapi-v2" })
const ref = {
  accountId: account.id,
  siteType: account.siteType,
  scopeKey: "account",
  resourceId: "1",
}
const requirement = (key: string, automatic = true) => ({
  requirementKey: key,
  displayName: "Same label",
  provisioning: automatic
    ? { kind: "automatic" as const }
    : {
        kind: "input-required" as const,
        reasonCode: "finite-quota-required" as const,
      },
})
const editor = () => ({
  fields: [],
  initialValues: { quota: 0 },
  validate: vi.fn().mockReturnValue({ valid: false, issues: [] }),
  submit: vi.fn().mockResolvedValue({ facts: { ref } }),
  resolveDestinationScopeKey: () => "account",
})
const setup = () => {
  const nativeEditor = editor()
  const session = {
    resolveDefaultScope: vi.fn().mockResolvedValue({ scopeKey: "account" }),
    openCreateEditor: vi.fn().mockResolvedValue(nativeEditor),
    openCollection: vi
      .fn()
      .mockResolvedValue({ get: vi.fn().mockResolvedValue({ ref }) }),
    provisioning: {
      inspect: vi.fn().mockResolvedValue({
        requirements: [requirement("one"), requirement("two", false)],
        items: [],
      }),
      provision: vi
        .fn()
        .mockResolvedValue({ certainty: "applied", value: { ref } }),
    },
  }
  context.mockReturnValue({
    accountKeyResources: { open: vi.fn().mockResolvedValue(session) },
    request: {},
  })
  return { session, nativeEditor }
}

describe("interactive account key provisioning plans", () => {
  beforeEach(() => {
    account = buildDisplaySiteData({
      id: crypto.randomUUID(),
      siteType: "voapi-v2",
    })
    vi.clearAllMocks()
    inventory.mockResolvedValue([])
    prepareDefault.mockResolvedValue({ kind: "input-required" })
  })

  it("offers a native editor for default creation that needs user input", async () => {
    const { nativeEditor } = setup()
    const plan = await prepareAccountKeyProvisioning(account, "default")
    expect(plan.entries[0]?.editor).toBe(nativeEditor)
    expect(nativeEditor.submit).not.toHaveBeenCalled()
  })

  it("plans all missing requirements and opens input editors using opaque identities", async () => {
    const { session } = setup()
    const plan = await prepareAccountKeyProvisioning(account, "all-groups")
    expect(plan.entries).toHaveLength(2)
    expect(session.openCreateEditor).toHaveBeenCalledWith(
      "account",
      expect.any(Object),
      undefined,
      "two",
    )
    expect(session.provisioning.provision).not.toHaveBeenCalled()
  })

  it("omits requirements already covered by usable keys", async () => {
    const { session } = setup()
    session.provisioning.inspect.mockResolvedValueOnce({
      requirements: [requirement("one"), requirement("two")],
      items: [
        {
          ref,
          coverage: "usable",
          placement: { kind: "requirement", requirementKeys: ["one"] },
        },
      ],
    } as never)
    const plan = await prepareAccountKeyProvisioning(account, "all-groups")
    expect(plan.coveredCount).toBe(1)
    expect(plan.entries.map((entry) => entry.key)).toEqual(["two"])
  })

  it("blocks writes and input editors when coverage is incomplete", async () => {
    const { session } = setup()
    session.provisioning.inspect.mockResolvedValueOnce({
      requirements: [requirement("one")],
      items: [],
      partialFailure: { code: "unavailable" },
    } as never)
    await expect(
      prepareAccountKeyProvisioning(account, "all-groups"),
    ).rejects.toMatchObject({ failure: { code: "unavailable" } })
    expect(session.openCreateEditor).not.toHaveBeenCalled()
    expect(session.provisioning.provision).not.toHaveBeenCalled()
  })

  it("falls back to one default key for providers without group requirements", async () => {
    const { session } = setup()
    delete (session as Partial<typeof session>).provisioning
    const create = vi.fn()
    prepareDefault.mockResolvedValueOnce({ kind: "ready", create })
    const plan = await prepareAccountKeyProvisioning(account, "all-groups")
    expect(plan.entries).toHaveLength(1)
    await plan.entries[0]!.create()
    expect(create).toHaveBeenCalledOnce()
  })

  it("returns response-only secrets to the foreground owner", async () => {
    const { session } = setup()
    session.provisioning.inspect.mockResolvedValueOnce({
      requirements: [requirement("one")],
      items: [],
    })
    session.provisioning.provision.mockResolvedValueOnce({
      certainty: "applied",
      value: { ref, createdSecret: { secret: "create-only" } },
    } as never)
    const plan = await prepareAccountKeyProvisioning(account, "all-groups")
    expect(await plan.entries[0]!.create()).toMatchObject({
      createdSecret: { secret: "create-only" },
    })
  })

  it("uses the native default editor for a complete New API inventory without groups or keys", async () => {
    account = buildDisplaySiteData({
      id: crypto.randomUUID(),
      siteType: "new-api",
    })
    const { session, nativeEditor } = setup()
    session.provisioning.inspect.mockResolvedValue({
      requirements: [],
      items: [],
    })
    const plan = await prepareAccountKeyProvisioning(account, "all-groups")
    expect(plan.entries).toHaveLength(1)
    expect(plan.entries[0]?.editor).toBe(nativeEditor)
    expect(session.provisioning.provision).not.toHaveBeenCalled()
    expect(nativeEditor.submit).not.toHaveBeenCalled()
  })

  it.each(["voapi-v2", "sub2api"] as const)(
    "does not assume an empty %s requirement inventory permits default creation",
    async (siteType) => {
      account = buildDisplaySiteData({ id: crypto.randomUUID(), siteType })
      const { session } = setup()
      session.provisioning.inspect.mockResolvedValue({
        requirements: [],
        items: [],
      })
      await expect(
        prepareAccountKeyProvisioning(account, "all-groups"),
      ).rejects.toMatchObject({ failure: { code: "unavailable" } })
      expect(prepareDefault).not.toHaveBeenCalled()
    },
  )

  it.each([true, false])(
    "blocks an empty New API snapshot with %s partial failure",
    async (partial) => {
      account = buildDisplaySiteData({
        id: crypto.randomUUID(),
        siteType: "new-api",
      })
      const { session } = setup()
      session.provisioning.inspect.mockResolvedValue({
        requirements: [],
        items: partial
          ? []
          : [
              {
                ref,
                coverage: "usable",
                placement: { kind: "orphaned", placementKey: "old" },
              },
            ],
        ...(partial ? { partialFailure: { code: "unavailable" } } : {}),
      } as never)
      await expect(
        prepareAccountKeyProvisioning(account, "all-groups"),
      ).rejects.toMatchObject({ failure: { code: "unavailable" } })
      expect(prepareDefault).not.toHaveBeenCalled()
    },
  )

  it("never replays an uncertain mutation", async () => {
    const { session } = setup()
    session.provisioning.provision.mockResolvedValueOnce({
      certainty: "possibly-applied",
      failure: { code: "unexpected" },
    } as never)
    const plan = await prepareAccountKeyProvisioning(account, "all-groups")
    await expect(plan.entries[0]!.create()).rejects.toBeInstanceOf(
      AccountKeyResourceError,
    )
    await expect(plan.entries[0]!.create()).rejects.toMatchObject({
      failure: { code: "mutation_state_uncertain" },
    })
    expect(session.provisioning.provision).toHaveBeenCalledOnce()
    await expect(
      prepareAccountKeyProvisioning(account, "all-groups"),
    ).rejects.toMatchObject({ failure: { code: "mutation_state_uncertain" } })
  })

  it("keeps a confirmed write guarded while inventory is eventually consistent", async () => {
    setup()
    const plan = await prepareAccountKeyProvisioning(account, "all-groups")
    await plan.entries[0]!.create()
    await expect(
      prepareAccountKeyProvisioning(account, "all-groups"),
    ).rejects.toMatchObject({ failure: { code: "unavailable" } })
  })

  it("does not create a duplicate when an active response-only key already exists", async () => {
    setup()
    inventory.mockResolvedValue([
      { status: "active", secret: null, canResolveSecret: false },
    ])
    expect(
      (await prepareAccountKeyProvisioning(account, "default")).entries,
    ).toHaveLength(0)
  })
})
