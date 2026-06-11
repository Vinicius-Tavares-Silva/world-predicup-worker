# World Predicup Live Match Worker Plan

## Current Implementation

This repository now contains a first TypeScript worker scaffold:

- configuration loading and validation
- provider interface with mock, WC2026 API, and API-Football live-match providers
- snapshot and event normalization into the webhook payload contract
- stable idempotency key generation
- webhook delivery with retry and dry-run mode
- SQLite persistence using Node's built-in `node:sqlite`
- unit tests for config, provider mapping, normalization, and idempotency

## Local Development

Use Node.js 24 or newer.

```bash
npm install
npm test
npm run build
npm run dev
```

The worker defaults to `DRY_RUN=true`, so `npm run dev` prints the mock webhook payload instead of calling an API. It stores local state at `./data/worker.sqlite` and will skip already-sent idempotency keys on later runs.

Copy `.env.example` to `.env` when connecting it to a real endpoint. Set `DRY_RUN=false`, `WORLD_PREDICUP_API_BASE_URL`, and `WORLD_PREDICUP_WEBHOOK_TOKEN` before sending real webhook requests.

## Local World Predicup Integration Test

The sibling app repo receives worker updates through its local Supabase Edge Function:

```bash
cd ../world-predicup
supabase start
supabase status -o env
cp supabase/functions/.env.local.example supabase/functions/.env.local
```

The function env file only needs `LIVE_MATCH_WEBHOOK_TOKEN`; the Supabase CLI injects the local Supabase URL and service role key. Serve the receiver:

```bash
supabase functions serve live-match-webhook --env-file supabase/functions/.env.local
```

In this worker repo, run the smoke test with the same local service role key:

```bash
WORLD_PREDICUP_SUPABASE_URL=http://127.0.0.1:54321 \
WORLD_PREDICUP_SUPABASE_SERVICE_ROLE_KEY='<local-service-role-key>' \
WORLD_PREDICUP_WEBHOOK_TOKEN=local-worker-webhook-token \
npm run test:local:webhook
```

The script picks one seeded group-stage match, maps the mock provider to it, runs the worker once with `DRY_RUN=false`, and verifies the match row changed to `in_progress` with score `2-1`.

To manually simulate a match update through the same local webhook, use:

```bash
WORLD_PREDICUP_SUPABASE_URL=http://127.0.0.1:54321 \
WORLD_PREDICUP_SUPABASE_SERVICE_ROLE_KEY='<local-service-role-key>' \
WORLD_PREDICUP_WEBHOOK_TOKEN=local-worker-webhook-token \
npm run simulate:match -- --match 1 --event start
```

`--match` accepts either a UUID or a 1-based ordinal from the local match schedule ordered by date. Useful examples:

```bash
# Start match 1 at 0-0
npm run simulate:match -- --match 1 --event start

# Set match 1 live at minute 67 with score 2-1
npm run simulate:match -- --match 1 --event live --home 2 --away 1 --minute 67

# Finish match 1 with score 3-2
npm run simulate:match -- --match 1 --event finish --home 3 --away 2 --minute 90
```

Optional flags:

```text
--provider local-sim
--external-id custom-provider-match-id
--reset true|false
```

The simulator upserts a local provider mapping, sends a fake `match_snapshot` request to `live-match-webhook`, and prints the updated World Predicup match row.

## WC2026 Match Mapping Sync

The production webhook resolves provider matches through the World Predicup `match_provider_mappings` table. Populate it from the WC2026 `/matches` endpoint with:

```bash
SPORTS_DATA_PROVIDER=wc2026 \
SPORTS_DATA_API_KEY='<wc2026-api-key>' \
WC2026_API_BASE_URL=https://api.wc2026api.com \
WORLD_PREDICUP_SUPABASE_URL='https://<project-ref>.supabase.co' \
WORLD_PREDICUP_SUPABASE_SERVICE_ROLE_KEY='<service-role-key>' \
npm run sync:wc2026-mappings
```

The command defaults to dry-run mode. It prints fetched, matched, reversed, unmatched, and ambiguous counts without writing rows.

