/**
 * Core Types for War-Lanes Poker Game Engine
 */

export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';  // Jokers now use standard suits
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 'J' | 'Q' | 'K' | 'A' | 'JOKER';
export type StandardRank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 'J' | 'Q' | 'K' | 'A';
export type StandardSuit = 'hearts' | 'diamonds' | 'clubs' | 'spades';

export type GameMode = 'vs-ai' | 'vs-player' | 'online';
export type OnlineConnectionStatus =
  | 'offline'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'opponent-disconnected';

export interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
  minionEffect?: {
    type: 'spades-damage' | 'hearts-heal';
    owner: CurrentPlayer;
    value: number;
  };
}

export type LaneId = 'left' | 'middle' | 'right';
export type RelicType = 'shield' | 'skull' | 'sword';

export type RelicAvailability = Record<RelicType, boolean>;

export interface RelicLaneEffects {
  shielded: boolean;
  swordBonus: boolean;
}

export interface LaneRelicEffects {
  player1: RelicLaneEffects;
  player2: RelicLaneEffects;
}

export interface LaneSide {
  cards: Card[];
}

export interface Lane {
  id: LaneId;
  player1: LaneSide;
  player2: LaneSide;
}

// v2 Ability System - Status Effect Types
// Each BleedStack is a separate bleed instance that doesn't refresh others
export interface BleedStack {
  damagePerTurn: number;  // Damage this instance deals per turn
  turnsRemaining: number; // 3 turns, does NOT refresh when new bleed applied
}

// v2.2 Hearts Regen System - Instance-based (like bleed)
// Each RegenStack is a separate regen instance that doesn't refresh others
export interface RegenStack {
  healingPerTurn: number;  // Healing this instance provides per turn
  turnsRemaining: number;  // 5 turns, does NOT refresh when new regen applied
}

// Effect choice types for player decisions
export type EffectChoiceType = 
  | 'clubs-2-6-replacement'    // Choose hand card + J/Q/K replacement
  | 'clubs-7-10-replacement'   // v2.2: Choose hand card to replace with Clubs Ace on WIN
  | 'clubs-7-10-option'        // Move card OR Neutralize lane (legacy, now on Queen)
  | 'clubs-ace-option'         // Move any card OR Neutralize lane (legacy)
  | 'clubs-queen-move'         // v2.2: Move opponent's top card between lanes (ON PLAY)
  | 'clubs-queen-delay'        // Choose another lane to delay resolution by 1 turn (legacy)
  | 'diamonds-ace-option'      // v2.2: +2 Charges OR +2 Charge Power (no self-damage)
  | 'diamonds-queen-spend'     // Choose damage or heal (applied twice)
  | 'diamonds-spend-charge'    // Spend 1 charge: damage or heal
  | 'hearts-ace-regen-choice'  // v2.2: +1 more regen OR +1 more regen effect
  | 'spades-ace-choice';       // v2.2: +5 more blood debt OR +2 more bleed

export interface EffectChoice {
  type: EffectChoiceType;
  player: CurrentPlayer;
  sourceCardId: string;
  // Additional context depending on type
  laneId?: LaneId;
}

// For Clubs 7-10 move option
export interface CardMoveTarget {
  cardId: string;
  fromLane: LaneId;
  toLane: LaneId;
}

