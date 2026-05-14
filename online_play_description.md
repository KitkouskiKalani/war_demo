# Online Play – How It Works (Supabase) and What Production Would Need

This document describes how the online multiplayer mode in **Let There Be War** is wired up today, what infrastructure must exist for it to work, and what would have to change before this is robust enough to ship as a real production game.

It is targeted at developers picking up this repo who want to (a) get online play running locally, (b) understand the message flow between two clients, or (c) plan the work needed to harden it.

---

## TL;DR

- The game is a **2-player turn-based card game** built as a Vite + React 19 + TypeScript SPA. There is **no game server**.
- For online play, two browser clients connect through **Supabase Realtime Broadcast** channels (one channel per room).
- A **Postgres `lobbies` table** in Supabase is used purely as a "list of public rooms waiting for a guest". It is *not* used to store game state.
- The game state lives entirely in the **host client's `useReducer` store**. The host streams actions / state snapshots to the guest. The guest is effectively a thin client that sends inputs back and rehydrates state on key events.
- This is a **trusted-client / cooperative-cheating** model. It is fine for friends-only play. It is not safe for ranked / competitive / monetized play and would need server-authoritative logic to ship.

---

## Architecture at a Glance

```
                    ┌───────────────────────────────────────────────┐
                    │                Supabase Project               │
                    │                                               │
   ┌───────────┐    │   ┌────────────────────┐  ┌──────────────┐    │   ┌───────────┐
   │  Host     │ ◀▶ │   │  Realtime channel  │  │ Postgres:    │    │ ▶ │  Guest    │
   │  (P1)     │    │   │  game_<roomCode>   │  │ public.      │    │   │  (P2)     │
   │           │    │   │  (Broadcast,       │  │ lobbies      │    │   │           │
   │  Reducer  │    │   │   per-room ephemer)│  │ (room list)  │    │   │  Reducer  │
   │  +        │    │   └────────────────────┘  └──────────────┘    │   │  +        │
   │  Network  │    │                                               │   │  Network  │
   └───────────┘    └───────────────────────────────────────────────┘   └───────────┘
        │                                                                   │
        └──────────────── Both clients run the same                ─────────┘
                          src/game reducer locally
```

Key idea: both clients run the **same deterministic reducer** in the same browser bundle. Online play only needs to keep the two reducers in sync by broadcasting either *user inputs* (`GAME_ACTION`) or *full snapshots* (`STATE_SYNC` / `FLIP_RESULT_SYNC`) at well-known transition points.

---

## What Supabase Is Used For

There are **two** independent Supabase features in use:

> Current hardening note: online play now also supports durable `matches` and
> `match_players` records when the schema in `docs/ONLINE_SUPABASE_SCHEMA.sql`
> has been installed. If those tables are missing, lobby creation falls back to
> the legacy `lobbies`-only flow so local/friendly testing does not break.

### 1. Realtime Broadcast – `src/network/peer.ts`

This is the actual "multiplayer transport". Each room subscribes to a channel named `game_<6-digit-code>`. Messages are sent with `{ type: 'broadcast', event, payload }` and never touch the database.

Events broadcast on the channel:

| Event           | Sender         | Payload                                  | Purpose                                                               |
|-----------------|----------------|------------------------------------------|-----------------------------------------------------------------------|
| `player_joined` | guest → host   | `{ player: 'guest' }`                    | Tells host the guest has subscribed; host then sends `STATE_SYNC`.    |
| `player_left`   | either → other | `{ player: 'host' \| 'guest' }`          | Sent on intentional disconnect so the other side can show a notice.   |
| `game_action`   | both           | `{ type, ... }` (see message envelopes)  | Carries gameplay traffic.                                             |

Inside `game_action` there is a small envelope dispatcher, currently understood by `GameBoard.handleNetworkAction`:

