# app-cap review — 2026-10-16

Reviewed: `a9c618c..b3286c1` of `/Users/sl/src/app-cap`, against the spec
`docs/plans/2026-10-15-app-cap-design.md`, the plan `docs/plans/2026-10-16-app-cap-plan.md` (Tasks 3–11), every
`Ruling:` line in the ledger, the bot-protection contract in frontend-core (`requireBotProtection`, `types.ts`,
the bypass), capjs-core 0.1.5 and @cap.js/widget 0.1.58 as installed, and the repository rules. The reviewer did
not write the code.

What was run:

- `REDIS_URL=redis://127.0.0.1:6390 pnpm vitest run`: 10 files, 70 passed.
- `pnpm exec playwright test`: 5 passed (4.8 s) on the existing builds.
- `pnpm exec eslint .`: clean. `pnpm run test:types`: clean.
- Sabotage: the `$` anchor in the token format removed made "an extra part" and "two tokens" fail; `left <= 0` →
  `left < 0` made "expires at this very moment" fail. Both restored, `git diff --stat` empty.
- Two private instances of the built playground (`.output-open` on :3157, `.output` on :3158, both with the
  secret `review-secret-xyz`, Redis :6390), a private `redis-server` on :6391 for outage and ACL tests, and
  scripts in `$TMPDIR` that drive orchestr's real Redis client, crafted challenges and headless Chromium.

## Strengths

- **The proof token is tight.** Anchored format, fixed lengths, HMAC over the exact string, `timingSafeEqual` on a
  length that the regex fixes at 32 bytes, so the length check leaks nothing. Signature malleability (the two
  ignored bits of the last base64url character) cannot replay: the claim is on the id, not on the string. The same
  holds for capjs-core's challenge claim, which is keyed on the decoded signature bytes.
- **Order of checks is right.** No forged or expired token ever writes to Redis; the claim runs only after the HMAC
  and the expiry pass, exactly as the spec's table orders it.
- **Review focus 1–5 hold.** (1) The adapter queue plus `held = undefined` give two parallel actions two tokens; the
  handler order (`startSolve`'s `.then` registered before `take`'s `await`) is sound. (2) `left <= 0` is `expired`,
  and the test catches a sabotage. (3) On the built server a declared 16,384-byte body gets 403, 16,385 gets 413;
  the same for chunked bodies of those sizes. (4) Verified with orchestr's real `lazyConnect` + node-redis 6.2.1
  client against a Redis I stopped and restarted: `down` during the outage (1,002 ms each), `claimed` again after
  restart without a process restart, also after the reconnect strategy had given up. (5) Extra dots, internal
  spaces, a second token (Node joins duplicate headers with `, `) are `malformed-proof`; leading/trailing spaces are
  trimmed by Node's HTTP parser before the app sees them, which is correct HTTP.
- **Cloud plugin order is handled.** Nothing in the plugin body touches the mount; `createLazyStore` asks
  `redisKeyPrefix` on first use and keeps a found store. cloud-runtime's `cacheMount` mounts synchronously in its
  plugin, so no request can arrive before it. The screeny05 driver reports `name: 'redis'` with `url` and `base` in
  `options`, so `redisKeyPrefix` resolves to `t:<tenant>:app-cap:` on Cloud.
- **`SET NX PX` shape is right for node-redis 6.2.1** (`expiration: { type, value }`, `condition: 'NX'`), proven
  against a real Redis in CI and locally.
- **No CDN reach.** All three CDN fallbacks in `widget.js` are overridden; the e2e asserts every request stays on
  the origin. The WASM is inlined base64 in capjs-core, so inlining it changes nothing at runtime.
- **The esbuild/obfuscator alias is safe at level 3.** capjs-core imports them only for levels above 3, dynamically,
  and catches a failed import. The server output carries neither package.
- **`/challenge` is no CPU amplifier**: about 1.5 ms per request end to end, 6.4 KB response, nothing stored.
- **Redeem leaks nothing**: `{ success: false }` for every failed validation.
- Clean, small modules; the name is spelled once; comments explain why; no design-doc references; lint and types
  clean.

## Issues

### Critical (must fix)

