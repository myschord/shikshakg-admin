# Deploying the admin console (Cloudflare Workers)

The console is a static export (`output: "export"`). `npm run build` produces `out/`, and Cloudflare serves it
directly (Workers static assets, see `wrangler.toml`). There is no server code. Staff sign in against the backend API
from the browser.

## Cloudflare project settings

Create a Workers project connected to the admin GitHub repo.

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Root directory | repo root |
| Node | 22 (from `.node-version`) |

`npm run build` runs `next build`, then `scripts/write-headers.mjs`, which fills the Content-Security-Policy into
`out/_headers` using the API origin. Do not run `next build` alone for a release.

## Build variables (Settings, Variables and Secrets, build environment)

`NEXT_PUBLIC_*` values are baked into the files; change one and you must build again.

| Variable | Required | Meaning |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Yes | Backend origin, no trailing slash and no `/api/v1`. Also the origin allowed in the CSP. |
| `NEXT_PUBLIC_APP_ENV` | Yes | `production` |

## Backend settings that must match

- `CORS_ORIGINS` on the backend must include the console's production origin (for example
  `https://admin.shikshakg.com`).
- The A8 screens (users, action log, announcements, current affairs, daily quiz) still run on browser-side mocks until
  the backend routes in `docs/BACKEND_NEEDS.md` exist. Do not give staff real work on those screens yet.

## Security

`public/_headers` sets the cache and security headers, including `X-Robots-Tag: noindex` and `frame-ancestors 'none'`.
Consider also putting the console behind Cloudflare Access so the login page is not public.

## Checking a build locally

```bash
npm run build
npm run serve
```
