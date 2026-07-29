# BidArena — Codex Master Execution Prompt

> **Project Goal:** Build a first-position-worthy, production-ready, publicly deployed real-time auction platform that satisfies the complete BidArena SRS, is easy to demonstrate in a 5–10 minute video, and is fully explainable during the live defense round.

---

## 1. Project Context

- **Project:** BidArena — Competitive Real-Time Auction Platform
- **Sprint Duration:** 24 hours
- **Team Size:** 2 members
- **Primary Stack:** MERN, Socket.io, MongoDB, Razorpay, Redis
- **Main Objective:** Complete all mandatory SRS requirements first, then implement as many high-value stretch goals as possible without making the core auction engine unstable.
- **Quality Target:** We are competing for **first position**, so the implementation must be reliable, polished, tested, cleanly documented, and defendable.
- **UI Target:** Simple, modern, clean, responsive, product-focused, and human-designed. It must not look like a generic AI-generated dashboard.

Before writing code, read the complete SRS PDF in the repository root.

Recommended SRS filename:

```text
BIDARENA_SRS.pdf
```

Do not claim a feature is complete unless it is:

1. Implemented
2. Integrated
3. Tested
4. Documented
5. Committed to the correct branch

---

# 2. Team Ownership

## Domain A — Marketplace and UX

**Owner:** Subham  
**Working Branch:** `subham`

Domain A includes:

- User registration UI
- Login/logout UI
- Session restoration on refresh
- Auction creation UI
- Auction discovery
- Upcoming, active, and completed filters
- Auction details page
- Live auction room UI
- Bid controls
- Timer display
- Statistics UI
- Timeline UI
- Spectator mode UI
- Chat UI
- User profile
- Auctions created
- Auctions won
- Bid history
- Seller dashboard
- Payment UI
- Responsive design
- Loading, empty, error, and disabled states

### Domain A Branch Rule

Any code whose primary responsibility belongs to Domain A must be committed and pushed only to:

```bash
subham
```

Codex must judge ownership based on the actual code responsibility, not only the filename.

Examples:

- React page for auction room → `subham`
- Bid form component → `subham`
- Timer display component → `subham`
- Profile page → `subham`
- Auction listing page → `subham`
- Frontend Socket.io hook → `subham`
- Frontend Razorpay checkout UI → `subham`

---

## Domain B — Auction Engine and Real-Time State

**Owner:** Rohit  
**Working Branch:** `rohit`

Domain B includes:

- Socket.io server setup
- Socket authentication
- Auction rooms
- Bid validation
- Deterministic bid ordering
- Per-auction bid queue
- Duplicate bid protection
- Server-generated sequence numbers
- MongoDB persistence
- Atomic bid processing
- Authoritative server timer
- Winner logic
- Auction completion
- Reconnection recovery
- Browser refresh recovery
- Server restart recovery
- Concurrent auction isolation
- Timeline persistence
- Live statistics calculation
- Auction heat calculation
- Chat backend isolation
- Razorpay order creation
- Razorpay signature verification
- Redis state/cache integration
- Backend testing
- Recovery and fault tolerance

### Domain B Branch Rule

Any code whose primary responsibility belongs to Domain B must be committed and pushed only to:

```bash
rohit
```

Examples:

- Auction Engine service → `rohit`
- Bid queue → `rohit`
- Socket event handlers → `rohit`
- Timer manager → `rohit`
- Winner declaration service → `rohit`
- MongoDB models and transactions → `rohit`
- Redis integration → `rohit`
- Razorpay backend verification → `rohit`
- Server restart recovery → `rohit`

---

# 3. Mandatory Git Branch Strategy

The repository must use these four long-lived branches:

```text
main
developer
subham
rohit
```

## Branch Responsibilities

### `main`

- Final stable production branch
- Only complete and tested code is merged here
- Deployment should use this branch
- No direct feature development
- No experimental work
- No direct commits except emergency fixes

### `developer`

- Shared integration branch
- Domain A and Domain B are merged here
- All cross-domain testing happens here
- Deployment rehearsal should happen here before merging to `main`
- Broken or incomplete features must not be merged into `main`

