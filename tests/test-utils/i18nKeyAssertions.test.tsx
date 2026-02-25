import { t as i18nextT } from "i18next"
import { useTranslation } from "react-i18next"
import { describe, expect, it } from "vitest"

import { render, screen } from "~/tests/test-utils/render"

describe("i18n test harness (key assertions)", () => {
  const MISSING_UI_KEY = "__tests__.i18nKeyAssertions.missing"

  it("returns stable namespaced keys for non-React i18next.t", () => {
    expect(i18nextT(`ui:${MISSING_UI_KEY}`)).toBe(`ui:${MISSING_UI_KEY}`)
    expect(i18nextT(MISSING_UI_KEY, { ns: "ui" })).toBe(`ui:${MISSING_UI_KEY}`)
    expect(
      i18nextT(MISSING_UI_KEY, {
        ns: "ui",
        defaultValue: "fallback",
      }),
    ).toBe(`ui:${MISSING_UI_KEY}`)
  })

  it("returns stable namespaced keys for react-i18next useTranslation", async () => {
    /**
     * This test verifies that the useTranslation hook also returns stable namespaced keys for missing translations, which is important for our i18n key assertion tests. If this test fails, it may indicate a misconfiguration in our test i18n instance or a change in react-i18next behavior that could affect our ability to assert on missing keys in component tests.
     */
    function Example() {
      const { t } = useTranslation("ui")
      return (
        <div>
          <div data-testid="implicit">{t(MISSING_UI_KEY)}</div>
          <div data-testid="explicit">{t(MISSING_UI_KEY, { ns: "ui" })}</div>
          <div data-testid="defaultValue">
            {t(MISSING_UI_KEY, { defaultValue: "fallback" })}
          </div>
        </div>
      )
    }

    render(<Example />)

    expect(await screen.findByTestId("implicit")).toHaveTextContent(
      `ui:${MISSING_UI_KEY}`,
    )
    expect(await screen.findByTestId("explicit")).toHaveTextContent(
      `ui:${MISSING_UI_KEY}`,
    )
    expect(await screen.findByTestId("defaultValue")).toHaveTextContent(
      `ui:${MISSING_UI_KEY}`,
    )
  })
})
