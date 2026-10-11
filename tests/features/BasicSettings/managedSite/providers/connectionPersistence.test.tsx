import userEvent from "@testing-library/user-event"
import { afterEach, expect, it, vi } from "vitest"

import AxonHubSettings from "~/features/BasicSettings/components/tabs/ManagedSite/providers/AxonHubSettings"
import ClaudeCodeHubSettings from "~/features/BasicSettings/components/tabs/ManagedSite/providers/ClaudeCodeHubSettings"
import CliProxyApiSettings from "~/features/BasicSettings/components/tabs/ManagedSite/providers/CliProxyApiSettings"
import NewApiSettings from "~/features/BasicSettings/components/tabs/ManagedSite/providers/NewApiSettings"
import OctopusSettings from "~/features/BasicSettings/components/tabs/ManagedSite/providers/OctopusSettings"
import Sub2ApiSettings from "~/features/BasicSettings/components/tabs/ManagedSite/providers/Sub2ApiSettings"
import toast from "~/lib/notify"
import * as axon from "~/services/apiService/axonHub/authSession"
import * as claude from "~/services/apiService/claudeCodeHub"
import * as cli from "~/services/apiService/cliProxyApi"
import * as octopus from "~/services/apiService/octopus/channels"
import * as sub2 from "~/services/managedSites/providers/sub2api"
import { userPreferences } from "~/services/preferences/userPreferences"
import { createDeferred } from "~~/tests/test-utils/deferred"
import { act, render, screen, waitFor } from "~~/tests/test-utils/render"

vi.mock("~/lib/notify", () => ({
  default: {
    loading: vi.fn(),
    dismiss: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}))
const { openVerification } = vi.hoisted(() => ({ openVerification: vi.fn() }))
vi.mock(
  "~/features/ManagedSiteVerification/useNewApiManagedVerification",
  () => ({
    useNewApiManagedVerification: () => ({
      dialogState: { isOpen: false, isBusy: false },
      openNewApiManagedVerification: openVerification,
    }),
  }),
)
vi.mock(
  "~/features/ManagedSiteVerification/NewApiManagedVerificationDialog",
  () => ({ NewApiManagedVerificationDialog: () => null }),
)
afterEach(() => vi.restoreAllMocks())

it.each([
  {
    name: "New API",
    key: "newApi" as const,
    Component: NewApiSettings,
    config: {
      adminToken: "",
      userId: "1",
      username: "admin",
      password: "secret",
      totpSecret: "",
    },
    spy: () => openVerification.mockClear(),
  },

  {
    name: "AxonHub",
    key: "axonHub" as const,
    Component: AxonHubSettings,
    config: { email: "admin@example.invalid", password: " secret " },
    spy: () =>
      vi.spyOn(axon, "signIn").mockResolvedValue("synthetic-session-token"),
  },
  {
    name: "Claude Code Hub",
    key: "claudeCodeHub" as const,
    Component: ClaudeCodeHubSettings,
    config: { adminToken: "secret" },
    spy: () =>
      vi.spyOn(claude, "validateClaudeCodeHubConfig").mockResolvedValue(true),
  },
  {
    name: "CLIProxyAPI",
    key: "cliProxyApi" as const,
    Component: CliProxyApiSettings,
    config: { adminToken: "secret" },
    spy: () =>
      vi.spyOn(cli, "listAllCliProxyApiProviders").mockResolvedValue([]),
  },
  {
    name: "Octopus",
    key: "octopus" as const,
    Component: OctopusSettings,
    config: { username: "admin", password: "secret" },
    spy: () =>
      vi
        .spyOn(octopus, "validateOctopusConfig")
        .mockResolvedValue({ success: true }),
  },
  {
    name: "Sub2API",
    key: "sub2apiManagedSite" as const,
    Component: Sub2ApiSettings,
    config: { adminToken: "secret" },
    spy: () =>
      vi
        .spyOn(sub2, "validateSub2ApiManagedSiteConfig")
        .mockResolvedValue(undefined),
  },
])(
  "$name persists before checking and disables edits while saving",
  async ({ key, Component, config, spy }) => {
    await userPreferences.savePreferences({
      [key]: { baseUrl: "https://old.example.invalid", ...config },
    })
    const pending = createDeferred<void>()
    const original =
      userPreferences.savePreferencesWithResult.bind(userPreferences)
    const save = vi
      .spyOn(userPreferences, "savePreferencesWithResult")
      .mockImplementation(async (...args) => {
        const value = args[0][key]
        if (value?.baseUrl === "https://new.example.invalid")
          await pending.promise
        return original(...args)
      })
    const validate = spy()
    const user = userEvent.setup()
    const { container } = render(<Component />)
    const url = await screen.findByDisplayValue("https://old.example.invalid")
    await user.clear(url)
    await user.type(url, "https://new.example.invalid")
    await user.tab()
    await waitFor(() => expect(save).toHaveBeenCalled())
    // Blur saves configuration, including for CLIProxyAPI; checking is explicit.
    expect(validate).not.toHaveBeenCalled()
    await user.click(
      await screen.findByRole("button", {
        name: "settings:managedSiteConnection.check",
      }),
    )
    try {
      expect(validate).not.toHaveBeenCalled()
      expect(
        await screen.findByRole("button", {
          name: "settings:managedSiteConnection.saving",
        }),
      ).toBeDisabled()
      for (const input of container.querySelectorAll("input"))
        expect(input).toBeDisabled()
    } finally {
      await act(async () => pending.resolve())
    }
    await waitFor(() => expect(validate).toHaveBeenCalledTimes(1))
    expect(await userPreferences.getPreferences()).toMatchObject({
      [key]: { baseUrl: "https://new.example.invalid", ...config },
    })
    if (key === "newApi") {
      expect(validate).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "settings",
          config: expect.objectContaining({
            baseUrl: "https://new.example.invalid",
          }),
        }),
      )
      return
    }
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "settings:managedSiteConnection.success",
        expect.objectContaining({ id: expect.any(String) }),
      ),
    )
  },
)
