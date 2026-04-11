import {
  render,
  renderHook,
  type RenderHookOptions,
  type RenderOptions,
} from "@testing-library/react"
import type { ReactElement, ReactNode } from "react"
import { I18nextProvider } from "react-i18next"

import { ChannelDialogProvider } from "~/components/dialogs/ChannelDialog"
import { DeviceProvider } from "~/contexts/DeviceContext"
import { ReleaseUpdateStatusProvider } from "~/contexts/ReleaseUpdateStatusContext"
import { ThemeProvider } from "~/contexts/ThemeContext"
import { UserPreferencesProvider } from "~/contexts/UserPreferencesContext"
import { testI18n } from "~~/tests/test-utils/i18n"

interface AppProvidersProps {
  children: ReactNode
  withReleaseUpdateStatusProvider?: boolean
  withUserPreferencesProvider?: boolean
  withThemeProvider?: boolean
}

function IdentityProvider({ children }: { children: ReactNode }) {
  return <>{children}</>
}

const AppProviders = ({
  children,
  withReleaseUpdateStatusProvider = true,
  withUserPreferencesProvider = true,
  withThemeProvider = true,
}: AppProvidersProps) => {
  const PreferencesProvider = withUserPreferencesProvider
    ? UserPreferencesProvider
    : IdentityProvider
  const ActiveThemeProvider = withThemeProvider
    ? ThemeProvider
    : IdentityProvider
  const ActiveReleaseUpdateStatusProvider = withReleaseUpdateStatusProvider
    ? ReleaseUpdateStatusProvider
    : IdentityProvider

  return (
    <I18nextProvider i18n={testI18n}>
      <DeviceProvider>
        <PreferencesProvider>
          <ActiveThemeProvider>
            <ActiveReleaseUpdateStatusProvider>
              <ChannelDialogProvider>{children}</ChannelDialogProvider>
            </ActiveReleaseUpdateStatusProvider>
          </ActiveThemeProvider>
        </PreferencesProvider>
      </DeviceProvider>
    </I18nextProvider>
  )
}

interface AppRenderOptions extends Omit<RenderOptions, "wrapper"> {
  withReleaseUpdateStatusProvider?: boolean
  withUserPreferencesProvider?: boolean
  withThemeProvider?: boolean
}

interface AppRenderHookOptions<Props>
  extends Omit<RenderHookOptions<Props>, "wrapper"> {
  withReleaseUpdateStatusProvider?: boolean
  withUserPreferencesProvider?: boolean
  withThemeProvider?: boolean
}

const customRender = (ui: ReactElement, options?: AppRenderOptions) => {
  const {
    withReleaseUpdateStatusProvider = true,
    withUserPreferencesProvider = true,
    withThemeProvider = true,
    ...renderOptions
  } = options ?? {}

  return render(ui, {
    wrapper: ({ children }) => (
      <AppProviders
        withReleaseUpdateStatusProvider={withReleaseUpdateStatusProvider}
        withUserPreferencesProvider={withUserPreferencesProvider}
        withThemeProvider={withThemeProvider}
      >
        {children}
      </AppProviders>
    ),
    ...renderOptions,
  })
}

const customRenderHook = <Result, Props>(
  callback: (initialProps: Props) => Result,
  options?: AppRenderHookOptions<Props>,
) => {
  const {
    withReleaseUpdateStatusProvider = true,
    withUserPreferencesProvider = true,
    withThemeProvider = true,
    ...renderHookOptions
  } = options ?? {}

  return renderHook<Result, Props>(callback, {
    wrapper: ({ children }) => (
      <AppProviders
        withReleaseUpdateStatusProvider={withReleaseUpdateStatusProvider}
        withUserPreferencesProvider={withUserPreferencesProvider}
        withThemeProvider={withThemeProvider}
      >
        {children}
      </AppProviders>
    ),
    ...renderHookOptions,
  })
}

// eslint-disable-next-line import/export
export * from "@testing-library/react"
// eslint-disable-next-line import/export
export { customRender as render }
// eslint-disable-next-line import/export
export { customRenderHook as renderHook }
