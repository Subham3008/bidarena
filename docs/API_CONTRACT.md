# BidArena REST API Contract

> **Contract status:** Living contract.
>
> **Implemented now:** health/readiness, HTTP authentication, auction creation,
> discovery, and public auction details.
>
> Auction, profile, payment, bidding, and chat routes remain planned. Socket.io
> auction rooms and snapshots are implemented.

This document defines the initial HTTP boundary between the BidArena client and
server. It is a contract, not evidence that a feature exists. A planned route
must not be marked implemented until its controller, service, validation,
authorization, persistence, and tests are complete.

## 1. Scope and versioning

- Product HTTP routes use the `/api` prefix.
- The infrastructure health check remains unversioned at `/health`.
- JSON request and response fields use `camelCase`.
- Request and response bodies use `application/json`, except for an image upload
  mechanism if one is selected later.
- Breaking changes require a new API version or an explicitly coordinated
  client/server migration.
- Live bidding and room chat are Socket.io commands, not REST operations, in the
  initial contract. See [SOCKET_CONTRACT.md](./SOCKET_CONTRACT.md).

## 2. Implementation status

| Surface | Status | Notes |
|---|---|---|
| `GET /health` | Implemented foundation endpoint | No database, Redis, or external-service readiness is implied. |
| `GET /ready` | Implemented foundation endpoint | Reports MongoDB readiness. |
| `/api/auth/*` | Implemented | HTTP-only JWT cookie authentication and session restoration. |
| Socket.io auction rooms and snapshots | Implemented | Optional cookie identity, isolated rooms, snapshots, and presence. |
| `GET /api/auctions` | Implemented | Public discovery, filtering, sorting, and pagination. |
| `POST /api/auctions` | Implemented | Authenticated auction creation. |
| `GET /api/auctions/:auctionId` | Implemented | Public auction details with a safe seller summary. |
| `/api/auctions/:auctionId/*` | Planned | History, recovery, and payment. |
| `/api/users/me/*` | Planned | Current-user profile and history. |

## 3. Representation conventions

### 3.1 Identifiers

- Resource IDs are opaque strings. Clients must not infer type, creation time,
  ordering, or authorization from an ID.
- Path parameters use names such as `:auctionId`; JSON uses `auctionId`.
- The authenticated user ID always comes from a server-verified credential.
  A client-supplied `userId`, `bidderId`, `sellerId`, or `winnerId` never proves
  identity or authorization.

### 3.2 Time

- Persisted and REST resource timestamps use ISO 8601 UTC strings, for example
  `2026-08-01T12:30:00.000Z`.
- Auction scheduling uses absolute `startAt` and `endAt` timestamps.
- Socket snapshots and time-sensitive socket messages also include `serverTime`
  as Unix epoch milliseconds so the client can estimate clock offset.
- The client may render a countdown, but it must not decide that an auction has
  started, ended, or selected a winner. The server is authoritative.
- The server does not send per-second timer ticks. Clients derive the visual
  countdown from `endAt` and the latest `serverTime` reference.

### 3.3 Money

- The available SRS uses integer examples but does not define the currency,
  whether values are major or minor units, or the allowed precision. This is a
  required product decision, not something either domain may infer alone.
- This draft **proposes**, but does not yet freeze, integer minor units plus an
  uppercase ISO 4217 `currency` code. That convention would avoid binary
  floating-point values and map cleanly through validation, persistence,
  Socket.io, and payment-provider calls.
- Examples below follow that proposal and use `INR` only illustratively. They do
  not establish INR as the supported or default currency.
- Once the decision is approved, the same representation must be used by every
  `amount`, `highestBid`, `minimumNextBid`, persistence field, and provider
  conversion. Clients format money for display but submit the unformatted
  canonical value.
- The server computes the authoritative minimum acceptable bid.

### 3.4 Status values

Only the following SRS-defined lifecycle values are part of the initial
contract:

| Concept | Values |
|---|---|
| Auction status | `UPCOMING`, `ACTIVE`, `COMPLETED` |
| Payment status | `PENDING`, `SUCCESSFUL`, `FAILED` |
| Current room role | `SELLER`, `BIDDER`, `SPECTATOR` |

Auction status and payment status remain separate fields. A successful payment
must not silently change `auction.status`, and an auction becoming `COMPLETED`
must not imply payment success.

