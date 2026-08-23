import 'react-native-url-polyfill/auto';
import '@/lib/install-local-storage';

import { createClient } from '@supabase/supabase-js';

const supabaseURL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(supabaseURL && publishableKey);

const client = isSupabaseConfigured
  ? createClient(supabaseURL!, publishableKey!, {
      auth: {
        storage: globalThis.localStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
      },
    })
  : null;

export function getSupabaseClient() {
  if (!client) {
    throw new Error('Supabase 환경 변수가 설정되지 않았습니다');
  }
  return client;
}
