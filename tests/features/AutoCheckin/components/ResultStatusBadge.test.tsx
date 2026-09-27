import { describe, expect, it } from "vitest"

import ResultStatusBadge from "~/features/AutoCheckin/components/ResultStatusBadge"
import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"
import { render, screen } from "~~/tests/test-utils/render"

describe("check-in result semantics", () => {
  it.each([
    [CHECKIN_RESULT_STATUS.SUCCESS, "success", "bg-success-soft"],
    [
      CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
      "alreadyChecked",
      "bg-success-soft",
    ],
    [CHECKIN_RESULT_STATUS.SKIPPED, "skipped", "bg-muted"],
    [CHECKIN_RESULT_STATUS.UNCERTAIN, "uncertain", "bg-warning-soft"],
    [CHECKIN_RESULT_STATUS.FAILED, "failed", "bg-destructive-soft"],
  ] as const)(
    "distinguishes %s from errors and attention states",
    (status, label, surface) => {
      render(<ResultStatusBadge status={status} />, {
        withReleaseUpdateStatusProvider: false,
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      })
      expect(
        screen.getByText(`autoCheckin:execution.status.${label}`),
      ).toHaveClass(surface)
    },
  )
})