After the dry run reports no unmatched or ambiguous matches, write the mappings:

```bash
SYNC_WC2026_MAPPINGS_WRITE=true \
SPORTS_DATA_PROVIDER=wc2026 \
SPORTS_DATA_API_KEY='<wc2026-api-key>' \
WC2026_API_BASE_URL=https://api.wc2026api.com \
WORLD_PREDICUP_SUPABASE_URL='https://<project-ref>.supabase.co' \
WORLD_PREDICUP_SUPABASE_SERVICE_ROLE_KEY='<service-role-key>' \
npm run sync:wc2026-mappings
```

The sync matches by kickoff time plus normalized home/away team names, with aliases for English provider names and Portuguese app names. It refuses to write ambiguous mappings.

For API-Football, use:

```env
SPORTS_DATA_PROVIDER=api-football
SPORTS_DATA_API_KEY=your-api-football-key
API_FOOTBALL_LEAGUE_ID=1
API_FOOTBALL_SEASON=2026
API_FOOTBALL_LIVE_SCOPE=1
```

`API_FOOTBALL_LIVE_SCOPE=1` polls only live World Cup matches. Set it to `all` only when intentionally checking every live football match and filtering locally.

To validate the API-Football key and fixture mapping before any World Cup matches are live:

```bash
npm run probe:api-football
```

For WC2026 API, use:

```env
SPORTS_DATA_PROVIDER=wc2026
SPORTS_DATA_API_KEY=your-wc2026-key
WC2026_API_BASE_URL=https://api.wc2026api.com
WC2026_USE_TEST_ENDPOINT=true
```

`WC2026_USE_TEST_ENDPOINT=true` makes `npm run dev` poll `/test/match`, which cycles through a fictional Brazil vs Argentina match. Set it to `false` for production polling via `/matches?status=live`.

To validate the WC2026 key and sandbox live-match mapping:

```bash
npm run probe:wc2026
```

## Trigger.dev Deployment

This worker is configured for Trigger.dev project `proj_futvdbmbattdpsiimydk`.

```bash
npm run trigger:dev
npm run trigger:deploy
```

The deployed task is `poll-live-world-cup-matches`. Trigger.dev runs it every 5 minutes. The worker checks the known World Cup schedule before calling the sports-data provider, so runs outside match windows exit successfully with `no_live_match` and do not spend a provider request.

```ts
cron: {
  pattern: "*/5 * * * *",
  timezone: "UTC",
},
```

Set these environment variables in Trigger.dev production:

```env
SPORTS_DATA_PROVIDER=wc2026
SPORTS_DATA_API_KEY=your-wc2026-key
WC2026_API_BASE_URL=https://api.wc2026api.com
WC2026_SCHEDULE_PATH=./data/wc2026-matches.json
WC2026_USE_TEST_ENDPOINT=true
DRY_RUN=true
STATE_DB_PATH=/tmp/worker.sqlite
```

For real webhook delivery, change `DRY_RUN=false` and set:

```env
WORLD_PREDICUP_API_BASE_URL=https://<project-ref>.supabase.co
WORLD_PREDICUP_WEBHOOK_TOKEN=your-webhook-token
WORLD_PREDICUP_WEBHOOK_PATH=/functions/v1/live-match-webhook
```

Trigger.dev does not use the local SQLite state store for scheduled runs. It still sends the stable `Idempotency-Key` header, so the receiving API should dedupe repeated score snapshots.

## Trigger Minute Loop With 100 Daily API Calls

Trigger.dev wakes the worker every 5 minutes for operational simplicity. A Trigger run is cheap, gives observability, and lets us react quickly when a match window starts. The important rule is that most Trigger runs must exit without calling the sports data provider.

The worker needs a local decision layer before calling WC2026 API:

```text
Trigger runs every 5 minutes
-> check the known tournament schedule
-> decide if this minute is inside an active polling window
-> if no, exit with reason: no_live_match
-> if group-stage window, call the live endpoint once
-> if knockout window, call live plus completed reconciliation
-> normalize returned matches and send webhook updates
```

