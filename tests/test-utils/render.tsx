import { render, type RenderOptions } from "@testing-library/react"
import type { ReactElement, ReactNode } from "react"
import { I18nextProvider } from "react-i18next"

import { DeviceProvider } from "~/contexts/DeviceContext"
import { ThemeProvider } from "~/contexts/ThemeContext"
import { UserPreferencesProvider } from "~/contexts/UserPreferencesContext"
import testI18n from "~/tests/test-utils/i18n"

interface AppProvidersProps {
  children: ReactNode
}

const AppProviders = ({ children }: AppProvidersProps) => {
  return (
    <I18nextProvider i18n={testI18n}>
      <DeviceProvider>
        <UserPreferencesProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </UserPreferencesProvider>
      </DeviceProvider>
    </I18nextProvider>
  )
}

const customRender = (ui: ReactElement, options?: RenderOptions) => {
  return render(ui, { wrapper: AppProviders, ...options })
}

export * from "@testing-library/react"
export { customRender as render }
