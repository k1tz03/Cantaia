import { createClient } from '@supabase/supabase-js';
import { CONFIG } from '../config';

// Client Supabase avec service role key (bypass RLS)
export const supabase = createClient(
  CONFIG.supabase.url,
  CONFIG.supabase.serviceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);
