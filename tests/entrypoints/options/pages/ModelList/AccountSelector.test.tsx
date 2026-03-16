import { beforeEach, describe, expect, it, vi } from "vitest"

import { AccountSelector } from "~/features/ModelList/components/AccountSelector"
import { render, screen } from "~~/tests/test-utils/render"
import { testI18n } from "~~/tests/test-utils/i18n"

describe("AccountSelector", () => {
  beforeEach(() => {
    testI18n.addResourceBundle(
      "en",
      "modelList",
      {
        selectSource: "Select Source",
        allAccounts: "All accounts",
        pleaseSelectSource: "Please select a source",
        sourceLabels: {
          profileOption: "API Credential: {{name}} · {{host}}",
        },
      },
      true,
      true,
    )
  })

  it("includes the profile hostname in the selector label", async () => {
    render(
      <AccountSelector
        selectedSourceValue="profile:profile-1"
        setSelectedSourceValue={vi.fn()}
        accounts={[]}
        profiles={[
          {
            id: "profile-1",
            name: "Reusable Key",
            apiType: "openai-compatible",
            baseUrl: "https://profile.example.com/v1",
            apiKey: "sk-secret",
            tagIds: [],
            notes: "",
            createdAt: 1,
            updatedAt: 1,
          },
        ]}
      />,
    )

    const combobox = await screen.findByRole("combobox")
    expect(combobox).toBeInTheDocument()
    expect(combobox).toHaveTextContent(
      "API Credential: Reusable Key · profile.example.com",
    )
  })
})
