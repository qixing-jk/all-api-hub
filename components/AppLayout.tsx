import { ReactNode } from "react"

import "~/styles/style.css"

import {
  ChannelDialogContainer,
  ChannelDialogProvider,
} from "~/components/ChannelDialog"
import { ThemeAwareToaster } from "~/components/ThemeAwareToaster"
import { DeviceProvider } from "~/contexts/DeviceContext"
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
          <ChannelDialogProvider>
            {children}
            <ChannelDialogContainer />
          </ChannelDialogProvider>
          <ThemeAwareToaster reverseOrder={false} />
        </ThemeProvider>
      </UserPreferencesProvider>
    </DeviceProvider>
  )
}

export default AppLayout
