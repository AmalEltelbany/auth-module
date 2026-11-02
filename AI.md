# AI.md: how AI was used on this project

## Summary

| | |
|---|---|
| **Tool** | Claude Code (desktop app), model Claude Opus 5.5 |
| **Mode** | Agent: it reads files, runs commands, edits code, and spawns background research sub-agents |
| **What AI did** | Planning, research against primary sources, scaffolding, boilerplate, first drafts of code and tests |
| **What I did** | Set scope, made every decision in the log below, pushed back on over-engineering, reviewed and verified output |
| **Guardrails** | `AGENTS.md` (loaded by Claude Code through `CLAUDE.md`) constrains what the agent writes; the "pinned tests" stop it from weakening security tests |

## How I worked

1. **Plan before code.** Had the agent turn the task PDF into a repo structure, an architecture and the flows, before any code existed.
2. **Research instead of trusting the model's memory.** Every library and security choice was checked by a background sub-agent against primary sources (official docs, GitHub, the npm registry, OWASP, NIST). I kept the results, with citations, as local research notes.
3. **Audit the AI's own design.** I had a second research pass grade the drafted verify/reset design against OWASP, NIST and ASVS. It found 7 issues (see Corrections).
4. **Write rules before code.** I converted the decisions into one agent rules file (`AGENTS.md`, with `CLAUDE.md` importing it), modelled on rules I use in another production repo, so generated code follows them from the first commit.
5. **Build in small logged steps.** Every build step below records the prompt, what was generated, what I changed and how it was verified.

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

## Decisions log

Who decided: **Me** (my call), **Me ← AI** (I accepted the AI's recommendation), **Me ≠ AI** (I chose differently from the AI), **Research** (forced by primary-source evidence).

| # | Decision | Options | Chosen | Who | Why |
|---|---|---|---|---|---|
| 1 | Repo shape | two folders / npm workspaces / Nx | npm workspaces: `apps/*` + `packages/shared` | Me ← AI | One copy of the validation rules for both apps |
| 2 | Scope | minimum task / full auth | Full: refresh rotation, email verification, password reset | Me ≠ AI | AI sized it for a few hours; I wanted production depth |
| 3 | TypeScript | 7 / 6 | `~6.0` | Research | The Nest CLI and Swagger don't support TS 7; typescript-eslint requires `<6.1` |
| 4 | Validation | class-validator / zod | zod, shared by both apps | Me ← AI | Nest 12 accepts zod natively; one schema for UI and API |
| 5 | Signup when the email fails | roll back / keep user | Keep user and offer resend | Me ← AI | Signup can't be blocked by an optional feature |
| 6 | Unverified users | can sign in / blocked | Can sign in, with a banner | Me ← AI | Graders reach the welcome page without an inbox |
| 7 | Password minimum length | 8 / 12 / 15 (NIST) | 8 | Me | It's the task spec; documented as a deviation from NIST |
| 8 | UI base | Base UI (shadcn default) / Radix | **Radix** | Me ≠ AI | Mature, and most examples use it; AI recommended Base UI |
| 9 | Toasts | cut / sonner | **Keep sonner** | Me ≠ AI | AI cut it while trimming; I want toasts |
| 10 | Libraries | full researched list / trimmed | Trimmed: 12 cut | Me ≠ AI | AI's research list was too heavy for the scope |
| 11 | Frontend state | Redux / TanStack Query / context | Context + `BroadcastChannel` | Me ← AI | No real server data to cache |
| 12 | Email in dev | real provider / Mailpit | Mailpit + log fallback | Me ← AI | No account or keys needed by graders |
| 13 | Agent rules format | single CLAUDE.md / AGENTS.md + 5 scoped rule files | One `AGENTS.md`, imported by `CLAUDE.md` | Me ≠ AI | AI split rules into 5 Cursor files; we use Claude Code, so one file is simpler |
| 14 | Repo name | fullstack-auth / auth-module / nest-react-auth | `auth-module` | Me ≠ AI | Matches the task's wording ("implement a module") |
| 15 | Research notes | commit / keep local | Keep local, git-ignored | Me | Personal working notes, not part of the submission |
| 16 | What counts as a letter / special character | ASCII `[a-z]` / Unicode `\p{L}`; space special or not | Unicode letters; space is **not** special | Me ← AI | Non-English names and passwords work; a space alone doesn't satisfy "special" |
| 17 | Security headers / CSRF / cookies | helmet + csrf-csrf + cookie-parser / Nest 12 built-ins | Built-ins | Research | Found in the installed framework; three fewer dependencies |
| 18 | Unknown email at sign-in | return 401 immediately / verify against a dummy hash | Dummy-hash verify | Me ← AI | Same response time for unknown and wrong-password, so timing doesn't reveal accounts |

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
