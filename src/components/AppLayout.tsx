import { ReactNode } from "react"

import "~/styles/style.css"

import { AutoCheckinUiOpenPretrigger } from "~/components/AutoCheckinUiOpenPretrigger"
import { ChangelogOnUpdateUiOpenHandler } from "~/components/ChangelogOnUpdateUiOpenHandler"
import {
  ChannelDialogContainer,
  ChannelDialogProvider,
  DuplicateChannelWarningDialogContainer,
} from "~/components/dialogs/ChannelDialog"
import {
  UpdateLogDialogContainer,
  UpdateLogDialogProvider,
} from "~/components/dialogs/UpdateLogDialog"
import { ThemeAwareToaster } from "~/components/ThemeAwareToaster"
import { DeviceProvider } from "~/contexts/DeviceContext"
import { ReleaseUpdateStatusProvider } from "~/contexts/ReleaseUpdateStatusContext"
import { ThemeProvider } from "~/contexts/ThemeContext"
import { UserPreferencesProvider } from "~/contexts/UserPreferencesContext"

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
          <ReleaseUpdateStatusProvider>
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
          </ReleaseUpdateStatusProvider>
          <ThemeAwareToaster reverseOrder={false} />
        </ThemeProvider>
      </UserPreferencesProvider>
    </DeviceProvider>
  )
}
