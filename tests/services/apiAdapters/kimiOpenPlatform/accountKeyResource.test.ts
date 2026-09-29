import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { createKimiOpenPlatformKeyResources } from "~/services/apiAdapters/kimiOpenPlatform/accountKeyResource"
import { AuthTypeEnum } from "~/types"

const {
  mockFetchKimiProjects,
  mockFetchKimiKeys,
  mockCreateKimiKey,
  mockRenameKimiKey,
  mockDeleteKimiKey,
} = vi.hoisted(() => ({
  mockFetchKimiProjects: vi.fn(),
  mockFetchKimiKeys: vi.fn(),
  mockCreateKimiKey: vi.fn(),
  mockRenameKimiKey: vi.fn(),
  mockDeleteKimiKey: vi.fn(),
}))

vi.mock("~/services/apiService/kimiOpenPlatform", () => ({
  fetchKimiProjects: mockFetchKimiProjects,
  fetchKimiKeys: mockFetchKimiKeys,
  createKimiKey: mockCreateKimiKey,
  renameKimiKey: mockRenameKimiKey,
  deleteKimiKey: mockDeleteKimiKey,
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
    vi.clearAllMocks()
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
