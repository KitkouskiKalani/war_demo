import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { CurrentPlayer, GameState } from '../game/types';

const RESUME_STORAGE_KEY = 'ltbw-online-resume-v1';
const ACTIVE_LOBBY_MAX_AGE_MS = 90_000;

let supabase: SupabaseClient | null = null;

export interface OnlineSession {
  matchId: string;
  roomCode: string;
  playerSlot: CurrentPlayer;
  sessionToken: string;
  isHost: boolean;
}

export interface MatchBackedLobby {
  id: string;
  host_name: string;
  created_at: string;
  match_id?: string | null;
  last_heartbeat_at?: string | null;
  status?: string | null;
}

export interface SnapshotResult {
  state: GameState | null;
  lastSequence: number;
  status?: string | null;
}

function isConfigured(): boolean {
  return !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
}

function getClient(): SupabaseClient | null {
  if (!isConfigured()) return null;
  if (!supabase) {
    supabase = createClient(
      import.meta.env.VITE_SUPABASE_URL,
      import.meta.env.VITE_SUPABASE_ANON_KEY,
    );
  }
  return supabase;
}

export function generateSessionToken(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function isLobbyFresh(lobby: MatchBackedLobby): boolean {
  if (lobby.status && lobby.status !== 'waiting') return false;
  if (!lobby.last_heartbeat_at) return true;
  return Date.now() - new Date(lobby.last_heartbeat_at).getTime() <= ACTIVE_LOBBY_MAX_AGE_MS;
}

export function saveResumeMetadata(session: OnlineSession): void {
  try {
    localStorage.setItem(RESUME_STORAGE_KEY, JSON.stringify(session));
  } catch (err) {
    console.warn('[Matches] Failed to save resume metadata:', err);
  }
}

export function loadResumeMetadata(): OnlineSession | null {
  try {
    const raw = localStorage.getItem(RESUME_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OnlineSession;
    if (!parsed.matchId || !parsed.roomCode || !parsed.sessionToken || !parsed.playerSlot) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearResumeMetadata(): void {
  try {
    localStorage.removeItem(RESUME_STORAGE_KEY);
  } catch {
    // ignore storage failures
  }
}

export async function createMatchBackedLobby(
  roomCode: string,
  hostName: string,
  initialState: GameState,
): Promise<OnlineSession | null> {
  const client = getClient();
  if (!client) return null;

  const sessionToken = generateSessionToken();
  const snapshot = {
    ...initialState,
    roomCode,
    gameMode: 'online',
    isHost: true,
    localPlayer: 1 as CurrentPlayer,
  };

  const { data: match, error: matchError } = await client
    .from('matches')
    .insert({
      room_code: roomCode,
      status: 'waiting',
      host_id: sessionToken,
      last_snapshot: snapshot,
      last_sequence: 0,
      current_phase: snapshot.phase,
      last_seen_at: nowIso(),
    })
    .select('id')
    .single();

  if (matchError || !match?.id) {
    console.warn('[Matches] Match-backed lobby unavailable; falling back to legacy lobby:', matchError);
    return null;
  }

  await client.from('match_players').upsert({
    match_id: match.id,
    player_slot: 1,
    session_token: sessionToken,
    display_name: hostName,
    connected_at: nowIso(),
    last_seen_at: nowIso(),
    disconnected_at: null,
  });

  const { error: lobbyError } = await client
    .from('lobbies')
    .upsert({
      id: roomCode,
      host_name: hostName,
      match_id: match.id,
      host_session_token: sessionToken,
      last_heartbeat_at: nowIso(),
      status: 'waiting',
    });

  if (lobbyError) {
    console.warn('[Matches] Failed to create match-backed lobby row:', lobbyError);
  }

  return {
    matchId: match.id,
    roomCode,
    playerSlot: 1,
    sessionToken,
    isHost: true,
  };
}

export async function getLobbyByRoomCode(roomCode: string): Promise<MatchBackedLobby | null> {
  const client = getClient();
  if (!client) return null;

  const { data, error } = await client
    .from('lobbies')
    .select('*')
    .eq('id', roomCode)
    .maybeSingle();

  if (error) {
    console.warn('[Matches] Failed to fetch lobby metadata:', error);
    return null;
  }
  return data as MatchBackedLobby | null;
}

export async function joinMatchBackedLobby(roomCode: string, displayName = 'Player 2'): Promise<OnlineSession | null> {
  const client = getClient();
  if (!client) return null;

  const lobby = await getLobbyByRoomCode(roomCode);
  if (!lobby || !isLobbyFresh(lobby) || !lobby.match_id) return null;

  const sessionToken = generateSessionToken();
  await client.from('match_players').upsert({
    match_id: lobby.match_id,
    player_slot: 2,
    session_token: sessionToken,
    display_name: displayName,
    connected_at: nowIso(),
    last_seen_at: nowIso(),
    disconnected_at: null,
  });

  await client
    .from('matches')
    .update({
      status: 'active',
      guest_id: sessionToken,
      updated_at: nowIso(),
      last_seen_at: nowIso(),
    })
    .eq('id', lobby.match_id);

  await client
    .from('lobbies')
    .update({ status: 'active', last_heartbeat_at: nowIso() })
    .eq('id', roomCode);

  return {
    matchId: lobby.match_id,
    roomCode,
    playerSlot: 2,
    sessionToken,
    isHost: false,
  };
}

export async function heartbeatLobby(roomCode: string, sessionToken?: string | null): Promise<void> {
  const client = getClient();
  if (!client) return;

  let query = client
    .from('lobbies')
    .update({ last_heartbeat_at: nowIso() })
    .eq('id', roomCode);

  if (sessionToken) {
    query = query.eq('host_session_token', sessionToken);
  }

  await query;
}

export async function closeLobby(roomCode: string, sessionToken?: string | null): Promise<void> {
  const client = getClient();
  if (!client) return;

  let query = client
    .from('lobbies')
    .update({ status: 'closed', last_heartbeat_at: nowIso() })
    .eq('id', roomCode);

  if (sessionToken) {
    query = query.eq('host_session_token', sessionToken);
  }

  await query;
}

export async function persistSnapshot(
  matchId: string | null,
  state: GameState,
  sequence: number,
): Promise<void> {
  const client = getClient();
  if (!client || !matchId) return;

  const { error } = await client
    .from('matches')
    .update({
      last_snapshot: state,
      last_sequence: sequence,
      current_phase: state.phase,
      winner: state.winner,
      updated_at: nowIso(),
      last_seen_at: nowIso(),
    })
    .eq('id', matchId);

  if (error) {
    console.warn('[Matches] Failed to persist snapshot:', error);
  }
}

export async function fetchLatestSnapshot(matchId: string): Promise<SnapshotResult | null> {
  const client = getClient();
  if (!client) return null;

  const { data, error } = await client
    .from('matches')
    .select('last_snapshot,last_sequence,status')
    .eq('id', matchId)
    .maybeSingle();

  if (error) {
    console.warn('[Matches] Failed to fetch latest snapshot:', error);
    return null;
  }

  return {
    state: (data?.last_snapshot as GameState | null) ?? null,
    lastSequence: data?.last_sequence ?? 0,
    status: data?.status ?? null,
  };
}

export async function markPlayerDisconnected(session: OnlineSession | null): Promise<void> {
  const client = getClient();
  if (!client || !session) return;

  await client
    .from('match_players')
    .update({ disconnected_at: nowIso(), last_seen_at: nowIso() })
    .eq('match_id', session.matchId)
    .eq('player_slot', session.playerSlot)
    .eq('session_token', session.sessionToken);
}

export async function touchPlayer(session: OnlineSession | null): Promise<void> {
  const client = getClient();
  if (!client || !session) return;

  await client
    .from('match_players')
    .update({ last_seen_at: nowIso(), disconnected_at: null })
    .eq('match_id', session.matchId)
    .eq('player_slot', session.playerSlot)
    .eq('session_token', session.sessionToken);
}
