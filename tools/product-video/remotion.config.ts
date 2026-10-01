import { Config } from "@remotion/cli/config"

// Optional existing Chrome/Chromium. Otherwise Remotion manages its browser.
if (process.env.CHROME_PATH)
  Config.setBrowserExecutable(process.env.CHROME_PATH)