For WC2026 API, prefer aggregate requests:

```http
GET /matches?status=live
GET /matches
```

One aggregate live request should cover all currently live World Cup matches, including days where two matches happen at the same time. The budget must be based on active time windows, not the number of simultaneous games. Group-stage windows are intentionally short: kickoff - 10 minutes through kickoff + 120 minutes. Knockout windows remain longer: kickoff - 30 minutes through kickoff + 210 minutes.

For production, generate `WC2026_SCHEDULE_PATH` from `GET https://api.wc2026api.com/matches`. The artifact can be the raw `/matches` JSON array; the worker reads `kickoff_utc` and `round` to build polling windows without calling the provider outside active windows.

### Budget Targets

For a 100-request/day free tier, group-stage polling uses the shorter window and a 5-minute cadence:

```text
Worst group day: 5 matches
Window policy:   kickoff - 10m through kickoff + 120m
Cadence:         5 minutes
Provider calls:  1 live request per execution
Worst usage:     about 132 requests
```

That can exceed the 100/day free limit on the busiest group days. If the provider limit is strict, switch the Trigger schedule to 10 minutes during the group phase; the same policy drops the worst group day to about 68 requests.

On match days, compute the interval from the schedule:

```text
active_window_minutes = sum(merged polling windows)
live_interval_minutes = ceil(active_window_minutes / available_live_requests)
```

Example with 4 group-stage kickoff windows:

```text
window duration: kickoff - 30m through kickoff + 150m = 180 minutes
4 windows * 180 minutes = 720 active minutes
720 active minutes / 60 live requests = one provider call every 12 minutes
```

Knockout windows are longer to cover extra time, penalties, and final reconciliation:

```text
knockout window duration: kickoff - 30m through kickoff + 210m = 240 minutes
```

Example with 2 games at the same time:

```text
18:00 Brazil vs Argentina
18:00 Germany vs France

Merged window: 17:30-20:30
Provider call at 17:30 covers both if /matches?status=live returns both
Provider call at 17:42 covers both
Provider call at 17:54 covers both
```

If the provider ever requires per-match requests, multiply the window cost by the number of matches in that merged window and increase the interval accordingly. With a 100/day limit, per-match live polling should be treated as a fallback, not the default.

### Polling Windows

Build windows from the known World Cup schedule:

```ts
type MatchWindow = {
  matchId: string;
  kickoffAt: string;
  startsAt: string; // kickoff - 30 minutes
  endsAt: string;   // group: kickoff + 150m, knockout: kickoff + 210m
};

type MergedPollingWindow = {
  startsAt: string;
  endsAt: string;
  matchIds: string[];
  intervalMinutes: number;
};
```

Merge overlapping windows so simultaneous or back-to-back matches share provider calls. A day with four matches might have four windows, but a day with two simultaneous matches still has one merged window for that kickoff slot.

### State Needed

Trigger runtime state should be external, because in-memory state does not survive across runs.

Minimum persisted state:

```text
provider_request_budget
- date
- provider
- daily_limit
- requests_used
- requests_reserved
- last_provider_call_at
- next_allowed_provider_call_at

match_polling_windows
- date
- starts_at
- ends_at
- match_ids
- interval_minutes

provider_snapshots
- provider
- external_match_id
- status
- minute
- home_score
- away_score
- fetched_at

sent_updates
- idempotency_key
- external_match_id
- sent_at
- payload_hash
```

Storage options:

- Use the main World Predicup database if the worker can safely access service-role APIs.
- Use Trigger.dev environment plus a small external store only for budget/sent-update state.
- Use Supabase tables for budget, schedule windows, and idempotency, which is the most practical path for this project.

### Decision Rules

Each 5-minute run checks:

1. If now is outside all known match windows, do not call the provider and return `no_live_match`.
2. If now is inside a match window, call the provider once.
3. Send webhook updates using stable idempotency keys so the receiver can dedupe repeated snapshots.

Meaningful phase/status updates:

