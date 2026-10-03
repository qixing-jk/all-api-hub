import type { Browser } from "@playwright/test"
export function assertDevBrowserProfile(browser: Browser): Promise<void>
export function ensureDevExtensionReady(browser: Browser, extensionDir: string): Promise<string>
