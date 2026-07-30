# BidArena Socket.io Contract

> **Contract status:** Living contract.
> **Implemented now:** optional cookie authentication, auction rooms,
> authoritative snapshots, in-memory presence, deterministic bidding, and
> authoritative lifecycle timers, chat, live statistics, auction heat, and
> verified payment status updates. Redis remains planned.

The Domain A auction-room client consumes the implemented snapshot and presence
events. Its bid control waits for a `place_bid` acknowledgement and never
updates bid state optimistically; committed room broadcasts and snapshots are
the authoritative state.

This contract defines the initial real-time boundary for auction rooms. The
backend remains the source of truth. A socket command expresses intent; it does
not allow the client to decide bid validity, highest bidder, auction status,
timer expiry, winner, or payment status.

## 1. Connection and authentication

- The initial contract uses the Socket.io default namespace `/`.
- Connection middleware verifies the existing `bidarena_session` JWT cookie
  when present. A missing or invalid cookie leaves the socket anonymous.
- A client-supplied `userId`, whether in the handshake or an event payload, is
  untrusted and never establishes identity.
- The verified principal is attached to `socket.data.user`; anonymous sockets
  may join only as spectators.
- The deployment path, allowed origins, and transport fallback policy are still
  unresolved. Event names and payloads do not depend on those deployment
  choices.

Socket connections remain available for spectators when identity cannot be
verified. Bidder-mode joins are rejected through the command acknowledgement.

## 2. Naming and representation