- `scheduled -> live`
- score changed
- `live -> halftime`
- `halftime -> live`
- `live -> finished`
- penalty score changed
- final reconciliation after finished

### Implementation Plan

1. Add a `BudgetStore` interface with methods to read/update daily request counters and next allowed provider call time.
2. Add a `ScheduleStore` interface that can load World Cup fixtures and build merged polling windows by date.
3. Add Supabase-backed implementations for `BudgetStore`, `ScheduleStore`, and `StateStore` for Trigger production.
4. Keep SQLite only for local development.
5. Change `poll-live-world-cup-matches` so it starts every 5 minutes but exits early with a structured log reason when no provider request should be made.
6. Add `ProviderCallDecision` tests for:
   - no matches today
   - outside polling window
   - inside polling window but cadence not reached
   - daily budget exhausted
   - simultaneous matches merged into one window
   - score/status changed sends webhook
   - unchanged snapshot does not send webhook
7. Add dashboard logs for every run:
   - `decision`
   - `requestsUsed`
   - `dailyLimit`
   - `nextAllowedProviderCallAt`
   - `activeWindowMatchIds`
8. Re-enable the Trigger cron only after the budget gate is in place.

## Goal

Build a worker that collects official or licensed World Cup 2026 live match data, normalizes score and event updates, and sends them to the World Predicup API minute by minute.

The worker should avoid relying on Google page scraping as the production source. Scraping public score widgets is brittle, can be blocked, and does not provide a stable contract. A sports data API should be the primary source, with scraping only considered as a last-resort diagnostic fallback.

## Delivery Contract

For now, the worker will send live updates to a mock World Predicup endpoint:

```http
POST /functions/v1/live-match-webhook
Authorization: Bearer <WORLD_PREDICUP_WEBHOOK_TOKEN>
Content-Type: application/json
Idempotency-Key: <stable-update-key>
```

Recommended environment variables:

```env
WORLD_PREDICUP_API_BASE_URL=https://<project-ref>.supabase.co
WORLD_PREDICUP_WEBHOOK_TOKEN=replace-me
SPORTS_DATA_PROVIDER=api-football
SPORTS_DATA_API_KEY=replace-me
API_FOOTBALL_LEAGUE_ID=1
API_FOOTBALL_SEASON=2026
API_FOOTBALL_LIVE_SCOPE=1
POLL_INTERVAL_LIVE_SECONDS=60
POLL_INTERVAL_PRE_MATCH_SECONDS=300
```

## Webhook Payload

The API should accept repeated events safely. Every request should include a stable idempotency key so retries do not create duplicate goals, cards, or score snapshots.

```json
{
  "source": "provider-name",
  "type": "match_snapshot",
  "externalMatchId": "provider-match-123",
  "matchId": "world-predicup-match-123",
  "status": "live",
  "minute": 67,
  "period": "second_half",
  "homeTeam": {
    "id": "BRA",
    "name": "Brazil"
  },
  "awayTeam": {
    "id": "ARG",
    "name": "Argentina"
  },
  "score": {
    "home": 2,
    "away": 1
  },
  "events": [
    {
      "externalEventId": "provider-event-999",
      "type": "goal",
      "minute": 66,
      "teamId": "BRA",
      "playerName": "Example Player",
      "scoreAfterEvent": {
        "home": 2,
        "away": 1
      },
      "occurredAt": "2026-06-15T19:24:00Z"
    }
  ],
  "occurredAt": "2026-06-15T19:25:00Z",
  "receivedAt": "2026-06-15T19:25:04Z"
}
```

## Update Types

The worker should send two categories of updates:

- `match_snapshot`: current score, status, minute, and period. Sent every minute while the match is live.
- `match_event`: important event such as goal, penalty, red card, yellow card, substitution, VAR, halftime, full time, extra time, or penalty shootout update.

For simplicity, the first implementation can send snapshots with an embedded `events` array. Later, the API can split snapshots and events into separate routes if needed.

## Worker Flow