**C1. A challenge or token from one environment passes in every other environment of the same project — so
production's `blockAutomatedBrowsers` and `difficulty` are only as strong as the weakest environment.**
`src/runtime/server/lib/secret.ts:9-11`, `src/runtime/server/plugins/capVerifier.ts:17`. Confirmed.

- Both keys derive from `projectSecretKey` alone. Cockpit writes one `secret_key` per **project** into every
  environment's laioutrrc (`apps/cockpit/src/lib/project/data-provider/ProjectRcProvider.ts:100`), and a project
  has three environments by default. The app's options are per environment (`apps_config`).
- capjs-core reads `blockAutomatedBrowsers` and the difficulty **from the encrypted challenge**, not from the
  redeeming server (`validateChallengeV2`, `meta.blockAutomatedBrowsers`, `e.d`). So a challenge minted by a weaker
  environment redeems on production under the weaker rules, and a token redeemed anywhere verifies everywhere.
- Reproduced: headless Chromium against the blocking build alone fails (`prepare failed … redeem`). The same
  browser fetching its challenge from the open build (same secret) and redeeming on the blocking build gets 200,
  and the resulting held proof is accepted by the blocking build's protected route: `200 {"ok":true}`.
- The README itself advises "switch `blockAutomatedBrowsers` off in a test environment", which creates exactly this
  hole. Any environment with a lower `difficulty` likewise sets production's price.
