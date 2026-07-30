# BidArena Deployment Guide

## Runtime

Use Node.js `^20.19.0` or `>=22.12.0`. Deploy the first release with exactly
one backend instance: auction queues, presence, and timers are process-local.
MongoDB must support transactions (a replica set or managed equivalent).

## Backend

```bash
cd server
npm ci
npm start
```

`npm start` validates required core configuration, connects MongoDB, builds the
payment indexes, recovers auction lifecycle state, restores timers, and only
then listens on `HOST` and the platform-provided `PORT`.

Backend variables:

| Variable | Production value or default |
|---|---|
| `NODE_ENV` | Required: `production` |
| `MONGODB_URI` | Required MongoDB connection URI; never expose it to the client |
| `JWT_ACCESS_SECRET` | Required random secret of at least 32 characters |
| `CLIENT_URLS` | Required exact comma-separated frontend origins, without paths |
| `HOST` | Defaults to `0.0.0.0`; use the host's required bind address |
| `PORT` | Defaults to `5000`; hosting platforms normally inject this |
| `ACCESS_TOKEN_EXPIRY` | Defaults to `15m` |
| `SESSION_COOKIE_SAME_SITE` | Defaults to `lax`; use `none` only for HTTPS cross-site hosting |
| `MAX_BID_AMOUNT` | Defaults to `1000000000` in the server's bid unit |

`CLIENT_URLS` supports multiple origins:

```dotenv
CLIENT_URLS=https://app.example.com,https://admin.example.com
```

Whitespace and trailing slashes are normalized. Unknown origins are rejected
for both Express and Socket.IO; credentialed wildcard CORS is not used.

Feature integrations remain lazy and do not block process startup:

| Feature | Variables |
|---|---|
| Auction image uploads | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` |
| Winner payments | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` |

Razorpay currently accepts test-mode keys only (`rzp_test_...`). Do not put
Cloudinary secrets, Razorpay secrets, MongoDB credentials, or JWT secrets in
frontend variables.

## Frontend

Set Vite variables before building; they are public and embedded into the
bundle:

```dotenv
VITE_API_URL=https://api.example.com/api
VITE_SOCKET_URL=https://api.example.com
```

Then build:

```bash
cd client
npm ci
npm run build
```

Deploy `client/dist` as a static SPA and rewrite unknown routes to
`index.html`. The production host/proxy must support `/socket.io` polling and
WebSocket upgrades.

The current session cookie defaults to `SameSite=Lax`. Prefer same-site HTTPS
domains such as `app.example.com` and `api.example.com`. If frontend and backend
use unrelated sites, set `SESSION_COOKIE_SAME_SITE=none`, keep the strict
`CLIENT_URLS` allowlist, and verify the authentication/CSRF posture manually.

## Health checks

Configure the platform probes against:

```text
GET /health  -> 200 when the Node process is alive
GET /ready   -> 200 only when MongoDB is connected; otherwise 503
```

Neither endpoint returns credentials, connection strings, or stack traces.

## Post-deployment smoke test

1. Confirm `/health` returns `200` and `/ready` returns `200`.
2. Register, log in, refresh the browser, and confirm the session persists.
3. Open two distinct auction rooms across two browsers and confirm
   polling/WebSocket traffic, isolated presence, bidding, timers, reconnect
   recovery, chat, and stats.
4. Upload one authenticated JPEG, PNG, or WebP under 5 MB and confirm the
   returned URL is HTTPS. Do not run automated uploads against production.
5. Complete a test auction and run one Razorpay test-mode winner payment. Never
   use a real payment during deployment verification.
6. Restart the single backend instance and confirm lifecycle recovery does not
   duplicate completion, winner, or timeline records; confirm persisted bids
   and payment status remain readable.
7. Check server logs for safe stage-level errors only.

## Manual platform steps

- Provision MongoDB network access, backups, and a transaction-capable cluster.
- Configure backend and frontend variables in their hosting dashboards.
- Configure HTTPS, the SPA rewrite, WebSocket upgrades, and health probes.
- Restrict Cloudinary credentials and confirm the `bidarena/auctions` folder.
- Create Razorpay test credentials and keep live mode disabled.
- Rotate MongoDB, JWT, Cloudinary, and Razorpay secrets after any accidental
  exposure and before handoff; rebuild the frontend only when its public URLs
  change.
