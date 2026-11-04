# AI.md: how AI was used on this project

## Summary

| | |
|---|---|
| **Tool** | Claude Code|
| **Mode** | Agent: it reads files, runs commands, edits code, and spawns background research sub-agents |
| **What AI did** | Proposed options, researched primary sources, wrote scaffolding, boilerplate and first drafts of code and tests. It never had the final word. |
| **What I did** | Owned every decision: set the scope, chose between the options, overruled the AI where I disagreed, cut over-engineering, and reviewed and verified every change before it was committed |
| **Guardrails** | `AGENTS.md` (loaded by Claude Code through `CLAUDE.md`) constrains what the agent writes; the "pinned tests" stop it from weakening security tests |

## How I worked

1. **Plan before code.** Had the agent turn the task PDF into a repo structure, an architecture and the flows, before any code existed.
2. **Research instead of trusting the model's memory.** Every library and security choice was checked by a background sub-agent against primary sources (official docs, GitHub, the npm registry, OWASP, NIST). I kept the results, with citations, as local research notes.
3. **Audit the AI's own design.** I had a second research pass grade the drafted verify/reset design against OWASP, NIST and ASVS. It found 7 issues (see Corrections).
4. **Write rules before code.** I converted the decisions into one agent rules file (`AGENTS.md`, with `CLAUDE.md` importing it), modelled on rules I use in another production repo, so generated code follows them from the first commit.
5. **Build in small logged steps.** Every build step below records the prompt, what was generated, what I changed and how it was verified.
6. **AI proposes, I decide.** For each choice I asked for the options and their trade-offs, then picked one myself. A recommendation went in only after I checked it against the task, the evidence and the rest of the design; when I disagreed, I overruled it (decisions 2, 8, 9, 10, 13, 14, 32).

## Prompts that worked well

| Prompt (lightly edited) | Why it worked |
|---|---|
| "Help me plan this, especially how to structure the repo since it's both frontend and backend." | Asking for a plan, not code, gave a structure to argue with before anything was built. |
| "Do research: which libraries should we use for the backend?" | Got versions and peer ranges from the npm registry instead of the model's memory. Found the Nest 12 / TS 7 conflict. |
| "Search the feature we discussed and research best practices and system design for it." | Turned the agent into a reviewer of its own earlier design, which exposed real flaws. |
| "Don't over-engineer. If a library isn't really needed, it's okay not to use it." | Cut 12 libraries, each replaced by a few lines of code or a platform feature. |
| "Check how rules are written in my other repo." | Grounded the rules in a format I already use and trust, not a generic template. |

## Corrections: where AI output was wrong or incomplete