- Fix: put what the challenge must not cross into the derivation labels — the environment name (frontend-core has
  it at build time as `laioutrrc.laioutr.environmentName`; write it into the app's private runtime config) and the
  resolved options, e.g. `app-cap:v1:challenge:<env>:<difficulty>:<0|1>` and `app-cap:v1:token:<env>`. A changed
  option then invalidates in-flight proofs once, the same as a key rotation. Add a test that a token or challenge
  from another label fails, and an e2e like the reproduction above.

### Important (should fix)

**I1. The 16 KB body limit is bypassed by `Transfer-Encoding: chunked`; the whole body is buffered first.**
`src/runtime/server/api/redeem.post.ts:12-15`. Confirmed.

- Without `content-length`, `Number(undefined)` is `NaN`, `NaN > limit` is false, and `readRawBody` reads the
  entire stream before `redeem()` measures it. The comment "a large body costs nothing" holds only for declared
  lengths.
- Measured on the built server: one unauthenticated 200 MB chunked POST returned 413 after 171 ms and took the
  process from 162 MB to 788 MB RSS. A handful in parallel exhausts a pod's memory; behind Cloudflare each request
  may still be up to 100 MB.
- Fix: read `event.node.req` as a stream with a byte counter and stop (destroy the request, answer 413) at 16,385
  bytes; or refuse a request without `content-length` with 411 — the widget always sends one. Add a route-level
  test (chunked 16,384 → passes the size check, 16,385 → 413) — no test covers the route today.

**I2. A Redis that answers with an error is treated as an outage, so a misconfiguration turns replay protection off
under the default `whenUnavailable: 'open'`.** `src/runtime/server/lib/claim.ts:46-50`. Confirmed.

- Every throw — including Redis reply errors such as `NOPERM`, `READONLY`, `WRONGTYPE` — becomes `down`. At redeem
  that issues `u` tokens for the same solution without limit; at verify it returns `unavailable`, which frontend-core
  lets through under `open` (its default), replays included, on every request.
- Reproduced on a private Redis with a tenant ACL `~t:tenant:*`: a prefix outside it gives `down down` for a claim
  and its replay; inside it, `claimed taken`. A wrong scope from `redisKeyPrefix` (the ledger's deferred F6 is such
  a case), a replica answering `READONLY`, or an ACL change would make every Cloud project fail open silently except
  for frontend-core's per-request warning.
- The contract says a verifier returns `invalid`, never `unavailable`, for a configuration error.
- Fix: classify node-redis reply errors (`ErrorReply`/`SimpleError`) apart from transport errors and timeouts. A
  reply error is `invalid` with a reason such as `store-error`, logged with `console.error` once; only connection
  errors and the 1 s limit stay `down`. Test it with an ACL user on the CI Redis.

**I3. A `u` token keeps its outage verdict after the outage ends.** `src/runtime/server/lib/verifyProof.ts:25`,
`src/runtime/server/lib/redeem.ts:73-81`. Confirmed by code and the unit test "hands a proof redeemed during an
outage to the project policy, once"; spec-conformant, but the spec's reason ("the server sees this outage") is true
only at redeem time.

- Under `open`: one solution redeemed N times during even a one-second blip yields N tokens that each pass once, up
  to 10 minutes after Redis is back; after recovery the same solution redeems once more as `c`. The README says
  "while Redis is down", which understates it.
- Under `closed`: the adapter holds the proof it solved ahead. A visitor whose background redeem fell into a blip
  gets a 503 on their next action, up to 10 minutes later, while nothing is down.
- Fix: carry a digest of the challenge signature in the token (or only in `u` tokens) and, at verify, claim
  `c:<digest>` as well when the flag is `u`: `claimed` → `valid`, `taken` → `replayed`, `down` → `unavailable`.
  Give that claim the full token lifetime plus the challenge lifetime. Then a `u` token is judged by the store's
  state at the action, which is what the policy is about.

### Minor

**M1. A crafted instrumentation payload makes `validateChallenge` throw, and the redeem answers 500.**
`src/runtime/server/lib/redeem.ts:71`. Confirmed. capjs-core's `detectAutomation` calls `String(S.ua)` and
`brands.join`; `{"ua":{"toString":1}}` throws `TypeError: Cannot convert object to primitive value`. With a crafted
challenge (signed with the test secret) the built server answered 500, logged an unhandled error with stack, and set
no `app_cap.redeem.result`. Reaching it needs a valid PoW and instrumentation state, but nothing is claimed, so one
solved challenge can repeat it for its 10-minute life and fill the logs. The repository's fail-soft rule 5 asks for
this wrap. Fix: `try/catch` around `validateChallenge` → 403 `{ success: false }`, result `malformed`.

**M2. Claim TTLs carry no margin for clock skew between instances.** `verifyProof.ts:22` claims for exactly
`expires - now`; capjs-core passes `exp - now` for the challenge claim. An instance whose clock lags another by Δ
accepts the token (or the challenge) for Δ after the claim key expired on Redis, so the same proof passes twice in
that window. Fix: add a fixed margin (for example 60 s) to both TTLs (`consumeNonce` may add it to `ttlMs`).
Suspected — needs skew; NTP keeps Δ small.

**M3. An event-loop stall of 1 s turns an in-flight claim into `down`.** `claim.ts:19-25`. After a stall, Node runs
the expired timer before it reads the Redis reply already in the socket, so a claim that Redis answered becomes
`down` and passes under `open`. A load an attacker can cause (heavy SSR) becomes a replay window. Fix: on the timer,
yield once with `setImmediate` and re-check whether the work settled before declaring `down`. Suspected, not
reproduced.

**M4. The alias of `esbuild` and `javascript-obfuscator` is global to the storefront's server bundle.**
`src/module.ts:58`. Any other server code that imports either at runtime gets the throwing stub. The message names
app-cap, so it is diagnosable. A Rollup plugin with `resolveId(source, importer)` that stubs only when the importer
is inside capjs-core would confine it.

**M5. Missing tests that the spec lists or that guard the boundary.** No test touches the routes or the plugin:
the declared `content-length` 413, the 503 paths, `Cache-Control: no-store`, the provider value written to runtime
config, the build settings (alias, inline) as unit tests. Changing `declared > REDEEM_BODY_LIMIT` to `>=` breaks no
test. The spec's Playwright run "for the node-server and vercel presets" runs node-server only; the Vercel check in
the ledger was a manual package listing, not a solve.

**M6. The README's CSP section is likely incomplete for nonce-based policies.** `README.md:48-57`. The widget runs
the instrumentation in a `srcdoc` iframe with an inline script; a `srcdoc` document inherits the page's CSP, so under
a nonce policy without `'unsafe-inline'` that script runs only with `window.CAP_SCRIPT_NONCE`, which the app never
sets. (`widget.js` itself is fine: same-origin, and inserted by script, so `'self'` or `'strict-dynamic'` covers
it.) The measured page presumably allowed inline scripts already, as a default Nuxt page needs. Fix: document it, or
have `loadWidget` pass the page's nonce to `CAP_SCRIPT_NONCE`. Suspected, not run.

**M7. The peer floor `>=0.71.0` admits a frontend-core without `redisKeyPrefix`.** `package.json:93`. A consumer
on 0.71.0 gets the unpatched orchestr (pnpm patches do not ship), and the build fails on a missing export. The
README's status note records it and the package is `private`, so this is a release step, not a defect yet.

## Declined to judge

- Proof not bound to the action: Turnstile checks `action`; app-cap cannot, because it solves the next proof before
  it knows the action. Single use makes the gap small.
- Holders of `projectSecretKey` (every project member, Studio's browser) can mint tokens offline. They can already
  send frontend-core's signed bypass, so app-cap adds no reach.
- PoW outsourcing (a third-party page proxying challenges to real visitors) and a self-reported automation probe:
  inherent to Cap; the README states the automation check's limits. Obfuscation level 3 is unobfuscated by design.
- Shipped Cap license text is upstream's short Apache-2.0 notice, not the full license text, and `@cap.js/wasm` has
  none: a release-review question, not mine to conclude.
- `/api/app-cap/` versus the CLAUDE.md wording "every URL under `/app-<name>/`": the spec chose `/api/app-cap/`,
  which is namespaced and collision-free.
- A storefront under a non-root `app.baseURL` would miss the hard-coded `/api/app-cap/` and `/app-cap/0.1.58/`
  paths; Laioutr storefronts serve at the root, as far as I know.
- frontend-core's fallback secret (`Math.random`, ~11 characters) for a laioutrrc without a key: frontend-core's
  concern; Cockpit always writes one.
- Manual checks (headed Chrome walk, a phone solve time) and the docs-repository provider section: release steps
  the plan leaves to the user.

## Verdict

**Not ready to ship.** The core mechanics are well built and the five focus cases hold, including Redis recovery
with orchestr's real client and the Cloud plugin order. But C1 lets a bot meet production's protection with the
rules of any other environment of the same project — reproduced with headless Chromium — and the README's own
advice creates that setup. Fix C1 before release. Fix I1–I3 before customers rely on it: I1 is an unauthenticated
memory exhaustion on a public route, I2 makes a misconfigured Redis fail open silently under the default policy, and
I3 extends an outage's verdict past the outage. The Minor items can follow.

## Resolution (implementer, 2026-10-16)

| Finding | Status | Proof |
| --- | --- | --- |
| C1 | Fixed. Both key labels carry `blockAutomatedBrowsers` and `difficulty`, so a challenge or a token from an environment with other options fails here. | `secret.test.ts` "derives other keys when …" (2 cases) and `redeem.test.ts` "refuses a challenge issued under other options" failed first, then passed. |
| I1 | Fixed. The route reads `event.node.req` through `readBodyLimited`, which stops at the first byte over 16 KB without destroying the socket, and answers 413 with `connection: close`. | `readBody.test.ts` "stops at the first byte over the limit" (17 of 1,000 chunks pulled); a sabotage that counts after reading fails it. E2E: a chunked 64 KB POST gets 413. |
| I2 | Fixed. A Redis reply error (`ErrorReply` class or an upper-case code word) is `error`, not `down`: the verifier answers `invalid` / `store-refused`, the redeem answers 403 / `store-refused`, and the store logs the reply code once. Timeouts and connection failures stay `down`. | `claim.test.ts` "reports a refused command as an error" with a real ACL user (NOPERM); verdict and redeem cases. |
| I3 | Fixed. The token carries `challengeRef(signature)`. The verifier claims `c:<ref>` for a `u` token: claimed → `valid`, taken → `replayed`, down → `unavailable` / `unclaimed-challenge`. The redeem claims the same key. | `verifyProof.test.ts` "claims its challenge now, so one solution passes once after the outage"; a sabotage that skips the claim fails it. |
| M1 | Fixed. A throw inside `validateChallenge` answers 403 / `malformed`. | `redeem.crash.test.ts` with the library's throw faked. |
| M2–M7 | Deferred. | Listed as deferred minors in the report to the user. |

After the fixes: unit 12 files / 84 tests, e2e 6 tests on two production builds, lint and types clean.