1. Load configuration and validate required tokens.
2. Fetch upcoming and live World Cup matches from the sports data provider.
3. Identify matches that need polling:
   - starting within 30 minutes
   - currently live
   - recently finished but not reconciled
4. Fetch live score and event timeline for each active match.
5. Normalize provider-specific fields into the internal payload shape.
6. Generate idempotency keys:
   - snapshots: `snapshot:<provider>:<externalMatchId>:<minute>:<homeScore>:<awayScore>:<status>`
   - events: `event:<provider>:<externalMatchId>:<externalEventId>`
7. Send updates to `/functions/v1/live-match-webhook`.
8. Retry failed requests with exponential backoff.
9. Persist sent updates so restarts do not resend old events incorrectly.

## Polling Schedule

```text
Before tournament:
- sync fixtures once per day

Match day:
- poll today's fixtures every 15 minutes

30 minutes before kickoff:
- poll every 5 minutes

Live match:
- poll every 60 seconds

After full time:
- poll every 2 minutes for 30 minutes
- run one final reconciliation update
```

## Free-Tier Request Budget

If the selected free API allows only 100 requests per day, the worker must budget requests by match window.

The best case is an aggregate endpoint, for example:

```http
GET /matches?date=2026-06-20
GET /live-matches
GET /fixtures?date=2026-06-20
```

If one request returns all matches for the current date or all currently live matches, simultaneous matches can be covered with one request. In that case, request usage depends on the number of active time windows, not the number of matches.

Example for a day with 6 matches across 4 kickoff windows:

```text
Daily fixture sync:                  1 request
Pre-match checks for each window:    8 requests
Live polling every 5 minutes:       48 requests
Post-match reconciliation:           8 requests
Buffer for retries/manual checks:   35 requests
Total:                             100 requests
```

If matches are spread across 4 windows and each window needs about 120 minutes of live coverage:

```text
4 windows * 120 minutes = 480 covered minutes
480 minutes / 48 live requests = one live request every 10 minutes per window
```

If the API can return all currently live matches in a single request, concurrent matches inside the same window do not increase request usage:

```text
18:00 kickoff: Match A and Match B
18:05 request to /live-matches returns both matches
18:10 request to /live-matches returns both matches
18:15 request to /live-matches returns both matches
```

If the API only supports per-match endpoints, for example `GET /matches/:id`, simultaneous matches do increase request usage:

```text
18:05 request for Match A
18:05 request for Match B
18:10 request for Match A
18:10 request for Match B
```

The worker should load the known FIFA schedule before each match day, group matches by kickoff time, and create predictable polling windows:

```ts
type PollingWindow = {
  startsAt: string; // group: kickoff - 10m, knockout: kickoff - 30m
  endsAt: string;   // group: kickoff + 120m, knockout: kickoff + 210m
  matchIds: string[];
  requestIntervalSeconds: number;
};
```

Request interval should be calculated from the remaining daily budget:

```text
available_live_requests = daily_limit - fixture_sync - pre_match - post_match - retry_buffer
total_window_minutes = sum(window_duration_minutes)
interval_minutes = ceil(total_window_minutes / available_live_requests)
```

For a 100-request free tier, this means the realistic product experience is:

- predictable score refreshes every 5 minutes if quota can be increased or occasional overages are acceptable
- switchable 10-minute group polling when staying strictly under 100 requests/day
- slower updates when only per-match endpoints are available
- not true minute-by-minute live coverage unless the provider offers a much higher free limit

Recommended implementation for strict 100-request/day API-Football usage:

```text
Primary candidate: API-Football
Live endpoint: GET https://v3.football.api-sports.io/fixtures?live=all
Auth header: x-apisports-key: <API_KEY>
Free limit: 100 requests/day
Runtime interval: 10 minutes during live windows
```

API-Football's live fixtures endpoint can return all currently live matches in one response. Their own docs also describe the endpoint as returning score, fixture status, elapsed minute, and match events. That makes it a good match for days where multiple World Cup games overlap.

World Cup-specific alternatives:

