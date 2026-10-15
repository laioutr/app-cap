# app-cap

[![Laioutr][laioutr-src]][laioutr-href]
[![License][license-src]][license-href]
[![Nuxt][nuxt-src]][nuxt-href]

Bot protection for [Laioutr](https://laioutr.com) actions without a vendor account. The app makes
[Cap](https://trycap.dev), an open-source proof-of-work check with browser instrumentation, the
bot-protection provider of a storefront. Everything runs in the storefront's own Nitro server, and the
browser contacts no third party.

> **Status: pre-release.** The app needs `redisKeyPrefix()` from `@laioutr-core/orchestr`, which ships in
> the next core release. Until then, `patches/@laioutr-core__orchestr@0.71.0.patch` adds it to 0.71.0.
> When the release is out, raise the `@laioutr-core/frontend-core` peer floor to it and remove the patch.

## How it works

1. A visitor starts a protected action. frontend-core asks the app for a proof.
2. A hidden widget fetches a challenge from `POST /api/app-cap/challenge`, solves it in a web worker, runs
   the instrumentation, and redeems the solution at `POST /api/app-cap/redeem`.
3. The redeem route checks the solution, claims the challenge once, and returns a signed proof token, valid
   for 10 minutes.
4. The action request carries the token in `x-cap-token`. The verifier checks the signature and the expiry,
   and claims the token once.
5. After each use the app solves the next proof in the background, so only the first protected action of a
   visit waits for a solve.

Nothing loads before the first protected action.

## Setup

1. Add the app to the project's `laioutrrc` and list the protected actions in
   `config.botProtection.actions`, as for any bot-protection provider.
2. Make sure the project has Redis for orchestr's cache. Laioutr Cloud has it. On Vercel, the project needs
   `redisUrl`. Without Redis, a built server rejects every protected action and logs why, because a proof
   could not be made single-use. The same happens when Redis refuses a claim, for example with `NOPERM`;
   the log names the reply code.
3. The project secret key signs the proofs. Cockpit writes a stable one into the `laioutrrc`. The signing
   keys are also bound to the options, so a proof from an environment with weaker options, such as a test
   environment with the automation check off, does not pass an environment with stricter ones.

### Options

| Option | Default | Effect |
| --- | --- | --- |
| `blockAutomatedBrowsers` | `true` | Reject a browser that Cap's instrumentation identifies as automated |
| `difficulty` | `1000000` | Expected hashes per solve, clamped to `50000`–`5000000` |

A value of the wrong type falls back to the default, with a warning that names the option.

### Content Security Policy

Measured in Chromium on a production build, a solve needs these sources in addition to `'self'`:

```
script-src 'wasm-unsafe-eval' 'unsafe-eval'
worker-src blob:
```

Without `'unsafe-eval'` the instrumentation cannot run and every redeem fails.

### Test suites

Headless Chromium fails the automation check, so Playwright suites cannot solve. Send frontend-core's
signed bypass, `x-laioutr-bypass-bot-protection`, from
`signBotProtectionBypass(projectSecretKey, action, nowSeconds)`. Or switch `blockAutomatedBrowsers` off
in a test environment; its proofs do not pass an environment with the check on.

## Limits

- **A browser that cannot finish a solve cannot do a protected action**, even with
  `whenUnavailable: 'open'`. This includes a false positive of the automation check. Tor Browser and setups
  with screens of mixed DPI are not measured.
- **The automation check raises the cost for a bot. It does not stop every bot.** undetected-chromedriver,
  nodriver and headless Firefox pass it.
- **While Redis is down, replay protection is off under `whenUnavailable: 'open'`.** A proof redeemed
  during the outage is marked. While the outage lasts, the project's policy decides about it. When Redis is
  back, the verifier claims the proof's challenge, so one solution passes once.
- The UI shows the generic action error when a solve fails. The bot-protection contract has no error class
  for it yet.
- Solve times are measured on an Apple M4 Pro only (p50 about 330 ms at the default difficulty).

## Consent

The app adds no consent integration. Before the first protected action, nothing loads. At that action, the
browser loads the widget and its WASM from the storefront's own origin, and the instrumentation script
reads browser and screen properties. The customer judges the consent question for their storefront.

## Development

Requires Node.js 22.12 or newer and pnpm 10 or newer. The committed `.npmrc` maps the Laioutr scopes to
[npm.laioutr.cloud](https://npm.laioutr.cloud); log in once per machine with
`npm login --registry https://npm.laioutr.cloud`.

```bash
pnpm install
pnpm dev:prepare                     # copies the widget assets, stubs the module, prepares the playground
pnpm dev                             # playground on http://localhost:3000, page /check
pnpm test                            # unit tests; set REDIS_URL to include the Redis claim tests
pnpm test:e2e:build && pnpm test:e2e # two production builds and Playwright; needs redis-server
pnpm lint && pnpm test:types
```

`pnpm run assets` copies the widget, both WASM files and pako's inflate from the pinned packages into
`src/runtime/app/public/app-cap/<widget version>/`, and the license texts into `third-party-licenses/`.
It refuses a widget or WASM version other than the pinned pair.

## Publishing

Releases run through [changesets](https://github.com/changesets/changesets) and publish to npmjs.org with
[npm trusted publishing](https://docs.npmjs.com/trusted-publishers). Before the first release:

1. Get the CTO's approval for a public `@laioutr/*` package.
   Then remove `"private": true` from `package.json`. It stops `changeset publish` until then.
2. Add the repository secrets `NPM_LAIOUTR_TOKEN` (read access to npm.laioutr.cloud) and `RELEASE_TOKEN`
   (a fine-grained PAT with Contents and Pull requests read and write on this repository).
3. Publish the first version by hand, because trusted publishing needs the package to exist:
   `pnpm prepack && npm publish --access public --no-provenance`.
4. Configure the trusted publisher on npm: GitHub Actions, this repository, workflow `release.yml`.

## License

The app's own code is MIT. The package ships third-party files with their license texts in
`third-party-licenses/`: Cap's widget and WASM (Apache-2.0) and pako's inflate (MIT and Zlib).
`capjs-core` is a dependency under Apache-2.0.

<!-- Badges -->

[license-src]: https://img.shields.io/badge/license-MIT-020420?style=flat&colorA=020420&colorB=00DC82
[license-href]: ./LICENSE.md
[nuxt-src]: https://img.shields.io/badge/Nuxt-020420?logo=nuxt.js
[nuxt-href]: https://nuxt.com
[laioutr-src]: https://img.shields.io/badge/%F0%9F%A6%99_Laioutr_App-702DCE
[laioutr-href]: https://www.laioutr.com/
