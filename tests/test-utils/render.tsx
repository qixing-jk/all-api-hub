import {
  render,
  renderHook,
  type RenderHookOptions,
  type RenderHookResult,
  type RenderOptions,
} from "@testing-library/react"
import type { ReactElement, ReactNode } from "react"
import { I18nextProvider } from "react-i18next"

import { ChannelDialogProvider } from "~/components/dialogs/ChannelDialog"
import { DeviceProvider } from "~/contexts/DeviceContext"
import { ThemeProvider } from "~/contexts/ThemeContext"
import { UserPreferencesProvider } from "~/contexts/UserPreferencesContext"
import type { UserPreferences } from "~/services/preferences/userPreferences"
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
        <UserPreferencesProvider initialPreferences={initialPreferences}>
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

const customRenderHook = <Result, Props>(
  callback: (initialProps: Props) => Result,
  options?: RenderHookOptions<Props> & AppRenderOptions,
): RenderHookResult<Result, Props> => {
  const { initialPreferences, ...renderHookOptions } = options ?? {}
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
