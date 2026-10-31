/**
 * Local notifications (no server). Everything is personal: the time comes from when this
 * user usually listens, the text from their own stats, streak, mixes and favourite artists.
 *
 * At most two are scheduled at any time, and both are rebuilt whenever the app goes to the
 * background or the data changes:
 *   - "next": the next reminder slot (streak at risk > Sunday recap > a mix teaser)
 *   - "comeback": 3 days later, only fires if the app wasn't opened since
 * Plus "downloads finished" right away when a download queue completes in the background.
 */
import { AppState } from 'react-native';
import { useDownloadStore } from '@/store/downloadStore';
import { useNotifyStore, type NotifyKind } from '@/store/notifyStore';
import { useProfileStore, type PlayRecord } from '@/store/profileStore';
import { useRecsStore } from '@/store/recsStore';
import { liveStreak, streakAtRisk, useStreakStore } from '@/store/streakStore';
import { artistNorm, topArtists } from './taste';

type NotificationsModule = typeof import('expo-notifications');
let mod: NotificationsModule | null | undefined;

function N(): NotificationsModule | null {
  if (mod !== undefined) return mod;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('expo-notifications') as NotificationsModule;
  } catch {
    mod = null; // native module missing (tests / old build)
  }
  return mod;
}

const ID_NEXT = 'soniq-next';
const ID_COMEBACK = 'soniq-comeback';
const QUIET_START = 22; // no reminders from 22:00 …
const QUIET_END = 9; // … to 09:00
const DEFAULT_HOUR = 20;
const COMEBACK_DAYS = 3;
const DAY_MS = 86_400_000;

const CHANNELS: { id: string; name: string; description: string }[] = [
  { id: 'reminders', name: 'Mixes & reminders', description: 'Your mixes, weekly recap, streak' },
  { id: 'downloads', name: 'Downloads', description: 'When songs finish downloading' },
];

// ---------- Permission ----------

