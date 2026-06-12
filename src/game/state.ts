/**
 * Game State Initialization Helpers
 */

import type { Card, CurrentPlayer, GameState, Lane, LaneId, LaneRelicEffects, PlayerState, RelicAvailability, RelicStacks } from './types';
import { createDeck, shuffle } from './deck';
import { SUIT_EFFECTS_ENABLED } from './suitEffects';

const STARTING_HP = 100;
const LANE_IDS: LaneId[] = ['left', 'middle', 'right'];

// v8 Split Deck: how many cards to set aside as the neutral community pile when
// partitioning. The rest is split evenly into the two personal player decks.
// Sized comfortably above a round's worst-case community consumption (3 initial
// per-lane cards + ~1 per lane resolution) so community rarely starves while
// still leaving large, equal player decks. Tunable.
const COMMUNITY_RESERVE = 16;

export interface DeckPartition {
  player1Deck: Card[];
  player2Deck: Card[];
  communityDeck: Card[];
}

/**
 * v8 Split Deck: deterministically split a pool of cards into two EQUAL personal
 * decks plus a neutral community pile. The community pile gets COMMUNITY_RESERVE
 * cards; the remainder is split evenly, and any single odd leftover card is
 * folded into the community pile so the two player decks are exactly equal in
 * size. Equal decks + equal draws are what guarantee fair dealing.
 *
 * The pool is shuffled here, so callers should pass the raw (unshuffled) pool.
 */
export function partitionDeck(pool: Card[]): DeckPartition {
  const shuffled = shuffle(pool);
  const reserve = Math.min(COMMUNITY_RESERVE, shuffled.length);
  const community = shuffled.slice(0, reserve);
  const rest = shuffled.slice(reserve);
  const half = Math.floor(rest.length / 2);
  const player1Deck = rest.slice(0, half);
  const player2Deck = rest.slice(half, half * 2);
  const leftover = rest.slice(half * 2); // 0 or 1 card when rest is odd
  return {
    player1Deck,
    player2Deck,
    communityDeck: [...community, ...leftover],
  };
}

export function createInactiveRelics(): RelicAvailability {
  return { shield: false, skull: false, sword: false };
}

export function createEmptyRelicStacks(): RelicStacks {
  return { shield: 0, skull: 0, sword: 0 };
}

function createEmptyLaneRelicEffect(): LaneRelicEffects {
  return {
    player1: { shielded: false, swordBonus: false },
    player2: { shielded: false, swordBonus: false },
  };
}

export function createEmptyLaneRelicEffects(): Record<LaneId, LaneRelicEffects> {
  return {
    left: createEmptyLaneRelicEffect(),
    middle: createEmptyLaneRelicEffect(),
    right: createEmptyLaneRelicEffect(),
  };
}

function createEmptyLane(id: LaneId): Lane {
  return { id, player1: { cards: [] }, player2: { cards: [] } };
}

export function createEmptyLanes(): Lane[] {
  return LANE_IDS.map(createEmptyLane);
}

export function clearMinionEffectsFromCards(cards: Card[]): Card[] {
  return cards.map(({ minionEffect, ...card }) => card);
}

function createInitialPlayerState(): PlayerState {
  return {
    hp: STARTING_HP,
    hand: [],
    relicsAvailable: createInactiveRelics(),
    relicStacks: createEmptyRelicStacks(),
    minionAvailable: false,
    minionStacks: 0,
    lastEndTurnDrawCardIds: [],
    // v2 Ability System
    bloodDebtStacks: 0,
    bleedStacks: [],
    // v3 Hearts Regen System
    regenStacks: [],                 // TEMP regen instances only
    regenEffectBonus: 0,             // legacy, unused
    regenEffectBonusTurnsRemaining: 0, // legacy, unused
    regenPermanent: 0,               // baseline, set to 1 when player picks hearts
    pendingAceDamageToRegen: false,
    diamondCharges: 0,
    chargePower: 0
  };
}