Reserve-price, cancellation, moderation, and administrative statuses are not
part of this initial contract. They must not be added incidentally while
implementing mandatory scope.

### 3.5 Null and omitted fields

- A field is omitted when it is not part of that response projection.
- `null` means the field is applicable but no value currently exists; for
  example, an auction without a winner has `winner: null`.
- Empty collections are `[]`, not `null`.

## 4. Authentication and identity

Protected REST routes require a principal established by authentication
middleware. HTTP authentication uses a signed JWT in the
`bidarena_session` cookie. The cookie is HTTP-only, uses `SameSite=Lax`, is
scoped to `/`, and is marked `Secure` in production. The server derives
identity from the verified JWT subject; it never accepts identity from request
data.

Regardless of that decision, these rules are fixed:

1. Credentials are verified server-side before protected work starts.
2. Passwords, refresh tokens, and signing secrets never appear in normal API
   responses, logs, Socket.io broadcasts, or URLs.
3. Request body and query identity fields never override the verified principal.
4. Seller, bidder, spectator, winner, and payment permissions are derived from
   the verified principal plus authoritative auction data.
5. Logout clears the session cookie using the same cookie scope.
6. Authentication failure uses `401`; an authenticated user lacking permission
   uses `403`.
7. Socket authentication must use the same identity source and verification
   policy; a socket-provided `userId` is untrusted.

Whether unauthenticated users may use spectator reads is unresolved. Until that
decision is frozen, routes marked **optional auth** must return only public-safe
fields and enrich the response only after successful authentication.

## 5. Response envelopes

### 5.1 Successful request

```json
{
  "success": true,
  "message": "Auction retrieved",
  "data": {
    "auction": {}
  }
}
```

- `success` is always `true`.
- `message` is a stable human-readable summary, not a field the client uses for
  control flow.
- `data` contains the operation result and may be omitted only when no result is
  needed, as in the minimal health response.
- Auction discovery returns pagination beside `auctions` inside `data`.

### 5.2 Failed request

```json
{
  "success": false,
  "message": "Request validation failed",
  "error": {
    "code": "VALIDATION_ERROR",
    "details": [
      {
        "field": "title",
        "message": "Title is required"
      }
    ]
  }
}
```

- `success` is always `false`.
- Clients branch on `error.code`, not on `message` text.
- `details` is optional and must contain only safe, actionable data.
- Validation details identify public request fields; they do not reveal stack
  traces, database internals, tokens, or provider secrets.
- Production `500` responses use a generic message and are logged server-side.

### 5.3 Implemented health response

`GET /health` returns `200 OK` with exactly:

```json
{
  "success": true,
  "message": "BidArena server is running"
}
```

This liveness response does not claim that MongoDB, Redis, Socket.io, Cloudinary,
or Razorpay is ready. A dependency-readiness contract is unresolved and is not
part of the foundation endpoint.

## 6. HTTP status and error-code semantics

| HTTP status | Meaning | Typical codes |
|---|---|---|
| `200` | Successful read, update, logout, verification, or action | — |
| `201` | Resource created | — |
| `400` | Malformed JSON or structurally invalid input | `VALIDATION_ERROR`, `MALFORMED_REQUEST` |
| `401` | Missing, expired, or invalid authentication | `UNAUTHENTICATED`, `SESSION_EXPIRED` |
| `403` | Verified user is not allowed to perform the action | `FORBIDDEN`, `NOT_AUCTION_WINNER` |
| `404` | Requested resource does not exist or is not visible | `RESOURCE_NOT_FOUND`, `AUCTION_NOT_FOUND` |
| `409` | Conflict with authoritative resource state | `AUCTION_NOT_ACTIVE`, `AUCTION_COMPLETED`, `PAYMENT_ALREADY_COMPLETED` |
| `422` | Structurally valid request violates a domain rule | `BID_BELOW_MINIMUM`, `SELLER_CANNOT_BID`, `PAYMENT_VERIFICATION_FAILED` |
| `429` | Rate limit exceeded | `RATE_LIMITED` |
| `500` | Unexpected server failure | `INTERNAL_ERROR` |
| `503` | A required dependency is temporarily unavailable | `SERVICE_UNAVAILABLE` |

The same domain error codes are used by Socket.io negative acknowledgements
where the same rule applies. A missing resource may intentionally be returned as
`404` rather than `403` when that avoids disclosing private data.

