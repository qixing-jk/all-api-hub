import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createInstance } from "i18next"
import { useState } from "react"
import { I18nextProvider } from "react-i18next"
import { expect, it, vi } from "vitest"

import { AccountSummaryBar } from "~/features/ModelList/catalog/AccountSummaryBar"
import { EMPTY_MODEL_MANAGEMENT_CAPABILITIES } from "~/features/ModelList/catalog/modelManagementSources"
import { MODEL_LIST_SORT_MODES } from "~/features/ModelList/filtering/sortModes"
import { AllAccountsGroupFilterMenu } from "~/features/ModelList/groups/AllAccountsGroupFilterMenu"
import { ModelPriceQuote } from "~/features/ModelList/presentation/ModelItem/ModelPriceQuote"
import { useModelListSourcePresentation } from "~/features/ModelList/presentation/useModelListSourcePresentation"
import { MODEL_LIST_BILLING_MODES } from "~/features/ModelList/pricing/billingModes"
import { PricingConditionDetails } from "~/features/ModelList/pricing/PricingConditionDetails"
import { PricingScenarioNavigation } from "~/features/ModelList/pricing/pricingScenarioNavigation"
import en from "~/locales/en/modelList.json"
import ja from "~/locales/ja/modelList.json"
import type { QuoteResult } from "~/services/modelPricing/pricingPlan"
import { quoteModelPrice } from "~/services/modelPricing/quoteModelPrice"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"

vi.mock("~/services/productAnalytics/actions", () => ({
  trackProductAnalyticsActionStarted: vi.fn(),
}))

it("does not build account section labels while the group filter menu is closed", async () => {
  const i18n = createInstance()
  await i18n.init({ lng: "en", resources: { en: { modelList: en } } })
  const translate = vi.spyOn(i18n, "t")
  const props = {
    accounts: [buildDisplaySiteData({ id: "first", name: "First account" })],
    availableAccountGroupsByAccountId: { first: ["vip"] },
    availableAccountGroupOptionsByAccountId: {
      first: [{ name: "vip", ratio: 2 }],
    },
    excludedGroupsByAccountId: {},
    onExcludedGroupsChange: vi.fn(),
    onOpenChange: vi.fn(),
  }
  const view = (open: boolean) => (
    <I18nextProvider i18n={i18n}>
      <AllAccountsGroupFilterMenu {...props} open={open} />
    </I18nextProvider>
  )
  const { rerender } = render(view(false))
  expect(
    translate.mock.calls.filter(
      ([key]) => key === "accountGroupFilterSelectedSummary",
    ),
  ).toHaveLength(0)
  rerender(view(true))
  expect(await screen.findByText("First account")).toBeVisible()
  expect(screen.getByText("1 selected / 1")).toBeVisible()
})

it("only updates the account summary that received new catalog data", async () => {
  const i18n = createInstance()
  await i18n.init({ lng: "en", resources: { en: { modelList: en } } })
  const translate = vi.spyOn(i18n, "t")
  const first = { accountId: "first", name: "First account", count: 1 }
  const second = {
    accountId: "second",
    name: "Second account",
    count: 0,
    isLoading: true,
  }
  const input = {
    accounts: [],
    profiles: [],
    selectedSource: null,
    currentAccount: undefined,
    sourceCapabilities: {
      ...EMPTY_MODEL_MANAGEMENT_CAPABILITIES,
      supportsCurrencyPricing: false,
    },
    setSelectedSourceValue: vi.fn(),
    setSelectedGroups: vi.fn(),
    sortMode: MODEL_LIST_SORT_MODES.DEFAULT,
    setSortMode: vi.fn(),
    selectedBillingMode: MODEL_LIST_BILLING_MODES.ALL,
    setSelectedBillingMode: vi.fn(),
    selectedGroups: [],
    showRealPrice: false,
    setShowRealPrice: vi.fn(),
    searchTerm: "",
    pricingData: null,
    pricingContexts: [],
    isFallbackCatalogActive: false,
    accountQueryStates: [],
    accountSummaryCountsByAccountId: new Map<string, number>(),
  }
  function Summary({ loaded }: { loaded: boolean }) {
    const [activeAccountIds, setActiveAccountIds] = useState<string[]>([])
    const { handleAccountSummaryClick } = useModelListSourcePresentation({
      ...input,
      allAccountsFilterAccountIds: activeAccountIds,
      setAllAccountsFilterAccountIds: setActiveAccountIds,
    })
    return (
      <AccountSummaryBar
        items={[
          { ...first },
          loaded ? { ...second, count: 2, isLoading: false } : second,
        ]}
        activeAccountIds={activeAccountIds}
        onAccountClick={handleAccountSummaryClick}
      />
    )
  }
  const view = (loaded: boolean) => (
    <I18nextProvider i18n={i18n}>
      <Summary loaded={loaded} />
    </I18nextProvider>
  )
  const { rerender } = render(view(false))
  translate.mockClear()
  rerender(view(true))
  expect(
    screen.getByRole("button", { name: /^First account\s*1 model$/ }),
  ).toBeVisible()
  expect(
    screen.getByRole("button", { name: /^Second account\s*2 models$/ }),
  ).toBeVisible()
  expect(
    translate.mock.calls.filter(([key]) => key === "accountSummary.models"),
  ).toHaveLength(1)

  const user = userEvent.setup()
  const firstButton = screen.getByRole("button", { name: /^First account/ })
  const secondButton = screen.getByRole("button", { name: /^Second account/ })
  await user.click(firstButton)
  await user.click(secondButton)
  expect(firstButton).toHaveAttribute("aria-pressed", "true")
  expect(secondButton).toHaveAttribute("aria-pressed", "true")
  await user.click(firstButton)
  expect(firstButton).toHaveAttribute("aria-pressed", "false")
  expect(secondButton).toHaveAttribute("aria-pressed", "true")
})