| Envelope `type`     | Direction       | Payload                       | Meaning                                                                                  |
|---------------------|-----------------|-------------------------------|------------------------------------------------------------------------------------------|
| `GAME_ACTION`       | both            | `{ action: ReducerAction }`   | A normal reducer action (e.g. `PLAY_CARD_TO_LANE`, `END_TURN`). Replayed locally with `fromNetwork: true` so reducer guard rails are skipped. |
| `STATE_SYNC`        | host → guest    | `{ state: GameState }`        | Initial snapshot when guest joins; assigns guest `localPlayer = 2`, `isHost = false`.    |
| `FLIP_RESULT_SYNC`  | host → guest    | `{ state: GameState }`        | After the host runs the war flip, syncs the resolved state so the guest doesn't redo it. |
| `SUIT_SELECTED`     | both            | `{ suit: Suit }`              | Suit choice during `SuitSelection`; the receiving reducer dispatches `OPPONENT_SUIT_SELECTED`. |

Important properties of this transport:

- `broadcast: { self: false }` – clients do not echo their own messages, so reducer dispatch + send pattern doesn't double-apply locally.
- All non-deterministic logic (war flip RNG, deck shuffles, dealing) is **executed only on the host**, then snapshotted to the guest. This avoids RNG desync.
- There is **no acknowledgement / sequence number / replay layer**. Lost or out-of-order messages will silently desync clients.

### 2. Postgres `lobbies` / `matches` tables – `src/network/supabase.ts` and `src/network/matches.ts`

The lobby table is still used for "browse open rooms" UX, but the hardened path
backs each lobby with a durable match record:

1. Host creates a Realtime room and gets a 6-digit code.
2. Host creates `public.matches` and `public.match_players` rows with a host session token.
3. Host inserts or updates `public.lobbies` with `match_id`, `host_session_token`, `last_heartbeat_at`, and `status = 'waiting'`.
4. Anyone visiting the lobby browser subscribes to `postgres_changes` on `public.lobbies` and gets a stale-filtered list.
5. As soon as a guest joins, the guest records a player session, the match becomes `active`, and the lobby is closed/hidden.

During gameplay the host periodically persists `matches.last_snapshot` and
`matches.last_sequence`. If a client detects a sequence gap, refreshes, or
reconnects with saved local metadata, it can request/fetch the latest snapshot
instead of silently drifting.

---

## Repository Layout (online-play files)

| File                                         | Role                                                                                          |
|----------------------------------------------|-----------------------------------------------------------------------------------------------|
| `src/network/peer.ts`                        | Realtime transport: `createRoom`, `joinRoom`, `sendAction`, `onAction`, `onConnection`, `onDisconnect`, `disconnect`, `forceCleanup`. |
| `src/network/supabase.ts`                    | Lobby CRUD: `createLobby`, `removeLobby`, `getLobbies`, `subscribeToLobbies`.                 |
| `src/network/matches.ts`                     | Durable match/session helpers: match-backed lobbies, heartbeats, snapshots, local resume metadata, and disconnect marks. |
| `docs/ONLINE_SUPABASE_SCHEMA.sql`            | SQL setup for `matches`, `match_players`, lobby heartbeat columns, indexes, and cleanup queries. |
| `src/components/GameBoard.tsx`               | UI integration: handles `STATE_SYNC` / `FLIP_RESULT_SYNC` / `GAME_ACTION`, sends actions, gates inputs by `isLocalPlayerTurn`. |
| `src/game/reducer.ts`                        | Authoritative reducer. Recognizes `fromNetwork` flag to skip phase / turn guards on remote actions; `SYNC_STATE` action replaces the entire state but preserves `localPlayer` / `isHost`. |
| `src/game/types.ts`                          | `GameMode = 'vs-ai' \| 'vs-player' \| 'online'`, `localPlayer`, `isHost`, `roomCode`.         |

The legacy peerjs dependency in `package.json` is no longer used by the online flow; Supabase Realtime fully replaced WebRTC.