## 7. Initial route inventory

### 7.1 System

| Method | Path | Auth | Status | Purpose |
|---|---|---|---|---|
| `GET` | `/health` | None | **Implemented** | Process liveness only. |
| `GET` | `/ready` | None | **Implemented** | MongoDB readiness. |

### 7.2 Authentication and session

All routes in this table are implemented.

| Method | Path | Auth | Purpose | Success |
|---|---|---|---|---|
| `POST` | `/api/auth/register` | None | Register a user and establish a session. | `201` |
| `POST` | `/api/auth/login` | None | Verify credentials and establish a session. | `200` |
| `POST` | `/api/auth/logout` | Optional cookie | Clear the current session cookie idempotently. | `200` |
| `GET` | `/api/auth/me` | Required | Restore the current principal from the session cookie. | `200` |

Representative registration request:

```json
{
  "displayName": "Asha Rao",
  "email": "asha@example.com",
  "password": "client-entered-password"
}
```

Representative authenticated principal:

```json
{
  "success": true,
  "message": "Current user retrieved",
  "data": {
    "user": {
      "id": "user_opaque_id",
      "displayName": "Asha Rao",
      "email": "asha@example.com"
    }
  }
}
```

Passwords currently require 8–72 characters, are hashed with bcrypt, and are
never selected or returned by normal user queries. Access-token lifetime is
configured with `ACCESS_TOKEN_EXPIRY` and defaults to 15 minutes. Email
verification, refresh rotation, revocation, password recovery, and multi-device
session behavior remain future decisions.

### 7.3 Auction marketplace and recovery

Creation, discovery, and public details are implemented. HTTP snapshot,
bid-history, and timeline routes remain planned.

| Method | Path | Auth | Purpose | Success |
|---|---|---|---|---|
| `GET` | `/api/auctions` | None | Discover auctions with filters, sorting, and pagination. | `200` |
| `POST` | `/api/auctions` | Required | Create an auction owned by the current user. | `201` |
| `GET` | `/api/auctions/:auctionId` | None | Get public auction details and a safe seller summary. | `200` |
| `GET` | `/api/auctions/:auctionId/snapshot` | Optional | Fetch authoritative recovery state outside Socket.io. | `200` |
| `GET` | `/api/auctions/:auctionId/bids` | Optional | Read persisted bid history. | `200` |
| `GET` | `/api/auctions/:auctionId/timeline` | Optional | Read persisted auction timeline entries. | `200` |

Discovery accepts `status=UPCOMING|ACTIVE|COMPLETED`, a title `search`,
`page` (default 1), `limit` (default 12, maximum 48), and `sort` values
`newest`, `endingSoon`, `priceLow`, or `priceHigh`.

Representative create request:

```json
{
  "title": "Mechanical Keyboard",
  "description": "Seller-provided auction description",
  "image": "https://example.invalid/image.jpg",
  "startBid": 100000,
  "minimumIncrement": 5000,
  "startAt": "2026-08-01T12:00:00.000Z",
  "endAt": "2026-08-01T12:30:00.000Z"
}
```

The sprint accepts a validated image URL. Upload transport and image lifecycle
remain future work.

Representative auction projection:

```json
{
  "_id": "auction_opaque_id",
  "title": "Mechanical Keyboard",
  "description": "Seller-provided auction description",
  "image": "https://example.invalid/image.jpg",
  "seller": {
    "_id": "user_opaque_id",
    "name": "Asha Rao"
  },
  "status": "ACTIVE",
  "startAt": "2026-08-01T12:00:00.000Z",
  "endAt": "2026-08-01T12:30:00.000Z",
  "startBid": 100000,
  "currentBid": 100000,
  "minimumIncrement": 5000,
  "bidCount": 0,
  "createdAt": "2026-07-30T09:00:00.000Z",
  "updatedAt": "2026-08-01T12:10:00.000Z"
}
```

Public bidder identity and privacy rules are unresolved. The final projection
may use a masked public identity, but it must not leak email addresses or payment
data.

Representative snapshot response:

```json
{
  "success": true,
  "message": "Auction snapshot retrieved",
  "data": {
    "auction": {},
    "latestBids": [],
    "timeline": [],
    "serverTime": 1785595800000,
    "activeBidderCount": 0,
    "spectatorCount": 0,
    "currentUserRole": "SPECTATOR",
    "paymentStatus": "PENDING",
    "lastBidSequence": 0
  }
}
```

