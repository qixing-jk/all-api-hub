import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import NotificationsTab from "~/features/BasicSettings/components/tabs/Notifications/NotificationsTab"

vi.mock(
  "~/features/BasicSettings/components/tabs/Notifications/TaskNotificationSettings",
  () => ({
    default: () => <section data-testid="task-notification-settings" />,
  }),
)

describe("NotificationsTab", () => {
  it("renders task notification settings without site announcement polling settings", () => {
    render(<NotificationsTab />)

    expect(screen.getByTestId("task-notification-settings")).toBeInTheDocument()
    expect(
      screen.queryByTestId("site-announcement-settings"),
    ).not.toBeInTheDocument()
  })
})
