import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import ApiCredentialProfilesPopupView from "~/features/ApiCredentialProfiles/components/ApiCredentialProfilesPopupView"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import type { Tag } from "~/types"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

let store: ApiCredentialProfile[] = []

const mockListProfiles = vi.fn(async () => store)
const mockCreateProfile = vi.fn(async (input: any) => input)
const mockUpdateProfile = vi.fn(async (id: string, updates: any) => ({
  id,
  ...updates,
}))
const mockDeleteProfile = vi.fn(async (_id: string) => true)

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
const mockDeleteTag = vi.fn(async (_tagId: string) => ({ updatedAccounts: 0 }))

vi.mock(
  "~/services/apiCredentialProfiles/apiCredentialProfilesStorage",
  () => ({
    apiCredentialProfilesStorage: {
      listProfiles: () => mockListProfiles(),
      createProfile: (input: any) => mockCreateProfile(input),
      updateProfile: (id: string, updates: any) =>
        mockUpdateProfile(id, updates),
      deleteProfile: (id: string) => mockDeleteProfile(id),
    },
  }),
)

vi.mock("~/services/tags/tagStorage", () => ({
  tagStorage: {
    listTags: () => mockListTags(),
    createTag: (name: string) => mockCreateTag(name),
    renameTag: (tagId: string, name: string) => mockRenameTag(tagId, name),
    deleteTag: (tagId: string) => mockDeleteTag(tagId),
  },
}))

describe("ApiCredentialProfiles popup view", () => {
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

  it("filters profiles by search, api type, and tags", async () => {
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

    render(<ApiCredentialProfilesPopupView />)

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

    await user.click(await screen.findByRole("button", { name: /prod/i }))

    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { name: "Google" }),
      ).not.toBeInTheDocument()
    })
  })
})