### `subham`

- Dedicated Domain A branch
- Marketplace and UX work
- UI code
- Frontend integrations
- Domain A documentation and tests

### `rohit`

- Dedicated Domain B branch
- Auction Engine
- Real-time state
- Backend
- Persistence
- Recovery
- Razorpay backend
- Redis
- Domain B tests

---

# 4. Required Development Flow

The flow must always be:

```text
Domain A feature
    ↓
Implement on subham branch
    ↓
Test the feature
    ↓
Commit the small feature
    ↓
Push to subham
    ↓
Merge subham into developer
    ↓
Run integration tests on developer
```

```text
Domain B feature
    ↓
Implement on rohit branch
    ↓
Test the feature
    ↓
Commit the small feature
    ↓
Push to rohit
    ↓
Merge rohit into developer
    ↓
Run integration tests on developer
```

Final release flow:

```text
subham ──┐
         ├──> developer ──> complete integration testing ──> main
rohit ───┘
```

## Strict Merge Rules

1. Never merge `subham` directly into `main`.
2. Never merge `rohit` directly into `main`.
3. Always merge both domain branches into `developer` first.
4. Run full integration tests on `developer`.
5. Fix all blocking errors on the responsible domain branch.
6. Re-merge the fixed branch into `developer`.
7. Only merge `developer` into `main` when the complete project is stable.
8. Never force-push unless explicitly required and understood.
9. Never commit secrets.
10. Never make random cross-domain edits without documenting them.

---

# 5. Small Feature Commit Rule

Codex must create a commit after every small, meaningful, working feature.

Do not make one giant commit for the entire project.

Good examples:

```bash
git commit -m "feat(auth): add user registration flow"
git commit -m "feat(auction): add auction creation form"
git commit -m "feat(socket): add authenticated auction room joining"
git commit -m "feat(bidding): add per-auction bid queue"
git commit -m "feat(timer): add authoritative server countdown"
git commit -m "feat(recovery): restore auction snapshot on reconnect"
git commit -m "feat(payment): verify Razorpay payment signature"
git commit -m "feat(redis): cache active auction state"
git commit -m "test(bidding): cover simultaneous bid ordering"
git commit -m "docs(defense): explain race-condition handling"
```

Bad examples:

```bash
git commit -m "done"
git commit -m "full project"
git commit -m "changes"
git commit -m "final"
git commit -m "updated code"
```

## Before Every Commit

Codex must:

1. Run the relevant test or build command.
2. Confirm there is no unrelated code in the commit.
3. Confirm the code belongs to the current branch owner.
4. Update relevant documentation.
5. Show the exact files changed.
6. Explain the feature flow.
7. Commit using a meaningful conventional commit message.
8. Push to the current domain branch.

---

# 6. Codex Branch Ownership Logic

Before changing any file, Codex must classify the task.

Use this decision:

```text
Is the task mainly visible UI, frontend interaction, page design,
frontend state display, or marketplace UX?
    → Work on subham branch

Is the task mainly backend logic, socket processing, persistence,
bid ordering, timer authority, recovery, Redis, or payment verification?
    → Work on rohit branch

Does the task require both domains?
    → Split the work:
       frontend portion on subham
       backend portion on rohit
       merge both into developer
       test integration on developer
```

Codex must not place complete cross-domain work in only one person's branch.

Example: Payment feature

```text
Razorpay checkout button and UI → subham
Razorpay order creation and signature verification → rohit
Full payment flow test → developer
```

Example: Live bidding

```text
Bid input and live update UI → subham
Bid queue, validation, persistence and broadcast → rohit
Two-browser integration test → developer
```

Example: Timer

```text
Visual countdown component → subham
Authoritative endAt logic and completion scheduler → rohit
Timer sync verification → developer
```

---

# 7. First-Position Quality Standard

We are not building only a submission that “runs.”

We are building a project that should compete for **first position**.

Codex must optimise for:

- Correctness
- Reliability
- Explainability
- Clean architecture
- Clear Git history
- Strong demo flow
- Strong live defense
- Responsive UX
- Real edge-case handling
- Production deployment
- Honest requirement tracking
- Good comments around difficult logic
- No fake completion claims

