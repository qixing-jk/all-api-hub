import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import ApiCredentialProfiles from "~/entrypoints/options/pages/ApiCredentialProfiles"
import { API_TYPES } from "~/services/aiApiVerification"
import { render, screen, waitFor, within } from "~/tests/test-utils/render"
import type { Tag } from "~/types"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"
import {
  normalizeGoogleFamilyBaseUrl,
  normalizeOpenAiFamilyBaseUrl,
} from "~/utils/webAiApiCheck"

let store: ApiCredentialProfile[] = []

const mockListProfiles = vi.fn(async () => store)
const mockListTags = vi.fn(async (): Promise<Tag[]> => [])
const mockCreateTag = vi.fn(async (name: string) => ({
  id: `t-${name}`,
  name,
  createdAt: 0,
  updatedAt: 0,
}))
const mockRenameTag = vi.fn(async (tagId: string, name: string) => ({
  id: tagId,
  name,
  createdAt: 0,
  updatedAt: 0,
}))
const mockDeleteTag = vi.fn(async (tagId: string) => {
  void tagId
  return { updatedAccounts: 0 }
})
const mockCreateProfile = vi.fn(
  async (input: {
    name: string
    apiType: string
    baseUrl: string
    apiKey: string
    tagIds?: string[]
    notes?: string
  }) => {
    const normalizedBaseUrl =
      input.apiType === API_TYPES.GOOGLE
        ? normalizeGoogleFamilyBaseUrl(input.baseUrl) ?? input.baseUrl
        : normalizeOpenAiFamilyBaseUrl(input.baseUrl) ?? input.baseUrl

    const now = Date.now()
    const profile: ApiCredentialProfile = {
      id: `p-${store.length + 1}`,
      name: input.name,
      apiType: input.apiType as any,
      baseUrl: normalizedBaseUrl,
      apiKey: input.apiKey,
      tagIds: input.tagIds ?? [],
      notes: input.notes ?? "",
      createdAt: now,
      updatedAt: now,
    }

    store = [...store, profile]
    return profile
  },
)

const mockUpdateProfile = vi.fn(
  async (id: string, updates: Partial<ApiCredentialProfile>) => {
    const next = store.map((p) => (p.id === id ? { ...p, ...updates } : p))
    store = next
    const updated = next.find((p) => p.id === id)
    if (!updated) throw new Error("not found")
    return updated
  },
)

const mockDeleteProfile = vi.fn(async (id: string) => {
  const before = store.length
  store = store.filter((p) => p.id !== id)
  return store.length !== before
})

vi.mock("~/services/apiCredentialProfilesStorage", () => ({
  apiCredentialProfilesStorage: {
    listProfiles: () => mockListProfiles(),
    createProfile: (input: any) => mockCreateProfile(input),
    updateProfile: (id: string, updates: Partial<ApiCredentialProfile>) =>
      mockUpdateProfile(id, updates),
    deleteProfile: (id: string) => mockDeleteProfile(id),
  },
}))

vi.mock("~/services/accountTags/tagStorage", () => ({
  tagStorage: {
    listTags: () => mockListTags(),
    createTag: (name: string) => mockCreateTag(name),
    renameTag: (tagId: string, name: string) => mockRenameTag(tagId, name),
    deleteTag: (tagId: string) => mockDeleteTag(tagId),
  },
}))