```text
WorldCupAPI
Live endpoint: GET /livescores?key=<API_KEY>
Fixtures endpoint: GET /fixtures?key=<API_KEY>&date=YYYY-MM-DD
Events endpoint: GET /events?key=<API_KEY>&match_id=<MATCH_ID>
Auth style: query parameter key
```

This also has a live aggregate endpoint, but detailed events are per-match, so it may cost more requests if the app needs cards, substitutions, and commentary.

```text
WC2026 API
Matches endpoint: GET https://api.wc2026api.com/matches
Auth header: Authorization: Bearer <API_KEY>
Free limit: 100 requests/day
```

This appears useful for fixtures and scores, but its public landing page does not expose enough detail to confirm match events without testing the interactive docs.

```text
SportDB.dev
Live endpoint: GET /api/football/live
Auth header: X-API-Key: <API_KEY>
Free tier: 1000 free requests advertised
```

This may work well for live scores, but World Cup 2026 competition coverage and event depth must be validated.

```text
football-data.org
Matches endpoint: competition/matches or /matches with filters
Auth header: X-Auth-Token: <API_KEY>
Free tier: request-limited
```

This is likely better for fixtures and final scores than rich live event timelines.

## Data Source Plan

Preferred providers to evaluate:

- Stats Perform / Opta: strongest official route, likely expensive and contract-heavy.
- BALLDONTLIE FIFA World Cup API: practical developer API with 2026 support and match event endpoints.
- Sportmonks, LiveScore API, Data Sports Group: compare pricing, latency, coverage, and event detail.

Free-first providers to evaluate before building a scraper:

- WC2026 API: unofficial World Cup 2026 API with a free tier advertised at 100 requests per day for fixtures, scores, and group standings.
- API-Football: free plan advertised at 100 requests per day and includes livescore, fixtures, events, lineups, and statistics, but the free tier may have season limitations.
- SportDB.dev: free tier advertised with 1000 free API requests for live scores and fixtures.
- football-data.org: free football data API, useful for fixtures/results depending on competition coverage, but may not provide enough live event depth for this use case.
- BSD / Bzzoiro Sports Data: advertises free football live scores and event endpoints, but World Cup 2026 coverage must be validated.

Provider selection criteria:

- Live score latency under 60 seconds.
- World Cup 2026 coverage for all 104 matches.
- Match event timeline support.
- Stable match IDs.
- Rate limits that support live polling.
- Commercial usage allowed.
- Clear failure semantics and API status reporting.

Recommended free-tier polling strategy:

- Use free APIs for fixture sync and score snapshots first.
- Poll only one active match when possible.
- During live matches, poll every 60 seconds only if the provider limit allows it.
- If the free plan is limited to 100 requests per day, use it for final scores and important checkpoints, not true minute-by-minute updates.
- If the free plan is at least 1000 requests per month or day, calculate whether it covers tournament match days before relying on it.
- Build provider adapters behind a common interface so the project can switch from free API to scraper or paid API without changing the webhook delivery logic.

## Scraper Fallback Plan

If no free API provides enough World Cup 2026 live data, build a scraper as a fallback provider adapter, not as the core worker.

Preferred scraping targets:

- FIFA scores and fixtures page if the live data is exposed in page JSON or stable network calls.
- Google sports result page only if it can be accessed consistently without login, CAPTCHA, or browser automation instability.

Scraper constraints:

- Treat scraped data as best-effort, not official.
- Avoid aggressive polling. Start at 60 seconds during live matches.
- Persist raw scraped payloads and screenshots during testing.
- Detect layout changes and fail closed instead of sending wrong scores.
- Add confidence checks before sending a score update:
  - expected teams match the internal fixture
  - match status is recognized
  - score changed monotonically except corrections
  - minute is within a plausible range

Scraper implementation options:

- First choice: inspect network requests and consume a JSON endpoint if the page uses one.
- Second choice: parse embedded page state from HTML if stable.
- Last choice: browser automation with Playwright and DOM selectors.

The scraper should emit the same normalized payload as an API provider:

