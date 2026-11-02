import { render, screen } from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import { expect, it } from "vitest"

import { getPricingDiagnosticIssueLabel } from "~/features/ModelList/pricing/pricingDiagnosticView"
import { PricingSourceNotes } from "~/features/ModelList/pricing/PricingSourceNotes"
import de from "~/locales/de/modelList.json"
import en from "~/locales/en/modelList.json"
import es from "~/locales/es-419/modelList.json"
import ja from "~/locales/ja/modelList.json"
import pt from "~/locales/pt-BR/modelList.json"
import vi from "~/locales/vi/modelList.json"
import zh from "~/locales/zh-CN/modelList.json"
import tw from "~/locales/zh-TW/modelList.json"
import { PRICING_SOURCE_NOTE_KINDS as kinds } from "~/services/modelPricing/pricingConstants"
import { pricingSourceNoteSchema } from "~/services/modelPricing/pricingSourceNotes"
import { createResourceTestI18n } from "~~/tests/test-utils/i18n"

it.each(
  Object.entries({
    de,
    en,
    "es-419": es,
    ja,
    "pt-BR": pt,
    vi,
    "zh-CN": zh,
    "zh-TW": tw,
  }),
)(
  "uses the active %s locale and preserves structured routing, window and charge facts",
  async (language, resource) => {
    const i18n = await createResourceTestI18n(
      { [language]: { modelList: resource } },
      language,
    )
    render(
      <I18nextProvider i18n={i18n}>
        <PricingSourceNotes
          notes={[
            { kind: kinds.AMBIGUOUS_CHARGES },
            { kind: kinds.RULES_UNAVAILABLE },
            { kind: kinds.AMBIGUOUS_VARIANT_CHARGES },
            { kind: kinds.THRESHOLD_SOURCE_CONFLICT },
            { kind: kinds.THRESHOLD_BASIS_UNVERIFIED },
            { kind: kinds.RUNTIME_DEPENDENT },
            { kind: kinds.PROVIDER_REPORTED_ESTIMATE },
            { kind: kinds.ENDPOINT_SOURCE_CONFLICT },
            { kind: kinds.WHOLE_REQUEST_TIER },
            { kind: kinds.EXCLUDED_CHARGES, charges: ["provider_tool"] },
            {
              kind: kinds.ROUTING_CONTEXT,
              dedicated: false,
              multiplier: 1.8747,
              timeWindows: [
                {
                  label: "Night",
                  start: 1080,
                  end: 540,
                  input: 2,
                  output: 10,
                  cacheRead: 0.2,
                },
              ],
            },
          ]}
        />
      </I18nextProvider>,
    )
    expect(
      screen.getByText(resource.pricingNotes.ambiguousCharges),
    ).toBeVisible()
    expect(
      screen.getByText(
        i18n.t("modelList:pricingNotes.excludedCharges", {
          charges: "provider_tool",
        }),
      ),
    ).toBeVisible()
    expect(screen.getByText(/1\.8747/)).toHaveTextContent(
      resource.pricingNotes.defaultRoute,
    )
    expect(screen.getByText(/18:00–09:00/)).toHaveTextContent("Night")
    expect(
      screen.getByText(resource.pricingNotes.timeWindowTimezoneUnavailable),
    ).toBeVisible()
    expect(document.body).not.toHaveTextContent("{{")
    for (const key of [
      "ambiguousVariantCharges",
      "thresholdSourceConflict",
      "thresholdBasisUnverified",
      "runtimeDependent",
      "providerReportedEstimate",
      "endpointSourceConflict",
      "wholeRequestTier",
    ] as const)
      expect(screen.getByText(resource.pricingNotes[key])).toBeVisible()
    const t = i18n.getFixedT(language, "modelList")
    expect(
      getPricingDiagnosticIssueLabel(
        "unsupported:threshold-basis-unverified",
        t,
      ),
    ).toBe(resource.diagnostics.issueLabels.thresholdBasisUnverified)
    expect(
      getPricingDiagnosticIssueLabel("unsupported:source-conflict", t),
    ).toBe(resource.diagnostics.issueLabels.sourceConflict)
    expect(getPricingDiagnosticIssueLabel("unknown-protocol-code", t)).toBe(
      "unknown-protocol-code",
    )
  },
)

it("rejects unknown note kinds and incomplete structured facts", () => {
  expect(
    pricingSourceNoteSchema.safeParse({ kind: "future-note" }).success,
  ).toBe(false)
  expect(
    pricingSourceNoteSchema.safeParse({ kind: kinds.EXCLUDED_CHARGES }).success,
  ).toBe(false)
  expect(
    pricingSourceNoteSchema.safeParse({
      kind: kinds.ROUTING_CONTEXT,
      multiplier: -1,
      dedicated: false,
    }).success,
  ).toBe(false)
})
