import { Tab } from "@headlessui/react"
import { describe, expect, it, vi } from "vitest"

import { ProviderTabs } from "~/entrypoints/options/pages/ModelList/components/ProviderTabs"
import { fireEvent, render, screen, waitFor } from "~/tests/test-utils/render"

const createProviders = () => ["OpenAI", "Claude", "Gemini"] as any
const TABLIST_CLIENT_WIDTH_PX = 100
const TABLIST_SCROLL_WIDTH_PX = 300
const BASE_FILTERED_MODELS_COUNT = 10
const PROVIDER_FILTERED_MODELS_COUNT = 1

describe("ProviderTabs scroll arrows", () => {
  it("enables right arrow when tab list overflows", async () => {
    const setSelectedProvider = vi.fn()

    render(
      <ProviderTabs
        providers={createProviders()}
        selectedProvider="all"
        setSelectedProvider={setSelectedProvider}
        baseFilteredModelsCount={BASE_FILTERED_MODELS_COUNT}
        getProviderFilteredCount={() => PROVIDER_FILTERED_MODELS_COUNT}
      >
        <Tab.Panels>
          <Tab.Panel>All</Tab.Panel>
          <Tab.Panel>OpenAI</Tab.Panel>
          <Tab.Panel>Claude</Tab.Panel>
          <Tab.Panel>Gemini</Tab.Panel>
        </Tab.Panels>
      </ProviderTabs>,
    )

    const tabList = await screen.findByRole("tablist")
    Object.defineProperty(tabList, "clientWidth", {
      value: TABLIST_CLIENT_WIDTH_PX,
      configurable: true,
    })
    Object.defineProperty(tabList, "scrollWidth", {
      value: TABLIST_SCROLL_WIDTH_PX,
      configurable: true,
    })
    Object.defineProperty(tabList, "scrollLeft", {
      value: 0,
      writable: true,
      configurable: true,
    })

    fireEvent.scroll(tabList)

    const leftArrow = screen.getByLabelText("modelList:providerTabs.scrollLeft")
    const rightArrow = screen.getByLabelText(
      "modelList:providerTabs.scrollRight",
    )

    await waitFor(() => expect(leftArrow).toBeDisabled())
    await waitFor(() => expect(rightArrow).toBeEnabled())
  })

  it("scrolls the tab list when clicking arrows", async () => {
    const setSelectedProvider = vi.fn()

    render(
      <ProviderTabs
        providers={createProviders()}
        selectedProvider="all"
        setSelectedProvider={setSelectedProvider}
        baseFilteredModelsCount={BASE_FILTERED_MODELS_COUNT}
        getProviderFilteredCount={() => PROVIDER_FILTERED_MODELS_COUNT}
      >
        <Tab.Panels>
          <Tab.Panel>All</Tab.Panel>
          <Tab.Panel>OpenAI</Tab.Panel>
          <Tab.Panel>Claude</Tab.Panel>
          <Tab.Panel>Gemini</Tab.Panel>
        </Tab.Panels>
      </ProviderTabs>,
    )

    const tabList = await screen.findByRole("tablist")
    Object.defineProperty(tabList, "clientWidth", {
      value: TABLIST_CLIENT_WIDTH_PX,
      configurable: true,
    })
    Object.defineProperty(tabList, "scrollWidth", {
      value: TABLIST_SCROLL_WIDTH_PX,
      configurable: true,
    })
    Object.defineProperty(tabList, "scrollLeft", {
      value: 0,
      writable: true,
      configurable: true,
    })

    const scrollBy = vi.fn()
    Object.defineProperty(tabList, "scrollBy", {
      value: scrollBy,
      configurable: true,
    })

    fireEvent.scroll(tabList)

    const rightArrow = screen.getByLabelText(
      "modelList:providerTabs.scrollRight",
    )
    await waitFor(() => expect(rightArrow).toBeEnabled())
    fireEvent.click(rightArrow)

    expect(scrollBy).toHaveBeenCalled()
    const callArg = scrollBy.mock.calls[0]?.[0]
    expect(callArg).toEqual(
      expect.objectContaining({
        behavior: "auto",
      }),
    )
    expect(callArg.left).toBeGreaterThan(0)
  })
})