- Event names use `snake_case`, matching the SRS-defined `place_bid` command.
- Payload fields use `camelCase`.
- Resource IDs are opaque strings.
- REST and socket status, timestamp, money, and identity rules are shared. See
  [API_CONTRACT.md](./API_CONTRACT.md#3-representation-conventions).
- `startAt` and `endAt` are ISO 8601 UTC strings.
- `serverTime` is Unix epoch milliseconds.
- Monetary examples follow the API contract's proposed integer-minor-unit
  convention, but currency unit/precision remains unresolved and must be frozen
  before bid implementation.
- Auction status is `UPCOMING`, `ACTIVE`, or `COMPLETED`.
- Payment status is independently `PENDING`, `SUCCESSFUL`, or `FAILED`.

## 3. Rooms and isolation

The server uses one isolated Socket.io room per auction. The internal room name
is:

```text
auction:{auctionId}
```

The client sends only `auctionId`; it does not construct or authorize itself for
an internal room name.

Room rules:

1. `join_auction` validates that the auction exists and derives the user's
   effective role before joining.
2. Auction broadcasts go only to that auction's room.
3. Sender-specific validation errors are acknowledged only to the sender and
   are never broadcast.
4. Leaving one auction must not affect membership or processing in another.
5. Bid queues and bid sequence counters are isolated per auction.
6. Chat failures must not block, roll back, delay, or disconnect the bidding
   pipeline.
7. Credentials, email addresses, provider signatures, and private payment data
   are never room payloads.

A socket may join multiple isolated auction rooms. Unauthenticated sockets may
join only with spectator intent.

## 4. Command acknowledgement envelope

Every client-to-server command in this contract requires a Socket.io callback.
The server calls it exactly once after validation and any required persistence.

Successful acknowledgement:

```json
{
  "success": true,
  "data": {}
}
```

Negative acknowledgement:

```json
{
  "success": false,
  "message": "Command rejected"
}
```

Rules:

- Implemented room commands branch on `success`; `message` is safe display text.
- Future domain commands may add stable error codes when their behavior is
  implemented.
- A negative acknowledgement is private to the requesting socket.
- A command timeout is indeterminate, not proof of success or failure. The
  client reconnects or requests an authoritative snapshot before deciding what
  happened.
- Automatic retries are allowed only when the command has documented
  idempotency. `place_bid` carries `clientBidId`; duplicate-result semantics are
  still an open decision described below.
- Server-to-client broadcasts do not require client acknowledgements in the
  initial contract. Durable recovery comes from persisted state and snapshots,
  not from treating broadcasts as a message queue.

## 5. Client-to-server commands

The room, snapshot, bidding, chat, statistics, and heat commands are implemented.

| Command | Authentication | Purpose | Acknowledgement data |
|---|---|---|---|
| `join_auction` | Optional; required for bidder mode | Validate access, join one auction room, and emit a full snapshot. | `{}` |
| `leave_auction` | Same socket that joined | Leave an auction room. | `{}` |
| `request_auction_snapshot` | Joined socket | Emit authoritative room state after a gap or suspected staleness. | `{}` |
| `place_bid` | Joined verified bidder | Queue and atomically persist one bid intent. | `{ bid, latestBid, auction, timelineEvent }` |
| `send_chat_message` | Joined verified seller or bidder | Persist one room-isolated chat message. | `{ chatMessage }` |
| `request_chat_history` | Joined socket | Emit the latest 50 persisted messages. | `{}` |
| `request_auction_stats` | Joined socket | Emit current authoritative statistics and heat. | `{}` |

### 5.1 `join_auction`

Request:

```json
{
  "auctionId": "auction_opaque_id",
  "mode": "BIDDER"
}
```

`mode` expresses client intent (`BIDDER` or `SPECTATOR`) but does not grant a
role. The server derives `SELLER`, `BIDDER`, or `SPECTATOR` from verified
identity and authoritative auction ownership.

Successful acknowledgement:

```json
{
  "success": true,
  "data": {}
}
```

Success emits `auction_snapshot` directly to the joining socket. MongoDB is the
source, with at most 20 latest bids and 50 timeline events.

### 5.2 `leave_auction`

Request:

```json
{
  "auctionId": "auction_opaque_id"
}
```

Leaving is safe to repeat and does not affect another auction room.

### 5.3 `request_auction_snapshot`

Request:

```json
{
  "auctionId": "auction_opaque_id"
}
```

Success emits the same `auction_snapshot` shape as `join_auction`. The client
replaces its local room state with this event.

### 5.4 `place_bid`

The request shape follows the SRS exactly:

```json
{
  "auctionId": "auction_opaque_id",
  "amount": 125000,
  "clientBidId": "unique-client-generated-id"
}
```

There is intentionally no `userId`. The verified socket principal is the
bidder. The semantic unit of `amount` follows the unresolved money decision in
the REST contract; client and server must freeze the same representation before
implementing bidding.

Successful acknowledgement:

```json
{
  "success": true,
  "data": {
    "bid": {
      "id": "bid_opaque_id",
      "auctionId": "auction_opaque_id",
      "bidder": {
        "id": "user_opaque_id",
        "name": "Visible participant name",
        "avatarUrl": null
      },
      "amount": 125000,
      "clientBidId": "unique-client-generated-id",
      "sequence": 43,
      "serverSequence": 43,
      "createdAt": "2026-08-01T12:11:00.000Z",
      "timestamp": "2026-08-01T12:11:00.000Z"
    },
    "auction": {
      "id": "auction_opaque_id",
      "status": "ACTIVE",
      "currentBid": 125000,
      "currentBidder": {
        "id": "user_opaque_id",
        "name": "Visible participant name",
        "avatarUrl": null
      },
      "bidCount": 43,
      "sequence": 43,
      "version": 7
    }
  }
}
```

The success data also includes `latestBid` (the canonical alias of `bid`) and
the committed `timelineEvent`, matching the room broadcast.

Representative rejection:

```json
{
  "success": false,
  "message": "Bid must be at least 125000"
}
```

The server rejects a bid when the user is unauthenticated, the auction does not
exist, the auction is not active, server time is at or after `endAt`, the seller
bids, the socket is spectator-only, the amount is missing/non-numeric/negative,
the amount is below the authoritative minimum, `clientBidId` is duplicated, or
the auction is already completed.

An accepted bid follows this order:

```text
authenticate socket
  -> enqueue in this auction's queue
  -> load authoritative auction state
  -> validate
  -> persist auction, bid, timeline, and sequence atomically
  -> commit
  -> broadcast auction_state_updated
  -> acknowledge sender
```

No success acknowledgement or room broadcast may precede the required database
commit. Network scheduling means the client must still tolerate receiving the
room broadcast and callback close together in either observed order.

### 5.5 `send_chat_message`

Request:

```json
{
  "auctionId": "auction_opaque_id",
  "text": "Is local pickup available?",
  "clientMessageId": "client_message_opaque_id"
}
```

The verified socket identity is the sender; client identity and role fields are
ignored. Text is trimmed, limited to 300 characters, stored as plain text, and
HTML-sensitive characters are escaped in public payloads. Each verified user
may send at most five valid messages in ten seconds. The unique
`sender + clientMessageId` constraint makes retry duplicates reject without a
second persistence or broadcast. A chat error never enters the bid queue.

### 5.6 `request_chat_history`

```json
{
  "auctionId": "auction_opaque_id"
}
```

Any joined participant, including an anonymous spectator, may request history.
Success emits `chat_history` only to that socket.

### 5.7 `request_auction_stats`

```json
{
  "auctionId": "auction_opaque_id"
}
```

Any joined participant may request an authoritative `auction_stats_updated`
and `auction_heat_updated` refresh. These request-driven events are emitted only
to the requesting socket.

## 6. Server-to-client events

Room, bidding, lifecycle, chat, statistics, and heat events named below are
implemented. `timeline_event_created` remains planned.

| Event | Audience | Purpose |
|---|---|---|
| `auction_snapshot` | One authorized socket | Push a full replacement snapshot during explicit server-led resynchronization. |
| `auction_started` | Auction room | Announce the authoritative `UPCOMING` to `ACTIVE` transition. |
| `timer_sync` | Auction room | Synchronize an active auction countdown to backend time. |
| `auction_state_updated` | Auction room | Publish authoritative state after a committed bid or completion. |
| `bid_rejected` | Requesting socket only | Report a rejected bid without room broadcast. |
| `auction_completed` | Auction room | Publish the one-time persisted completion and winner result. |
| `presence_updated` | Auction room | Publish active bidder and spectator counts. |
| `timeline_event_created` | Auction room | Publish a newly persisted public timeline entry. |
| `auction_stats_updated` | Auction room or requesting socket | Publish server-derived live statistics. |
| `auction_heat_updated` | Auction room or requesting socket | Publish recent accepted-bid heat. |
| `chat_message` | Auction room | Publish one persisted room-isolated message. |
| `chat_history` | Requesting/joining socket | Publish at most 50 persisted messages. |
| `chat_message_rejected` | Requesting socket only | Report a private chat rejection. |
| `payment_status_updated` | Auction room with public-safe fields | Publish backend-verified payment state. |

`timer_sync` is emitted only while the auction is authoritatively `ACTIVE`.

### 6.1 `auction_snapshot`

```json
{
  "auction": {
    "id": "auction_opaque_id",
    "status": "COMPLETED",
    "currentBid": 125000,
    "currentBidder": {
      "id": "user_opaque_id",
      "name": "Visible participant name",
      "avatarUrl": null
    },
    "winner": {
      "id": "user_opaque_id",
      "name": "Visible participant name",
      "avatarUrl": null
    },
    "winningAmount": 125000,
    "bidCount": 43,
    "sequence": 43
  },
  "latestBids": [
    {
      "id": "bid_opaque_id",
      "amount": 125000,
      "sequence": 43,
      "createdAt": "2026-08-01T12:11:00.000Z",
      "bidder": {
        "id": "user_opaque_id",
        "name": "Visible participant name",
        "avatarUrl": null
      }
    }
  ],
  "timeline": [
    {
      "id": "timeline_opaque_id",
      "type": "WINNER_DECLARED",
      "createdAt": "2026-08-01T12:30:00.000Z",
      "actor": {
        "id": "user_opaque_id",
        "name": "Visible participant name",
        "avatarUrl": null
      }
    }
  ],
  "serverTime": 1785595800000,
  "activeBidderCount": 1,
  "spectatorCount": 2,
  "currentUserRole": "SPECTATOR"
}
```

Because `currentUserRole` may differ per socket, a full snapshot containing it
is sent to one socket rather than broadcast unchanged to the whole room.
MongoDB references are populated with only `_id`, `displayName`, and `avatar`;
the public payload maps them to `id`, `name`, and `avatarUrl`.
Join and snapshot-resynchronization also emit current `chat_history`,
`auction_stats_updated`, and `auction_heat_updated` events without changing the
existing snapshot object.

### 6.2 `auction_state_updated`

```json
{
  "auctionId": "auction_opaque_id",
  "auction": {
    "id": "auction_opaque_id",
    "status": "ACTIVE",
    "currentBid": 125000,
    "currentBidder": {
      "id": "user_opaque_id",
      "name": "Visible participant name",
      "avatarUrl": null
    },
    "winner": null,
    "winningAmount": null,
    "bidCount": 43,
    "sequence": 43,
    "endAt": "2026-08-01T12:30:00.000Z"
  },
  "latestBid": {
    "id": "bid_opaque_id",
    "amount": 125000,
    "sequence": 43,
    "createdAt": "2026-08-01T12:11:00.000Z",
    "bidder": {
      "id": "user_opaque_id",
      "name": "Visible participant name",
      "avatarUrl": null
    }
  },
  "timelineEvent": {
    "id": "timeline_opaque_id",
    "type": "BID_ACCEPTED",
    "createdAt": "2026-08-01T12:11:00.000Z",
    "actor": {
      "id": "user_opaque_id",
      "name": "Visible participant name",
      "avatarUrl": null
    }
  },
  "serverTime": 1785595860000
}
```

This event is emitted to the full auction room, including the bidder, only after
persistence commits. A rejected or duplicate bid produces no room event. The
payload also retains model-name aliases such as `serverSequence`, `timestamp`,
`eventType`, and `bid` in command acknowledgements.

### 6.3 `auction_started`

```json
{
  "auctionId": "auction_opaque_id",
  "status": "ACTIVE",
  "startAt": "2026-08-01T12:00:00.000Z",
  "endAt": "2026-08-01T12:30:00.000Z",
  "serverTime": 1785595200000
}
```

### 6.4 `auction_completed`

```json
{
  "auctionId": "auction_opaque_id",
  "auction": {
    "id": "auction_opaque_id",
    "status": "COMPLETED",
    "currentBid": 125000,
    "bidCount": 43,
    "winner": {
      "id": "user_opaque_id",
      "name": "Visible winner name",
      "avatarUrl": null
    },
    "winningAmount": 125000
  },
  "timelineEvent": {
    "type": "WINNER_DECLARED",
    "winner": {
      "id": "user_opaque_id",
      "name": "Visible winner name",
      "avatarUrl": null
    }
  },
  "serverTime": 1785597000000
}
```

If there is no accepted bid, `winner` and `winningAmount` are `null`. Completion
is persisted atomically and broadcast at most once for the winning state
transition. The same nested authoritative state is also emitted through
`auction_state_updated`; `auction_completed` retains top-level status, winner,
winning amount, and bid-count mirrors for compatibility.

### 6.5 `presence_updated`

```json
{
  "auctionId": "auction_opaque_id",
  "activeBidderCount": 4,
  "spectatorCount": 7,
  "serverTime": 1785595860000
}
```

Presence is live operational state, not durable auction history. Disconnect
cleanup removes only that socket from every joined auction. Bidder counts use
unique authenticated user IDs across tabs; authenticated spectators count by
identity and anonymous spectators count by connection. Seller presence is also
tracked but is not included in these public counts.

### 6.6 `timeline_event_created`

```json
{
  "auctionId": "auction_opaque_id",
  "timelineEvent": {
    "id": "timeline_opaque_id",
    "type": "BID_ACCEPTED",
    "occurredAt": "2026-08-01T12:11:00.000Z",
    "publicData": {}
  }
}
```

`BID_ACCEPTED` is persisted for every accepted bid. Other timeline types and
public payload schemas remain separately defined.

### 6.7 `auction_stats_updated`

```json
{
  "auctionId": "auction_opaque_id",
  "stats": {
    "bidderCount": 2,
    "spectatorCount": 1,
    "bidCount": 15,
    "uniqueBidderCount": 2,
    "currentBid": 20500,
    "bidVelocityPerMinute": 4,
    "lastBidAt": "2026-08-01T12:11:00.000Z",
    "status": "ACTIVE"
  },
  "serverTime": 1785595860000
}
```

Presence counts come from unique in-memory room identities. Bid count, current
bid, status, unique bidder count, velocity, and last bid time come from
persisted auction and accepted-bid data. Velocity is the number of accepted bids
in the latest 60 seconds.

### 6.8 `auction_heat_updated`

```json
{
  "auctionId": "auction_opaque_id",
  "heat": "WARM",
  "recentBidCount": 3,
  "windowSeconds": 60,
  "serverTime": 1785595860000
}
```

Heat uses only persisted accepted bids in the latest 60 seconds: zero or one is
`COLD`, two through four is `WARM`, and five or more is `HOT`.

### 6.9 `chat_message`

```json
{
  "auctionId": "auction_opaque_id",
  "chatMessage": {
    "id": "chat_opaque_id",
    "auctionId": "auction_opaque_id",
    "sender": {
      "id": "user_opaque_id",
      "name": "Visible participant name",
      "avatarUrl": null
    },
    "text": "Is local pickup available?",
    "clientMessageId": "client_message_opaque_id",
    "createdAt": "2026-08-01T12:12:00.000Z"
  },
  "serverTime": 1785595920000
}
```

The sender contains only public identity fields. The room event is emitted only
after MongoDB persistence succeeds.

### 6.10 `chat_history`

```json
{
  "auctionId": "auction_opaque_id",
  "messages": [],
  "serverTime": 1785595920000
}
```

`messages` contains the latest 50 persisted messages in oldest-to-newest order.

### 6.11 `chat_message_rejected`

```json
{
  "success": false,
  "message": "Chat rate limit exceeded; try again shortly"
}
```

This event and its matching negative acknowledgement are sent only to the
requesting socket.

### 6.12 `payment_status_updated`

```json
{
  "auctionId": "auction_opaque_id",
  "paymentStatus": "SUCCESSFUL",
  "serverTime": 1785596700000
}
```

This event is emitted only after backend verification and persistence. Provider
order IDs, payment IDs, signatures, and secrets are not included in the room
broadcast. An idempotent verification retry does not emit it again.

### 6.13 `timer_sync`

```json
{
  "auctionId": "auction_opaque_id",
  "status": "ACTIVE",
  "serverTime": 1785595860000,
  "startAt": "2026-08-01T12:00:00.000Z",
  "endAt": "2026-08-01T12:30:00.000Z",
  "remainingMs": 1140000
}
```

The backend computes `serverTime` and non-negative `remainingMs`. Sync events
stop after the persisted completion transition; the browser only renders the
countdown and never changes auction status.

## 7. Error codes

| Code | Meaning | Retry guidance |
|---|---|---|
| `VALIDATION_ERROR` | Payload shape or field value is invalid. | Correct the request. |
| `UNAUTHENTICATED` | Socket has no valid verified principal. | Restore auth, reconnect, and rejoin. |
| `FORBIDDEN` | Principal lacks permission. | Do not retry unchanged. |
| `AUCTION_NOT_FOUND` | Auction does not exist or is not visible. | Stop or return to discovery. |
| `NOT_IN_AUCTION_ROOM` | Command requires successful room join. | Join and replace state from snapshot. |
| `AUCTION_NOT_ACTIVE` | Auction is upcoming or otherwise not active. | Use authoritative state; do not guess. |
| `AUCTION_ENDED` | Server time is at or after `endAt`. | Request snapshot; do not retry bid. |
| `AUCTION_COMPLETED` | Completion already persisted. | Request snapshot; do not retry bid. |
| `SELLER_CANNOT_BID` | Verified seller attempted to bid. | Do not retry. |
| `SPECTATOR_CANNOT_BID` | Socket is authorized only as spectator. | Change role only through an authorized join flow. |
| `BID_BELOW_MINIMUM` | Amount is below authoritative minimum. | Render returned minimum and require a new intent. |
| `DUPLICATE_BID` | `clientBidId` was already processed or observed. | Do not create a second bid; resynchronize. |
| `RATE_LIMITED` | Command rate limit was exceeded. | Respect server guidance when defined. |
| `SERVICE_UNAVAILABLE` | Required processing dependency is unavailable. | Retry only after resynchronization and documented backoff. |
| `INTERNAL_ERROR` | Unexpected server failure. | Preserve client state, then resynchronize. |

Errors from chat use the acknowledgement for `send_chat_message` and must not be
routed through or block the bid queue.

## 8. Deterministic ordering and sequence numbers

- Each auction has its own sequential bid-processing queue. Different auctions
  may process concurrently without sharing ordering state.
- Every accepted bid receives a positive, strictly increasing, server-generated
  `sequenceNumber` scoped to its auction.
- The sequence number is persisted atomically with the accepted bid,
  authoritative auction update, and required timeline record before broadcast.
- A rejected bid consumes no accepted-bid sequence number.
- `clientBidId` provides duplicate detection; it is not the authoritative order.
- Clients apply a bid-driven `auction_state_updated` event only if
  `auction.sequence` is newer than the last applied bid sequence.
- A duplicate or older sequence is ignored. A gap triggers
  `request_auction_snapshot`; the client does not invent missing bids.
- `auction.sequence` in a snapshot is the authoritative recovery watermark.
- Sequences are independent across auctions and are never compared globally.
- The current SRS guarantees sequence numbers for accepted bids only. Whether a
  second persisted `stateVersion` should order completion, payment, presence,
  and other non-bid events is unresolved.

Retrying the same `clientBidId` is rejected without creating another bid. After
an acknowledgement timeout, the client requests a snapshot before deciding the
original outcome.

## 9. Refresh, reconnection, and stale-state recovery

Required client recovery flow:

```text
restore authentication
  -> connect socket
  -> register event listeners
  -> emit join_auction with acknowledgement
  -> receive full authoritative snapshot
  -> replace local auction state
  -> derive visual countdown from endAt and serverTime
  -> resume live event processing from auction.sequence
```

Rules:

1. The bidding control is disabled while disconnected, unauthenticated, or not
   yet resynchronized.
2. A reconnect always rejoins explicitly; room membership is not assumed to
   survive transport loss.
3. Snapshot data replaces stale local auction data, latest bids, timeline,
   counts, role, and payment state.
4. Events received before snapshot installation are buffered or discarded and
   resolved through the snapshot; the client must not merge them by arrival time
   alone.
5. A bid sequence gap, impossible status transition, or uncertain command
   timeout triggers snapshot recovery.
6. Reconnection rejoins and receives `chat_history`, current statistics, and
   current heat alongside the unchanged authoritative snapshot.
7. Server restart recovery reads MongoDB, completes expired auctions safely,
   restores active timers/cache where appropriate, and still returns the same
   snapshot contract.

## 10. Timer and completion semantics

- `endAt` and server time determine eligibility. A bid received at server time
  greater than or equal to `endAt` is rejected.
- The client countdown is presentation only and may reach zero before or after
  the completion event due to clock or network delay.
- The server atomically transitions `ACTIVE` to `COMPLETED`, determines and
  persists the winner once, creates required timeline state, and then emits
  `auction_completed`.
- Duplicate scheduler calls, reconnects, or server restart recovery must not
  produce a second winner or duplicate completion broadcast from a second state
  transition.
- A completed room is read-only for bidding. Chat behavior after completion is
  unresolved.
- Anti-sniping is a stretch goal and is not part of this initial contract. No
  implicit `endAt` extension occurs unless that feature is separately specified,
  implemented, and documented.
- `timer_sync` periodically aligns display countdowns with backend time. The
  persisted lifecycle transition, not the sync stream, remains authoritative.

## 11. Open decisions requiring agreement

The available SRS does not settle these points:

1. Socket.io deployment path, transports, and proxy settings.
2. Public bidder/winner identity masking.
3. A unified non-bid `stateVersion` and replay strategy.
4. Client acknowledgement timeouts, retry backoff, and server rate limits.
5. Chat moderation, long-term retention, and post-completion behavior.
6. Presence disconnect grace periods.
7. Timeline event registry and public payload schema.
8. Redis cache failure behavior during an otherwise persisted bid.
9. Payment retry and reconciliation events.

Both domains must resolve these in the shared contract before implementing
dependent client and server behavior. Neither side may silently choose a
different payload or event meaning.