Priority order:

1. Correct Auction Engine
2. Deterministic concurrent bidding
3. Server-owned timer
4. Winner correctness
5. Reconnection and restart recovery
6. Persistent database state
7. Clean frontend UX
8. Razorpay verification
9. Redis integration
10. Deployment
11. Testing
12. Video and defense preparation
13. Stretch goals

Do not sacrifice the core engine to add decorative or low-value features.

---

# 8. Required Documentation

Create and maintain:

```text
docs/
├── SRS_TRACEABILITY.md
├── ARCHITECTURE.md
├── API_CONTRACT.md
├── SOCKET_CONTRACT.md
├── DATABASE_DESIGN.md
├── GIT_WORKFLOW.md
├── TEST_PLAN.md
├── TEST_EVIDENCE.md
├── DEFENSE_NOTES.md
├── DEMO_SCRIPT.md
├── DEPLOYMENT.md
└── KNOWN_LIMITATIONS.md
```

## SRS Traceability

Map every mandatory requirement:

- FR-1 to FR-24
- NFR 4.1 to 4.13
- S-1 to S-15
- SG-1 to SG-15

Format:

| Requirement | Owner | Branch | Implementation Files | Test | Status |
|---|---|---|---|---|---|
| FR-1 | Subham | subham | client/... | auth test | Pending |
| FR-12 | Rohit | rohit | server/... | concurrent bid test | Pending |
| FR-22 | Rohit + Subham | rohit/subham | server/... client/... | reconnect test | Pending |

A requirement can be marked `Done` only when it is implemented and verified.

Statuses:

```text
Pending
In Progress
Implemented
Tested
Integrated
Done
Blocked
```

---

# 9. Commenting Standard

Codex must keep adding useful comments during implementation.

Comments are required especially for:

- Race-condition handling
- Per-auction queue
- Sequence number logic
- MongoDB transaction boundaries
- Database-before-broadcast flow
- Duplicate request protection
- Server timer ownership
- Winner declaration guard
- Reconnection snapshot
- Server restart recovery
- Redis locking/cache logic
- Razorpay signature verification
- Chat isolation
- Socket room isolation

Good comment:

```ts
// Process bids sequentially per auction so two simultaneous requests
// cannot overwrite the same authoritative auction state.
```

Good comment:

```ts
// Commit the MongoDB transaction before broadcasting.
// This prevents clients from seeing a state that was not persisted.
```

Good comment:

```ts
// The server endAt timestamp is authoritative.
// The client countdown is only a visual representation.
```

Bad comment:

```ts
// increment count
count++;
```

Bad comment:

```ts
// call function
processBid();
```

## Comment Rules

- Explain **why**, not obvious syntax.
- Do not add comments to every line.
- Keep comments updated when logic changes.
- Add JSDoc/TSDoc to important public services.
- Add short module-level comments to complex engine files.
- Use comments to help the team explain the code during defense.

---

# 10. Architecture Rules

The backend must be the single source of truth.

The client must never independently decide:

- Whether a bid is valid
- Highest bid
- Highest bidder
- Winner
- Auction completion
- Final payment status
- Authoritative timer expiry

The client sends commands and displays authoritative server state.

Recommended structure:

```text
client/
  src/
    components/
    pages/
    hooks/
    services/
    sockets/
    context/
    utils/
    types/

server/
  src/
    config/
    controllers/
    routes/
    middleware/
    models/
    validators/
    services/
    sockets/
    engine/
    jobs/
    utils/
    tests/
```

Keep business logic out of:

- React components
- Express route definitions
- Socket event handlers

Use services and engine modules for business rules.

---

# 11. Domain B Mandatory Flow

## Bid Request

```json
{
  "auctionId": "string",
  "amount": 12000,
  "clientBidId": "unique-client-generated-id"
}
```

The authenticated user ID must come from the verified socket or authenticated request.

Do not trust a client-provided `userId`.

## Bid Processing Flow

