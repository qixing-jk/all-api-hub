import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  ensureAccountKey,
  prepareDefaultAccountKeyCreation,
} from "~/services/accounts/keys/accountKeyCreation"
import { DEFAULT_AUTO_PROVISION_KEY_NAME } from "~/services/accounts/keys/accountKeyNames"
import { createKimiOpenPlatformKeyResources } from "~/services/apiAdapters/kimiOpenPlatform/accountKeyResource"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { AuthTypeEnum } from "~/types"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"

const {
  mockFetchKimiProjects,
  mockFetchKimiKeys,
  mockCreateKimiKey,
  mockRenameKimiKey,
  mockDeleteKimiKey,
  mockAccountContext,
  mockRuntimeKeys,
} = vi.hoisted(() => ({
  mockFetchKimiProjects: vi.fn(),
  mockFetchKimiKeys: vi.fn(),
  mockCreateKimiKey: vi.fn(),
  mockRenameKimiKey: vi.fn(),
  mockDeleteKimiKey: vi.fn(),
  mockAccountContext: vi.fn(),
  mockRuntimeKeys: vi.fn(),
}))

vi.mock("~/services/accounts/utils/apiServiceRequest", () => ({
  createDisplayAccountApiContext: mockAccountContext,
  fetchDisplayAccountRuntimeKeys: mockRuntimeKeys,
}))

vi.mock("~/services/apiService/kimiOpenPlatform", () => ({
  fetchKimiProjects: mockFetchKimiProjects,
  fetchKimiKeys: mockFetchKimiKeys,
  createKimiKey: mockCreateKimiKey,
  renameKimiKey: mockRenameKimiKey,
  deleteKimiKey: mockDeleteKimiKey,
}))

vi.mock("~/services/apiService/kimiOpenPlatform/transport", () => ({
  ensureKimiAuthState: vi.fn(),
}))

const openInput = {
  account: {
    id: "kimi-acc",
    name: "Kimi Account",
    siteType: SITE_TYPES.KIMI_GLOBAL,
  },
  request: {
    accountId: "kimi-acc",
    baseUrl: "https://platform.kimi.ai",
    auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
  },
}

