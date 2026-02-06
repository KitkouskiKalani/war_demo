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
 * Includes retry logic for transient network failures.
 */
export function createRoom(roomCode?: string): Promise<string> {
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 1500; // 1.5 seconds between retries
  
  return new Promise((resolve, reject) => {
    const client = getClient();
    if (!client) {
      reject(new Error('Network not configured. Please set up Supabase.'));
      return;
    }
    
    const code = roomCode || generateRoomCode();
    const channelName = ROOM_PREFIX + code;
    
    let retryCount = 0;
    let subscribeTimeout: ReturnType<typeof setTimeout> | null = null;
    let resolved = false; // Prevent multiple resolutions
    let handlingFailure = false; // Prevent recursive failure handling
    
    const cleanup = () => {
      if (subscribeTimeout) {
        clearTimeout(subscribeTimeout);
        subscribeTimeout = null;
      }
      if (gameChannel) {
        try {
          client.removeChannel(gameChannel);
        } catch (e) {
          // Ignore cleanup errors
        }
        gameChannel = null;
      }
    };
    
    const attemptConnection = () => {
      if (resolved) return;
      
      console.log('[Network] Creating room:', code, retryCount > 0 ? `(retry ${retryCount})` : '');
      
      // Clean up any existing channel
      cleanup();
      handlingFailure = false;
      
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
      
      // Set timeout for subscription
      subscribeTimeout = setTimeout(() => {
        if (!resolved) {
          console.warn('[Network] Subscription timeout');
          handleFailure('Connection timed out');
        }
      }, 15000); // 15 second timeout
      
      // Subscribe to the channel
      gameChannel.subscribe((status) => {
        console.log('[Network] Channel status:', status);
        if (resolved) return;
        
        if (status === 'SUBSCRIBED') {
          resolved = true;
          if (subscribeTimeout) {
            clearTimeout(subscribeTimeout);
            subscribeTimeout = null;
          }
          console.log('[Network] Room created successfully:', code);
          resolve(code);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          handleFailure(`Channel error: ${status}`);
        }
      });
    };
    
    const handleFailure = (reason: string) => {
      // Prevent multiple/recursive failure handling
      if (resolved || handlingFailure) return;
      handlingFailure = true;
      
      cleanup();
      
      retryCount++;
      if (retryCount < MAX_RETRIES) {
        console.log(`[Network] ${reason}. Retrying in ${RETRY_DELAY}ms... (${retryCount}/${MAX_RETRIES})`);
        setTimeout(() => {
          handlingFailure = false;
          attemptConnection();
        }, RETRY_DELAY);
      } else {
        resolved = true;
        console.error(`[Network] Failed after ${MAX_RETRIES} attempts:`, reason);
        currentRoomCode = null;
        isHostPlayer = false;
        reject(new Error('Failed to create room. Please check your internet connection and try again.'));
      }
    };
    
    attemptConnection();
  });
}

/**
 * Join a room as guest using a room code.
 * Includes retry logic for transient network failures.
 */
export function joinRoom(roomCode: string): Promise<void> {
  const MAX_RETRIES = 2;
  const RETRY_DELAY = 1500;
  
  return new Promise((resolve, reject) => {
    const client = getClient();
    if (!client) {
      reject(new Error('Network not configured. Please set up Supabase.'));
      return;
    }
    
    const cleanCode = roomCode.replace(/\D/g, '').trim();
    if (!cleanCode || cleanCode.length !== 6) {
      reject(new Error('Invalid room code. Please enter a 6-digit code.'));
      return;
    }
    
    const channelName = ROOM_PREFIX + cleanCode;
    
    let retryCount = 0;
    let joinTimeout: ReturnType<typeof setTimeout> | null = null;
    let resolved = false;
    let handlingFailure = false; // Prevent recursive failure handling
    
    const cleanup = () => {
      if (joinTimeout) {
        clearTimeout(joinTimeout);
        joinTimeout = null;
      }
      if (gameChannel) {
        try {
          client.removeChannel(gameChannel);
        } catch (e) {
          // Ignore cleanup errors
        }
        gameChannel = null;
      }
    };
    
    const attemptJoin = () => {
      if (resolved) return;
      
      console.log('[Network] Joining room:', cleanCode, retryCount > 0 ? `(retry ${retryCount})` : '');
      
      // Clean up any existing channel
      cleanup();
      handlingFailure = false;
      
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
      joinTimeout = setTimeout(() => {
        if (!resolved) {
          handleFailure('Room not found or host not responding');
        }
      }, 15000);
      
      // Subscribe to the channel
      gameChannel.subscribe(async (status) => {
        console.log('[Network] Channel status:', status);
        if (resolved) return;
        
        if (status === 'SUBSCRIBED') {
          resolved = true;
          if (joinTimeout) {
            clearTimeout(joinTimeout);
            joinTimeout = null;
          }
          
          // Notify host that we joined
          try {
            await gameChannel!.send({
              type: 'broadcast',
              event: 'player_joined',
              payload: { player: 'guest' },
            });
          } catch (e) {
            console.warn('[Network] Error sending join notification:', e);
          }
          
          console.log('[Network] Joined room successfully:', cleanCode);
          
          if (connectionCallback) {
            connectionCallback();
          }
          resolve();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          handleFailure(`Channel error: ${status}`);
        }
      });
    };
    
    const handleFailure = (reason: string) => {
      // Prevent multiple/recursive failure handling
      if (resolved || handlingFailure) return;
      handlingFailure = true;
      
      cleanup();
      
      retryCount++;
      if (retryCount < MAX_RETRIES) {
        console.log(`[Network] ${reason}. Retrying in ${RETRY_DELAY}ms... (${retryCount}/${MAX_RETRIES})`);
        setTimeout(() => {
          handlingFailure = false;
          attemptJoin();
        }, RETRY_DELAY);
      } else {
        resolved = true;
        console.error(`[Network] Failed after ${MAX_RETRIES} attempts:`, reason);
        currentRoomCode = null;
        isHostPlayer = false;
        reject(new Error('Failed to join room. The room may not exist or the host may have disconnected.'));
      }
    };
    
    attemptJoin();
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
  console.log('[Network] Disconnecting...');
  
  if (gameChannel) {
    // Notify the other player (best effort, don't await)
    try {
      gameChannel.send({
        type: 'broadcast',
        event: 'player_left',
        payload: { player: isHostPlayer ? 'host' : 'guest' },
      });
    } catch (e) {
      console.warn('[Network] Error sending disconnect notification:', e);
    }
    
    // Remove the channel
    try {
      const client = getClient();
      if (client) {
        client.removeChannel(gameChannel);
      }
    } catch (e) {
      console.warn('[Network] Error removing channel:', e);
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

/**
 * Force cleanup any stale connections (call before creating/joining a room)
 */
export function forceCleanup(): void {
  console.log('[Network] Force cleanup...');
  if (gameChannel) {
    try {
      const client = getClient();
      if (client) {
        client.removeChannel(gameChannel);
      }
    } catch (e) {
      // Ignore errors during force cleanup
    }
    gameChannel = null;
  }
  currentRoomCode = null;
  isHostPlayer = false;
}
