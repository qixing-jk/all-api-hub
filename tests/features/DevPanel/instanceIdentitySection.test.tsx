import { fireEvent, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useInstanceIdentityDevSection } from "~/features/DevPanel/sections/instanceIdentitySection"
import {
  buildDevIdentity,
  DEV_IDENTITY_FIXTURE_BADGE_TEXT,
  DEV_IDENTITY_FIXTURE_COLOR,
  DEV_IDENTITY_FIXTURE_PATH,
} from "~~/tests/test-utils/devIdentityFixtures"
import { render } from "~~/tests/test-utils/render"

const {
  getDevIdentityMock,
  getExtensionURLMock,
  getExtensionVersionMock,
  getManagementSelfMock,
  getRuntimeIdMock,
  toastErrorMock,
  toastSuccessMock,
} = vi.hoisted(() => ({
  getDevIdentityMock: vi.fn(),
  getExtensionURLMock: vi.fn(),
  getExtensionVersionMock: vi.fn(),
  getManagementSelfMock: vi.fn(),
  getRuntimeIdMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}))

vi.mock("~/utils/browser/extensionIdentity", () => ({
  getDevIdentity: (...args: unknown[]) => getDevIdentityMock(...args),
}))

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()

  return {
    ...actual,
    getExtensionURL: (...args: unknown[]) => getExtensionURLMock(...args),
    getExtensionVersion: (...args: unknown[]) =>
      getExtensionVersionMock(...args),
    getManagementSelf: (...args: unknown[]) => getManagementSelfMock(...args),
    getRuntimeId: (...args: unknown[]) => getRuntimeIdMock(...args),
  }
})

vi.mock("~/lib/notify", () => ({
  default: { error: toastErrorMock, success: toastSuccessMock },
}))

const BUILD_IDENTITY = buildDevIdentity()

function SectionHarness() {
  const section = useInstanceIdentityDevSection()

  return (
    <div>
      <p data-testid="section-meta">
        {[
          section.collapsible,
          section.defaultCollapsed,
          section.summary ?? "no-summary",
          section.order ?? "default-order",
        ].join("|")}
      </p>
      {section.rows?.map((row) => (
        <p key={row.id} data-testid={`row-${row.id}`}>
          {`${row.label}|${row.value ?? "unavailable"}|${row.tone ?? "none"}`}
        </p>
      ))}
      {section.actions.map((action) => (
        <button
          key={action.id}
          type="button"
          onClick={() => void action.run()}
          disabled={action.disabled}
          aria-busy={action.loading || undefined}
        >
          {action.label}
        </button>
      ))}
    </div>
  )
}

const RENDER_OPTIONS = {
  withReleaseUpdateStatusProvider: false,
  withUserPreferencesProvider: false,
  withThemeProvider: false,
} as const

async function renderHarness() {
  render(<SectionHarness />, RENDER_OPTIONS)
  await waitFor(() => expect(getManagementSelfMock).toHaveBeenCalled())
}

describe("instance identity dev section", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(globalThis.navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
    getDevIdentityMock.mockReturnValue(BUILD_IDENTITY)
    getExtensionURLMock.mockReturnValue("chrome-extension://abcdefghijkl/")
    getExtensionVersionMock.mockReturnValue("3.62.0")
    getManagementSelfMock.mockResolvedValue({ installType: "development" })
    getRuntimeIdMock.mockReturnValue("abcdefghijklmnopabcdefghijklmnop")
  })

  it("starts folded and below the actionable sections", async () => {
    await renderHarness()

    expect(screen.getByTestId("section-meta")).toHaveTextContent(
      `true|true|${BUILD_IDENTITY.pathTail}|default-order`,
    )
  })

  it("reports the baked paths and labels how far each value can be trusted", async () => {
    await renderHarness()

    expect(screen.getByTestId("row-source-path")).toHaveTextContent(
      `Source path|${DEV_IDENTITY_FIXTURE_PATH}|stable`,
    )
    expect(screen.getByTestId("row-output-path")).toHaveTextContent(
      "best-effort",
    )
    expect(screen.getByTestId("row-extension-id")).toHaveTextContent("runtime")
    expect(screen.getByTestId("row-badge-code")).toHaveTextContent(
      DEV_IDENTITY_FIXTURE_BADGE_TEXT,
    )
    expect(screen.getByTestId("row-instance-color")).toHaveTextContent(
      DEV_IDENTITY_FIXTURE_COLOR,
    )
  })

  it("reads the install type without blocking on it", async () => {
    getManagementSelfMock.mockResolvedValue({ installType: "unpacked" })

    await renderHarness()

    await waitFor(() =>
      expect(screen.getByTestId("row-install-type")).toHaveTextContent(
        "unpacked",
      ),
    )
  })

  it("survives a browser that exposes no install metadata", async () => {
    getManagementSelfMock.mockResolvedValue(null)

    await renderHarness()

    await waitFor(() =>
      expect(screen.getByTestId("row-install-type")).toHaveTextContent(
        "unavailable",
      ),
    )
  })

  it("says so when the build baked no path instead of implying one", async () => {
    getDevIdentityMock.mockReturnValue(
      buildDevIdentity({
        path: null,
        pathTail: null,
        outputPath: null,
        badgeText: "HQO",
        color: "rgb(218, 183, 78)",
        colorIndex: 1,
        source: "runtime-id",
      }),
    )

    await renderHarness()

    expect(screen.getByTestId("row-source-path")).toHaveTextContent(
      "Source path|unavailable|stable",
    )
    expect(screen.getByTestId("row-output-path")).toHaveTextContent(
      "unavailable",
    )
  })

  it("copies a JSON snapshot of the identity", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(globalThis.navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    })

    await renderHarness()
    fireEvent.click(
      screen.getByRole("button", { name: "Dev: Copy build identity JSON" }),
    )

    await waitFor(() => expect(writeText).toHaveBeenCalled())
    const payload = JSON.parse(writeText.mock.calls[0][0] as string)
    expect(payload).toMatchObject({
      path: BUILD_IDENTITY.path,
      outputPath: BUILD_IDENTITY.outputPath,
      runtimeId: "abcdefghijklmnopabcdefghijklmnop",
      installType: "development",
      version: "3.62.0",
      baseUrl: "chrome-extension://abcdefghijkl/",
    })
    expect(toastSuccessMock).toHaveBeenCalled()
  })

  it("reports a clipboard failure instead of failing silently", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("clipboard blocked"))
    Object.defineProperty(globalThis.navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    })

    await renderHarness()
    fireEvent.click(
      screen.getByRole("button", { name: "Dev: Copy build identity JSON" }),
    )

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled())
    expect(toastSuccessMock).not.toHaveBeenCalled()
  })
})