export function initializeNewGame(): GameState {
  const { player1Deck, player2Deck, communityDeck } = partitionDeck(createDeck());
  return {
    phase: 'ModeSelection',
    gameMode: 'vs-ai', // Default, will be set by player
    player1: createInitialPlayerState(),
    player2: createInitialPlayerState(),
    lanes: createEmptyLanes(),
    player1Deck,
    player2Deck,
    communityDeck,
    outOfPlayPile: [],
    currentPlayer: 1,
    roundStartingPlayer: 1,
    roundNumber: 1,
    player1FinalTurnDone: false,
    player2FinalTurnDone: false,
    cardsPlayedThisTurn: 0,
    winner: null,
    player1Suit: null,
    player2Suit: null,
    flipResult: null,
    fieldControlSuit: null,
    // v7 Cycling Lane Flow - community slots empty until War Flip + initial deal
    laneCommunityCards: { left: null, middle: null, right: null },
    allLaneCommunityCard: null,
    pendingRoundEndLanes: [],
    laneRelicEffects: createEmptyLaneRelicEffects(),
    // Support ability tracking
    player1LanesLost: 0,
    player2LanesLost: 0,
    player1SupportAvailable: false,
    player2SupportAvailable: false,
    // Online multiplayer
    localPlayer: null,
    isHost: false,
    roomCode: null,
    onlineMatchId: null,
    onlineSessionToken: null,
    onlineLastSequence: 0,
    onlineConnectionStatus: 'offline',
    // Lane resolution animation
    lastLaneResolution: null,
    // v2 Ability System
    neutralizedLanes: { left: false, middle: false, right: false },
    pendingEffectChoices: [],
    overkillThisTurn: 0
  };
}

export function startNewRound(prevState: GameState): GameState {
  // v8 Split Deck Round Flow: hands carry across rounds. Everything else (both
  // personal decks, the community pile, and the out-of-play discard) is pooled,
  // reshuffled, and re-partitioned into two fresh EQUAL personal decks plus a
  // new neutral community pile. Lanes + community slots reset.
  const pool = clearMinionEffectsFromCards([
    ...prevState.player1Deck,
    ...prevState.player2Deck,
    ...prevState.communityDeck,
    ...prevState.outOfPlayPile,
  ]);
  const { player1Deck: newPlayer1Deck, player2Deck: newPlayer2Deck, communityDeck: newCommunityDeck } =
    partitionDeck(pool);

  // Preserve v2 persistent state and hand; reset per-round temp flags are kept as-is
  // (bleed/regen stacks persist - handled elsewhere).
  const player1NewRound: PlayerState = {
    ...prevState.player1,
    hp: prevState.player1.hp,
    hand: clearMinionEffectsFromCards(prevState.player1.hand), // preserved across rounds
    relicsAvailable: prevState.player1.relicsAvailable,
    relicStacks: prevState.player1.relicStacks,
    minionAvailable: prevState.player1.minionAvailable,
    minionStacks: prevState.player1.minionStacks,
    lastEndTurnDrawCardIds: [],
  };

  const player2NewRound: PlayerState = {
    ...prevState.player2,
    hp: prevState.player2.hp,
    hand: clearMinionEffectsFromCards(prevState.player2.hand), // preserved across rounds
    relicsAvailable: prevState.player2.relicsAvailable,
    relicStacks: prevState.player2.relicStacks,
    minionAvailable: prevState.player2.minionAvailable,
    minionStacks: prevState.player2.minionStacks,
    lastEndTurnDrawCardIds: [],
  };

  return {
    phase: 'InitialFlip',
    gameMode: prevState.gameMode, // Preserve game mode across rounds
    player1: player1NewRound,
    player2: player2NewRound,
    lanes: createEmptyLanes(),
    player1Deck: newPlayer1Deck,
    player2Deck: newPlayer2Deck,
    communityDeck: newCommunityDeck,
    outOfPlayPile: [],
    currentPlayer: 1,
    roundStartingPlayer: prevState.roundStartingPlayer,
    roundNumber: prevState.roundNumber + 1,
    player1FinalTurnDone: false,
    player2FinalTurnDone: false,
    cardsPlayedThisTurn: 0,
    winner: null,
    player1Suit: prevState.player1Suit,
    player2Suit: prevState.player2Suit,
    flipResult: null,
    fieldControlSuit: null, // Reset for new flip
    // v7: community slots reset; will be dealt after the next War Flip
    laneCommunityCards: { left: null, middle: null, right: null },
    allLaneCommunityCard: null,
    pendingRoundEndLanes: [],
    laneRelicEffects: createEmptyLaneRelicEffects(),
    // Support ability persists across rounds
    player1LanesLost: prevState.player1LanesLost,
    player2LanesLost: prevState.player2LanesLost,
    player1SupportAvailable: prevState.player1SupportAvailable,
    player2SupportAvailable: prevState.player2SupportAvailable,
    // Online multiplayer - preserve across rounds
    localPlayer: prevState.localPlayer,
    isHost: prevState.isHost,
    roomCode: prevState.roomCode,
    onlineMatchId: prevState.onlineMatchId,
    onlineSessionToken: prevState.onlineSessionToken,
    onlineLastSequence: prevState.onlineLastSequence,
    onlineConnectionStatus: prevState.onlineConnectionStatus,
    // Lane resolution animation - clear for new round
    lastLaneResolution: null,
    // v2 Ability System - reset lane neutralization, clear choices
    neutralizedLanes: { left: false, middle: false, right: false },
    pendingEffectChoices: [],
    overkillThisTurn: 0
  };
}