```text
receive place_bid
    ↓
authenticate socket
    ↓
enqueue in auction-specific queue
    ↓
fetch authoritative auction state
    ↓
validate bid
    ↓
start database transaction
    ↓
update highest bid and bidder
    ↓
create bid record
    ↓
create timeline record
    ↓
increment sequence number
    ↓
commit transaction
    ↓
update Redis cache
    ↓
broadcast authoritative state
    ↓
acknowledge sender
```

## Validation Rules

Reject when:

- User is unauthenticated
- Auction does not exist
- Auction is not active
- Server time is at or after `endAt`
- Seller bids on own auction
- User is only a spectator
- Amount is missing
- Amount is non-numeric
- Amount is negative
- Amount is below required minimum
- `clientBidId` is duplicated
- Auction is already completed

## Deterministic Ordering

Use a separate sequential queue for each auction:

```text
Auction A: A1 → A2 → A3
Auction B: B1 → B2 → B3
```

Different auctions may process independently.

Every accepted bid must get a server-generated sequence number.

---

# 12. Timer and Winner Flow

Store absolute timestamps:

```text
startAt
endAt
```

The server decides whether the auction is active.

At timer expiry:

1. Reject new bids.
2. Atomically change status from `ACTIVE` to `COMPLETED`.
3. Determine the highest bidder.
4. Declare the winner only once.
5. Save the winner.
6. Save timeline events.
7. Broadcast completion.
8. Make the room read-only.
9. Enable the winner payment flow.

Use an atomic condition so duplicate completion calls cannot create multiple winners.

---

# 13. Reconnection and Recovery

## Browser Refresh or Socket Reconnection

```text
restore authentication
    ↓
reconnect socket
    ↓
join auction room
    ↓
fetch latest authoritative state
    ↓
send full snapshot
    ↓
replace stale client state
```

Snapshot should include:

```json
{
  "auction": {},
  "latestBids": [],
  "timeline": [],
  "serverTime": 0,
  "activeBidderCount": 0,
  "spectatorCount": 0,
  "currentUserRole": "BIDDER",
  "paymentStatus": "PENDING"
}
```

## Server Restart

On backend start:

1. Fetch `UPCOMING` and `ACTIVE` auctions.
2. Complete expired auctions safely.
3. Restore active timers.
4. Restore relevant Redis cache state.
5. Prevent duplicate winner declaration.
6. Keep MongoDB as persistent recovery source.

---

# 14. Redis Requirements

Redis should be used only where it gives clear value.

Possible responsibilities:

- Active auction state cache
- Fast snapshot retrieval
- Active participant presence
- Spectator counts
- Bid queue coordination
- Idempotency keys
- Distributed locks
- Rate limiting
- Socket.io Redis adapter when scaling

MongoDB remains the permanent source of truth.

Redis must not become the only place where critical auction history or winner state exists.

Document:

- What is cached
- Cache key format
- TTL
- Cache invalidation
- MongoDB fallback
- Restart behaviour

Example keys:

```text
auction:{auctionId}:state
auction:{auctionId}:presence
auction:{auctionId}:processed-bids
auction:{auctionId}:lock
```

---

# 15. Razorpay Requirements

Use Razorpay test mode.

Flow:

```text
auction completes
    ↓
winner clicks pay
    ↓
backend verifies winner identity
    ↓
backend creates Razorpay order
    ↓
frontend opens checkout
    ↓
frontend sends payment details
    ↓
backend verifies signature
    ↓
payment status updated
    ↓
timeline created
    ↓
room receives payment update
```

Payment status:

```text
PENDING
SUCCESSFUL
FAILED
```

Do not trust a frontend-only success response.

Separate:

```text
auction.status
payment.status
```

---

# 16. UI/UX Rules

The UI must look human-designed.

Avoid:

- Purple-blue gradient everywhere
- Glassmorphism everywhere
- Giant rounded cards
- Random floating shapes
- Unnecessary hero section
- Fake statistics
- Excessive animations
- Neon colours
- Excessive shadows
- Random emojis
- Inconsistent icons
- Every section inside a card
- Generic AI-generated marketing copy

Use:

