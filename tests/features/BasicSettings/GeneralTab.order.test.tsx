import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import GeneralTab from "~/features/BasicSettings/components/tabs/General/GeneralTab"

vi.mock(
  "~/features/BasicSettings/components/tabs/General/DisplaySettings",
  () => ({
    default: () => <section data-testid="display-settings" />,
  }),
)

vi.mock(
  "~/features/BasicSettings/components/tabs/General/AppearanceSettings",
  () => ({
    default: () => <section data-testid="appearance-settings" />,
  }),
)

vi.mock(
  "~/features/BasicSettings/components/tabs/General/ActionClickBehaviorSettings",
  () => ({
    default: () => <section data-testid="action-click-settings" />,
  }),
)

vi.mock(
  "~/features/BasicSettings/components/tabs/General/TaskNotificationSettings",
  () => ({
    default: () => <section data-testid="task-notification-settings" />,
  }),
)

vi.mock(
  "~/features/BasicSettings/components/tabs/General/SiteAnnouncementNotificationSettings",
  () => ({
    default: () => <section data-testid="site-announcement-settings" />,
  }),
)

vi.mock(
  "~/features/BasicSettings/components/tabs/General/ChangelogOnUpdateSettings",
  () => ({
    default: () => <section data-testid="changelog-settings" />,
  }),
)

vi.mock(
  "~/features/BasicSettings/components/tabs/General/LoggingSettings",
  () => ({
    default: () => <section data-testid="logging-settings" />,
  }),
)

vi.mock(
  "~/features/BasicSettings/components/tabs/General/ResetSettingsSection",
  () => ({
    default: () => <section data-testid="reset-settings" />,
  }),
)

describe("GeneralTab", () => {
  it("orders common settings before maintenance, diagnostics, and reset actions", () => {
    render(<GeneralTab />)

    const sectionTestIds = [
      "display-settings",
      "appearance-settings",
      "action-click-settings",
      "task-notification-settings",
      "site-announcement-settings",
      "changelog-settings",
      "logging-settings",
      "reset-settings",
    ]

    const sections = sectionTestIds.map((testId) => screen.getByTestId(testId))

    for (let index = 0; index < sections.length - 1; index += 1) {
      expect(
        sections[index].compareDocumentPosition(sections[index + 1]) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
    }
  })
})