describe("kimiOpenPlatformKeyResources", () => {
  const capability = createKimiOpenPlatformKeyResources(SITE_TYPES.KIMI_GLOBAL)

  beforeEach(() => {
    vi.resetAllMocks()
  })

  it.each(["", "   ", "a".repeat(33)])(
    "rejects invalid names before key creation %j",
    async (name) => {
      mockFetchKimiProjects.mockResolvedValue([
        { id: "proj-1", name: "Project" },
      ])
      const session = await capability.open(openInput)
      const editor = await session.openCreateEditor("proj-1")
      expect(editor.validate({ name })).toMatchObject({ valid: false })
      await expect(editor.submit({ name })).rejects.toThrow()
      expect(mockCreateKimiKey).not.toHaveBeenCalled()
    },
  )

  it("retains unchanged names without sending a rename", async () => {
    mockFetchKimiProjects.mockResolvedValue([{ id: "proj-1", name: "Project" }])
    mockFetchKimiKeys.mockResolvedValue([
      { key: "ak", auth: "sk-masked…", name: "Name", project_id: "proj-1" },
    ])
    const session = await capability.open(openInput)
    const collection = await session.openCollection("proj-1")
    const editor = await collection.openEditEditor({
      accountId: openInput.account.id,
      siteType: SITE_TYPES.KIMI_GLOBAL,
      scopeKey: "proj-1",
      resourceId: "ak",
    })
    await expect(editor.submit({ name: " Name " })).resolves.toMatchObject({
      facts: { displayName: "Name" },
    })
    expect(mockRenameKimiKey).not.toHaveBeenCalled()
  })

  it("falls back to the first project and refuses default creation without any project", async () => {
    mockFetchKimiProjects.mockResolvedValueOnce([
      { id: "first", name: "First" },
      { id: "second", name: "Second" },
    ])
    const session = await capability.open(openInput)
    await expect(session.resolveDefaultScope()).resolves.toMatchObject({
      scopeKey: "first",
    })
    mockFetchKimiProjects.mockResolvedValueOnce([])
    const emptySession = await capability.open(openInput)
    await expect(emptySession.resolveDefaultScope()).rejects.toThrow()
    expect(mockCreateKimiKey).not.toHaveBeenCalled()
  })

  it("lists keys without inventing a creation timestamp when the console omits it", async () => {
    mockFetchKimiProjects.mockResolvedValueOnce([
      { id: "proj-1", name: "Project" },
    ])
    mockFetchKimiKeys.mockResolvedValueOnce([
      { key: "ak", auth: "masked…", name: "Name", project_id: "proj-1" },
    ])
    const session = await capability.open(openInput)
    const collection = await session.openCollection("proj-1")
    const page = await collection.list()
    expect(page.items).toHaveLength(1)
    expect(page.items[0]?.runtimeKey).not.toHaveProperty("createdAt")
  })

  it("uses safe key identifiers and project metadata for unnamed inventory entries", async () => {
    mockFetchKimiProjects.mockResolvedValue([{ id: "proj-1", name: "Project" }])
    mockFetchKimiKeys.mockResolvedValue([
      {
        key: "ak",
        auth: "sk-plaintext",
        name: "",
        project_id: "proj-1",
        created_at: "not-a-date",
      },
      { key: "other", auth: "masked…", name: "Other", project_id: "different" },
    ])
    const session = await capability.open(openInput)
    const collection = await session.openCollection("proj-1")
    const page = await collection.list()
    expect(page.items).toHaveLength(1)
    expect(page.items[0]).toMatchObject({
      displayName: "ak",
      maskedLabel: "ak",
      runtimeKey: { createdAt: undefined },
      fields: expect.arrayContaining([
        expect.objectContaining({ fieldId: "project", value: "proj-1" }),
      ]),
    })
  })

  it("uses the shared authentication failure classification", async () => {
    mockFetchKimiProjects.mockRejectedValueOnce(
      new ApiError("expired", 401, "listProjects", API_ERROR_CODES.HTTP_401),
    )
    const session = await capability.open(openInput)
    await expect(session.listScopes()).rejects.toMatchObject({
      failure: { code: "authentication_failed" },
    })
  })

  it("reports an overlong name as a field validation issue before sending a mutation", async () => {
    mockFetchKimiProjects.mockResolvedValueOnce([
      { id: "proj-1", name: "Default Project", is_default: true },
    ])
    const session = await capability.open(openInput)
    const editor = await session.openCreateEditor("proj-1")
    expect(editor.validate({ name: "a".repeat(33) })).toMatchObject({
      valid: false,
      issues: [{ fieldId: "name", code: "out_of_range" }],
    })
    expect(editor.validate({ name: "a".repeat(32) })).toEqual({ valid: true })
    expect(mockCreateKimiKey).not.toHaveBeenCalled()
  })

  it("classifies an absent key as not_found for interrupted deletion recovery", async () => {
    mockFetchKimiProjects.mockResolvedValueOnce([
      { id: "proj-1", name: "Default Project", is_default: true },
    ])
    mockFetchKimiKeys.mockResolvedValueOnce([])
    const session = await capability.open(openInput)
    const collection = await session.openCollection("proj-1")
    await expect(
      collection.get({
        accountId: openInput.account.id,
        siteType: openInput.account.siteType,
        scopeKey: "proj-1",
        resourceId: "gone",
      }),
    ).rejects.toMatchObject({ failure: { code: "not_found" } })
  })

  it.each([SITE_TYPES.KIMI, SITE_TYPES.KIMI_GLOBAL])(
    "creates a default %s key in the designated project and retains its one-time secret",
    async (siteType) => {
      const owner = buildDisplaySiteData({
        ...openInput.account,
        siteType,
        baseUrl:
          siteType === SITE_TYPES.KIMI
            ? "https://platform.kimi.com"
            : "https://platform.kimi.ai",
      })
      mockAccountContext.mockReturnValue({
        accountKeyResources: createKimiOpenPlatformKeyResources(siteType),
        request: { ...openInput.request, baseUrl: owner.baseUrl },
      })
      mockFetchKimiProjects.mockResolvedValueOnce([
        { id: "other", name: "Other project" },
        { id: "default", name: "Default project", is_default: true },
      ])
      mockCreateKimiKey.mockResolvedValueOnce({
        key: "ak-default",
        auth: "sk-created-secret",
        name: DEFAULT_AUTO_PROVISION_KEY_NAME,
        project_id: "default",
      })
      const plan = await prepareDefaultAccountKeyCreation(owner)
      expect(plan.kind).toBe("ready")
      if (plan.kind !== "ready") throw new Error("Expected default creation")
      const result = await plan.create()
      expect(mockCreateKimiKey).toHaveBeenCalledWith(
        expect.objectContaining({ baseUrl: owner.baseUrl }),
        "default",
        DEFAULT_AUTO_PROVISION_KEY_NAME,
      )
      expect(result.createdSecret?.secret).toBe("sk-created-secret")
      expect(result.createdSecret?.secretAvailability).toBe(
        "create-response-only",
      )
      expect(result.ref?.scopeKey).toBe("default")
    },
  )

  it("requires foreground handling instead of losing a background-created secret", async () => {
    const owner = buildDisplaySiteData({
      ...openInput.account,
      id: "kimi-background",
    })
    mockAccountContext.mockReturnValue({
      accountKeyResources: capability,
      request: openInput.request,
    })
    mockRuntimeKeys.mockResolvedValueOnce([])
    await expect(ensureAccountKey(owner)).resolves.toEqual({
      kind: "input-required",
      reason: "one-time-secret",
    })
    expect(mockCreateKimiKey).not.toHaveBeenCalled()
  })

  it("lists scopes and keys across projects, marking masked secrets", async () => {
    mockFetchKimiProjects.mockResolvedValueOnce([
      { id: "proj-1", name: "Default Project", is_default: true },
    ])
    mockFetchKimiKeys.mockResolvedValueOnce([
      {
        key: "ak-123",
        auth: "sk-abc...xyz",
        name: "Test Key",
        project_id: "proj-1",
        project_name: "Default Project",
        created_at: "2026-09-29T10:00:00Z",
      },
    ])

    const session = await capability.open(openInput)
    const scopes = await session.listScopes()
    expect(scopes.length).toBe(1)
    expect(scopes[0]?.scopeKey).toBe("proj-1")

    const collection = await session.openCollection("proj-1")
    const page = await collection.list()

    expect(page.items.length).toBe(1)
    expect(page.items[0]?.ref.resourceId).toBe("ak-123")
    expect(page.items[0]?.displayName).toBe("Test Key")
    expect(page.items[0]?.maskedLabel).toBe("sk-abc...xyz")
  })

  it("creates a key in the project and returns the unmasked secret", async () => {
    mockFetchKimiProjects.mockResolvedValueOnce([
      { id: "proj-1", name: "Default Project", is_default: true },
    ])
    mockCreateKimiKey.mockResolvedValueOnce({
      key: "ak-456",
      auth: "sk-plaintext-secret-1234567890",
      name: "New Key",
      project_id: "proj-1",
    })

    const session = await capability.open(openInput)
    const editor = await session.openCreateEditor("proj-1")
    const result = await editor.submit({ name: "New Key" })

    expect(result.facts?.ref.resourceId).toBe("ak-456")
    expect(result.facts?.displayName).toBe("New Key")
    expect(result.createdSecret?.secret).toBe("sk-plaintext-secret-1234567890")
    expect(result.createdSecret?.credential.baseUrl).toBe(
      "https://api.moonshot.ai/v1",
    )
  })

  it("renames an existing key", async () => {
    mockFetchKimiProjects.mockResolvedValueOnce([
      { id: "proj-1", name: "Default Project", is_default: true },
    ])
    mockFetchKimiKeys.mockResolvedValue([
      {
        key: "ak-123",
        auth: "sk-abc...xyz",
        name: "Old Name",
        project_id: "proj-1",
      },
    ])
    mockRenameKimiKey.mockResolvedValueOnce(undefined)

    const session = await capability.open(openInput)
    const collection = await session.openCollection("proj-1")
    const ref = {
      accountId: "kimi-acc",
      siteType: SITE_TYPES.KIMI_GLOBAL,
      scopeKey: "proj-1",
      resourceId: "ak-123",
    }
    const editor = await collection.openEditEditor(ref)
    const result = await editor.submit({ name: "Renamed Key" })

    expect(result.facts?.displayName).toBe("Renamed Key")
    expect(mockRenameKimiKey).toHaveBeenCalledWith(
      openInput.request,
      "proj-1",
      "ak-123",
      "Renamed Key",
    )
  })

  it("deletes an existing key", async () => {
    mockFetchKimiProjects.mockResolvedValueOnce([
      { id: "proj-1", name: "Default Project", is_default: true },
    ])
    mockDeleteKimiKey.mockResolvedValueOnce(undefined)

    const session = await capability.open(openInput)
    const collection = await session.openCollection("proj-1")
    const ref = {
      accountId: "kimi-acc",
      siteType: SITE_TYPES.KIMI_GLOBAL,
      scopeKey: "proj-1",
      resourceId: "ak-123",
    }
    await collection.delete(ref)

    expect(mockDeleteKimiKey).toHaveBeenCalledWith(
      openInput.request,
      "proj-1",
      "ak-123",
    )
  })

  it("marks runtime key resolution as unavailable", async () => {
    mockFetchKimiProjects.mockResolvedValueOnce([
      { id: "proj-1", name: "Default Project", is_default: true },
    ])
    const session = await capability.open(openInput)
    const ref = {
      accountId: "kimi-acc",
      siteType: SITE_TYPES.KIMI_GLOBAL,
      scopeKey: "proj-1",
      resourceId: "ak-123",
    }
    const resolution = await session.runtimeKey?.resolve(ref)
    expect(resolution?.kind).toBe("unavailable")
  })
})