| AI's first answer | Problem | How it was caught | Fix |
|---|---|---|---|
| Plan sized for "a few hours" | Ignored that I wanted a fuller, production-grade version | I pushed back twice | Re-planned with refresh rotation, email verification and password reset |
| Verify page POSTs the token on load | Email link scanners (e.g. Defender Safe Links) run page JS and would burn the token | Research audit | POST only after a user click |
| "Send mail without awaiting it" prevents email enumeration | The DB lookup and token insert still run before the reply, so timing leaks | Research audit | Reply 202 first, do all the work after |
| "Revoke all sessions" on password reset | Access JWTs stay valid until they expire | Research audit | `sessionVersion` claim checked by the guard |
| Reset steps run one after another | A crash partway leaves inconsistent state | Research audit | One Mongo transaction (needs a replica set) |
| `MongoMemoryServer` for e2e tests | Transactions fail on a standalone `mongod` | Me, cross-checking two docs | `MongoMemoryReplSet` |
| Vitest `^5` in one doc, `~5.0` in the other | Inconsistent pins across apps | Me, cross-checking two docs | Both pinned to `~5.0` |
| Explanation of why Swagger fails on TS 7 | Stated from memory | Asked; verified on npm | Confirmed via peer ranges; the reason is labelled as inference |
| `helmet` on the trimmed library list | Nest 12 already ships `app.useSecurityHeaders()` ("same headers and defaults as helmet 8") | Agent read the installed Nest type definitions before coding, instead of trusting the research doc | Dropped helmet; an e2e test asserts the headers |
| Cookies "like Express" (`maxAge` in ms) | Nest 12's built-in `setCookie` takes **seconds**; a copied ms value makes a 15-min cookie live ~10 days | Same type-definition check | `maxAge: 15 * 60`; e2e asserts `Max-Age=900` |
| First smoke test "passed" against port 3000 | Port 3000 was my other project's dev server, so every request hit the wrong app | Responses were HTML, not JSON | Re-ran on 3100; API default moved to 3001 |
| Dev Mongo published on `0.0.0.0:27017` | An unauthenticated database reachable from the local network | Automated security review of the step 2 commit | Bound to `127.0.0.1` only |
| Session re-check on every `visibilitychange` | Fired even when signed out: 21 pointless `/users/me` 401s in one browser session | Reading the browser console during manual testing (the unit tests passed) | Listener only active while signed in. Verified: 0 extra requests when signed out. |
| Vite template pinned TypeScript `~7.0.2` | Would break the TS 6 pin the Nest tooling needs | Reviewed the generated `package.json` before installing | Removed it; the web app uses the root TS 6.0 |
| shadcn's `sonner.tsx` imports `next-themes` | A stale Next.js package we had rejected, added silently | Read the generated component | Removed; toasts follow the OS theme |
| Web tests: all 10 failed | jsdom has no `window.matchMedia`, which sonner calls | Test run | Small stub in the test setup |
| 429s showed "ThrottlerException: Too Many Requests" | The library's internal message would have reached users on the forgot-password form | Tripped the limit with curl while building the page | Problem filter gives 429s a human `detail` |
| Verification email included the user's name | Anyone can sign up with a victim's address; a "name" like "Call +1 555… to unlock" reached the victim from our trusted sender | Automated security review of the step 5 commit | Emails to unverified addresses contain only the code; names reject control characters and newlines |
| Mail cooldown was "check, then send" | Concurrent requests could both pass the check and send several emails | Same security review | One atomic `claimMailSlot()` update on the user; e2e sends 3 parallel resends and expects exactly 1 email |
| Startup treated any error as "signed out" | A 502 while the API restarted showed a signed-in user the sign-in page | Manual browser run (the API was restarting under my own mutation tests) | Only 401 means signed out; 5xx and network errors retry with backoff |
| `mailSentAt` stored with an `_id` | Mongoose made the nested `{ verify, reset }` a subdocument | Inspected the stored document while debugging an "invalid code" | `@Prop(raw({...}))` |
| First code from the email returned 400 | Not a bug: 18 minutes had passed and the 10-minute code had expired (the TTL sweeper had deleted it) | Queried Mongo instead of assuming | None needed; a fresh code verified |
| Step 2 smoke-test API still running 14 hours later | Git Bash `kill` stopped the shell wrapper, not `node`; it held argon2's native file and blocked `npm ci` | `npm ci` EPERM, then listed every Node process | Stopped that one process; the user's other tools were left alone |
| Refresh cookie as `__Secure-` with `Path=/api/auth` (decision 24) | `__Secure-` allows a `Domain` attribute, so a sibling subdomain could plant its own refresh token ("cookie tossing") and sign a victim into the attacker's account | Automated security review of the step 4 commit | `__Host-refresh_token`, `Path=/`; e2e asserts no `Domain` |
| `refresh()` ignored `sessionVersion` | A refresh token issued before a password reset could have minted fresh access tokens afterwards, bypassing "sign out everywhere" (latent: nothing bumped the version yet) | Automated security review of the uncommitted step 4 | Each session row stores the version it was issued under; refresh rejects a mismatch and revokes the family. New pinned test, mutation-checked |
| First mutation run "skipped" all 17 tests | Running vitest from `apps/api` made mongodb-memory-server download mongod into `~/.cache`; the timeout killed it, leaving a broken 950 KB binary (`spawn EFTYPE`) | Read the actual error instead of trusting "skipped" | Deleted the broken files; pinned `MONGOMS_DOWNLOAD_DIR` in the vitest config |