export async function notificationsAllowed(): Promise<boolean> {
  const n = N();
  if (!n) return false;
  try {
    return (await n.getPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/** Ask Android for permission (once; later calls just report the answer). */
export async function askNotificationPermission(): Promise<boolean> {
  const n = N();
  if (!n) return false;
  try {
    await ensureChannels();
    const current = await n.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    return (await n.requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

async function ensureChannels(): Promise<void> {
  const n = N();
  if (!n) return;
  for (const c of CHANNELS) {
    await n.setNotificationChannelAsync(c.id, {
      name: c.name,
      description: c.description,
      importance: n.AndroidImportance.DEFAULT,
    });
  }
}

// ---------- Personal data → time and text ----------

/** The hour this user listens most (last ~200 plays), moved out of quiet hours. */
export function usualHour(
  history: readonly PlayRecord[] = useProfileStore.getState().history,
): number {
  const counts = new Array<number>(24).fill(0);
  for (const h of history)
    counts[new Date(h.at).getHours()] = (counts[new Date(h.at).getHours()] ?? 0) + 1;
  const total = counts.reduce((a, b) => a + b, 0);
  let best = DEFAULT_HOUR;
  if (total >= 10) best = counts.indexOf(Math.max(...counts));
  if (best >= QUIET_START) return QUIET_START - 1;
  if (best < QUIET_END) return QUIET_END;
  return best;
}

export function reminderHour(): number {
  return useNotifyStore.getState().hour ?? usualHour();
}

/** Next time at `hour`:00 that is at least 30 min away. */
function nextAt(hour: number, from = new Date()): Date {
  const d = new Date(from);
  d.setHours(hour, 0, 0, 0);
  if (d.getTime() - from.getTime() < 30 * 60_000) d.setDate(d.getDate() + 1);
  return d;
}

function firstName(): string {
  return useProfileStore.getState().profile?.name?.split(/\s+/)[0] ?? '';
}

function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}m` : `${m} min`;
}

interface Message {
  title: string;
  body: string;
  url: string;
  kind: NotifyKind;
}

/** Last 7 days from this user's own history. Null when there's too little to say. */
export function weeklyRecap(now = Date.now()): Message | null {
  const week = useProfileStore.getState().history.filter((h) => now - h.at < 7 * DAY_MS);
  if (week.length < 5) return null;
  const minutes = week.reduce((sum, h) => sum + (h.listenedSec ?? 0), 0) / 60;
  const byArtist = new Map<string, { name: string; n: number }>();
  const bySong = new Map<string, { name: string; n: number }>();
  for (const h of week) {
    const a = artistNorm(h.artist);
    byArtist.set(a, {
      name: h.artist.split(',')[0]?.trim() ?? h.artist,
      n: (byArtist.get(a)?.n ?? 0) + 1,
    });
    bySong.set(h.trackId, { name: h.title, n: (bySong.get(h.trackId)?.n ?? 0) + 1 });
  }
  const top = [...byArtist.values()].sort((a, b) => b.n - a.n)[0];
  const song = [...bySong.values()].sort((a, b) => b.n - a.n)[0];
  const name = firstName();
  return {
    kind: 'recap',
    title: `${name ? `${name}, your` : 'Your'} week in music 🎧`,
    body: [
      `${formatMinutes(minutes)} · ${week.length} songs.`,
      top ? `Top artist: ${top.name} (${top.n} plays).` : '',
      song && song.n > 1 ? `On loop: ${song.name}.` : '',
    ]
      .filter(Boolean)
      .join(' '),
    url: '/stats',
  };
}

function streakMessage(): Message | null {
  const s = useStreakStore.getState();
  const days = liveStreak(s);
  if (days < 2) return null;
  const artist = topArtists(1)[0];
  return {
    kind: 'streak',
    title: `🔥 Keep your ${days}-day streak`,
    body: artist
      ? `One song keeps it alive. Maybe some ${artist}?`
      : 'Play one song today to keep it alive.',
    url: '/',
  };
}

/** Rotates through the user's own mixes, one per day. */
function mixMessage(date: Date): Message | null {
  const mixes = useRecsStore.getState().mixes;
  if (mixes.length === 0) return null;
  const dayIndex = Math.floor(date.getTime() / DAY_MS);
  const mix = mixes[dayIndex % mixes.length];
  if (!mix) return null;
  const body =
    mix.kind === 'fresh'
      ? `${mix.tracks.length} songs from artists you haven’t played yet.`
      : mix.kind === 'because'
        ? `More like “${mix.seedTitle ?? ''}”, picked from what you love.`
        : mix.kind === 'repeat'
          ? `Your most-loved songs lately: ${mix.subtitle.replace(/ & more$/, '')}.`
          : `${mix.subtitle}, plus new songs in the same vibe.`;
  return {
    kind: 'daily',
    title: mix.kind === 'because' ? 'Because you liked it' : `${mix.title} is ready`,
    body,
    url: `/mix/${mix.id}`,
  };
}

function comebackMessage(): Message | null {
  const artist = topArtists(1)[0];
  const last = useProfileStore.getState().history[0];
  if (!artist && !last) return null;
  const name = firstName();
  return {
    kind: 'comeback',
    title: artist ? `Miss ${artist}${name ? `, ${name}` : ''}? 🎧` : 'Your music misses you 🎧',
    body: last ? `Pick up where you left off: ${last.title}.` : 'Your mixes are waiting.',
    url: '/',
  };
}

/** What the next reminder slot should say: streak at risk, else Sunday recap, else a mix. */
function nextSlot(at: Date): Message | null {
  const { kinds } = useNotifyStore.getState();
  const s = useStreakStore.getState();
  const tomorrowRisk = at.getDate() !== new Date().getDate() ? liveStreak(s) >= 2 : streakAtRisk(s);
  if (kinds.streak && tomorrowRisk) {
    const m = streakMessage();
    if (m) return m;
  }
  if (kinds.recap && at.getDay() === 0) {
    const m = weeklyRecap();
    if (m) return m;
  }
  if (kinds.daily) return mixMessage(at);
  return null;
}

// ---------- Scheduling ----------

async function schedule(id: string, message: Message, date: Date): Promise<void> {
  const n = N();
  if (!n) return;
  await n.scheduleNotificationAsync({
    identifier: id,
    content: {
      title: message.title,
      body: message.body,
      data: { url: message.url, kind: message.kind },
    },
    trigger: { type: n.SchedulableTriggerInputTypes.DATE, date, channelId: 'reminders' },
  });
}

let rescheduling = false;

/** Rebuild the scheduled reminders from the latest data. Safe to call often. */
export async function rescheduleNotifications(): Promise<void> {
  const n = N();
  if (!n || rescheduling) return;
  rescheduling = true;
  try {
    await n.cancelScheduledNotificationAsync(ID_NEXT).catch(() => undefined);
    await n.cancelScheduledNotificationAsync(ID_COMEBACK).catch(() => undefined);
    const { enabled, kinds } = useNotifyStore.getState();
    if (!enabled || !(await notificationsAllowed())) return;
    await ensureChannels();
    const hour = reminderHour();

    const at = nextAt(hour);
    // Already listened in the last hour before the slot? Then skip to the day after.
    const last = useProfileStore.getState().history[0]?.at ?? 0;
    if (at.getTime() - last < 60 * 60_000) at.setDate(at.getDate() + 1);
    const next = nextSlot(at);
    if (next) await schedule(ID_NEXT, next, at);

    if (kinds.comeback) {
      const back = nextAt(hour, new Date(Date.now() + COMEBACK_DAYS * DAY_MS));
      const msg = comebackMessage();
      if (msg) await schedule(ID_COMEBACK, msg, back);
    }
  } catch (err) {
    if (__DEV__) console.warn('[notify] reschedule failed', err);
  } finally {
    rescheduling = false;
  }
}

/** Show something right now (used for "downloads finished"). */
async function showNow(message: Message, channelId: string): Promise<void> {
  const n = N();
  const { enabled, kinds } = useNotifyStore.getState();
  if (!n || !enabled || !kinds[message.kind] || !(await notificationsAllowed())) return;
  await n.scheduleNotificationAsync({
    content: {
      title: message.title,
      body: message.body,
      data: { url: message.url, kind: message.kind },
    },
    trigger: { channelId },
  });
}

let started = false;

/** Started once from the root layout. */
export function startNotifications(): void {
  const n = N();
  if (started || !n) return;
  started = true;

  // Notifications that arrive while SONIQ is open: a quiet banner, no sound.
  n.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });

  // Fresh data whenever the user leaves the app (and once at start).
  AppState.addEventListener('change', (state) => {
    if (state === 'background') void rescheduleNotifications();
  });
  useNotifyStore.subscribe((s, prev) => {
    if (s.enabled !== prev.enabled || s.kinds !== prev.kinds || s.hour !== prev.hour)
      void rescheduleNotifications();
  });
  useRecsStore.subscribe((s, prev) => {
    if (s.builtAt !== prev.builtAt) void rescheduleNotifications();
  });
  setTimeout(() => void rescheduleNotifications(), 5_000);

  // Downloads: a batch that finishes while the app is in the background.
  let batch = 0;
  let batchFailed = 0;
  useDownloadStore.subscribe((s, prev) => {
    const wasBusy = prev.active !== null || prev.pending.length > 0;
    const busy = s.active !== null || s.pending.length > 0;
    if (prev.active && prev.active !== s.active) {
      if (s.failed[prev.active] && !prev.failed[prev.active]) batchFailed++;
      else if (s.items[prev.active]) batch++;
    }
    if (wasBusy && !busy) {
      const done = batch;
      const failed = batchFailed;
      batch = 0;
      batchFailed = 0;
      if (AppState.currentState !== 'active' && done + failed > 0) {
        void showNow(
          {
            kind: 'downloads',
            title:
              done > 0
                ? `${done} song${done === 1 ? '' : 's'} ready offline ⬇️`
                : 'Downloads stopped',
            body:
              failed > 0
                ? `${failed} couldn’t download. Open SONIQ to retry.`
                : 'Listen anywhere, even without internet.',
            url: '/library',
          },
          'downloads',
        );
      }
    }
  });
}

/** Where a tapped notification should take the user. */
export function urlOf(response: {
  notification: { request: { content: { data?: unknown } } };
}): string | null {
  const data = response.notification.request.content.data as { url?: unknown } | undefined;
  return typeof data?.url === 'string' && data.url.startsWith('/') ? data.url : null;
}

export function notificationsModule(): NotificationsModule | null {
  return N();
}
