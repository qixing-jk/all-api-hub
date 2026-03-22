import { render, renderHook, type RenderOptions } from "@testing-library/react"
import type { ReactElement, ReactNode } from "react"
import { I18nextProvider } from "react-i18next"

import { ChannelDialogProvider } from "~/components/dialogs/ChannelDialog"
import { DeviceProvider } from "~/contexts/DeviceContext"
import { ThemeProvider } from "~/contexts/ThemeContext"
import { UserPreferencesProvider } from "~/contexts/UserPreferencesContext"
import {
  createDefaultPreferences,
  type UserPreferences,
} from "~/services/preferences/userPreferences"
import { testI18n } from "~~/tests/test-utils/i18n"

interface AppProvidersProps {
  children: ReactNode
  initialPreferences?: UserPreferences
}

interface AppRenderOptions extends RenderOptions {
  initialPreferences?: UserPreferences
}

const AppProviders = ({ children, initialPreferences }: AppProvidersProps) => {
  return (
    <I18nextProvider i18n={testI18n}>
      <DeviceProvider>
        <UserPreferencesProvider
          initialPreferences={initialPreferences ?? createDefaultPreferences(0)}
        >
          <ChannelDialogProvider>
            <ThemeProvider>{children}</ThemeProvider>
          </ChannelDialogProvider>
        </UserPreferencesProvider>
      </DeviceProvider>
    </I18nextProvider>
  )
}

const customRender = (ui: ReactElement, options?: AppRenderOptions) => {
  const { initialPreferences, ...renderOptions } = options ?? {}
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AppProviders initialPreferences={initialPreferences}>
      {children}
    </AppProviders>
  )

  return render(ui, { wrapper, ...renderOptions })
}

const customRenderHook: typeof renderHook = (callback, options) => {
  const hookOptions = options as (typeof options & AppRenderOptions) | undefined
  const { initialPreferences, ...renderHookOptions } = hookOptions ?? {}
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AppProviders initialPreferences={initialPreferences}>
      {children}
    </AppProviders>
  )

  return renderHook(callback, { wrapper, ...renderHookOptions })
}

// eslint-disable-next-line import/export
export * from "@testing-library/react"
// eslint-disable-next-line import/export
export { customRender as render }
// eslint-disable-next-line import/export
export { customRenderHook as renderHook }