export interface PlayerState {
  hp: number;
  hand: Card[];
  relicsAvailable: RelicAvailability;
  minionAvailable: boolean;
  // v2 Ability System - Persistent Buffs/Status
  bloodDebtStacks: number;      // Spades 2-6: consumed on next lane win for bonus damage
  bleedStacks: BleedStack[];    // Spades 7-10: deals damage at start of turn
  // v3 Hearts Regen System
  // - regenPermanent: baseline healing/turn that persists and only grows (Queen/King gains)
  // - regenStacks: TEMP regen instances only, each with its own 3-turn timer (2-6, Ace conversion)
  // - regenEffectBonus / regenEffectBonusTurnsRemaining: legacy fields, unused by Hearts v3 (kept to avoid touching unrelated code)
  regenStacks: RegenStack[];         // TEMP regen instances only
  regenEffectBonus: number;          // Legacy - unused in Hearts v3
  regenEffectBonusTurnsRemaining: number; // Legacy - unused in Hearts v3
  regenPermanent: number;            // v3: Permanent regen/turn baseline (Hearts only)
  pendingAceDamageToRegen: boolean;  // v3: Hearts Ace one-shot flag - next won lane converts damage dealt to temp regen
  diamondCharges: number;       // Diamonds 7-10: resource for spending
  chargePower: number;          // Diamonds 2-6/Ace: increases charge effect value (cap +5)
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
  player1Card: Card;           // The winning/final card shown
  player2Card: Card;           // The winning/final card shown
  player1AllCards: Card[];     // All cards flipped by player 1 (in order)
  player2AllCards: Card[];     // All cards flipped by player 2 (in order)
  winner: CurrentPlayer;
  damage: number;
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
  // v2: Track which effects triggered for display
  triggeredEffects?: TriggeredEffect[];
  wasNeutralized?: boolean; // True if lane was neutralized (no effects fired)
  // v6 Poker Rework: record the best hand each side formed so UI can label the winning hand
  player1HandType?: import('./pokerBonuses').HandType;
  player2HandType?: import('./pokerBonuses').HandType;
}

// v2 Ability System - Effect tracking for UI display
export interface TriggeredEffect {
  cardId: string;
  suit: StandardSuit;
  rank: Rank;
  effectType: string; // Description of what happened
  strength: 'full' | 'half';
  value?: number; // Numeric value if applicable
}

// Rank tier classification for trigger rules
export type RankTier = 'low' | 'mid' | 'high' | 'ace';

// Get rank tier from a rank
export function getRankTier(rank: Rank): RankTier {
  if (rank === 'JOKER') return 'high'; // Jokers don't trigger effects but classify as high
  if (rank === 'A') return 'ace';
  if (rank === 'J' || rank === 'Q' || rank === 'K') return 'high';
  if (typeof rank === 'number') {
    if (rank >= 2 && rank <= 6) return 'low';
    if (rank >= 7 && rank <= 10) return 'mid';
  }
  return 'mid'; // fallback
}

export interface GameState {
  phase: GamePhase;
  gameMode: GameMode;
  player1: PlayerState;
  player2: PlayerState;
  lanes: Lane[];
  // v4 Shared Deck System: single community deck both players draw from,
  // and a hidden pile for cards that are out of play until the next round.
  sharedDeck: Card[];
  outOfPlayPile: Card[];
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
  // v7 Cycling Lane Flow
  // - laneCommunityCards: per-lane community card. Refreshed (discarded + redrawn from sharedDeck)
  //   every time that lane resolves, so a single round can cycle through several community cards
  //   per lane.
  // - allLaneCommunityCard: only refreshed at round end (when both players' hands are empty),
  //   not on individual lane resolutions.
  // - pendingRoundEndLanes: queue of lanes that still need to play their resolution animation
  //   during EndOfRoundResolving phase. Drained one lane at a time so the UI can show each
  //   lane's damage/animation sequentially before starting the next round.
  laneCommunityCards: Record<LaneId, Card | null>;
  allLaneCommunityCard: Card | null;
  pendingRoundEndLanes: LaneId[];
  laneRelicEffects: Record<LaneId, LaneRelicEffects>;
  // Support ability tracking
  player1LanesLost: number;
  player2LanesLost: number;
  player1SupportAvailable: boolean;
  player2SupportAvailable: boolean;
  // Online multiplayer
  localPlayer: CurrentPlayer | null; // Which player you are (1 = host, 2 = guest)
  isHost: boolean;
  roomCode: string | null;
  onlineMatchId: string | null;
  onlineSessionToken: string | null;
  onlineLastSequence: number;
  onlineConnectionStatus: OnlineConnectionStatus;
  // Lane resolution animation
  lastLaneResolution: LaneResolutionResult | null;
  // v2 Ability System
  neutralizedLanes: Record<LaneId, boolean>; // Clubs 7-10/Ace: lane ignores ALL suit effects until next resolve
  pendingEffectChoices: EffectChoice[];      // Queue of player choices to resolve
  overkillThisTurn: number;                  // Hearts King: tracks overkill damage for healing conversion
}


