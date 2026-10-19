# Friends, Jam privacy, Clans

## Phase 1 — Friends (done)
- Add by SONIQ ID or invite link (`/functions/v1/invite?id=&name=` → `soniq://friend`).
- Request → Accept / Decline. Friends list: Remove, Block. Sent: Cancel. Blocked: Unblock.
- If both sent requests, they become friends instantly. Blocked users' requests are silently dropped.
- Limits: 200 friends, 50 pending sent, 30 requests/day.
- Backend: tables `friend_requests`, `friends` (both directions), `blocks`; RPCs `soniq_friend_request|respond|remove|block`, `soniq_friends_list`. No direct table access.
- App: `src/lib/friends.ts`, `src/store/friendsStore.ts`, `(home)/friends.tsx`, `app/friend.tsx`; Profile → Friends row.

- Live: after any action the other user's app gets a Realtime broadcast ping on `inbox:<id>` and reloads.

## Phase 2 — Jam Public/Private (done)
- Picker before Start (Private default); host can switch during the Jam. Guests see a Public/Private badge.
- Public: every listener's row in `jams` (refreshed 30 s, ignored after 90 s) → friends see "🟢 In a Jam · song" + Join
  (Friends page and Jam tab "Friends in a Jam"). Private Jams are never sent to the server.
- Invite link: `/functions/v1/invite?jam=CODE` → `soniq://jam?code=CODE` → Jam tab asks "Join this Jam?".
- Host can remove a listener (kick by profile ID; kept out for the rest of that Jam).
- Clans "coming soon" page at `(home)/clans`, linked from Friends and the Jam tab header.

## Phase 3 — Clans (done)
- Create (name + emoji, max 5 owned, 20 joined), join by 8-char code or link (`invite?clan=CODE` → `soniq://clan-join`).
- Max 30 members. Owner: remove member (banned from rejoining), new invite code, delete. Owner leaving → oldest member becomes owner.
- Chat: text ≤300 chars, 20 msgs/min, trigger keeps only the newest 50 messages per clan. System lines for joined/left/removed.
- Jam cards: 🎧 in chat (share current Jam or start one), or Jam tab → "Share to clan". Card has Join.
- Live: Realtime broadcast `clan:<id>` pings; list shows unread counts (`last_read` per member).
- Backend: `clans`, `clan_members`, `clan_bans`, `clan_messages`; RPCs `soniq_clan_*`, `soniq_clans_list`.
- App: `lib/clans.ts`, `store/clansStore.ts`, `(home)/clans.tsx`, `app/clan/[id].tsx`, `app/clan-join.tsx`.

## Jam reliability + guest controls (done)
- Room reconnects by itself (Supabase retry + our backoff 2/5/10/20 s, re-tracks presence); app foreground → ensureConnected + resync.
- Guest never leaves on a quiet host: "Host offline, waiting…" after 15 s; leaves only after 3 min offline (time while our own
  connection was down or the app was backgrounded doesn't count), on End, kick or Leave.
- Last Jam persisted (`jamStore.lastJam`); on launch within 30 min → "Rejoin your Jam?" (host re-hosts the same code).
- Guest leaving / Jam ending stops the guest's player and clears the Jam queue (`engine.stop()`).
- Host "Guests can": Listen / Add songs (default) / Full control. Guest taps go through `src/player/remote.ts`
  (engine `intercept`) → `request` events → host applies if allowed. Up next shows "added by".

## Notification / lock screen
- `scripts/patch-expo-audio.js` (each patch idempotent): Metadata.durationSec → session duration when the stream has none;
  notification refresh on seek / timeline / track change. Engine sends `isLiveStream: false`, re-sends metadata once the
  stream is ready (real length) and when the app returns to the foreground.