it("does not translate unused conditions for a quote without missing requirements", async () => {
  const i18n = createInstance()
  await i18n.init({ lng: "en", resources: { en: { modelList: en } } })
  const translate = vi.spyOn(i18n, "t")
  const { container } = render(
    <I18nextProvider i18n={i18n}>
      <PricingConditionDetails details={[]} requirements={[]} issues={[]} />
    </I18nextProvider>,
  )

  expect(container).toBeEmptyDOMElement()
  // A complete quote appears in every loaded account row; rendering nothing
  // must not resolve the entire scenario vocabulary for each of those rows.
  expect(translate.mock.calls).toHaveLength(0)
})

it("updates a quote without translating unused selectors or rebuilding unchanged meter labels", async () => {
  const i18n = createInstance()
  await i18n.init({
    lng: "en",
    resources: { en: { modelList: en }, ja: { modelList: ja } },
  })
  const translate = vi.spyOn(i18n, "t")
  const quote = quoteModelPrice(
    {
      rates: { input: { amount: 1, currency: "USD", unit: "token", per: 1 } },
      rules: [],
      groupMultiplier: "included",
      source: { kind: "account" },
      issues: [],
    },
    { purpose: "request", usage: { input: 1 } },
  )
  const view = (value: QuoteResult) => (
    <I18nextProvider i18n={i18n}>
      <PricingScenarioNavigation onConfigure={() => {}}>
        <ModelPriceQuote quote={value} />
      </PricingScenarioNavigation>
    </I18nextProvider>
  )
  const { rerender } = render(view(quote))
  expect(screen.getByText("$1.000000")).toBeVisible()
  expect(
    translate.mock.calls.filter(([key]) => key === "scenario.serviceTier"),
  ).toHaveLength(0)

  translate.mockClear()
  rerender(view({ ...quote, amount: 2 }))
  expect(screen.getByText("$2.000000")).toBeVisible()
  expect(
    translate.mock.calls.filter(([key]) => key === "scenario.pages"),
  ).toHaveLength(0)

  // Needed condition labels must still appear and follow a live locale change.
  rerender(
    view({
      ...quote,
      issues: [
        { code: "condition-missing" },
        { code: "price-missing", meter: "pages" },
      ],
      conditionDetails: [{ axis: "imageSize", available: ["1K"] }],
    }),
  )
  expect(
    screen.getByRole("button", {
      name: `${en.scenario.configure} · ${en.scenario.imageSize}`,
    }),
  ).toBeVisible()
  expect(screen.getByText(new RegExp(en.scenario.pages))).toBeVisible()
  await act(() => i18n.changeLanguage("ja"))
  expect(
    screen.getByRole("button", {
      name: `${ja.scenario.configure} · ${ja.scenario.imageSize}`,
    }),
  ).toBeVisible()
  expect(screen.getByText(new RegExp(ja.scenario.pages))).toBeVisible()
})
