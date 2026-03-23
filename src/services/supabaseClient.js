import { createClient } from '@supabase/supabase-js';
import { fetchWithRetry } from '../utils/fetchWithRetry.js';

const viteEnv = import.meta.env ?? {};
const nodeEnv = typeof process !== 'undefined' && process && process.env ? process.env : {};
const supabaseUrl = viteEnv.VITE_SUPABASE_URL ?? nodeEnv.VITE_SUPABASE_URL;
const supabaseKey = viteEnv.VITE_SUPABASE_ANON_KEY ?? nodeEnv.VITE_SUPABASE_ANON_KEY;

function createNoopSupabaseClient() {
  const buildConfigError = () => ({
    message: 'Supabase belum dikonfigurasi. Set VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY.',
  });

  const emptyResult = () => ({ data: null, error: buildConfigError() });

  // Keep this builder fluent so query chains do not crash when env is missing.
  const queryBuilder = {
    select: () => queryBuilder,
    insert: () => queryBuilder,
    upsert: () => queryBuilder,
    update: () => queryBuilder,
    delete: () => queryBuilder,
    eq: () => queryBuilder,
    neq: () => queryBuilder,
    in: () => queryBuilder,
    gt: () => queryBuilder,
    gte: () => queryBuilder,
    lt: () => queryBuilder,
    lte: () => queryBuilder,
    like: () => queryBuilder,
    ilike: () => queryBuilder,
    is: () => queryBuilder,
    contains: () => queryBuilder,
    containedBy: () => queryBuilder,
    overlap: () => queryBuilder,
    or: () => queryBuilder,
    not: () => queryBuilder,
    filter: () => queryBuilder,
    match: () => queryBuilder,
    textSearch: () => queryBuilder,
    range: () => queryBuilder,
    abortSignal: () => queryBuilder,
    order: () => queryBuilder,
    limit: () => queryBuilder,
    csv: async () => ({ data: '', error: buildConfigError() }),
    maybeSingle: async () => emptyResult(),
    single: async () => emptyResult(),
    then: (resolve, reject) => Promise.resolve(emptyResult()).then(resolve, reject),
    catch: (reject) => Promise.resolve(emptyResult()).catch(reject),
    finally: (handler) => Promise.resolve(emptyResult()).finally(handler),
  };

  const emptyAuthResult = async () => ({ data: null, error: buildConfigError() });
  const emptyFunctionsResult = async () => ({ data: null, error: buildConfigError() });

  return {
    from: () => queryBuilder,
    rpc: async () => ({ data: null, error: buildConfigError() }),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: () => {},
    functions: {
      invoke: emptyFunctionsResult,
    },
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      getUser: async () => ({ data: { user: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signInWithPassword: emptyAuthResult,
      signUp: emptyAuthResult,
      signOut: emptyAuthResult,
      updateUser: emptyAuthResult,
      resetPasswordForEmail: emptyAuthResult,
      signInWithOAuth: emptyAuthResult,
      exchangeCodeForSession: emptyAuthResult,
    },
  };
}

export const supabase = (supabaseUrl && supabaseKey)
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      global: {
        fetch: fetchWithRetry,
      },
    })
  : createNoopSupabaseClient();
