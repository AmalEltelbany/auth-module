# UI.md: UI decisions and the design story

Moved out of [AI.md](../AI.md) so the auth and security log stays focused. Same legend as AI.md's decisions log: **Me** (my call), **Me ← AI** (I accepted the AI's recommendation), **Me ≠ AI** (I chose differently), **Research** (forced by primary-source evidence).

The short version of the "less AI-looking" lesson ([Step 9](#step-9-design-reset-less-ai-looking-one-page-frame)): two redesigns in a row were the agent's own taste and both missed. What fixed it was process, not pixels: options or mockups first, I pick, then code. Every later design change (decisions 42–48) followed that.

## UI decisions

| # | Decision | Options | Chosen | Who | Why |
|---|---|---|---|---|---|
| 42 | Page frame | split panel / centered card / editorial / dark-first | Centered card, used by **every** page (auth, home, 404, error) | **Me** (from 4 mockups) | Predictable, polished, one frame to maintain |
| 43 | Accent and logo | keep blue + monogram / indigo + shield-keyhole | Indigo + shield with keyhole | **Me** (from options) | Says "auth" at a glance; one accent color only |
| 44 | Product name and logo | "Auth Module" / Keyhaven, Gatekeep, Passly, Vaultly; Lucide shield-check, fingerprint, key-round, lock-keyhole | **Keyhaven** + Lucide **key-round** on an indigo tile, centered above the card | **Me** (from options) | A real product name; an ISC-licensed icon is safe in a public repo (free "logo" sites like logoipsum forbid real use) |
| 46 | Page frame, take 2 | Revenew patterns: card + footer strip / slab-serif titles / bold underlined links / compact controls; background plain / dot grid | All four patterns, keep indigo, faint masked CSS dot grid (from a background search) | **Me** (options from reading Revenew's auth code) | Layout ideas only: no Revenew name, logo, text, colours, font (Roboto Slab, not Aleo) or Google button. Briefly tried "minimal, no card" first |
| 47 | Page frame, take 3, and name | keep the Revenew-style card / a Landingfolio reference (Tally login); Keyhaven / "Application" | Tally-style: logo top-left, no card, black button, indigo links, © footer; renamed to **Application** | **Me** (sent the reference) | Simpler and closer to what I wanted; removed the slab font and dot grid again. Then picked a 3-way segmented theme switcher (over sun/moon or a dropdown) and Lucide **layers** as the logo (over an "A" monogram, box, shield) |
| 48 | OTP entry and reset steps | single code input / 6 separate inputs / 6 boxes over one real input; reset on one screen / OTP then password; new "check OTP" endpoint / format check only | "OTP" wording, `OtpField` (boxes over one input), reset split into 2 steps, one request, format check only on step 1 | **Me** (asked) ← AI (how) | One real input keeps screen readers, paste and autofill working. A check-only endpoint would spend an attempt and need a token between steps, so a wrong OTP surfaces at submit and sends you back to step 1. Then aligned wording and error states with Revenew's reset flow (read from its code): one "Reset password" title, "Go back" on top, errors under the boxes that clear on edit, "Resend OTP in 0:59" under the boxes, "Confirm" / "Reset password" buttons. Kept: no confirm-password field (decision 41), and the button stays enabled (Revenew disables it until six digits) so a click explains what's missing |
| 45 | Theme toggle | next-themes / own ~40-line store | Own store (`useSyncExternalStore`), System / Light / Dark | Me ← AI | next-themes is built for Next.js and was already rejected; an inline script in `index.html` prevents the flash |

## UI build log

### Step 8: UI refresh (theme, logo, icons, layout)
- **Prompt:** "change the theme of frontend also add better icons and check logos and better component and background". I chose **blue / sky** and a **split-screen** layout when asked.
- **Generated:**
  - **Theme:** blue/sky design tokens (`--brand`, `--success`, `--warning`); a CSS-only backdrop (glow plus dot grid); dark mode that **follows the OS**
  - **Logo:** a shield-with-keyhole `Logo` component plus a matching `favicon.svg`, replacing the Vite template's lightning bolt
  - **Split-screen auth layout:** a brand panel with four security highlights, each true of this app; header icons per page; inputs with icons; a softer error box; the password checklist as two columns of check circles
  - **Home page:** a top bar with avatar and Log out, the welcome card, and three account status tiles (email, password, session). 404 and error pages use the same style.
- **Changed (found by reviewing and checking in the browser):**
  - **The favicon was still Vite's logo**: the "check logos" part of the prompt.
  - **Dark mode had never worked**: the CSS keyed it on a `.dark` class nothing ever set. It now follows `prefers-color-scheme`.
  - **`PasswordInput` overwrote any `className` passed to it** with `pr-9`, so styling password fields silently did nothing. It now merges.
  - **The blue shield vanished on the blue panel** (seen in the screenshot). The light variant now sits on a white tile.
  - **"Forgot password?" ignored right-alignment** because shadcn's `Field` stretches every child. Fixed with `text-right`.
  - **Lint caught `new Date()` during render** (impure). The year is now a module constant.
  - The browser tool showed a field's accessible name as its placeholder. I checked `input.labels` before assuming a regression: the label is still wired.
- **Verified:**
  - lint (exit 0), typecheck (0 errors), **107/107 tests**: the web tests passed unchanged, since every label, role and heading was kept
  - build
  - **In the browser:**
    - sign-in and sign-up at 1280 px, light and dark
    - sign-up at 375 px: panel hidden, logo on top, no horizontal overflow
    - the live checklist turning green
    - a real sign-up landing on the new home page
- **Process note:** while restarting the API, my process filter was too broad and also stopped a Node process from **another Claude session** (revenew-winback). I told the user. From now on, processes are stopped only by exact PID after confirming they're mine.
- **Follow-up prompt:** a screenshot of the Revenew Portal 2.0 Figma auth screens: "i want inspired from one in revenew".
  - **Reworked the auth layout after Revenew's patterns:** a centered compact card, very large soft circles running off the page edges, the logo mark centered above the card, serif headings (system serif stack, no extra font download), and a help + copyright row pinned to the bottom. The split-screen panel and per-page icon tiles are gone; the in-field icons stay.
  - **Kept on purpose (Me):** Revenew is my employer's product and this repo is public, so I took the layout ideas only. No Revenew logo, name, copy or exact colors, and no "Log in with Google" button, since there is no Google sign-in and it would be a fake control. The blue/sky theme and shield logo stay.
  - **Cleanup:** removed `Logo`'s light variant once the blue panel no longer used it.
  - **Verified:** 107/107 tests (the web tests again unchanged), lint, typecheck, build. In the browser: sign-in and sign-up at 1280 px in light and dark; sign-up at 375 px with no overflow.

### Step 9: design reset (less "AI-looking", one page frame)
- **Prompts, in order:**
  - "get a better logo … the bg it too similar [to Revenew] … enhance the home page … write better frontend code with good design system"
  - "still too ai and shit design please do full search on better ui/ux also home page too much keep just welcome to application as they say in task"
  - "still not what i need please give me option before start and do not forget to handle not found and all frontend parts"
- **What went wrong first:** two redesigns in a row were the agent's own taste, and both missed. The fix was process, not pixels: the agent showed **four ASCII mockups** (split panel, centered card, editorial, dark-first) plus accent, logo and 404 options, and I picked before any code was written (decisions 42–43).
- **Research used:** a list of "AI slop" design tells (gradients, glows, soft-shadow card grids, thin icons in tinted tiles) and web.dev's sign-in form guidance (labels above inputs, no placeholder labels, 44 px targets, `autocomplete="username"` on email, show-password toggle, no confirm field, consistent "Sign in"/"Sign out").
- **Generated / changed:**
  - **One frame for every screen:** `AuthLayout` = logo, one centered white card, optional line under it, optional top-right slot. Sign in/up, verify, forgot, reset, **home**, **404** and the **route error** all use it. The loading screen shows the logo mark and a spinner.
  - **Home cut to the task's requirement:** "Welcome to the application.", who is signed in, the verify notice if needed, and Sign out. Deleted the account tiles, avatar, change-password and their tests, plus unused shadcn `card`, `badge`, `progress`, `avatar` and the `IconBadge` component.
  - **Theme:** indigo accent, cool neutral page, white card; removed the backdrop circles, serif headings, in-field icons and the extra brand tokens.
  - **Logo:** shield with keyhole, the same SVG as the favicon; `theme-color` updated.
  - **Reset form:** the confirm field was removed from the shared schema, the API e2e bodies and the web form (decision 41).
  - **Inputs** use the card surface rather than the grey page color (seen in the screenshot).
- **Verified:**
  - lint (known 2 warnings), typecheck, build
  - **107/107 tests** (shared 35, API 45, web 27), including a new 404 test (heading plus a "Go home" link to `/`)
  - **In the browser:** home, 404 and reset at 1280 px in light and dark; home and reset at 375 px with no horizontal overflow
  - **Real run end to end** ("run it to test"): sign-up → code from Mailpit → verified, the banner gone → sign out → wrong password shows the generic error

### Step 10: name, centered logo, theme toggle
- **Prompt:** "i do not want name to be auth module … i want logo centered … choose from internet like revenew … also where is toggle of theme". Options were shown first; I picked Keyhaven, Lucide key-round, and System/Light/Dark (decisions 44–45).
- **Generated:**
  - **Name:** Keyhaven in the logo, tab title, Swagger title, `MAIL_FROM` default and `.env.example`, and the README and AGENTS.md titles. The repo stays `auth-module`.
  - **Logo:** Lucide `key-round` (already installed via shadcn) on an indigo tile, centered above the card; the same paths in `favicon.svg`.
  - **Theme:** `lib/theme.ts` (store + `useTheme`), a `ThemeToggle` in every page's top-right, dark mode switched from the OS media query to a `.dark` class, and toasts follow the chosen theme.
- **Verified:** lint, typecheck, build; **108/108 tests**, including a new toggle test (cycles, saves and clears the choice). In the browser: sign-in in light and dark; dark survives a reload; 404 at 375 px with no overflow.
