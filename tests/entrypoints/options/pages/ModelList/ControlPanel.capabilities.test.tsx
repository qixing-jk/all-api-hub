import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { I18nextProvider } from "react-i18next"
import { describe, expect, it, vi } from "vitest"

import { ControlPanel } from "~/features/ModelList/components/ControlPanel"
import { createProfileSource } from "~/features/ModelList/modelManagementSources"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { testI18n } from "~~/tests/test-utils/i18n"

const Wrapper = ({ children }: { children: ReactNode }) => (
  <I18nextProvider i18n={testI18n}>{children}</I18nextProvider>
)

describe("ControlPanel profile capabilities", () => {
  it("hides account-only pricing and group controls for profile-backed sources", () => {
    const profileSource = createProfileSource({
      id: "profile-1",
      name: "Reusable Key",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://profile.example.com",
      apiKey: "sk-secret",
      tagIds: [],
      notes: "",
      createdAt: 1,
      updatedAt: 2,
    })

    render(
      <ControlPanel
        selectedSource={profileSource}
        sourceCapabilities={profileSource.capabilities}
        searchTerm=""
        setSearchTerm={vi.fn()}
        selectedGroup="default"
        setSelectedGroup={vi.fn()}
        availableGroups={["default", "vip"]}
        pricingData={{ group_ratio: { default: 1, vip: 2 } }}
        loadPricingData={vi.fn()}
        isLoading={false}
        showRealPrice={false}
        setShowRealPrice={vi.fn()}
        showRatioColumn={false}
        setShowRatioColumn={vi.fn()}
        showEndpointTypes={true}
        setShowEndpointTypes={vi.fn()}
        totalModels={2}
        filteredModels={[
          { model: { model_name: "gpt-4o-mini" } },
          { model: { model_name: "claude-3-5-sonnet" } },
        ]}
      />,
      { wrapper: Wrapper },
    )

    expect(
      screen.getByText("modelList:profileSourceNotice.title"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("modelList:profileSourceNotice.description"),
    ).toBeInTheDocument()
    expect(screen.queryByText("modelList:userGroup")).not.toBeInTheDocument()
    expect(screen.queryByText("modelList:realAmount")).not.toBeInTheDocument()
    expect(screen.queryByText("modelList:showRatio")).not.toBeInTheDocument()
    expect(screen.getByText("modelList:endpointTypes")).toBeInTheDocument()
  })
})
