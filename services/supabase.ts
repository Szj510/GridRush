import { createClient } from '@supabase/supabase-js';
import type { UserStats } from '../types';

export interface ProfileRow {
  id: string;
  email: string | null;
  nickname: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface UserStatsRow {
  user_id: string;
  stats_json: UserStats;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface FeedbackRow {
  id?: string;
  created_at?: string | null;
  name: string;
  email: string;
  category: 'game_idea' | 'bug_report' | 'improvement';
  content: string;
  status?: string;
  user_agent?: string;
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

// Feedback submission
export const submitFeedback = async (feedback: FeedbackRow) => {
  if (!supabase || !hasSupabaseConfig) {
    throw new Error('Supabase not configured');
  }

  const { error } = await supabase
    .from('feedback')
    .insert([
      {
        ...feedback,
        user_agent: navigator.userAgent,
      },
    ]);

  if (error) throw error;
  return { success: true };
};
