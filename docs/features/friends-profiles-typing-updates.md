# Friends, profiles, typing, update notifications

- `soniq_profile_view(p_id, p_secret, p_other)` -> {id, name, since, status}; status is
  me | none | outgoing | incoming | friends | blocked. Nothing about listening is exposed.
- `src/app/user/[id].tsx`: banner + photo from the public avatars bucket (`<id>/avatar.jpg`,
  `<id>/banner.jpg`, cache-busted daily), name, joined date, ID and one action button.
  Opened from clan chat (avatar / name), clan members and the Friends list.
- Clans tab header: Friends button with a badge for incoming requests.
- Typing: `clan:<id>` broadcast event `typing` {id, stop}; at most one every 3 s; shown for 5 s;
  only ids of real clan members are shown (names come from the member list, not the payload).
- Notifications: offered after the first song; auto-enabled once if Android already allows them.
  New kinds `friends` and `updates` (+ channels `social`, `updates`). Settings has
  "Send a test notification".
- Friend request while SONIQ is in the background -> local notification (from the realtime ping).
  App fully closed -> no notification (would need push / FCM).
- Update check: expo-background-task every >= 6 h checks GitHub Releases and notifies once per
  version (`notifyStore.updateNotified`); the in-app popup marks the version as notified too.
