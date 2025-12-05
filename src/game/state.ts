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

export function initializeNewGame(): GameState {
  const deck = shuffle(createDeck());
  return {
    phase: 'InitialFlip',
    player1: { hp: STARTING_HP, deck: deck.slice(0, CARDS_PER_PLAYER), hand: [] },
    player2: { hp: STARTING_HP, deck: deck.slice(CARDS_PER_PLAYER, CARDS_PER_PLAYER * 2), hand: [] },
    lanes: createEmptyLanes(),
    discardPile: [],
    currentPlayer: 1,
    roundNumber: 1,
    player1FinalTurnDone: false,
    player2FinalTurnDone: false,
    cardsPlayedThisTurn: 0,
    winner: null,
  };
}

export function startNewRound(prevState: GameState): GameState {
  const allCards = collectAllCards(prevState);
  const shuffledDeck = shuffle(allCards);
  return {
    phase: 'InitialFlip',
    player1: { hp: prevState.player1.hp, deck: shuffledDeck.slice(0, CARDS_PER_PLAYER), hand: [] },
    player2: { hp: prevState.player2.hp, deck: shuffledDeck.slice(CARDS_PER_PLAYER, CARDS_PER_PLAYER * 2), hand: [] },
    lanes: createEmptyLanes(),
    discardPile: [],
    currentPlayer: 1,
    roundNumber: prevState.roundNumber + 1,
    player1FinalTurnDone: false,
    player2FinalTurnDone: false,
    cardsPlayedThisTurn: 0,
    winner: null,
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