---

## What Must Be in Place for It to Work

### 1. A Supabase project

Create a free project at <https://supabase.com>. From **Project Settings → API** you need:

- The project URL (`VITE_SUPABASE_URL`)
- The `anon` public key (`VITE_SUPABASE_ANON_KEY`)

Both must be available to the Vite client at build time:

```bash
# .env (committed example) or .env.local (gitignored)
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

If these are missing, `isSupabaseConfigured()` / `isConfigured()` short-circuit and online mode silently fails. The game still works in `vs-ai` and `vs-player` (pass-and-play) modes without Supabase.

### 2. The durable online schema

Run `docs/ONLINE_SUPABASE_SCHEMA.sql` once in Supabase **SQL Editor**. It creates:

- `matches`, which stores room status, latest snapshot, latest accepted sequence, phase, and winner.
- `match_players`, which stores each player slot's reconnect session token and liveness timestamps.
- Extra lobby columns for `match_id`, host token, heartbeat timestamp, and status.

The included policies are still friendly-build policies because the project does
not use Supabase Auth yet. For production, lock writes to authenticated users or
session-token-checked RPCs instead of allowing direct broad table updates.

### 3. Realtime enabled

Realtime is enabled by default for new Supabase projects, but the `postgres_changes` listener in `subscribeToLobbies` requires Realtime replication to be on for the `public.lobbies` table. In **Database → Replication** make sure `lobbies` is included in the `supabase_realtime` publication.

### 4. Network reachability

Both clients need outbound HTTPS + WebSocket access to `*.supabase.co`. There is no STUN/TURN involved (we are not on WebRTC), so corporate firewalls that block UDP are *not* a problem here, but ones that strip WebSockets are.

---

## Connection / Game Lifecycle

```
HOST                                                    GUEST
────                                                    ─────
GO_TO_CREATE_ROOM
Network.createRoom()  ──▶ subscribes to game_<code>
Lobbies.createLobby(code)                              (browses lobby list,
                                                        sees the room)
                                                       GO_TO_JOIN_ROOM
                                                       Network.joinRoom(code)
                                                       subscribes to game_<code>
                                  player_joined ───▶
PLAYER_CONNECTED
Lobbies.removeLobby(code)
sendAction({type:'STATE_SYNC',
           state:{...,phase:'SuitSelection',
                  isHost:false, localPlayer:2}})
                                  STATE_SYNC ─────▶  dispatch SYNC_STATE
                                                       (preserves own
                                                        localPlayer/isHost)
both pick suits ─────────── SUIT_SELECTED ────────▶  dispatch OPPONENT_SUIT_SELECTED
                                                       and vice versa

phase = InitialFlip
host runs INITIAL_FLIP_STEP
  (guest skips because isHost=false)

phase = InitialFlipResult
host:                 FLIP_RESULT_SYNC ──────────▶  dispatch SYNC_STATE
                                                     (now both have identical
                                                      shuffled deck, flip outcome,
                                                      who-goes-first, etc.)

— Main play loop —
local player dispatches PLAY_CARD_TO_LANE / END_TURN
                                  GAME_ACTION  ────▶  dispatch with fromNetwork:true
                                                      (skips turn/phase guards)
END_TURN                          GAME_ACTION  ────▶  receiver also shows
                                                      "Your Turn" toast
