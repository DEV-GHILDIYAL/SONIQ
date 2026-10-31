# Local notifications (v1.5.1)

1. Local only (expo-notifications), no server and no push tokens. Off until the user agrees.
2. Asked once, after 10 plays (or from Settings › Notifications). Android 13+ permission prompt; if blocked, Settings links to phone settings.
3. Time is personal: "Auto" = the hour this user listens most (last ~200 plays), kept between 9:00 and 21:00; or pick 9 AM-9 PM.
4. Text is personal, from their own data only: name, top artist, streak length, weekly minutes/plays/top song, their mixes' names.
5. At most two scheduled at once (`soniq-next`, `soniq-comeback`), rebuilt when the app goes to the background, mixes are rebuilt, or settings change. No reminder if they listened within the hour before the slot.
6. Next slot picks one: streak at risk → Sunday weekly recap → a mix teaser (rotates daily through their mixes).
7. Comeback: 3 days after the last app use, "Miss <top artist>? Pick up where you left off: <last song>". Opening the app moves it.
8. Downloads: right away when a download batch finishes while SONIQ is in the background (count + failures).
9. Each kind can be turned off in Settings. Channels: "Mixes & reminders", "Downloads". Tapping opens the right screen (mix, stats, library, home).