- Neutral background
- One controlled accent colour
- Clear typography hierarchy
- Consistent spacing system
- Restrained border radius
- Subtle borders and shadows
- Readable contrast
- Clear live status
- Real product-oriented wording
- Loading skeletons
- Empty states
- Error states
- Accessible forms
- Visible focus states
- Mobile responsiveness

## Auction Room Desktop Layout

```text
Left:
- product image
- auction information
- seller information

Centre:
- live status
- highest bid
- timer
- minimum next bid
- bid form
- bid activity

Right:
- participants
- statistics
- spectators
- chat
```

## Mobile Layout

```text
- product summary
- highest bid
- timer
- bid controls
- tabs for activity, timeline, participants and chat
```

Highest bid and remaining time must be visually dominant.

---

# 17. Testing Requirements

At minimum, test:

1. Registration
2. Login
3. Protected auction creation
4. Auction discovery
5. Join active room
6. Valid bid
7. Lower bid rejection
8. Seller self-bid rejection
9. Duplicate bid rejection
10. Two simultaneous bids
11. Sequence ordering
12. Timer expiration
13. Late bid rejection
14. Winner declaration
15. Duplicate winner prevention
16. Refresh recovery
17. Reconnection recovery
18. Multiple room isolation
19. Chat failure isolation
20. Razorpay signature verification
21. Payment failure
22. Server restart recovery
23. Redis fallback
24. Production frontend build
25. Backend startup

Do not say “tests passed” without showing the command and result.

---

# 18. Required Execution Phases

## Phase 0 — Inspection and Planning

- Read SRS
- Inspect repository
- Create architecture
- Freeze API contracts
- Freeze socket contracts
- Create SRS traceability
- Create Git workflow
- Assign ownership

## Phase 1 — Project Foundation

- Project structure
- Environment configuration
- MongoDB
- Redis
- Shared error handling
- Authentication base

## Phase 2 — Domain A Marketplace

Work on `subham`:

- Auth screens
- Auction creation
- Discovery
- Details
- Auction room
- Profile
- Responsive UI

## Phase 3 — Domain B Auction Engine

Work on `rohit`:

- Socket authentication
- Rooms
- Snapshot
- Bid queue
- Validation
- Transactions
- Broadcast

## Phase 4 — Timer and Completion

Work on `rohit`:

- Server timer
- Late bid rejection
- Winner declaration
- Timeline
- Recovery

Related timer UI work remains on `subham`.

## Phase 5 — Integration

Merge:

```text
subham → developer
rohit → developer
```

Then test:

- event names
- payload shapes
- auth
- timers
- state sync
- race conditions
- multiple rooms

## Phase 6 — Chat, Stats, Payment and Redis

Split ownership correctly between `subham` and `rohit`.

## Phase 7 — Stretch Goals

Only after mandatory requirements are stable.

High-value order:

1. Anti-sniping
2. Auction replay
3. Advanced timeline
4. Advanced stats
5. Heat visualisation
6. Reserve price
7. Scheduled auctions
8. Watchlists
9. Seller dashboard
10. Admin panel
11. Chat moderation
12. Proxy bidding
13. Fraud detection
14. Recommendation

## Phase 8 — Final QA

On `developer`:

- automated tests
- two-browser test
- reconnect test
- server restart test
- payment test
- production build
- deployment rehearsal

## Phase 9 — Release

```text
developer → main
```

Only after all blocking issues are fixed.

---

# 19. Codex Output After Every Feature

After each small feature, Codex must report:

```text
Feature:
Owner:
Branch:
Files changed:
Flow:
Why this approach:
Tests executed:
Test result:
Commit message:
Push result:
SRS requirements affected:
Remaining risk:
Next feature:
```

Example:

```text
Feature: Per-auction sequential bid queue
Owner: Rohit
Branch: rohit
Files changed:
- server/src/engine/BidQueue.ts
- server/src/services/BidService.ts
- server/src/tests/bidQueue.test.ts

Flow:
place_bid → auction queue → validation → transaction → broadcast

Tests executed:
npm test -- bidQueue.test.ts

Result:
8 tests passed

Commit:
feat(bidding): add per-auction sequential queue
```

---

# 20. Integration Procedure

When a Domain A feature is ready:

