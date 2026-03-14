import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { I18nextProvider } from "react-i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AccountSelector } from "~/features/ModelList/components/AccountSelector"
import { testI18n } from "~~/tests/test-utils/i18n"

const Wrapper = ({ children }: { children: ReactNode }) => (
  <I18nextProvider i18n={testI18n}>{children}</I18nextProvider>
)

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

  it("includes the profile hostname in the selector label", () => {
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
      { wrapper: Wrapper },
    )

    expect(screen.getByRole("combobox")).toBeInTheDocument()
    expect(screen.getByRole("combobox")).toHaveTextContent(
      "API Credential: Reusable Key · profile.example.com",
    )
  })
})
