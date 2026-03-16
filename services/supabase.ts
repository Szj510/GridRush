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
