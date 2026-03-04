import { ReactNode } from "react"

import "~/src/styles/style.css"

import AutoCheckinUiOpenPretrigger from "~/src/components/AutoCheckinUiOpenPretrigger"
import ChangelogOnUpdateUiOpenHandler from "~/src/components/ChangelogOnUpdateUiOpenHandler"
import {
  ChannelDialogContainer,
  ChannelDialogProvider,
  DuplicateChannelWarningDialogContainer,
} from "~/src/components/dialogs/ChannelDialog"
import {
  UpdateLogDialogContainer,
  UpdateLogDialogProvider,
} from "~/src/components/dialogs/UpdateLogDialog"
import { ThemeAwareToaster } from "~/src/components/ThemeAwareToaster"
import { DeviceProvider } from "~/src/contexts/DeviceContext"
import { ThemeProvider } from "~/src/contexts/ThemeContext"
import { UserPreferencesProvider } from "~/src/contexts/UserPreferencesContext"

interface AppLayoutProps {
  children: ReactNode
}

/**
 * AppLayout wires global providers and renders the Channel dialog container plus toasts.
 */
export function AppLayout({ children }: AppLayoutProps) {
  return (
    <DeviceProvider>
      <UserPreferencesProvider>
        <ThemeProvider>
          <ChannelDialogProvider>
            <UpdateLogDialogProvider>
              <ChangelogOnUpdateUiOpenHandler />
              <AutoCheckinUiOpenPretrigger />
              <UpdateLogDialogContainer />
              {children}
              <ChannelDialogContainer />
              <DuplicateChannelWarningDialogContainer />
            </UpdateLogDialogProvider>
          </ChannelDialogProvider>
          <ThemeAwareToaster reverseOrder={false} />
        </ThemeProvider>
      </UserPreferencesProvider>
    </DeviceProvider>
  )
}

export default AppLayout
