/**
 * Core Types for War-Lanes Poker Game Engine
 */

export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades' | 'joker';
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 'J' | 'Q' | 'K' | 'A' | 'JOKER';
export type StandardRank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 'J' | 'Q' | 'K' | 'A';
export type StandardSuit = 'hearts' | 'diamonds' | 'clubs' | 'spades';

export type GameMode = 'vs-ai' | 'vs-player' | 'online';

export interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
}

export type LaneId = 'left' | 'middle' | 'right';

export interface LaneSide {
  cards: Card[];
}

export interface Lane {
  id: LaneId;
  player1: LaneSide;
  player2: LaneSide;
}

export interface PlayerState {
  hp: number;
  deck: Card[];
  hand: Card[];
}

export type CurrentPlayer = 1 | 2;

export type GamePhase = 
  | 'ModeSelection'
  | 'OnlineLobby'      // Choose to create or join a room
  | 'WaitingForPlayer' // Host waiting for guest to connect
  | 'JoiningRoom'      // Guest entering room code
  | 'SuitSelection'
  | 'SuitSelectionP2'  // For PvP: Player 2 picks their suit
  | 'WaitingForOpponentSuit' // Online: waiting for opponent to pick suit
  | 'PassDevice'       // Transition screen between turns in PvP hotseat
  | 'InitialFlip' 
  | 'InitialFlipResult'
  | 'Main' 
  | 'EndOfRoundResolving' 
  | 'SuddenDeath'
  | 'Finished';

export interface FlipResult {
  player1Card: Card;
  player2Card: Card;
  winner: CurrentPlayer;
  damage: number;
}

export interface PendingLaneResolution {
  laneId: LaneId;
  filledByPlayer: CurrentPlayer;
  turnsUntilResolution: number; // Decrements each time it becomes the filling player's turn
}

// Result of a lane resolution - used for animation
export interface LaneResolutionResult {
  laneId: LaneId;
  player1Total: number;
  player2Total: number;
  winner: CurrentPlayer | null; // null = tie
  damage: number;
  baseDamage: number;  // Damage before suit effects
  loser: CurrentPlayer | null;
  timestamp: number; // Used to detect new resolutions
  // Suit effect bonuses (from winner's active cards)
  bonusDamage: number;  // Extra damage dealt (diamonds/spades)
  bonusHealing: number; // Healing to winner (hearts/clubs)
}

export interface GameState {
  phase: GamePhase;
  gameMode: GameMode;
  player1: PlayerState;
  player2: PlayerState;
  lanes: Lane[];
  discardPile: Card[];
  currentPlayer: CurrentPlayer;
  roundNumber: number;
  player1FinalTurnDone: boolean;
  player2FinalTurnDone: boolean;
  cardsPlayedThisTurn: number;
  winner: CurrentPlayer | null;
  player1Suit: StandardSuit | null;
  player2Suit: StandardSuit | null;
  flipResult: FlipResult | null;
  fieldControlSuit: StandardSuit | null;
  pendingResolutionLanes: PendingLaneResolution[];
  // Support ability tracking
  player1LanesLost: number;
  player2LanesLost: number;
  player1SupportAvailable: boolean;
  player2SupportAvailable: boolean;
  // Online multiplayer
  localPlayer: CurrentPlayer | null; // Which player you are (1 = host, 2 = guest)
  isHost: boolean;
  roomCode: string | null;
  // Lane resolution animation
  lastLaneResolution: LaneResolutionResult | null;
}


