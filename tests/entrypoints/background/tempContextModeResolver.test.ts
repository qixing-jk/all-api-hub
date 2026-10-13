import { describe, expect, it } from "vitest"

import {
  TEMP_CONTEXT_MODES,
  TEMP_CONTEXT_PREFERENCE_MODES,
} from "~/constants/tempContextMode"
import { resolveTempContextOpenMode } from "~/services/browsingContext/tempPage/tempContextModeResolver"
import { BROWSER_FOCUS_STATES } from "~/utils/browser/browserFocus"

describe("resolveTempContextOpenMode", () => {
  it.each([
    {
      name: "uses a window for incognito when unfocused without a shared window",
      preferredMode: TEMP_CONTEXT_PREFERENCE_MODES.Auto,
      incognito: true,
      sharedWindowAvailable: false,
      focusState: BROWSER_FOCUS_STATES.Unfocused,
      expected: TEMP_CONTEXT_MODES.Window,
    },
    {
      name: "uses composite for a regular unfocused browser with a shared window",
      preferredMode: TEMP_CONTEXT_PREFERENCE_MODES.Auto,
      incognito: false,
      sharedWindowAvailable: true,
      focusState: BROWSER_FOCUS_STATES.Unfocused,
      expected: TEMP_CONTEXT_MODES.Composite,
    },
    {
      name: "uses composite for a regular browser with unknown focus and a shared window",
      preferredMode: TEMP_CONTEXT_PREFERENCE_MODES.Auto,
      incognito: false,
      sharedWindowAvailable: true,
      focusState: BROWSER_FOCUS_STATES.Unknown,
      expected: TEMP_CONTEXT_MODES.Composite,
    },
    {
      name: "uses composite for a focused regular browser without a shared window",
      preferredMode: TEMP_CONTEXT_PREFERENCE_MODES.Auto,
      incognito: false,
      sharedWindowAvailable: false,
      focusState: BROWSER_FOCUS_STATES.Focused,
      expected: TEMP_CONTEXT_MODES.Composite,
    },
    {
      name: "uses a tab for an unfocused regular browser without a shared window",
      preferredMode: TEMP_CONTEXT_PREFERENCE_MODES.Auto,
      incognito: false,
      sharedWindowAvailable: false,
      focusState: BROWSER_FOCUS_STATES.Unfocused,
      expected: TEMP_CONTEXT_MODES.Tab,
    },
    {
      name: "uses a tab for a regular browser with unknown focus and no shared window",
      preferredMode: TEMP_CONTEXT_PREFERENCE_MODES.Auto,
      incognito: false,
      sharedWindowAvailable: false,
      focusState: BROWSER_FOCUS_STATES.Unknown,
      expected: TEMP_CONTEXT_MODES.Tab,
    },
    {
      name: "uses an inactive tab on mobile even when a window is focused",
      preferredMode: TEMP_CONTEXT_PREFERENCE_MODES.Auto,
      incognito: false,
      isMobileOrTablet: true,
      hasCookieStore: false,
      sharedWindowAvailable: false,
      focusState: BROWSER_FOCUS_STATES.Focused,
      expected: TEMP_CONTEXT_MODES.Tab,
    },
    {
      name: "uses an inactive tab on tablet despite a fixed window preference",
      preferredMode: TEMP_CONTEXT_PREFERENCE_MODES.Window,
      incognito: false,
      isMobileOrTablet: true,
      hasCookieStore: false,
      sharedWindowAvailable: true,
      focusState: BROWSER_FOCUS_STATES.Focused,
      expected: TEMP_CONTEXT_MODES.Tab,
    },
    {
      name: "uses an inactive tab for a Firefox cookie store",
      preferredMode: TEMP_CONTEXT_PREFERENCE_MODES.Window,
      incognito: false,
      isMobileOrTablet: false,
      hasCookieStore: true,
      sharedWindowAvailable: true,
      focusState: BROWSER_FOCUS_STATES.Focused,
      expected: TEMP_CONTEXT_MODES.Tab,
    },
  ])(
    "$name",
    ({
      preferredMode,
      incognito,
      isMobileOrTablet = false,
      hasCookieStore = false,
      sharedWindowAvailable,
      focusState,
      expected,
    }) => {
      expect(
        resolveTempContextOpenMode({
          preferredMode,
          incognito,
          isMobileOrTablet,
          hasCookieStore,
          sharedWindowAvailable,
          focusState,
        }),
      ).toBe(expected)
    },
  )

  it.each(
    Object.values(TEMP_CONTEXT_MODES).flatMap((preferredMode) =>
      [true, false].flatMap((sharedWindowAvailable) =>
        Object.values(BROWSER_FOCUS_STATES).map((focusState) => ({
          preferredMode,
          sharedWindowAvailable,
          focusState,
        })),
      ),
    ),
  )(
    "keeps the fixed $preferredMode preference outside incognito with $sharedWindowAvailable shared and $focusState focus",
    ({ preferredMode, sharedWindowAvailable, focusState }) => {
      expect(
        resolveTempContextOpenMode({
          preferredMode,
          incognito: false,
          isMobileOrTablet: false,
          hasCookieStore: false,
          sharedWindowAvailable,
          focusState,
        }),
      ).toBe(preferredMode)
    },
  )

  it.each(Object.values(TEMP_CONTEXT_PREFERENCE_MODES))(
    "uses a window for the %s preference in incognito",
    (preferredMode) => {
      expect(
        resolveTempContextOpenMode({
          preferredMode,
          incognito: true,
          isMobileOrTablet: true,
          hasCookieStore: true,
          sharedWindowAvailable: true,
          focusState: BROWSER_FOCUS_STATES.Focused,
        }),
      ).toBe(TEMP_CONTEXT_MODES.Window)
    },
  )
})
