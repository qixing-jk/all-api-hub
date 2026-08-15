import userEvent from "@testing-library/user-event"
import { expect, it, vi } from "vitest"

import { ApiCredentialProfilesDialogs } from "~/features/ApiCredentialProfiles/components/ApiCredentialProfilesDialogs"
import type { ApiCredentialProfilesController } from "~/features/ApiCredentialProfiles/hooks/useApiCredentialProfilesController"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

const { cursorPlusExportDialogMock, kelivoExportDialogMock } = vi.hoisted(
  () => ({
    cursorPlusExportDialogMock: vi.fn(),
    kelivoExportDialogMock: vi.fn(),
  }),
)

vi.mock("~/components/CursorPlusExportDialog", () => ({
  CursorPlusExportDialog: (props: unknown) => {
    cursorPlusExportDialogMock(props)
    const { onClose } = props as { onClose: () => void }
    return (
      <button type="button" onClick={onClose}>
        close Cursor++ profile export
      </button>
    )
  },
}))

vi.mock("~/components/KelivoExportDialog", () => ({
  KelivoExportDialog: (props: unknown) => {
    kelivoExportDialogMock(props)
    const { onClose } = props as { onClose: () => void }
    return (
      <button type="button" onClick={onClose}>
        close Kelivo profile export
      </button>
    )
  },
}))

vi.mock("~/components/CCSwitchExportDialog", () => ({
  CCSwitchExportDialog: () => null,
}))
vi.mock("~/components/ClaudeCodeRouterImportDialog", () => ({
  ClaudeCodeRouterImportDialog: () => null,
}))
vi.mock("~/components/CliProxyExportDialog", () => ({
  CliProxyExportDialog: () => null,
}))
vi.mock("~/components/dialogs/VerifyCliSupportDialog", () => ({
  VerifyCliSupportDialog: () => null,
}))
vi.mock(
  "~/features/ApiCredentialProfiles/components/ApiCredentialProfileDialog",
  () => ({ ApiCredentialProfileDialog: () => null }),
)
vi.mock(
  "~/features/ApiCredentialProfiles/components/KiloCodeProfileExportDialog",
  () => ({ KiloCodeProfileExportDialog: () => null }),
)
vi.mock(
  "~/features/ApiCredentialProfiles/components/VerifyApiCredentialProfileDialog",
  () => ({ VerifyApiCredentialProfileDialog: () => null }),
)
vi.mock("~/components/ui", () => ({
  DestructiveConfirmDialog: () => null,
}))

it("passes Kelivo profile analytics and clears the profile on close", async () => {
  const setKelivoProfile = vi.fn()
  const kelivoProfile = {
    id: "profile-example",
    name: "Example Provider",
    apiType: API_TYPES.OPENAI_COMPATIBLE,
    baseUrl: "https://api.example.invalid/v1",
    apiKey: "sk-example",
    tagIds: [],
    notes: "",
    createdAt: 1,
    updatedAt: 1,
  }
  const controller = {
    isEditorOpen: false,
    setIsEditorOpen: vi.fn(),
    editingProfile: null,
    addPrefill: null,
    tags: [],
    createTag: vi.fn(),
    renameTag: vi.fn(),
    deleteTag: vi.fn(),
    handleSave: vi.fn(),
    verifyingProfile: null,
    setVerifyingProfile: vi.fn(),
    cliVerifyingProfile: null,
    ccSwitchProfile: null,
    kiloCodeProfile: null,
    kelivoProfile,
    setKelivoProfile,
    cliProxyProfile: null,
    claudeCodeRouterProfile: null,
    deletingProfile: null,
  } as unknown as ApiCredentialProfilesController

  const user = userEvent.setup()
  render(<ApiCredentialProfilesDialogs controller={controller} />)

  await waitFor(() => {
    expect(kelivoExportDialogMock).toHaveBeenCalledWith({
      isOpen: true,
      onClose: expect.any(Function),
      initialValue: kelivoProfile,
      analyticsContext: {
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ApiCredentialProfiles,
        actionId:
          PRODUCT_ANALYTICS_ACTION_IDS.CopyApiCredentialProfileKelivoImportCode,
        surfaceId:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsApiCredentialProfilesRowActions,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      },
    })
  })

  await user.click(
    screen.getByRole("button", { name: "close Kelivo profile export" }),
  )
  expect(setKelivoProfile).toHaveBeenCalledWith(null)
})

it("adapts a profile for Cursor++ export and clears it on close", async () => {
  const setCursorPlusProfile = vi.fn()
  const cursorPlusProfile = {
    id: "profile-example",
    name: "Example Provider",
    apiType: API_TYPES.OPENAI_COMPATIBLE,
    baseUrl: "https://api.example.invalid/v1",
    apiKey: "sk-example",
    tagIds: [],
    notes: "",
    createdAt: 1,
    updatedAt: 1,
  }
  const controller = {
    isEditorOpen: false,
    setIsEditorOpen: vi.fn(),
    editingProfile: null,
    addPrefill: null,
    tags: [],
    createTag: vi.fn(),
    renameTag: vi.fn(),
    deleteTag: vi.fn(),
    handleSave: vi.fn(),
    verifyingProfile: null,
    setVerifyingProfile: vi.fn(),
    cliVerifyingProfile: null,
    ccSwitchProfile: null,
    cursorPlusProfile,
    setCursorPlusProfile,
    kiloCodeProfile: null,
    kelivoProfile: null,
    cliProxyProfile: null,
    claudeCodeRouterProfile: null,
    deletingProfile: null,
  } as unknown as ApiCredentialProfilesController

  const user = userEvent.setup()
  render(<ApiCredentialProfilesDialogs controller={controller} />)

  await waitFor(() => {
    expect(cursorPlusExportDialogMock).toHaveBeenCalledWith({
      isOpen: true,
      onClose: expect.any(Function),
      account: expect.objectContaining({
        name: cursorPlusProfile.name,
        baseUrl: cursorPlusProfile.baseUrl,
      }),
      runtimeKey: expect.objectContaining({
        label: cursorPlusProfile.name,
        secret: cursorPlusProfile.apiKey,
        baseUrl: cursorPlusProfile.baseUrl,
      }),
      analyticsContext: {
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ApiCredentialProfiles,
        actionId:
          PRODUCT_ANALYTICS_ACTION_IDS.CopyApiCredentialProfileCursorPlusProviderConfig,
        surfaceId:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsApiCredentialProfilesRowActions,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      },
    })
  })

  await user.click(
    screen.getByRole("button", { name: "close Cursor++ profile export" }),
  )
  expect(setCursorPlusProfile).toHaveBeenCalledWith(null)
})