```ts
interface LiveDataProvider {
  name: string;
  getFixtures(): Promise<ProviderFixture[]>;
  getAllMatches(): Promise<ProviderMatchSnapshot[]>;
  getLiveMatches(): Promise<ProviderMatchSnapshot[]>;
  getRecentlyCompletedMatches(window): Promise<ProviderMatchSnapshot[]>;
  getMatchSnapshot(externalMatchId: string): Promise<ProviderMatchSnapshot>;
  getMatchEvents(externalMatchId: string): Promise<ProviderMatchEvent[]>;
}
```

This keeps the delivery path unchanged:

```text
free API or scraper -> provider adapter -> normalizer -> idempotency -> webhook
```

## Minimal Data Store

The worker should keep small persistent state. SQLite is enough for the first version.

```text
matches
- id
- provider
- external_match_id
- home_team
- away_team
- kickoff_at
- status
- last_minute
- home_score
- away_score
- last_synced_at

sent_updates
- id
- idempotency_key
- external_match_id
- update_type
- sent_at
- payload_hash

sync_runs
- id
- started_at
- finished_at
- status
- error_message
```

## Reliability Requirements

- Do not crash the whole worker when one match or provider request fails.
- Log every failed webhook delivery with status code and response body.
- Retry webhook failures with exponential backoff.
- Alert if a live match has no successful provider update for more than 3 minutes.
- Alert if webhook delivery fails repeatedly for more than 5 minutes.
- Keep raw provider payloads during the tournament for debugging.

## Runtime Platform Options

The worker can run on any platform that supports scheduled jobs, secrets, outbound HTTP requests, retries, and logs. For this project, the platform does not need heavy compute. It needs predictable cron execution and good observability during match windows.

### Recommended: Trigger.dev

Trigger.dev is a good fit for this worker.

Relevant features:

- Scheduled tasks with cron.
- Timezone-aware schedules.
- Automatic task retries.
- Queues and concurrency controls.
- Dashboard observability for runs and failures.
- Alerts through email, Slack, or webhook.
- Free plan with limited included usage and 10 schedules.
- Can be self-hosted if needed.

Suggested Trigger.dev shape:

```text
Task: sync-world-cup-fixtures
Schedule: once per day

Task: poll-live-world-cup-matches
Schedule: every 5 minutes during tournament days

Task: reconcile-finished-matches
Schedule: built into knockout polling
```

The 5-minute polling task should check the known FIFA schedule and only call the sports data provider if a match window is active. This avoids wasting API requests overnight or between match windows.

### Alternative: Cloudflare Workers Cron Triggers

Cloudflare Workers Cron Triggers are a strong lightweight option for scheduled HTTP polling.

Pros:

- Very low operational overhead.
- Good for small, fast scheduled jobs.
- Cron triggers run in UTC.
- Can pair with Cloudflare KV, D1, or Durable Objects for state.

Cons:

- Less workflow-oriented than Trigger.dev.
- Retries, run history, and task observability need more custom work.
- Better for simple polling than multi-step orchestration.

### Alternative: Inngest

Inngest supports scheduled functions, retries, steps, and event-driven workflows.

Pros:

- Good developer experience for durable functions.
- Cron supports timezones.
- Useful if the app later becomes event-heavy.

Cons:

- Requires serving Inngest functions from an app/API.
- Slightly more architectural weight than needed for a single polling worker.

### Alternative: Upstash QStash Schedules

QStash can call an HTTP endpoint on a cron schedule and retry failed deliveries.

Pros:

- Very simple cron-to-HTTP model.
- Built-in retries.
- Good if the worker logic lives in an existing API route.

Cons:

- QStash schedules trigger URLs; the actual worker runtime must live elsewhere.
- Observability is focused on message delivery, not full job internals.

### Alternative: GitHub Actions Scheduled Workflow

Pros:

- Simple and free for low-volume scheduled jobs.
- Easy to start if the code is already on GitHub.

Cons:

- Cron timing is not ideal for live sports polling.
- Poor fit for production live updates.
- Logs and retries are not as ergonomic.

### Alternative: Vercel Cron Jobs

