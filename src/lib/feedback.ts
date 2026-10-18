/** Sends the in-app "suggest a feature" form to Supabase (table `feedback`). */
import { useProfileStore } from '@/store/profileStore';
import { flushListening } from './listeningSync';
import { getSupabase, supabaseConfigured } from './supabase';
import { currentVersion } from './updates';

export const FEEDBACK_CATEGORIES = ['New feature', 'Improvement', 'Bug', 'Other'] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export async function sendFeedback(category: FeedbackCategory, message: string): Promise<void> {
  const profile = useProfileStore.getState().profile;
  if (!profile || !supabaseConfigured()) throw new Error('Feedback is not available in this build.');
  // Make sure our profile exists on the server first.
  await flushListening();
  const { error } = await getSupabase().rpc('soniq_submit_feedback', {
    p_id: profile.id,
    p_secret: profile.secret,
    p_category: category,
    p_message: message,
    p_version: currentVersion(),
  });
  if (error) {
    if (/rate limited/i.test(error.message)) throw new Error("You've sent a lot today. Try again tomorrow 🙂");
    if (/network|fetch/i.test(error.message)) throw new Error('No internet. Your text is kept; try again.');
    throw new Error(`Couldn't send: ${error.message}`);
  }
}
