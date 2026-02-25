import { render, renderHook, type RenderOptions } from "@testing-library/react"
import type { ReactElement, ReactNode } from "react"
import { I18nextProvider } from "react-i18next"

import { ChannelDialogProvider } from "~/components/ChannelDialog/context/ChannelDialogContext"
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
          <ChannelDialogProvider>
            <ThemeProvider>{children}</ThemeProvider>
          </ChannelDialogProvider>
        </UserPreferencesProvider>
      </DeviceProvider>
    </I18nextProvider>
  )
}

const customRender = (ui: ReactElement, options?: RenderOptions) => {
  return render(ui, { wrapper: AppProviders, ...options })
}

const customRenderHook: typeof renderHook = (callback, options) => {
  return renderHook(callback, { wrapper: AppProviders, ...options })
}

// eslint-disable-next-line import/export
export * from "@testing-library/react"
// eslint-disable-next-line import/export
export { customRender as render }
// eslint-disable-next-line import/export
export { customRenderHook as renderHook }
