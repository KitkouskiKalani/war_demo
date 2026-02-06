/**
 * Game State Initialization Helpers
 */

import type { Card, GameState, Lane, LaneId, PlayerState } from './types';
import { createDeck, shuffle } from './deck';

const STARTING_HP = 100;
const CARDS_PER_PLAYER = 28;
const LANE_IDS: LaneId[] = ['left', 'middle', 'right'];

function createEmptyLane(id: LaneId): Lane {
  return { id, player1: { cards: [] }, player2: { cards: [] } };
}

export function createEmptyLanes(): Lane[] {
  return LANE_IDS.map(createEmptyLane);
}

function createInitialPlayerState(deck: Card[]): PlayerState {
  return {
    hp: STARTING_HP,
    deck,
    hand: [],
    // v2 Ability System
    bloodDebtStacks: 0,
    bleedStacks: [],
    // v2.2 Hearts Regen System (instance-based, like bleed)
    regenStacks: [],
    regenEffectBonus: 0,
    regenEffectBonusTurnsRemaining: 0,
    diamondCharges: 0,
    chargePower: 0
  };
}

export function initializeNewGame(): GameState {
  const deck = shuffle(createDeck());
  return {
    phase: 'ModeSelection',
    gameMode: 'vs-ai', // Default, will be set by player
    player1: createInitialPlayerState(deck.slice(0, CARDS_PER_PLAYER)),
    player2: createInitialPlayerState(deck.slice(CARDS_PER_PLAYER, CARDS_PER_PLAYER * 2)),
    lanes: createEmptyLanes(),
    discardPile: [],
    currentPlayer: 1,
    roundNumber: 1,
    player1FinalTurnDone: false,
    player2FinalTurnDone: false,
    cardsPlayedThisTurn: 0,
    winner: null,
    player1Suit: null,
    player2Suit: null,
    flipResult: null,
    fieldControlSuit: null,
    pendingResolutionLanes: [],
    // Support ability tracking
    player1LanesLost: 0,
    player2LanesLost: 0,
    player1SupportAvailable: false,
    player2SupportAvailable: false,
    // Online multiplayer
    localPlayer: null,
    isHost: false,
    roomCode: null,
    // Lane resolution animation
    lastLaneResolution: null,
    // v2 Ability System
    neutralizedLanes: { left: false, middle: false, right: false },
    pendingEffectChoices: [],
    overkillThisTurn: 0,
    laneDelayedUntilTurn: { left: false, middle: false, right: false }
  };
}

export function startNewRound(prevState: GameState): GameState {
  const allCards = collectAllCards(prevState);
  const shuffledDeck = shuffle(allCards);
  
  // Preserve v2 persistent state, clear temporary state
  const player1NewRound: PlayerState = {
    hp: prevState.player1.hp,
    deck: shuffledDeck.slice(0, CARDS_PER_PLAYER),
    hand: [],
    // Persistent v2 state - all persist across rounds
    bloodDebtStacks: prevState.player1.bloodDebtStacks,
    bleedStacks: prevState.player1.bleedStacks,
    regenStacks: prevState.player1.regenStacks,  // Array of RegenStack instances
    regenEffectBonus: prevState.player1.regenEffectBonus,
    regenEffectBonusTurnsRemaining: prevState.player1.regenEffectBonusTurnsRemaining,
    diamondCharges: prevState.player1.diamondCharges,
    chargePower: prevState.player1.chargePower
  };
  
  const player2NewRound: PlayerState = {
    hp: prevState.player2.hp,
    deck: shuffledDeck.slice(CARDS_PER_PLAYER, CARDS_PER_PLAYER * 2),
    hand: [],
    // Persistent v2 state - all persist across rounds
    bloodDebtStacks: prevState.player2.bloodDebtStacks,
    bleedStacks: prevState.player2.bleedStacks,
    regenStacks: prevState.player2.regenStacks,  // Array of RegenStack instances
    regenEffectBonus: prevState.player2.regenEffectBonus,
    regenEffectBonusTurnsRemaining: prevState.player2.regenEffectBonusTurnsRemaining,
    diamondCharges: prevState.player2.diamondCharges,
    chargePower: prevState.player2.chargePower
  };
  
  return {
    phase: 'InitialFlip',
    gameMode: prevState.gameMode, // Preserve game mode across rounds
    player1: player1NewRound,
    player2: player2NewRound,
    lanes: createEmptyLanes(),
    discardPile: [],
    currentPlayer: 1,
    roundNumber: prevState.roundNumber + 1,
    player1FinalTurnDone: false,
    player2FinalTurnDone: false,
    cardsPlayedThisTurn: 0,
    winner: null,
    player1Suit: prevState.player1Suit,
    player2Suit: prevState.player2Suit,
    flipResult: null,
    fieldControlSuit: null, // Reset for new flip
    pendingResolutionLanes: [],
    // Support ability persists across rounds
    player1LanesLost: prevState.player1LanesLost,
    player2LanesLost: prevState.player2LanesLost,
    player1SupportAvailable: prevState.player1SupportAvailable,
    player2SupportAvailable: prevState.player2SupportAvailable,
    // Online multiplayer - preserve across rounds
    localPlayer: prevState.localPlayer,
    isHost: prevState.isHost,
    roomCode: prevState.roomCode,
    // Lane resolution animation - clear for new round
    lastLaneResolution: null,
    // v2 Ability System - reset lane neutralization, clear choices
    neutralizedLanes: { left: false, middle: false, right: false },
    pendingEffectChoices: [],
    overkillThisTurn: 0,
    laneDelayedUntilTurn: { left: false, middle: false, right: false }
  };
}

function collectAllCards(state: GameState): Card[] {
  const allCards: Card[] = [
    ...state.player1.deck, ...state.player1.hand,
    ...state.player2.deck, ...state.player2.hand,
    ...state.discardPile,
  ];
  for (const lane of state.lanes) {
    allCards.push(...lane.player1.cards, ...lane.player2.cards);
  }
  return allCards;
}

export function drawCards(player: PlayerState, count: number): PlayerState {
  const cardsToDraw = Math.min(count, player.deck.length);
  return {
    ...player,
    deck: player.deck.slice(cardsToDraw),
    hand: [...player.hand, ...player.deck.slice(0, cardsToDraw)],
  };
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