```

`disconnect()` (or a tab close) emits `player_left`, marks the player row
disconnected best-effort, and lets the other side display an opponent reconnect
notice. Server-side stale cleanup should still be scheduled because unload
events are not guaranteed to fire.

---

## Hardened Message Envelope

Every `game_action` message now carries protocol metadata:

| Field | Purpose |
|-------|---------|
| `protocolVersion` | Rejects incompatible clients before applying a reducer action. |
| `matchId` | Ties messages to a durable match record. |
| `senderSlot` | Identifies whether player 1 or player 2 sent the message. |
| `sequence` | Detects dropped or reordered messages per sender. |
| `actionId` | Makes duplicate deliveries idempotent. |
| `sentAt` | Helps debug latency and stale traffic. |

On duplicates the receiver ignores the message. On a sequence gap the receiver
requests a snapshot, and the host responds with `STATE_SYNC` from the latest
state. This is still not a full acknowledgement/replay protocol, but it prevents
silent divergence from being treated as a valid state.

---

## Production Direction

The current hardening keeps Supabase Realtime and a trusted host so the game can
remain simple while it is still evolving. A production/competitive version
should move to intent-only clients:

1. Clients send `PLAY_CARD_TO_LANE`, `END_TURN`, relic use, and suit selection as intents.
2. A server authority validates those intents against private authoritative state.
3. The server owns all RNG, timers, deck order, War Flip, Sudden Death, round finalization, and snapshots.
4. The server sends each client only the public board plus that player's private hand.
5. Match records become the recovery source, not just a latest host snapshot.

Good server options are Supabase Edge Functions for lower-complexity turn
validation, a dedicated Node/WebSocket service for richer live sessions, or
Cloudflare Durable Objects for one stateful object per match.

---

## Trust Model and Known Limitations

Because everything in this design happens client-side:

1. **Game state is host-authoritative but not host-validated.** The host's reducer trusts incoming `GAME_ACTION`s with `fromNetwork: true` and intentionally skips the phase / turn checks. A modified guest could send `END_TURN` while the host is mid-turn or `PLAY_CARD_TO_LANE` for a card it doesn't actually hold.
2. **No identity.** There is no auth – any visitor can spoof any `host_name`, list/delete other people's lobbies, or join a room they overheard the code for.
3. **No reconnection.** Refreshing either tab destroys local state; the other side gets `player_left` and the game is over.
4. **No persistence.** Closing both tabs loses the match; there is no "resume game" flow.
5. **No anti-cheat on RNG.** The host shuffles the deck in plain JavaScript and snapshots it to the guest – the host can see the entire deck order.
6. **No rate limiting / abuse protection.** The wide-open RLS policies mean someone could scriptedly spam `lobbies` rows and DOS the lobby browser.
7. **No matchmaking.** Players have to either share a code out of band or find each other via the lobby browser.
8. **Ordering / loss.** Realtime Broadcast is best-effort; we do not number or ack messages.

For a casual "play with my friend" use case these are all fine. For anything competitive they are not.

---

## Roadmap to a Production Build

The work below is roughly ordered from "must have before public launch" to "nice to have once there are enough players".

### Tier 1 – Required before any public release

1. **Add Supabase Auth.** Replace the anon-only client with sign-in (email magic link, OAuth, or anonymous-then-link). Persist user IDs into both `lobbies` and a future `matches` table.
2. **Tighten RLS.**
   - `lobbies INSERT` only by the authenticated user, writing their own `host_id`.
   - `lobbies DELETE` only by the row's `host_id`.
   - `lobbies SELECT` can stay open, but consider hiding rows older than N minutes.
3. **Lobby TTL / cleanup.** Add a `last_heartbeat_at` column and a Supabase Edge Function (or `pg_cron`) that deletes rows older than ~5 minutes. Today, if a host crashes during `createRoom`, the `lobbies` row is orphaned.
4. **Server-authoritative game logic.** Move the reducer behind an Edge Function (or a small dedicated service) keyed by `match_id`. Clients send *intents* (`PLAY_CARD_TO_LANE`, `END_TURN`); the server validates against the authoritative state and broadcasts the result. This single change defeats almost every cheat in section above.
5. **Server-side RNG.** Shuffle the deck server-side with a CSPRNG and only ever ship each player their own visible cards + public information. Today both clients can see the full deck because the host snapshots the entire `GameState`.
6. **Message protocol versioning.** Add a `protocolVersion` to every envelope and reject mismatches with a clean error. Will save you the day you ship a new action type.
7. **Reconnect support.** Tag each client with a stable session token. When a client resubscribes within ~30s, the server (or current host) replays the latest `STATE_SYNC` instead of treating it as a forfeit.

### Tier 2 – Strongly recommended

8. **`matches` table for game history and resume.** Persist match metadata (`id`, `player1_id`, `player2_id`, `state_snapshot`, `phase`, `winner`, timestamps) so games can survive a refresh and an audit trail exists.
9. **Disconnect grace window.** Today `player_left` ends the match instantly. Production should pause the clock for, say, 60 seconds and only forfeit on persistent absence.
10. **Spectator / replay support.** Once state is server-authoritative, exposing a read-only Realtime channel per match is mostly free.
11. **Heartbeat / liveness checks.** Use Supabase Presence (already enabled in the channel config) to detect zombie clients instead of relying only on broadcast traffic.
12. **Better error UX.** Surface the difference between *Supabase not configured*, *room not found*, *room full*, *host disconnected*, and *channel timed out* to the player. Today most of these collapse into a single generic message.
13. **Rate limiting.** Edge Function / Postgres trigger that caps `lobbies` inserts per IP / per user per minute.
14. **Network observability.** Send anonymized metrics (channel subscribe latency, action round-trip time, retry count) somewhere – even just `console.warn` thresholds are a start.
15. **Drop the unused `peerjs` dependency.** It was the previous transport and is no longer referenced; removing it reduces bundle size and supply-chain surface.

### Tier 3 – Once there are real players

16. **Matchmaking / ELO.** A queue table backed by an Edge Function that pairs players by skill instead of the manual code/lobby flow.
17. **Friends list / invites.** Trivial once auth and `matches` exist.
18. **Region pinning.** Supabase Realtime is regional – a player in EU vs a host in us-east will see ~150 ms of lag per action. Either run multiple Supabase projects or move to a transport with regional pops (e.g. Cloudflare Durable Objects, Ably, or your own WebSocket service).
19. **Spectator mode + reconnect-as-spectator** if a player rage-quits.
20. **Anti-grief / chat moderation** if any player-to-player chat is added.
21. **Migrate transport off Supabase** if scale ever demands it. The current code is already abstracted behind `src/network/peer.ts` (`createRoom` / `joinRoom` / `sendAction` / `onAction`), so a swap to Ably / Pusher / a custom WS server is mostly a matter of reimplementing that one file.

### Tier 4 – Game-design followups specific to this codebase

These are not "online" issues per se, but they will become online issues if not addressed:

- The `SYNC_STATE` action currently ships the entire `GameState` over the wire, including each player's `hand` and the full `sharedDeck`. In production the server should ship each client only their own hand plus public information.
- `fromNetwork: true` is currently a "trust this action" bypass in the reducer. In a server-authoritative world this flag goes away – the server validates, the clients only display.
- The deterministic reducer is a great foundation for replay / rollback netcode if the game ever moves beyond turn-based.

---

## Quick Local Checklist

To run online play locally with a fresh Supabase project:

1. `npm install`
2. Create the Supabase project, copy URL + anon key into `.env`.
3. Run the SQL block above in Supabase SQL Editor to create `lobbies` + RLS policies.
4. Confirm `lobbies` is in the `supabase_realtime` publication.
5. `npm run dev`, open the app in two browsers (or one normal + one private window).
6. Browser A: **Online → Create Room** → share the 6-digit code.
7. Browser B: **Online → Join Room** → enter the code (or pick from the lobby list).
8. Both pick a suit; play proceeds.

If something silently fails, open the devtools console – every step in `peer.ts` and `supabase.ts` logs with a `[Network]` / `[Supabase]` prefix, which is usually enough to triage whether the issue is config (missing env vars), auth/RLS (lobby insert rejected), or transport (channel never reaches `SUBSCRIBED`).
