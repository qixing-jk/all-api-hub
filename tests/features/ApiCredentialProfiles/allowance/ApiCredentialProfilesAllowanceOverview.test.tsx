import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactElement } from "react"
import { I18nextProvider } from "react-i18next"
import { describe, expect, it, vi } from "vitest"

import { ApiCredentialProfilesAllowanceOverview } from "~/features/ApiCredentialProfiles/allowance/ApiCredentialProfilesAllowanceOverview"
import en from "~/locales/en/apiCredentialProfiles.json"
import es from "~/locales/es-419/apiCredentialProfiles.json"
import pt from "~/locales/pt-BR/apiCredentialProfiles.json"
import { SiteHealthStatus } from "~/types"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"
import { createResourceTestI18n, testI18n } from "~~/tests/test-utils/i18n"
import { render } from "~~/tests/test-utils/render"

/** The overview needs i18n, but does not consume stored preferences or theme. */
function renderOverview(ui: ReactElement) {
  return render(ui, {
    withUserPreferencesProvider: false,
    withThemeProvider: false,
  })
}

/** Builds a monitored profile with a known or unknown balance runway. */
function profile(amount: number, spend?: number): ApiCredentialProfile {
  return {
    id: String(amount),
    name: `Wallet ${amount}`,
    apiType: "openai",
    baseUrl: "https://example.invalid",
    apiKey: "fixture",
    tagIds: [],
    notes: "",
    createdAt: 1,
    updatedAt: 1,
    telemetrySnapshot: {
      attempts: [],
      health: { status: SiteHealthStatus.Healthy },
      lastSyncTime: 1,
      facts: {
        balances: [
          {
            amount,
            unit: { kind: "money", currency: "USD", decimalPlaces: 2 },
            semantics: "cash",
          },
        ],
        ...(spend === undefined
          ? {}
          : {
              usage: {
                todayCost: {
                  value: spend,
                  unit: { kind: "money", currency: "USD", decimalPlaces: 2 },
                },
              },
            }),
      },
    },
  }
}

describe("allowance overview", () => {
  it.each([
    ["es-419", es, "1 crítica", "1 baja", "2 críticas", "2 bajas"],
    ["pt-BR", pt, "1 crítica", "1 baixa", "2 críticas", "2 baixas"],
  ] as const)(
    "uses singular and plural urgency labels in %s",
    async (lng, resources, critical, low, criticalPlural, lowPlural) => {
      const i18n = await createResourceTestI18n(
        { [lng]: { apiCredentialProfiles: resources } },
        lng,
      )
      const view = renderOverview(
        <I18nextProvider i18n={i18n}>
          <ApiCredentialProfilesAllowanceOverview
            profiles={[profile(1, 1), profile(4, 1)]}
          />
        </I18nextProvider>,
      )
      expect(screen.getByText(critical)).toBeVisible()
      expect(screen.getByText(low)).toBeVisible()
      view.rerender(
        <I18nextProvider i18n={i18n}>
          <ApiCredentialProfilesAllowanceOverview
            profiles={[
              profile(1, 1),
              profile(2, 1),
              profile(4, 1),
              profile(5, 1),
            ]}
          />
        </I18nextProvider>,
      )
      expect(screen.getByText(criticalPlural)).toBeVisible()
      expect(screen.getByText(lowPlural)).toBeVisible()
    },
  )

  it("hides a fully monitored library with only unknown runways", () => {
    const { container } = renderOverview(
      <ApiCredentialProfilesAllowanceOverview profiles={[profile(30)]} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it("shows incomplete monitoring without offering an unknown profile as a focus target", () => {
    renderOverview(
      <I18nextProvider i18n={testI18n}>
        <ApiCredentialProfilesAllowanceOverview
          profiles={[
            profile(30),
            { ...profile(40), telemetrySnapshot: undefined },
          ]}
        />
      </I18nextProvider>,
    )
    expect(
      screen.getByText(
        "apiCredentialProfiles:telemetry.allowance.overview.monitored",
      ),
    ).toBeVisible()
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("focuses a low balance and remains usable without a focus callback", async () => {
    const user = userEvent.setup()
    const i18n = await createResourceTestI18n({
      en: { apiCredentialProfiles: en },
    })
    const focus = vi.fn()
    const view = renderOverview(
      <I18nextProvider i18n={i18n}>
        <ApiCredentialProfilesAllowanceOverview
          profiles={[profile(4, 1)]}
          onFocusProfile={focus}
        />
      </I18nextProvider>,
    )
    await user.click(screen.getByRole("button"))
    expect(focus).toHaveBeenCalledExactlyOnceWith("4")
    view.rerender(
      <I18nextProvider i18n={i18n}>
        <ApiCredentialProfilesAllowanceOverview profiles={[profile(4, 1)]} />
      </I18nextProvider>,
    )
    await user.click(screen.getByRole("button"))
    expect(focus).toHaveBeenCalledTimes(1)
  })
})
