import { describe, expect, it, vi } from "vitest"

import { ControlPanel } from "~/features/ModelList/components/ControlPanel"
import { createProfileSource } from "~/features/ModelList/modelManagementSources"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { render, screen } from "~~/tests/test-utils/render"

describe("ControlPanel profile capabilities", () => {
  it("hides account-only pricing and group controls for profile-backed sources", async () => {
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
    )

    expect(
      await screen.findByText("modelList:profileSourceNotice.title"),
    ).toBeInTheDocument()
    expect(
      await screen.findByText("modelList:profileSourceNotice.description"),
    ).toBeInTheDocument()
    expect(screen.queryByText("modelList:userGroup")).not.toBeInTheDocument()
    expect(screen.queryByText("modelList:realAmount")).not.toBeInTheDocument()
    expect(screen.queryByText("modelList:showRatio")).not.toBeInTheDocument()
    expect(await screen.findByText("modelList:endpointTypes")).toBeInTheDocument()
  })
})
