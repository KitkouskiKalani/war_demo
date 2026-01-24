/**
 * Network Module for Online Multiplayer using Supabase Realtime
 * 
 * Uses Supabase Broadcast for reliable message relay between players.
 * Much simpler and more reliable than WebRTC/PeerJS for turn-based games.
 */

import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';

// Room code prefix
const ROOM_PREFIX = 'game_';

let supabase: SupabaseClient | null = null;
let gameChannel: RealtimeChannel | null = null;
let currentRoomCode: string | null = null;
let isHostPlayer: boolean = false;
let actionCallback: ((action: any) => void) | null = null;
let connectionCallback: (() => void) | null = null;
let disconnectCallback: (() => void) | null = null;

/**
 * Generate a random 6-digit numeric room code
 */
export function generateRoomCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Check if Supabase is configured
 */
function isConfigured(): boolean {
  return !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
}

/**
 * Get or create Supabase client
 */
function getClient(): SupabaseClient | null {
  if (!isConfigured()) {
    console.error('[Network] Supabase not configured - add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env');
    return null;
  }
  
  if (!supabase) {
    supabase = createClient(
      import.meta.env.VITE_SUPABASE_URL,
      import.meta.env.VITE_SUPABASE_ANON_KEY
    );
    console.log('[Network] Supabase client initialized');
  }
  return supabase;
}

/**
 * Create a room as host. Returns the room code for guests to join.
 */
export function createRoom(roomCode?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = getClient();
    if (!client) {
      reject(new Error('Network not configured. Please set up Supabase.'));
      return;
    }
    
    const code = roomCode || generateRoomCode();
    const channelName = ROOM_PREFIX + code;
    
    console.log('[Network] Creating room:', code);
    
    // Clean up any existing channel
    if (gameChannel) {
      client.removeChannel(gameChannel);
      gameChannel = null;
    }
    
    currentRoomCode = code;
    isHostPlayer = true;
    
    // Create the channel
    gameChannel = client.channel(channelName, {
      config: {
        broadcast: { self: false }, // Don't receive own messages
        presence: { key: 'host' },
      },
    });
    
    // Listen for broadcast messages
    gameChannel.on('broadcast', { event: 'game_action' }, (payload) => {
      console.log('[Network] Received action:', payload.payload);
      if (actionCallback) {
        actionCallback(payload.payload);
      }
    });
    
    // Listen for player joining
    gameChannel.on('broadcast', { event: 'player_joined' }, (payload) => {
      console.log('[Network] Player joined!', payload);
      if (connectionCallback) {
        connectionCallback();
      }
    });
    
    // Listen for player leaving
    gameChannel.on('broadcast', { event: 'player_left' }, () => {
      console.log('[Network] Player left');
      if (disconnectCallback) {
        disconnectCallback();
      }
    });
    
    // Subscribe to the channel
    gameChannel.subscribe((status) => {
      console.log('[Network] Channel status:', status);
      if (status === 'SUBSCRIBED') {
        console.log('[Network] Room created successfully:', code);
        resolve(code);
      } else if (status === 'CHANNEL_ERROR') {
        reject(new Error('Failed to create room'));
      }
    });
  });
}

/**
 * Join a room as guest using a room code.
 */
export function joinRoom(roomCode: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = getClient();
    if (!client) {
      reject(new Error('Network not configured. Please set up Supabase.'));
      return;
    }
    
    const cleanCode = roomCode.replace(/\D/g, '').trim();
    const channelName = ROOM_PREFIX + cleanCode;
    
    console.log('[Network] Joining room:', cleanCode);
    
    // Clean up any existing channel
    if (gameChannel) {
      client.removeChannel(gameChannel);
      gameChannel = null;
    }
    
    currentRoomCode = cleanCode;
    isHostPlayer = false;
    
    // Create the channel
    gameChannel = client.channel(channelName, {
      config: {
        broadcast: { self: false }, // Don't receive own messages
        presence: { key: 'guest' },
      },
    });
    
    // Listen for broadcast messages
    gameChannel.on('broadcast', { event: 'game_action' }, (payload) => {
      console.log('[Network] Received action:', payload.payload);
      if (actionCallback) {
        actionCallback(payload.payload);
      }
    });
    
    // Listen for host disconnect
    gameChannel.on('broadcast', { event: 'player_left' }, () => {
      console.log('[Network] Host left');
      if (disconnectCallback) {
        disconnectCallback();
      }
    });
    
    // Set up a timeout for joining
    const joinTimeout = setTimeout(() => {
      reject(new Error('Room not found or host not responding'));
    }, 10000);
    
    // Subscribe to the channel
    gameChannel.subscribe(async (status) => {
      console.log('[Network] Channel status:', status);
      if (status === 'SUBSCRIBED') {
        // Notify host that we joined
        await gameChannel!.send({
          type: 'broadcast',
          event: 'player_joined',
          payload: { player: 'guest' },
        });
        
        clearTimeout(joinTimeout);
        console.log('[Network] Joined room successfully:', cleanCode);
        
        if (connectionCallback) {
          connectionCallback();
        }
        resolve();
      } else if (status === 'CHANNEL_ERROR') {
        clearTimeout(joinTimeout);
        reject(new Error('Failed to join room'));
      }
    });
  });
}

/**
 * Send a game action to the other player.
 */
export function sendAction(action: any): void {
  if (!gameChannel) {
    console.warn('[Network] Cannot send - no active connection');
    return;
  }
  
  console.log('[Network] Sending action:', action);
  gameChannel.send({
    type: 'broadcast',
    event: 'game_action',
    payload: action,
  });
}

/**
 * Register a callback for incoming actions.
 */
export function onAction(callback: (action: any) => void): void {
  actionCallback = callback;
}

/**
 * Register a callback for when connection is established.
 */
export function onConnection(callback: () => void): void {
  connectionCallback = callback;
}

/**
 * Register a callback for when the peer disconnects.
 */
export function onDisconnect(callback: () => void): void {
  disconnectCallback = callback;
}

/**
 * Check if we're currently connected.
 */
export function isConnected(): boolean {
  return gameChannel !== null;
}

/**
 * Get the current room code
 */
export function getCurrentRoomCode(): string | null {
  return currentRoomCode;
}

/**
 * Disconnect and clean up all connections.
 */
export function disconnect(): void {
  if (gameChannel) {
    // Notify the other player
    gameChannel.send({
      type: 'broadcast',
      event: 'player_left',
      payload: { player: isHostPlayer ? 'host' : 'guest' },
    });
    
    const client = getClient();
    if (client) {
      client.removeChannel(gameChannel);
    }
    gameChannel = null;
  }
  
  currentRoomCode = null;
  isHostPlayer = false;
  actionCallback = null;
  connectionCallback = null;
  disconnectCallback = null;
  
  console.log('[Network] Disconnected and cleaned up');
}