Pros:

- Convenient if the World Predicup API is already deployed on Vercel.
- Simple route-based cron.

Cons:

- Hobby plan cron is limited to once per day, so 10-minute polling requires Pro.
- Less suited to persistent worker state unless paired with a database.

### Alternative: Render Cron Jobs or Fly.io

Pros:

- Straightforward Node.js worker deployment.
- Good if we want to own the process more directly.

Cons:

- More infrastructure management.
- Retries, alerting, and run history need explicit setup.

### Platform Recommendation

Start with Trigger.dev unless there is a strong reason to keep infrastructure under a general-purpose host.

Recommended ranking:

```text
1. Trigger.dev
2. Cloudflare Workers Cron Triggers
3. Inngest
4. Upstash QStash + existing API route
5. Render/Fly.io cron worker
6. GitHub Actions
7. Vercel Cron, only if already on Vercel Pro
```

For this project, Trigger.dev gives the best balance of speed, visibility, retries, and low operational work.

## Implementation Milestones

1. Scaffold TypeScript worker with config validation.
2. Add provider interface and a mock provider.
3. Add World Predicup webhook client.
4. Add polling loop and live-match selection.
5. Add SQLite persistence for sent idempotency keys.
6. Add tests for normalization, idempotency, and webhook delivery.
7. Add a real provider adapter after provider selection.
8. Add deployment config and runtime monitoring.

## What We Need To Start

Required decisions and setup:

1. Create an API-Football account and get the free API key.
   - Required header: `x-apisports-key: <API_KEY>`
   - First endpoints to test:
     - `GET https://v3.football.api-sports.io/leagues`
     - `GET https://v3.football.api-sports.io/fixtures?live=all`
     - World Cup 2026 league lookup through `/leagues`

2. Confirm the World Predicup webhook configuration.

```env
WORLD_PREDICUP_API_BASE_URL=https://<project-ref>.supabase.co
WORLD_PREDICUP_WEBHOOK_PATH=/functions/v1/live-match-webhook
WORLD_PREDICUP_WEBHOOK_TOKEN=secret-token
```

The worker will send the token as:

```http
Authorization: Bearer <WORLD_PREDICUP_WEBHOOK_TOKEN>
```

3. Use Trigger.dev as the v1 runtime.
   - Scheduled polling task every 5 minutes.
   - Daily fixture sync task.
   - Knockout reconciliation inside the polling task.
   - Built-in retries, logs, and alerts.

4. Choose persistent storage for idempotency and match mappings.

Recommended for Trigger.dev:

```text
Postgres
```

Good options:

- Existing World Predicup database, if available.
- Supabase Postgres.
- Neon Postgres.

Avoid local SQLite for Trigger.dev because the worker runtime should not depend on local persistent disk.

5. Decide the match ID mapping strategy.

Simplest v1 strategy:

```json
{
  "provider": "api-football",
  "externalMatchId": "12345"
}
```

The World Predicup API can store this external provider ID and map it to an internal match later.

Better long-term strategy:

```json
{
  "provider": "api-football",
  "externalMatchId": "12345",
  "worldPredicupMatchId": "internal-match-id"
}
```

Optional setup:

- Slack, Discord, email, or webhook target for alerts.
- Decide whether v1 sends only score snapshots or also goals, cards, substitutions, and VAR events.
- Add a mock provider for local testing.
- Create the Trigger.dev project and deployment environment.

Minimal v1 scope:

```text
1. TypeScript project
2. Trigger.dev scheduled task every 5 minutes
3. API-Football adapter using /fixtures?live=all
4. Normalize score, status, minute, teams, and match events
5. Send payload to /functions/v1/live-match-webhook
6. Store idempotency keys in Postgres
7. Add basic logs and retry behavior
```

## Open Decisions

- Final provider choice.
- Exact World Predicup internal match IDs and team IDs.
- Whether the API wants one combined snapshot payload or separate snapshot/event payloads.
- Hosting target for the worker.
- Alerting target, such as email, Slack, Discord, or logs only.
