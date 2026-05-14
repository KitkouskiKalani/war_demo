/**
 * Supabase client for lobby management
 * 
 * Setup Instructions:
 * 1. Go to https://supabase.com and create a free account
 * 2. Create a new project
 * 3. Go to Project Settings > API
 * 4. Copy the "Project URL" and "anon/public" key
 * 5. Create a .env file in the project root with:
 *    VITE_SUPABASE_URL=your_project_url
 *    VITE_SUPABASE_ANON_KEY=your_anon_key
 * 6. In Supabase, go to SQL Editor and run:
 *    
 *    CREATE TABLE lobbies (
 *      id TEXT PRIMARY KEY,
 *      host_name TEXT NOT NULL,
 *      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
 *    );
 *    
 *    ALTER TABLE lobbies ENABLE ROW LEVEL SECURITY;
 *    
 *    CREATE POLICY "Anyone can read lobbies" ON lobbies FOR SELECT USING (true);
 *    CREATE POLICY "Anyone can insert lobbies" ON lobbies FOR INSERT WITH CHECK (true);
 *    CREATE POLICY "Anyone can delete lobbies" ON lobbies FOR DELETE USING (true);
 */

import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';

export interface Lobby {
  id: string;
  host_name: string;
  created_at: string;
  match_id?: string | null;
  host_session_token?: string | null;
  last_heartbeat_at?: string | null;
  status?: string | null;
}

let supabase: SupabaseClient | null = null;
let lobbiesChannel: RealtimeChannel | null = null;
const ACTIVE_LOBBY_MAX_AGE_MS = 90_000;

function isLobbyFresh(lobby: Lobby): boolean {
  if (lobby.status && lobby.status !== 'waiting') return false;
  if (!lobby.last_heartbeat_at) return true;
  return Date.now() - new Date(lobby.last_heartbeat_at).getTime() <= ACTIVE_LOBBY_MAX_AGE_MS;
}

// Check if Supabase is configured
export function isSupabaseConfigured(): boolean {
  return !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
}

// Initialize Supabase client
function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) {
    console.warn('[Supabase] Not configured - lobby listing disabled');
    return null;
  }
  
  if (!supabase) {
    supabase = createClient(
      import.meta.env.VITE_SUPABASE_URL,
      import.meta.env.VITE_SUPABASE_ANON_KEY
    );
  }
  return supabase;
}

// Create a lobby entry
export async function createLobby(roomCode: string, hostName: string = 'Player'): Promise<boolean> {
  const client = getSupabase();
  if (!client) return false;
  
  try {
    const { error } = await client
      .from('lobbies')
      .insert({ id: roomCode, host_name: hostName });
    
    if (error) {
      console.error('[Supabase] Error creating lobby:', error);
      return false;
    }
    console.log('[Supabase] Lobby created:', roomCode);
    return true;
  } catch (err) {
    console.error('[Supabase] Error creating lobby:', err);
    return false;
  }
}

// Remove a lobby entry
export async function removeLobby(roomCode: string): Promise<void> {
  const client = getSupabase();
  if (!client) return;
  
  try {
    await client.from('lobbies').delete().eq('id', roomCode);
    console.log('[Supabase] Lobby removed:', roomCode);
  } catch (err) {
    console.error('[Supabase] Error removing lobby:', err);
  }
}

// Get all active lobbies
export async function getLobbies(): Promise<Lobby[]> {
  const client = getSupabase();
  if (!client) return [];
  
  try {
    const { data, error } = await client
      .from('lobbies')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('[Supabase] Error fetching lobbies:', error);
      return [];
    }
    return (data || []).filter(isLobbyFresh);
  } catch (err) {
    console.error('[Supabase] Error fetching lobbies:', err);
    return [];
  }
}

// Subscribe to lobby changes (real-time updates)
export function subscribeToLobbies(callback: (lobbies: Lobby[]) => void): () => void {
  const client = getSupabase();
  if (!client) return () => {};
  
  // Initial fetch
  getLobbies().then(callback);
  
  // Subscribe to changes
  lobbiesChannel = client
    .channel('lobbies-changes')
    .on('postgres_changes', 
      { event: '*', schema: 'public', table: 'lobbies' },
      () => {
        // Refetch on any change
        getLobbies().then(callback);
      }
    )
    .subscribe();
  
  // Return unsubscribe function
  return () => {
    if (lobbiesChannel) {
      client.removeChannel(lobbiesChannel);
      lobbiesChannel = null;
    }
  };
}







