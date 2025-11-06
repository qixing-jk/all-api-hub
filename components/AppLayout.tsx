import { ReactNode } from "react"

import "~/styles/style.css"

import { ThemeAwareToaster } from "~/components/ThemeAwareToaster"
import { DeviceProvider } from "~/contexts/DeviceContext"
import { ThemeProvider } from "~/contexts/ThemeContext"
import { UserPreferencesProvider } from "~/contexts/UserPreferencesContext"
import {
  ChannelDialogContainer,
  ChannelDialogProvider
} from "~/features/ChannelManagement"

interface AppLayoutProps {
  children: ReactNode
}

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