```bash
git checkout subham
git pull origin subham
# implement and test
git add .
git commit -m "feat(ui): add live auction room"
git push origin subham

git checkout developer
git pull origin developer
git merge subham
# run integration tests
git push origin developer
```

When a Domain B feature is ready:

```bash
git checkout rohit
git pull origin rohit
# implement and test
git add .
git commit -m "feat(bidding): add deterministic bid processing"
git push origin rohit

git checkout developer
git pull origin developer
git merge rohit
# run integration tests
git push origin developer
```

Final release:

```bash
git checkout developer
git pull origin developer
# run all tests and builds

git checkout main
git pull origin main
git merge developer
git push origin main
```

Codex must stop and report conflicts instead of blindly resolving important business logic conflicts.

---

# 21. Live Defense Preparation

Maintain `docs/DEFENSE_NOTES.md`.

Explain in both simple and technical language:

- What is the backend source of truth?
- What is a race condition?
- How are simultaneous bids processed?
- Why use one queue per auction?
- What makes ordering deterministic?
- Why save before broadcasting?
- Why is the timer server-owned?
- How are late bids rejected?
- How is duplicate winner declaration prevented?
- How does reconnection recovery work?
- How does server restart recovery work?
- Why use isolated Socket.io rooms?
- How does Redis help?
- Why is MongoDB still the permanent source?
- Why is chat isolated?
- How is Razorpay verified?
- Which code belongs to Domain A?
- Which code belongs to Domain B?
- Why was this branch strategy used?

---

# 22. Video Demo Preparation

Maintain `docs/DEMO_SCRIPT.md`.

The 5–10 minute video must show:

1. Project introduction
2. Team roles
3. Architecture
4. Registration/login
5. Auction creation
6. Auction discovery
7. Two users joining the same auction
8. Live bid update
9. Invalid lower bid
10. Simultaneous bids
11. Timeline
12. Statistics and heat
13. Browser refresh
14. Network reconnection
15. Timer expiration
16. Late bid rejection
17. Winner declaration
18. Razorpay test payment
19. Multiple active auctions
20. Redis usage
21. Code walkthrough
22. Git branch and commit history
23. Public deployment
24. Final conclusion

---

# 23. Completion Gate

Do not merge `developer` into `main` until all of these are true:

- Frontend production build passes
- Backend starts successfully
- MongoDB connects
- Redis connects or fails gracefully
- Socket.io works in production
- Registration/login works
- Auction creation works
- Auction discovery works
- Two-browser bidding works
- Invalid bid is rejected
- Simultaneous bids are ordered
- Timer is authoritative
- Late bid is rejected
- Winner is declared once
- Refresh recovery works
- Reconnection recovery works
- Server restart recovery works
- Chat does not block bidding
- Razorpay test payment works
- SRS traceability is honest
- README is complete
- Demo script is complete
- Defense notes are complete
- `.env.example` files exist
- No secrets are committed
- No critical TODO remains
- No fake data is required for core flows
- Public deployment is accessible

---

# 24. Final Codex Instruction

You are acting as a senior full-stack architect, implementation engineer, QA engineer, Git workflow guardian, and live-defense preparation assistant.

We are aiming for **first position**.

Therefore:

- Build for correctness first.
- Keep the UI simple and professional.
- Keep the Auction Engine deterministic and defendable.
- Add useful comments around complex logic.
- Follow branch ownership strictly.
- Commit every small working feature.
- Push Domain A code to `subham`.
- Push Domain B code to `rohit`.
- Merge both into `developer`.
- Test complete integration on `developer`.
- Merge `developer` into `main` only at the end.
- Never hide incomplete features.
- Never claim success without evidence.
- Preserve clean commit history.
- Keep documentation updated continuously.

## Begin Now

Start with **Phase 0**:

1. Inspect the repository.
2. Read `BIDARENA_SRS.pdf`.
3. Verify or create the branches:

```text
main
developer
subham
rohit
```

4. Create the required documentation.
5. Classify every SRS requirement by owner and branch.
6. Produce the execution plan.
7. Do not start implementation until architecture and contracts are frozen.
