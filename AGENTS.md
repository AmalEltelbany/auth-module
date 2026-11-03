# Auth Module — Agent Instructions

Full-stack auth module: sign up, sign in, protected page, email verification and password reset. NestJS 12 + MongoDB API and a React 19 + TypeScript web app, in an npm workspaces monorepo.

Read the section that matches the code you are editing before you change it.

| Section | Read when |
|---|---|
| [Project](#project) | Always: stack, versions, layout, dependencies, git |
| [Security](#security) | Always: cookies, tokens, enumeration, logging |
| [API](#api-nestjs) | Editing `apps/api/**` |
| [Web](#web-react) | Editing `apps/web/**` |
| [Testing](#testing) | Editing `*.test.ts(x)` or `*.e2e-spec.ts` |

## Default workflow

1. Read the surrounding code and the matching section below.
2. Make a minimal, focused diff that matches existing naming and patterns.
3. Verify: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` (from the repo root).
4. Don't commit unless explicitly asked.

## Do not

- Add a dependency without checking [Dependencies](#dependencies)
- Store tokens anywhere JavaScript can read them
- Read `process.env` outside `apps/api/src/config.ts`
- Call `fetch` outside `apps/web/src/lib/api.ts`
- Duplicate a validation rule that `packages/shared` already owns
- Refactor unrelated code in the same change
- Delete or weaken a test listed under [Pinned tests](#pinned-tests)

## Environment

API (`apps/api/.env`, documented in `.env.example`):

- `MONGO_URI`: must point at a replica set (transactions)
- `JWT_ACCESS_SECRET`: signs access tokens
- `APP_URL`: public web origin; every email link is built from it
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`: if `SMTP_HOST` is empty, mail is logged instead of sent. That's development only; config refuses to boot in production without `SMTP_HOST`.

Web: none. It calls the relative path `/api`, proxied by Vite in dev and nginx in prod.

Local services: `docker compose up` (Mongo replica set, Mailpit inbox on `http://localhost:8025`).

---

# Project

## Stack

- **API**: NestJS 12.1+ (Express), Mongoose 9, `@nestjs/jwt`, argon2, zod 4, throttler, swagger, nodemailer. Security headers, CSRF protection and cookies are Nest 12 built-ins (`useSecurityHeaders()`, `enableCsrfProtection()`, `httpAdapter.setCookie()`), so no helmet or cookie-parser.
- **Cookies:** `setCookie` `maxAge` is in **seconds** (Express' `res.cookie` uses milliseconds).
- **Web**: React 19, Vite 8, react-router 8 (data mode), Tailwind 4, shadcn/ui on Radix, sonner, react-hook-form + zod
- **Tests**: Vitest (both apps), supertest + mongodb-memory-server (API), Testing Library + jsdom (web)
- **Lint**: oxlint (the Vite template's linter), with `npm run lint` at the root
- **Package manager**: npm workspaces

## Versions (pinned on purpose)

| Pin | Why |
|---|---|
| Node **≥ 24** | react-router 8 needs ≥ 22.22. Web tests use jsdom **~29.1** because jsdom 30 needs Node ≥ 24.15. |
| TypeScript **~6.0** | The Nest CLI bundles TS 6, `@nestjs/swagger` peers `^5.5 \|\| ^6`, and typescript-eslint peers `<6.1` |
| `@nestjs/*` **^12.1** | Built-in cookies and `enableCsrfProtection()` start at 12.1 |
| Vitest **~5.0** | 5.1.0 was brand new when we pinned. Bump deliberately. |

Don't bump a major without checking every peer range first.

## Layout

```
apps/api/src/
  auth/ users/ sessions/ mail/ common/
  config.ts  app.module.ts  main.ts
apps/web/src/
  app/          router.tsx, providers.tsx
  features/     auth/, home/  →  pages/ hooks/ components/
  components/ui shadcn primitives
  lib/          api.ts, form-errors.ts
packages/shared/src/
  auth-schemas.ts  password-rules.ts  types.ts
```

## Structure rules

- Dependencies point one way: `apps/*` → `packages/shared`. Shared never imports from an app or a framework (zod only).
- Code moves to `packages/shared` only when **both** apps use it.
- Inside an app, code moves to a shared folder only when a **second** feature uses it.
- No barrel `index.ts` files in features. Import from the concrete file.
- tsconfig uses `paths` (`@/*`) **without** `baseUrl`. TS 6 rejects `baseUrl`, but shadcn's init adds it, so delete that line after running it.

## Dependencies

Add a library only if the code it replaces is substantial or security-critical. Otherwise write the few lines.

```ts
// ❌ BAD: a dependency for a one-liner
import cloneDeep from 'lodash/cloneDeep';

// ✅ GOOD
const copy = structuredClone(obj);
```

- Platform first: `structuredClone`, `Object.groupBy`, `BroadcastChannel`, `fetch`, native input attributes.
- State why a new dependency earns its place in the commit message.
- Considered and rejected, so don't add them without a reason: helmet, cookie-parser, dotenv (`process.loadEnvFile()`), next-themes (shadcn's sonner adds it; ours follows the OS theme), pino, terminus, `@nestjs/config`, msw, jest-dom, axe, jsx-a11y-x, lodash, Redux/Zustand, TanStack Query.

## Simplifications

Mark deliberate shortcuts so they read as intent, and name the upgrade path:

```ts
// ponytail: no SMTP configured → log mail instead of sending; set SMTP_HOST to send
```

## Git

- Conventional commits: `feat(api): …`, `fix(web): …`, `test(shared): …`, `docs: …`, `chore: …`
- One concern per commit. `main` always builds and passes tests.
- Never commit `.env`. Update `.env.example` (and [Environment](#environment)) when a config key changes.

## General rules

- Minimal, focused diffs. Don't refactor unrelated code.
- Match existing naming and file conventions before introducing a new pattern.
- Deleting a file? Grep for its path and fix references in the same change.

---

# Security

## Tokens and cookies

- Access JWT (≤ 15 min) and refresh token live **only** in httpOnly, `Secure`, `SameSite=Strict` cookies:
  - `__Host-access_token`, 15 min
  - `__Host-refresh_token`, 7 days
  - **Both must keep the `__Host-` prefix** (forces `Secure`, `Path=/`, no `Domain`). With `__Secure-` and a narrower path, a sibling subdomain could plant its own refresh token ("cookie tossing") and sign a victim into the attacker's account.
- Logout revokes only **this device's** family. A copied access token can still work until it expires (≤ 15 min); that's the accepted trade-off of short-lived JWTs.
- Refresh tokens are opaque, stored **hashed**, rotated on every use, and grouped in families. Reusing an already-used token revokes the whole family.
- Access JWTs carry `sessionVersion`. The guard compares it with the user's, so a password reset kills live access tokens too.

```ts
// ❌ BAD: readable by any script on the page
localStorage.setItem('token', res.accessToken);

// ✅ GOOD: the server sets the cookie; the client never sees the token
await api.post('/auth/signin', body); // credentials: 'include' in lib/api.ts
```

## One-time tokens (verify email, reset password)

- 32 random bytes (`base64url`) go in the link; only `sha256(raw)` is stored.
- Consume with **one** atomic `findOneAndUpdate({ tokenHash, type, usedAt: null, expiresAt: { $gt: now } }, { usedAt: now })`. Never find → check → update.
- Keep the `expiresAt` check in the query. Mongo's TTL cleanup only runs about once a minute.
- Expiry: verify 24 h, reset 30 min. Issuing a new token deletes older unused ones; a password change deletes all reset tokens.
- Links put the token in a `#fragment`, never in `?query`. The page strips it with `history.replaceState` and POSTs it **only after a user click**. Email scanners open links and run JavaScript.
- Links are built from `APP_URL`, never from the request's `Host` header.

## Enumeration

- `POST /auth/forgot-password` **always** returns 202, even for an unknown email or a tripped rate limit. Do the lookup and send the mail **after** responding.
- Sign-in failures return one generic "Invalid email or password".
- Known, documented trade-off: signup returns 409 for a taken email.

## Passwords

- argon2id. Minimum 8 (task spec; NIST's 15 noted as a deviation), maximum 128, letter + number + special character, plus a breached-password check (HIBP range API, fail open).
- Sign-in only checks that a password was entered. **Never** apply strength rules at sign-in; that locks out existing accounts.
- Password rules are defined once, in `packages/shared/src/password-rules.ts`.

## Never log

Passwords, password hashes, raw tokens, full email links, cookies, or `Authorization` headers. Log `userId`, the event and the IP. The one exception is the dev-only mail log when `SMTP_HOST` is empty, which production config makes impossible.

## Never

- Store tokens in `localStorage` or `sessionStorage`
- Put a token in a query string
- Return a stack trace or Mongo error in a response
- Use `dangerouslySetInnerHTML`
- Lock an account because of forgot-password requests
- Add a route without deciding whether it is `@Public()`. The default is protected.

---

# API (NestJS)

## Modules

| Module | Owns | Knows nothing about |
|---|---|---|
| `auth` | signup, signin, refresh, logout, verify, forgot/reset, global guard | n/a |
| `users` | user documents, `GET /users/me` | auth, tokens, cookies |
| `sessions` | refresh-token families | HTTP |
| `mail` | sending verification / reset / "password changed" mail | users, tokens |
| `common` | exception filter, `@Public()`, `@CurrentUser()` | features |

Arrows point down only: `auth` → `users`, `sessions`, `mail`.

## Layers

| Layer | Does | Never |
|---|---|---|
| Controller | routes, cookies, status codes, validating input with shared zod schemas | business rules |
| Service | business rules (hashing, lockout, rotation) | touch `req` / `res` |
| Model | data access: inject the Mongoose `Model` directly | wrapped in a repository class |

```ts
// ❌ BAD: a repository that only forwards to Mongoose
class UsersRepository { findByEmail(e) { return this.model.findOne({ email: e }); } }

// ✅ GOOD
constructor(@InjectModel(User.name) private readonly users: Model<User>) {}
```

## Validation

- Validate input with the zod schemas from `packages/shared`, using Nest 12's built-in Standard Schema pipe.
- Code past the controller trusts its input. Don't validate again in services.

## Errors

- Throw Nest exceptions (`ConflictException`, `UnauthorizedException`, …). The global filter turns them into **RFC 9457** problem details.
- Validation errors include `errors: [{ path, message }]`. The web app maps these onto form fields.
- Map Mongo duplicate key `11000` to 409 in the filter, not in each service.

## Mongo

Enforce invariants in the schema, not in code:

```ts
// ❌ BAD: race between the check and the insert
if (await this.users.exists({ email })) throw new ConflictException();
await this.users.create({ email, ... });

// ✅ GOOD: unique index; the filter maps 11000 → 409
@Prop({ required: true, unique: true, lowercase: true, trim: true }) email: string;
```

- `passwordHash`: `select: false`. It's never loaded unless explicitly selected.
- Expiry: TTL index on `expiresAt` (sessions, one-time tokens).
- Password reset runs in **one transaction**: consume token → save hash → `sessionVersion++` → revoke families → delete reset tokens. Transactions need a replica set.

## Config

- `src/config.ts` parses `process.env` with zod once, at startup, and exports a typed object. A bad env crashes on boot.
- Nothing else reads `process.env`.

## Logging and mail

- Use Nest's `Logger` with a context: `new Logger(AuthService.name)`. See [Never log](#never-log).
- Signup and forgot-password send mail **without awaiting it**. Log failures; the user can resend.
- With no `SMTP_HOST`, nodemailer's `jsonTransport` logs the mail instead.

## Endpoints

| Method | Path | Access |
|---|---|---|
| POST | `/auth/signup`, `/auth/signin`, `/auth/refresh` | public, throttled |
| POST | `/auth/logout` | public, uses the refresh cookie (works with an expired access token) |
| POST | `/auth/verify-email` | public, throttled |
| POST | `/auth/verify-email/resend` | protected, 3 / 15 min |
| POST | `/auth/forgot-password` | public, always 202 |
| POST | `/auth/reset-password` | public, throttled |
| GET | `/users/me` | protected |
| GET | `/health` | public |

Every endpoint has Swagger decorators and at least one error-case e2e test.

---

# Web (React)

## Where things live

| Concern | Location |
|---|---|
| Route table + guards | `src/app/router.tsx`, `src/features/auth/guards.tsx` |
| Providers (auth, Toaster) | `src/app/providers.tsx` |
| Pages | `src/features/<name>/pages/` (default export `*Page`) |
| Feature logic | `src/features/<name>/hooks/` |
| Feature UI | `src/features/<name>/components/` |
| UI primitives | `src/components/ui/` (shadcn, Radix base) |
| HTTP | `src/lib/api.ts` only |

## Network

- Every request goes through `lib/api.ts`, which sends `credentials: 'include'`, parses problem details into `ApiError`, and handles refresh.
- On a 401, call `/auth/refresh` **once, shared by every caller** (one in-flight promise), then retry each request once. If the refresh fails, sign out.
- Components never call `fetch`.

## State

| Kind | Where |
|---|---|
| Current user | `AuthProvider` → `useAuth()` |
| Form values / errors | react-hook-form |
| Redirect target, token | router `state` / `location.hash` |
| Anything else | local `useState` |

No global store and no query cache library. Cross-tab logout uses `BroadcastChannel('auth')`. On `visibilitychange`, re-check `/users/me`.

Model status as a union, not booleans:

```ts
// ❌ BAD: allows isLoading && user && error at the same time
const [isLoading, setLoading] = useState(true);
const [user, setUser] = useState<User | null>(null);

// ✅ GOOD
type AuthState =
  | { status: 'loading' }
  | { status: 'authenticated'; user: User }
  | { status: 'unauthenticated' };
```

## Effects

Compute values during render. Don't copy state into state with an effect.

```tsx
// ❌ BAD
useEffect(() => setChecks(passwordRules.map(r => r.test(pw))), [pw]);

// ✅ GOOD
const checks = passwordRules.map(r => ({ label: r.label, ok: r.test(pw) }));
```

## Routing

- Object routes (`createBrowserRouter`). Import `RouterProvider` from `react-router/dom` and everything else from `react-router`.
- Guards are layout routes: `<RequireAuth>` / `<GuestOnly>` render `<Outlet />` or `<Navigate replace />`.
- Every route has an `errorElement`. Token pages use `lazy`.

## Forms

- `useForm({ resolver: zodResolver(schema), mode: 'onTouched' })`, with schemas imported from `packages/shared`. Never redefine them.
- Logic goes in a hook (`useSignUp`); the page only renders.
- Server errors go through `lib/form-errors.ts` → `setError(path)` for fields, `setError('root')` for everything else.
- The submit button is disabled while submitting.
- The password checklist reads `passwordRules` and updates on every keystroke.

## UI

- shadcn on **Radix**. Add components with `npx shadcn@latest add <name>`. Edit the copies in `components/ui/` only for project-wide changes.
- Forms use `Field` / `FieldLabel` / `FieldError` (shadcn's `Form` no longer exists).
- Toasts: `sonner`, for "password changed", "email sent" and network errors. Field errors stay inline, never as toasts.
- Colors come from tokens only:

```tsx
// ❌ BAD
<button className="bg-blue-500 text-white">

// ✅ GOOD
<Button>  {/* bg-primary text-primary-foreground from tokens */}
```

## Accessibility

- Every input has a `<label>`, `aria-invalid`, and `aria-describedby` pointing at its error.
- Use the correct `autocomplete`: `email`, `name`, `new-password` (sign up, reset), `current-password` (sign in).
- The password checklist uses `aria-live="polite"`. Focus moves to the first invalid field on submit.

## Don't

- Add `useMemo` / `useCallback` without a measured reason
- Build a barrel `index.ts`
- Put the user object or tokens in `localStorage`

---

# Testing

## What each layer tests

| Layer | Tool | Tests |
|---|---|---|
| `packages/shared` | Vitest, table-driven | every schema and password rule, 100% |
| API unit | Vitest + real in-memory Mongo | `AuthService`: hashing, lockout, rotation, reuse detection |
| API e2e | supertest + `MongoMemoryReplSet` | every endpoint, including at least one error case |
| Web | Vitest + jsdom + Testing Library | forms, guards, `lib/api.ts` |
| End-to-end (optional) | Playwright | one happy path through real cookies |

## Rules

- **Use `MongoMemoryReplSet`, not `MongoMemoryServer`.** Password reset runs in a transaction, which fails on a standalone `mongod`.
- Nest under Vitest needs `unplugin-swc`, or decorator metadata is dropped and injected services are `undefined`.
- `MONGOMS_DOWNLOAD_DIR` is pinned in `apps/api/vitest.config.ts` to the root `node_modules/.cache`. Don't remove it: running from `apps/api` would fall back to `~/.cache` and download ~800 MB again.
- A pinned test must fail when its protection is removed. When adding one, break the code it guards once and watch it fail.
- Web tests render the real route table with `renderApp(path)` from `src/test/render-app.tsx` and mock only the network at `lib/api.ts` (`vi.mock('@/lib/api')`). The `api.ts` tests stub `fetch` (`vi.stubGlobal`).
- Find elements by role or label, never by CSS class or test id:

```ts
// ❌ BAD
container.querySelector('.email-input');

// ✅ GOOD: also proves the field is labelled
screen.getByLabelText(/email/i);
```

- Password rules are tested as a table:

```ts
it.each([
  ['Passw0rd!', true],
  ['12345678!', false], // no letter
  ['Password!', false], // no number
  ['Passw0rd',  false], // no special
  ['Pa0!',      false], // too short
])('%s → %s', (pw, ok) => expect(passwordSchema.safeParse(pw).success).toBe(ok));
```

- Adding cases to an existing test file? Keep the existing cases. Delete one only when the code it covers is deleted.
- Don't chase a coverage percentage. Cover the rules and the flows.

## Pinned tests

These guard security decisions. Never delete or weaken them; if one fails, the code is wrong.

| Test | Guards |
|---|---|
| Verify page sends no request until the button is clicked | email scanners burning tokens |
| 3 simultaneous 401s → exactly 1 `/auth/refresh` | refresh reuse detection logging the user out |
| Forgot-password returns 202 for unknown emails and when throttled | account enumeration |
| Reusing a used refresh token revokes the family | stolen refresh tokens |
| A refresh token issued before a `sessionVersion` bump fails | a password reset leaving a session alive through refresh |
| After a reset, old sessions and the old password fail | sessions surviving a reset |
| `passwordHash` never appears in any response | hash leaks |