describe("ApiCredentialProfiles page", () => {
  beforeEach(() => {
    store = []
    mockListProfiles.mockClear()
    mockCreateProfile.mockClear()
    mockUpdateProfile.mockClear()
    mockDeleteProfile.mockClear()
    mockListTags.mockClear()
    mockCreateTag.mockClear()
    mockRenameTag.mockClear()
    mockDeleteTag.mockClear()
  })

  it("creates a profile via the add dialog and renders it", async () => {
    const user = userEvent.setup()

    render(<ApiCredentialProfiles />)

    expect(
      await screen.findByText("apiCredentialProfiles:empty.title"),
    ).toBeInTheDocument()

    const addButtons = screen.getAllByRole("button", {
      name: "apiCredentialProfiles:actions.add",
    })
    await user.click(addButtons[0]!)

    expect(
      await screen.findByText("apiCredentialProfiles:dialog.addTitle"),
    ).toBeInTheDocument()

    await user.type(
      screen.getByPlaceholderText(
        "apiCredentialProfiles:dialog.placeholders.name",
      ),
      "My Profile",
    )
    await user.type(
      screen.getByPlaceholderText(
        "apiCredentialProfiles:dialog.placeholders.baseUrl",
      ),
      "https://example.com/v1/models",
    )
    await user.type(
      screen.getByPlaceholderText(
        "apiCredentialProfiles:dialog.placeholders.apiKey",
      ),
      "sk-test",
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.save" }),
    )

    await waitFor(() => {
      expect(mockCreateProfile).toHaveBeenCalledTimes(1)
    })

    expect(await screen.findByText("My Profile")).toBeInTheDocument()
    expect(await screen.findByText("https://example.com")).toBeInTheDocument()
  })

  it("edits an existing profile", async () => {
    const user = userEvent.setup()

    store = [
      {
        id: "p-1",
        name: "Original",
        apiType: API_TYPES.OPENAI_COMPATIBLE,
        baseUrl: "https://example.com",
        apiKey: "sk-test",
        tagIds: [],
        notes: "",
        createdAt: 1,
        updatedAt: 1,
      },
    ]

    render(<ApiCredentialProfiles />)

    expect(await screen.findByText("Original")).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", { name: "common:actions.edit" }),
    )

    expect(
      await screen.findByText("apiCredentialProfiles:dialog.editTitle"),
    ).toBeInTheDocument()

    const nameInput = screen.getByPlaceholderText(
      "apiCredentialProfiles:dialog.placeholders.name",
    )
    await user.clear(nameInput)
    await user.type(nameInput, "Updated")

    await user.click(
      screen.getByRole("button", { name: "common:actions.save" }),
    )

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledTimes(1)
    })

    expect(await screen.findByText("Updated")).toBeInTheDocument()
  })

  it("deletes a profile via confirmation dialog", async () => {
    const user = userEvent.setup()

    store = [
      {
        id: "p-1",
        name: "To Delete",
        apiType: API_TYPES.OPENAI,
        baseUrl: "https://example.com",
        apiKey: "sk-test",
        tagIds: [],
        notes: "",
        createdAt: 1,
        updatedAt: 1,
      },
    ]

    render(<ApiCredentialProfiles />)

    expect(await screen.findByText("To Delete")).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", { name: "common:actions.delete" }),
    )

    expect(
      await screen.findByText("apiCredentialProfiles:delete.title"),
    ).toBeInTheDocument()

    const dialog = await screen.findByRole("dialog")
    await user.click(
      within(dialog).getByRole("button", { name: "common:actions.delete" }),
    )

    await waitFor(() => {
      expect(mockDeleteProfile).toHaveBeenCalledTimes(1)
    })

    expect(
      await screen.findByText("apiCredentialProfiles:empty.title"),
    ).toBeInTheDocument()
  })

  it("filters profiles by search and apiType", async () => {
    const user = userEvent.setup()

    mockListTags.mockResolvedValue([
      { id: "t-prod", name: "prod", createdAt: 1, updatedAt: 1 },
      { id: "t-dev", name: "dev", createdAt: 1, updatedAt: 1 },
    ])

    store = [
      {
        id: "p-1",
        name: "OpenAI",
        apiType: API_TYPES.OPENAI,
        baseUrl: "https://openai.example.com",
        apiKey: "sk-openai",
        tagIds: ["t-prod"],
        notes: "",
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: "p-2",
        name: "Google",
        apiType: API_TYPES.GOOGLE,
        baseUrl: "https://google.example.com",
        apiKey: "AIza-test",
        tagIds: ["t-dev"],
        notes: "",
        createdAt: 1,
        updatedAt: 1,
      },
    ]

    render(<ApiCredentialProfiles />)

    expect(
      await screen.findByRole("heading", { name: "OpenAI" }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole("heading", { name: "Google" }),
    ).toBeInTheDocument()

    await user.type(
      screen.getByPlaceholderText(
        "apiCredentialProfiles:controls.searchPlaceholder",
      ),
      "goog",
    )

    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { name: "OpenAI" }),
      ).not.toBeInTheDocument()
      expect(
        screen.getByRole("heading", { name: "Google" }),
      ).toBeInTheDocument()
    })

    await user.clear(
      screen.getByPlaceholderText(
        "apiCredentialProfiles:controls.searchPlaceholder",
      ),
    )

    const filter = screen.getAllByRole("combobox")[0]!
    await user.click(filter)
    await user.click(
      await screen.findByRole("option", {
        name: "aiApiVerification:verifyDialog.apiTypes.google",
      }),
    )

    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { name: "OpenAI" }),
      ).not.toBeInTheDocument()
      expect(
        screen.getByRole("heading", { name: "Google" }),
      ).toBeInTheDocument()
    })
  })

  it("opens export dialogs from the per-profile export menu", async () => {
    const user = userEvent.setup()

    store = [
      {
        id: "p-1",
        name: "Exportable",
        apiType: API_TYPES.OPENAI_COMPATIBLE,
        baseUrl: "https://example.com",
        apiKey: "sk-test",
        tagIds: [],
        notes: "",
        createdAt: 1,
        updatedAt: 1,
      },
    ]

    render(<ApiCredentialProfiles />)

    expect(await screen.findByText("Exportable")).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", { name: "common:actions.export" }),
    )

    await user.click(
      screen.getByRole("menuitem", {
        name: /keyManagement:actions\.exportToCCSwitch/i,
      }),
    )

    expect(
      await screen.findByText("ui:dialog.ccswitch.description"),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", { name: "common:actions.cancel" }),
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.export" }),
    )

    await user.click(
      screen.getByRole("menuitem", {
        name: /keyManagement:actions\.exportToKiloCode/i,
      }),
    )

    expect(
      await screen.findByText("ui:dialog.kiloCode.title"),
    ).toBeInTheDocument()
  })

  it("filters profiles by tags", async () => {
    const user = userEvent.setup()

    mockListTags.mockResolvedValue([
      { id: "t-prod", name: "prod", createdAt: 1, updatedAt: 1 },
      { id: "t-dev", name: "dev", createdAt: 1, updatedAt: 1 },
    ])

    store = [
      {
        id: "p-1",
        name: "OpenAI",
        apiType: API_TYPES.OPENAI,
        baseUrl: "https://openai.example.com",
        apiKey: "sk-openai",
        tagIds: ["t-prod"],
        notes: "",
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: "p-2",
        name: "Google",
        apiType: API_TYPES.GOOGLE,
        baseUrl: "https://google.example.com",
        apiKey: "AIza-test",
        tagIds: ["t-dev"],
        notes: "",
        createdAt: 1,
        updatedAt: 1,
      },
    ]

    render(<ApiCredentialProfiles />)

    expect(
      await screen.findByRole("heading", { name: "OpenAI" }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole("heading", { name: "Google" }),
    ).toBeInTheDocument()

    await user.click(await screen.findByRole("button", { name: /prod/i }))

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "OpenAI" }),
      ).toBeInTheDocument()
      expect(
        screen.queryByRole("heading", { name: "Google" }),
      ).not.toBeInTheDocument()
    })
  })
})