/**
 * v8 Split deck: draw up to `count` cards from the top of the specified
 * player's OWN deck into their hand. Because each player draws only from their
 * own equal-sized deck, both players always draw the same number of cards over
 * a round. Returns a new GameState.
 */
export function drawFromPlayerDeck(state: GameState, player: CurrentPlayer, count: number): GameState {
  const deck = player === 1 ? state.player1Deck : state.player2Deck;
  if (count <= 0 || deck.length === 0) return state;
  const cardsToDraw = Math.min(count, deck.length);
  const drawn = deck.slice(0, cardsToDraw);
  const remaining = deck.slice(cardsToDraw);
  const targetHand = player === 1 ? state.player1.hand : state.player2.hand;
  const newHand = [...targetHand, ...drawn];
  if (player === 1) {
    return { ...state, player1Deck: remaining, player1: { ...state.player1, hand: newHand } };
  }
  return { ...state, player2Deck: remaining, player2: { ...state.player2, hand: newHand } };
}

export function applyDamage(player: PlayerState, damage: number): PlayerState {
  return { ...player, hp: player.hp - damage };
}

export function findLane(lanes: Lane[], laneId: LaneId): Lane | undefined {
  return lanes.find(lane => lane.id === laneId);
}

export function updateLane(lanes: Lane[], updatedLane: Lane): Lane[] {
  return lanes.map(lane => lane.id === updatedLane.id ? updatedLane : lane);
}

export function isLaneReadyToResolve(lane: Lane): boolean {
  return lane.player1.cards.length === 3 && lane.player2.cards.length === 3;
}

/**
 * v3 Hearts: ensure a player who has chosen hearts has at least 1 permanent regen.
 * Call after the player's suit field has been set.
 */
export function applyHeartsStartingRegen(state: GameState): GameState {
  // Master feature flag: suit effects disabled -> don't seed Hearts regen.
  if (!SUIT_EFFECTS_ENABLED) return state;
  let next = state;
  if (next.player1Suit === 'hearts' && next.player1.regenPermanent < 1) {
    next = { ...next, player1: { ...next.player1, regenPermanent: 1 } };
  }
  if (next.player2Suit === 'hearts' && next.player2.regenPermanent < 1) {
    next = { ...next, player2: { ...next.player2, regenPermanent: 1 } };
  }
  return next;
}