## Decisions log

I made every decision below. The **Basis** column shows what I based each one on: **My idea** (the AI didn't raise it), **AI proposal, reviewed** (I checked the AI's recommendation and adopted it), **Overruled AI** (I chose differently from the AI), **Evidence** (I followed what primary sources or a security review showed).

| # | Decision | Options | Chosen | Basis | Why |
|---|---|---|---|---|---|
| 1 | Repo shape | two folders / npm workspaces / Nx | npm workspaces: `apps/*` + `packages/shared` | AI proposal, reviewed | One copy of the validation rules for both apps |
| 2 | Scope | minimum task / full auth | Full: refresh rotation, email verification, password reset | Overruled AI | AI sized it for a few hours; I wanted production depth |
| 3 | TypeScript | 7 / 6 | `~6.0` | Evidence | The Nest CLI and Swagger don't support TS 7; typescript-eslint requires `<6.1` |
| 4 | Validation | class-validator / zod | zod, shared by both apps | AI proposal, reviewed | Nest 12 accepts zod natively; one schema for UI and API |
| 5 | Signup when the email fails | roll back / keep user | Keep user and offer resend | AI proposal, reviewed | Signup can't be blocked by an optional feature |
| 6 | Unverified users | can sign in / blocked | Can sign in, with a banner | AI proposal, reviewed | Graders reach the welcome page without an inbox |
| 7 | Password minimum length | 8 / 12 / 15 (NIST) | 8 | My idea | It's the task spec; documented as a deviation from NIST |
| 8 | UI base | Base UI (shadcn default) / Radix | **Radix** | Overruled AI | Mature, and most examples use it; AI recommended Base UI |
| 9 | Toasts | cut / sonner | **Keep sonner** | Overruled AI | AI cut it while trimming; I want toasts |
| 10 | Libraries | full researched list / trimmed | Trimmed: 12 cut | Overruled AI | AI's research list was too heavy for the scope |
| 11 | Frontend state | Redux / TanStack Query / context | Context + `BroadcastChannel` | AI proposal, reviewed | No real server data to cache |
| 12 | Email in dev | real provider / Mailpit | Mailpit + log fallback | AI proposal, reviewed | No account or keys needed by graders |
| 13 | Agent rules format | single CLAUDE.md / AGENTS.md + 5 scoped rule files | One `AGENTS.md`, imported by `CLAUDE.md` | Overruled AI | AI split rules into 5 Cursor files; we use Claude Code, so one file is simpler |
| 14 | Repo name | fullstack-auth / auth-module / nest-react-auth | `auth-module` | Overruled AI | Matches the task's wording ("implement a module") |
| 15 | Research notes | commit / keep local | Keep local, git-ignored | My idea | Personal working notes, not part of the submission |
| 16 | What counts as a letter / special character | ASCII `[a-z]` / Unicode `\p{L}`; space special or not | Unicode letters; space is **not** special | AI proposal, reviewed | Non-English names and passwords work; a space alone doesn't satisfy "special" |
| 17 | Security headers / CSRF / cookies | helmet + csrf-csrf + cookie-parser / Nest 12 built-ins | Built-ins | Evidence | Found in the installed framework; three fewer dependencies |
| 18 | Unknown email at sign-in | return 401 immediately / verify against a dummy hash | Dummy-hash verify | AI proposal, reviewed | Same response time for unknown and wrong-password, so timing doesn't reveal accounts |
| 19 | jsdom version | 30 (needs Node ≥ 24.15) / 29.1 | 29.1 | AI proposal, reviewed | My machine (and likely graders') runs Node 24.14; no behaviour difference for these forms |
| 20 | Linter | ESLint + plugins / oxlint from the Vite template | oxlint | AI proposal, reviewed | The template's default; no ESLint 10 plugin-compatibility problems |
| 21 | Security review: logout only clears the cookie | bump `sessionVersion` / revoke the refresh family in step 4 | Step 4 | AI proposal, reviewed | `sessionVersion` would sign out every device; a 15-min access token is the accepted residual window |
| 22 | Security review: signup 409 reveals registered emails | email-only signup / keep 409 | Keep, documented | My idea | Already a documented trade-off; a better UX for this task |
| 23 | After sign-in, where to go | `navigate()` in each form hook / let the `<GuestOnly>` route redirect | Route redirect | AI proposal, reviewed | One place handles "return to the page you asked for" |
| 24 | Refresh cookie scope | `__Host-` (forces `Path=/`) / `__Secure-` with `Path=/api/auth` | ~~`__Secure-`, `/api/auth`~~ → **`__Host-`, `/`** | AI proposal, reviewed; then reversed on **Evidence** | First chosen to keep the 7-day token off other routes. Reversed after a security review: path scoping only limits exposure to our own server, while `__Secure-` opens a cross-subdomain attack |
| 25 | Logout scope | this device / all devices | This device (revokes its family) | AI proposal, reviewed | Logging out on a phone shouldn't sign out the laptop; "all devices" comes with password reset |
| 26 | Parallel refresh with the same token | grace window / strict single-use + single-flight client | Strict + single-flight | AI proposal, reviewed | No window in which a stolen token works; the client guarantees one refresh at a time |
| 27 | How to prove pinned tests | trust them / break the guarded code once | Mutation check | AI proposal, reviewed | Both pinned tests failed with the protection removed and passed with it restored |
| 28 | Email format | HTML templates (library) / plain text | Plain text | AI proposal, reviewed | Three short transactional messages; Mailpit and every client render them; no template dependency |
| 29 | SMTP missing | log mail everywhere / log in dev, refuse to boot in production | Dev-only logging | AI proposal, reviewed | Losing reset emails silently in production is worse than a failed deploy |
| 30 | Per-account mail limit | in-memory counter / "token issued in the last 60 s?" from Mongo | Mongo query | AI proposal, reviewed | Works across instances, zero new code paths; the IP throttle covers bursts |
| 31 | Where verify/reset logic lives | new `RecoveryService` / `AuthService` | `AuthService` | AI proposal, reviewed | One cohesive auth service; split it if it grows further |
| 32 | **Email links vs one-time codes** | links (built in step 5) / 6-digit OTP | **OTP for both flows** | **Overruled AI** | My call mid-build, after the link flow was built and verified. No link scanners burning tokens, no `APP_URL`, and the user stays in the app |
| 33 | OTP design | 6 digits, 10 min, 5 tries / 8 digits, 15 min | 6 digits, 10 min, 5 tries | AI proposal, reviewed | ASVS 6.5.5 caps out-of-band codes at 10 min; 5 tries in 10⁶ is a 0.0005% guess chance |
| 34 | Storing codes | sha256 / HMAC with a server key / argon2 | HMAC (key: the JWT secret) | AI proposal, reviewed | sha256 of 10⁶ values reverses instantly from a leaked DB; argon2 is unneeded with 5 attempts. Rotating the secret only voids codes ≤ 10 min old |
| 35 | Where attempts are counted | inside the reset transaction / before it | Before, atomically | AI proposal, reviewed | Inside, a wrong guess's attempt would roll back with the aborted transaction: unlimited guesses |
| 36 | Locked account response | "account locked" / generic 401 | Generic 401 | AI proposal, reviewed | A distinct message confirms the account exists; reset is the way out |
| 37 | Per-IP throttling in e2e | keep (tests hit limits) / skip when `NODE_ENV=test` | Skip in tests | AI proposal, reviewed | All test traffic shares one IP. 429 verified manually; per-account limits stay tested |
| 38 | Breach check on HIBP outage | fail closed / fail open | Fail open | AI proposal, reviewed | An outage of a third-party API must not block sign-up or reset |
| 39 | Guessing limits | per code only / per code + per-account daily budget | Both | **Evidence** | Security review showed per-code limits reset with every new code |
| 40 | Counting attempts | check, then increment / reserve atomically, then verify, refund on success | Reserve first | **Evidence** | Only the atomic version holds under parallel requests |
| 41 | "Confirm password" on reset | keep / drop | Drop | **Evidence** | web.dev form guidance: the show-password toggle catches typos; typing it twice is friction |

**UI decisions (42–48)** are in [docs/UI.md](docs/UI.md#ui-decisions).

## Build log

Each step records: **prompt → what AI generated → what I changed → how it was verified.**

<!-- One entry per build step, appended as the work happens. -->

### Step 1: workspace + `packages/shared`
- **Prompt:** "Yes, start step 1" (after the plan, research and rules were agreed)
- **Generated:**
  - root `package.json` (npm workspaces, Node ≥ 24.15) and a strict `tsconfig.base.json`
  - `packages/shared`:
    - zod schemas for sign up, sign in, forgot, verify and reset
    - `passwordRules` as one data list used by both the API and the UI checklist
    - `User` and RFC 9457 `ProblemDetails` types
    - table-driven tests
- **Changed:**
  - **Git identity:** set per repo to my personal account (AmalEltelbany). Global git and the GitHub CLI were on my work account.
  - **Password rules:** the agent first left the letter, number and special-character regexes as TODOs, flagging two policy questions ("is `ä` a letter?", "is a space special?"). I then had it write them. Unicode-aware letters and numbers (`\p{L}`, `\p{N}`); "special" means not a letter, number or whitespace. The edge cases are pinned in the test table.
  - **Package exports:** subpath exports (`@auth-module/shared/auth-schemas`) instead of an `index.ts` barrel, matching the no-barrels rule.
- **Verified:**
  - `npm install`: 0 vulnerabilities
  - `npm run typecheck`, `npm run build`: clean
  - `npm test`: 25 of 25 pass. Before the rules were written, 17 of 20 passed and the 3 password tests failed as expected, which confirmed they actually exercise the rules.

### Step 2: API core (sign up, sign in, logout, `/users/me`)
- **Prompt:** "Start step 2"
- **Generated:**
  - `apps/api`, NestJS 12 (ESM):
    - `config.ts`: zod-validated env, loaded with Node's built-in `process.loadEnvFile()`, no dotenv
    - `users`: Mongoose schema with a unique email index, `passwordHash` hidden with `select: false`, and `sessionVersion`
    - `auth`: argon2id hashing, a 15-min JWT in a `__Host-` httpOnly / Secure / SameSite=Strict cookie, and a global guard with a `@Public()` opt-out that checks `sessionVersion`
    - a global RFC 9457 problem-details filter (Mongo duplicate key `11000` → 409 on the `email` field)
    - Nest 12's Standard Schema pipe validating with the **shared** zod schemas, plus throttling, built-in security headers, built-in CSRF protection and Swagger at `/api/docs`
  - `test/auth.e2e-spec.ts`: 12 supertest tests against a real `MongoMemoryReplSet`
  - `docker-compose.yml`: a Mongo 8 single-node replica set that initiates itself
- **Changed:**
  - **Checked the framework before writing code.** I had the agent read the installed NestJS type definitions, not docs or memory. That removed **helmet** (Nest 12 has `useSecurityHeaders()`), confirmed the built-in cookie and CSRF APIs, and caught that `setCookie` `maxAge` is in seconds.
  - **Deep import** for reading cookies inside the guard: Nest doesn't export that helper publicly yet. Marked with a `ponytail:` comment naming the upgrade path.
  - **Smoke-test port collision.** Port 3000 was my other project's dev server. Moved the API default to 3001.
  - **Refresh tokens deferred to step 4.** For now, sessions last 15 minutes.
  - **Accepted one npm audit finding:** a moderate `minimatch` advisory in `@nestjs/cli`, a build-time tool that never runs in production.
- **Verified:**
  - `npm run typecheck`, `npm run build`: clean
  - `npm test`: shared 25/25, API e2e 12/12. Covers:
    - 201 with hardened cookie flags (`Max-Age=900`)
    - 409 on a duplicate email in any case
    - 400 field errors
    - identical 401 for a wrong password and an unknown email
    - `/users/me` with and without a session
    - logout clears the cookie
    - security headers, CSRF rejection of `Sec-Fetch-Site: cross-site`, and OpenAPI paths
    - pinned: `passwordHash` never appears in a response
  - Manual smoke test of the **built** server (`node dist/main.js`) against Docker Mongo: health, signup 201 with a cookie, `/users/me` 401 then 200, and the Swagger UI loads

### Step 3: web core (sign up, sign in, welcome page)
- **Prompt:** "Start step 3"
- **Generated:**
  - `apps/web`, Vite 8 + React 19:
    - Tailwind 4 + shadcn on **Radix** (Nova preset)
    - `lib/api.ts`: the only `fetch`; same-origin `/api` through Vite's proxy; problem details become `ApiError`
    - `lib/form-errors.ts`: server field errors go under their input, anything else above the button
    - `AuthProvider`: union-type state, `/users/me` check on startup, cross-tab logout via `BroadcastChannel`
    - `RequireAuth` / `GuestOnly` layout routes
    - sign-up and sign-in pages: shared zod schemas, live password checklist, show/hide password, correct `autocomplete` values
    - welcome page with the exact "Welcome to the application." text and a logout button
  - 10 component tests that render the **real route table** with only the network mocked
- **Changed:**
  - **Reviewed generated code before trusting it.** The Vite template pinned TS 7, and shadcn added `next-themes`. Both removed (see Corrections).
  - **jsdom 29 instead of 30**, so the project runs on Node 24.14 without an upgrade.
  - **Security review of step 2 (automated):** bound dev Mongo to localhost. The logout and signup-409 findings are recorded as decisions 21–22.
  - **Bug found only by manual testing:** the session re-check fired on every tab-visibility change, even when signed out. Fixed and re-verified.
- **Verified:**
  - `npm run lint` (0 errors; 2 fast-refresh warnings on deliberate provider + hook files), `npm run typecheck`, `npm run build`
  - `npm test`: shared 25/25, API 12/12, web 10/10
  - **Manual, in a real browser against the real API and Mongo:**
    - sign-up field error shown after leaving the field
    - live checklist
    - sign-up → "Account created" toast → welcome page
    - `document.cookie` and both storages **empty** (the session is httpOnly only)
    - session survives a reload; logout then reload goes to `/signin`
    - wrong password shows the generic error
    - duplicate email (different case) shows the error under the email field
    - layout correct at 375px
  - Bundle: 163 kB gzipped (React DOM plus full zod). Acceptable for now; token pages will be lazy-loaded in step 5.

### Step 4: refresh tokens and sessions
- **Prompt:** "Start step 4"
- **Generated:**
  - `sessions` module: one row per refresh token, stored as sha256 only, in families, with a TTL index. `rotate()` claims the token with a single atomic `findOneAndUpdate`. A token that was already used counts as a replay, and its whole family is revoked.
  - auth:
    - sign-up and sign-in also set `__Secure-refresh_token` (`Path=/api/auth`, 7 days)
    - `POST /auth/refresh` rotates both cookies and clears them on failure
    - logout is public and revokes this device's family, which addresses the step 2 security-review finding
  - web `lib/api.ts`: on a 401, one shared refresh call, then each request retried once. If the refresh fails, an `onSessionExpired` event signs the user out. Auth routes never trigger a refresh.
  - tests: 5 new API e2e tests, including the **pinned** reuse-detection test, and 4 `api.ts` unit tests, including the **pinned** "3 parallel 401s → 1 refresh" test
- **Changed:**
  - **Mutation-checked both pinned tests.** With reuse detection disabled, exactly the reuse test failed. With `??=` changed to `=`, the parallel test failed with "expected 3 to be 1". Both pass with the code restored.
  - **The first mutation run reported "17 skipped", not a failure.** The real cause was a broken mongod download triggered by running from a different directory. Fixed by pinning the binary cache (see Corrections).
  - **Security review before committing:** `refresh()` didn't check `sessionVersion`, so step 5's reset could have been bypassed through refresh. Sessions now record the version they were issued under. `rotate()` became `claim()`, then a version check in `AuthService`, then `create()` for the next token in the family. New pinned test, mutation-checked.
- **Verified:**
  - `npm run lint`, `typecheck`, `build`: clean
  - `npm test`: shared 25, API 18, web 14, so **57/57**
  - **In a real browser:**
    - signed in, then invalidated every access token by rotating the API's JWT secret and restarting it
    - reloading showed `me 401, me 401 → refresh 200 (once) → me 200, me 200`, and the user stayed signed in
    - after logout, the browser's refresh cookie got 401: revoked on the server

### Step 5: email verification and password reset
- **Prompt:** "Start step 5"
- **Generated:**
  - **API:**
    - `MailService`: nodemailer, plain text, logs instead of sending without SMTP in development; production config requires SMTP
    - a one-time-token store: sha256 only, single atomic consume, older links deleted on reissue, TTL index
    - `POST /auth/verify-email`, `/verify-email/resend` (signed in, 3 per 15 min), `/forgot-password` (always 202, all work deferred until after the response), `/reset-password`
    - reset runs in **one Mongo transaction**: consume token, new hash plus `sessionVersion++`, mark email verified, delete reset tokens, revoke every session; then a "password changed" email
    - a 60 s per-account mail cooldown
  - **Web:** lazy-loaded verify, forgot and reset pages. A `useLinkToken` hook reads `#token` once and strips it from the URL. The verify page **only sends after a click**. The reset page has the password checklist and a confirmation field. Also: a verify banner with resend on home, and "Forgot password?" on sign-in.
  - **Docker:** Mailpit, on localhost only.
  - **Tests:** 10 API e2e tests with a **recording mail fake** (they follow the real links the API builds), and 9 web tests.
- **Changed:**
  - Mutation-checked 2 more pinned tests:
    - removing `sessionVersion++` from `setPassword` fails the reset test
    - making the verify page auto-submit fails the no-auto-POST test
  - The raw throttler message on 429s would have reached users (see Corrections).
  - Bumped the Mailpit pin from 1.29 to 1.33 after its own API reported a newer release.
  - Deleted the temp files holding real link tokens after the browser run.
- **Verified:**
  - lint, typecheck, build: clean
  - `npm test`: shared 25, API 28, web 23, so **76/76**
  - Lazy pages cut the main bundle from 163 to 117 kB gzipped.
  - **End to end in a real browser, with real SMTP into Mailpit:**
    - sign-up, then the verification email arrives, built from `APP_URL`, with a 43-character token in the `#fragment`
    - opening the link sends **0 requests** and strips the token from the URL
    - the click shows "Email confirmed", and the banner disappears
    - forgot-password shows the generic "Check your email", and the reset email arrives
    - a new password is set, then the app redirects to `/signin`
    - a second device (curl) gets 401 on both access and refresh
    - old password 401, new password 200, reusing the link 400
    - the "Your password was changed" email arrives

### Step 6: hardening, OTP instead of links, README, CI
- **Prompts:**
  - "Start step 6"
  - then, mid-step: "i want otp not email link" (both flows; 6 digits, 10 min, 5 tries)
- **Generated:**
  - **Lockout:** 5 wrong passwords lock the account for 15 min. The counter lives on the user document; a reset lifts the lock; the response stays generic.
  - **Breached-password check:** HIBP k-anonymity range API, fails open. Runs at sign-up and reset, before the code is checked.
  - **OTP rework, replacing step 5's links:**
    - API: an HMAC'd code store with atomic attempt counting; `verify-email` now requires a session; reset takes `{ email, code, password, confirm }`; `APP_URL` removed
    - Web: a code-entry verify page (protected), forgot leads to a reset page with the email filled in, a `CodeField` input (`one-time-code` autocomplete), and the banner now says "Enter code"
  - **Security-review fixes for the step 5 commit:** no user text in emails to unverified addresses; an atomic per-account mail cooldown.
  - **Resilience:** startup retries 5xx and network errors instead of signing the user out.
  - **Also:** a README for graders, and a GitHub Actions CI workflow (lint, typecheck, test, build on Node 24).
- **Changed:**
  - **Mutation-checked the new protections:**
    - no attempt limit fails both "5 wrong attempts" tests
    - a distinct "no such account" message fails the enumeration test
    - no lockout counting fails the lockout test
  - **Kept code checks outside the reset transaction on purpose.** An abort would roll back the attempt counter (decision 35).
  - **CI:** moved the mongod cache step *after* `npm ci`, which deletes `node_modules`.
  - Several of the corrections above were found only by running the real stack, not by the tests: the 502 sign-out, the `_id` on `mailSentAt`, and the leftover process.
- **Verified:**
  - From a clean `npm ci`, the same sequence as CI: `lint` (exit 0; 2 known warnings), `typecheck` (0 errors), `test` (**104/104**: shared 35, API 43, web 26), `build`
  - **End to end in a real browser with real SMTP into Mailpit:**
    - **Verification:** sign-up, then the email contains only the code (no link, no name), entered with a pasted space, then 204, home, banner gone. An 18-minute-old code was correctly refused as expired.
    - **Reset:** forgot, then the reset page with the email filled in, then the code from Mailpit and a new password, then `/signin`
    - **After the reset:** a second device's access and refresh tokens give 401, the old password 401, the new one 200, reusing the code 400, and the "password changed" email arrived

### Step 7: fixes from the security review of step 6
- **Prompt:** none. Two automated security reviews of the step 6 commit, acted on before pushing.
- **Findings and changes:**
  - **OTP brute force across codes (high).** The 5-attempt limit was per code, and a new code could be requested every 60 s: ~7,200 guesses a day, about a 0.7% chance per day of taking over an account. **Fix:** a per-account budget of 10 wrong codes per 24 h, across every code (`reserveCodeAttempt`). This brings it to about 0.001% per day.
  - **Race in the lockout (medium).** Parallel wrong passwords all read "not locked" before any counter moved. **Fix:** reserve the attempt atomically *before* verifying the password, and refund it on success (`reserveLoginAttempt`). The code budget uses the same pattern.
  - **Lockout can be triggered by someone else (medium). Acknowledged, not changed:** it lasts 15 min, a reset lifts it, and the README lists it as a trade-off. Progressive delays or CAPTCHA would be the next step for a real product.
- **Changed:** my first version of the budget test was itself buggy. It read "the latest mail" before the fire-and-forget email had arrived, so it used an already-replaced code. Fixed it by waiting for one *new* email, then ran the suite 3× to rule out flakiness.
- **Verified:**
  - 3 new tests (cross-code budget; 12 parallel sign-in reservations → exactly 5; 15 parallel code reservations → exactly 10)
  - **Mutation-checked:** removing the budget, the login limit or the code limit fails exactly the matching tests
  - full suite green (see the commit)

### Steps 8–10: UI
Moved to [docs/UI.md](docs/UI.md#ui-build-log): the UI refresh, the design reset (less "AI-looking") and the name, logo and theme toggle.