The complete snapshot shape is shared with the socket contract. On reconnect or
refresh, the client replaces stale local auction state with this authoritative
snapshot rather than merging guesses into it.

### 7.4 Current-user views

All routes in this table are **planned and not implemented** and require an
authenticated principal.

| Method | Path | Purpose | Success |
|---|---|---|---|
| `GET` | `/api/users/me` | Read the current user's profile. | `200` |
| `GET` | `/api/users/me/auctions?relationship=created` | Read auctions created by the current user. | `200` |
| `GET` | `/api/users/me/auctions?relationship=won` | Read auctions won by the current user. | `200` |
| `GET` | `/api/users/me/bids` | Read the current user's persisted bid history. | `200` |

Profile editing fields and whether the seller dashboard needs a dedicated
aggregate endpoint are unresolved. No update route is frozen yet.

### 7.5 Winner payment

All routes in this table are **planned and not implemented**. They require an
authenticated principal, and the server must verify that principal against the
persisted auction winner.

| Method | Path | Purpose | Success |
|---|---|---|---|
| `GET` | `/api/auctions/:auctionId/payment` | Read viewer-authorized payment status. | `200` |
| `POST` | `/api/auctions/:auctionId/payment/order` | Create a Razorpay test order for the verified winner. | `201` |
| `POST` | `/api/auctions/:auctionId/payment/verify` | Verify provider IDs and signature on the backend. | `200` |

Representative order response:

```json
{
  "success": true,
  "message": "Payment order created",
  "data": {
    "order": {
      "provider": "RAZORPAY",
      "orderId": "provider_order_id",
      "amount": 120000,
      "currency": "INR"
    }
  }
}
```

Representative verification request:

```json
{
  "razorpayOrderId": "provider_order_id",
  "razorpayPaymentId": "provider_payment_id",
  "razorpaySignature": "provider_signature"
}
```

The server verifies the signature before persisting `SUCCESSFUL`. A frontend
checkout success callback alone never changes authoritative payment status.
Provider secrets and signatures are never broadcast to the auction room.

## 8. List responses

Auction discovery uses page-number pagination:

```json
{
  "success": true,
  "message": "Auctions fetched successfully",
  "data": {
    "auctions": [],
    "pagination": {
      "page": 1,
      "limit": 12,
      "totalItems": 0,
      "totalPages": 0
    }
  }
}
```

An empty result remains a successful response with the same pagination shape.

## 9. State, idempotency, and side effects

- MongoDB is the permanent source of truth for auction history, accepted bids,
  winner state, and payment state. Redis is never the sole durable record.
- Successful responses for state-changing operations are sent only after the
  required authoritative persistence succeeds.
- The initial contract does not expose REST bid submission. Bids use the
  authenticated Socket.io `place_bid` command and its `clientBidId` duplicate
  protection.
- Whether auction creation and payment-order creation accept an HTTP
  idempotency key is unresolved. Clients must not blindly retry those operations
  until this is frozen.
- Cache failure and provider failure must map to explicit errors or documented
  fallback behavior; they must not produce a false success envelope.

## 10. Open decisions requiring agreement

The available SRS does not settle the following. They remain deliberately open
rather than being invented in implementation:

1. Refresh rotation, revocation, password recovery, CSRF hardening beyond
   `SameSite=Lax`, and cross-site production cookie deployment.
2. Whether spectators must authenticate and which auction fields are public.
3. Monetary unit/precision, whether to adopt the proposed integer-minor-unit
   representation, and the supported/default currency.
4. Auction image upload route, limits, and Cloudinary reference lifecycle.
5. Additional auction creation constraints and the future minimum-next-bid
   formula.
6. Discovery options beyond title search, the four implemented sort modes, and
   page-number pagination.
7. Bidder identity visibility and masking.
8. Timeline entry type registry and public payloads.
9. Statistics and auction-heat formulas and response shapes.
10. Profile editing scope and seller-dashboard aggregation.
11. Payment retry, failed-attempt, webhook, and reconciliation behavior.
12. A dependency-readiness endpoint separate from `/health`.
13. HTTP idempotency rules for non-bid mutations.
14. Error-message localization and public observability/correlation metadata.

These decisions should be added here before dependent feature work begins. They
must not be inferred independently by the client and server.
