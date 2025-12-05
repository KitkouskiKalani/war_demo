/**
 * Game Reducer
 */

import type { Card, CurrentPlayer, GameState, Lane, LaneId, PlayerState } from './types';
import { cardValue, createDeck, findCardById, removeCardById, shuffle } from './deck';
import { calculateLaneTotal } from './poker';
import { applyDamage, createEmptyLanes, drawCards, findLane, initializeNewGame, isLaneReadyToResolve, startNewRound, updateLane } from './state';

export type GameAction =
  | { type: 'START_NEW_GAME' }
  | { type: 'INITIAL_FLIP_STEP' }
  | { type: 'PLAY_CARD_TO_LANE'; cardId: string; laneId: LaneId }
  | { type: 'DISCARD_CARD'; cardId: string }
  | { type: 'END_TURN' }
  | { type: 'RESOLVE_LANE'; laneId: LaneId }
  | { type: 'RESOLVE_END_OF_ROUND' }
  | { type: 'SUDDEN_DEATH_STEP' };

const INITIAL_HAND_SIZE = 5;
const CARDS_TO_DRAW = 3;
const CARDS_PER_TURN = 3;
const MAX_CARDS_PER_LANE = 3;

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'START_NEW_GAME': return initializeNewGame();
    case 'INITIAL_FLIP_STEP': return handleInitialFlipStep(state);
    case 'PLAY_CARD_TO_LANE': return handlePlayCardToLane(state, action.cardId, action.laneId);
    case 'DISCARD_CARD': return handleDiscardCard(state, action.cardId);
    case 'END_TURN': return handleEndTurn(state);
    case 'RESOLVE_LANE': return resolveLane(state, action.laneId);
    case 'RESOLVE_END_OF_ROUND': return handleResolveEndOfRound(state);
    case 'SUDDEN_DEATH_STEP': return handleSuddenDeathStep(state);
    default: return state;
  }
}

/**
 * Check if the game should end due to HP.
 * Returns the updated state with phase='Finished' and winner set, or null if game continues.
 */
function checkGameOver(state: GameState): GameState | null {
  const hp1 = state.player1.hp;
  const hp2 = state.player2.hp;

  if (hp1 <= 0 || hp2 <= 0) {
    // At least one player is dead
    if (hp1 <= 0 && hp2 > 0) {
      return { ...state, phase: 'Finished', winner: 2 };
    }
    if (hp2 <= 0 && hp1 > 0) {
      return { ...state, phase: 'Finished', winner: 1 };
    }
    // Both dead - higher HP (less negative) wins
    if (hp1 > hp2) {
      return { ...state, phase: 'Finished', winner: 1 };
    }
    if (hp2 > hp1) {
      return { ...state, phase: 'Finished', winner: 2 };
    }
    // Exactly equal - sudden death
    return { ...state, phase: 'SuddenDeath' };
  }

  return null; // Game continues
}

function handleInitialFlipStep(state: GameState): GameState {
  if (state.phase !== 'InitialFlip') return state;

  let player1 = { ...state.player1, deck: [...state.player1.deck] };
  let player2 = { ...state.player2, deck: [...state.player2.deck] };
  const flippedCards: Card[] = [];
  let winner: CurrentPlayer | null = null;
  let damageToDeal = 0;

  while (winner === null && player1.deck.length > 0 && player2.deck.length > 0) {
    const card1 = player1.deck[0];
    const card2 = player2.deck[0];
    player1.deck = player1.deck.slice(1);
    player2.deck = player2.deck.slice(1);
    flippedCards.push(card1, card2);

    const value1 = cardValue(card1);
    const value2 = cardValue(card2);

    if (value1 > value2) { winner = 1; damageToDeal = value1 - value2; }
    else if (value2 > value1) { winner = 2; damageToDeal = value2 - value1; }
  }

  if (winner === null) winner = 1;
  if (winner === 1) player2 = applyDamage(player2, damageToDeal);
  else player1 = applyDamage(player1, damageToDeal);

  // Check if someone died from the initial flip
  const stateAfterDamage: GameState = {
    ...state,
    player1,
    player2,
    discardPile: [...state.discardPile, ...flippedCards],
  };

  const gameOver = checkGameOver(stateAfterDamage);
  if (gameOver) {
    return gameOver;
  }

  // Game continues - draw cards and start main phase
  player1 = drawCards(player1, INITIAL_HAND_SIZE);
  player2 = drawCards(player2, INITIAL_HAND_SIZE);

  return { 
    ...state, 
    phase: 'Main', 
    player1, 
    player2, 
    discardPile: [...state.discardPile, ...flippedCards], 
    currentPlayer: winner, 
    cardsPlayedThisTurn: 0 
  };
}

function handlePlayCardToLane(state: GameState, cardId: string, laneId: LaneId): GameState {
  if (state.phase !== 'Main') return state;

  const currentPlayerState = state.currentPlayer === 1 ? state.player1 : state.player2;
  const card = findCardById(currentPlayerState.hand, cardId);
  if (!card) return state;

  const lane = findLane(state.lanes, laneId);
  if (!lane) return state;

  const playerSide = state.currentPlayer === 1 ? lane.player1 : lane.player2;
  if (playerSide.cards.length >= MAX_CARDS_PER_LANE) return state;

  if (playerSide.cards.length > 0) {
    const lastCard = playerSide.cards[playerSide.cards.length - 1];
    if (cardValue(card) < cardValue(lastCard)) return state;
  }

  const newHand = removeCardById(currentPlayerState.hand, cardId);
  const updatedPlayerSide = { cards: [...playerSide.cards, card] };
  const updatedLane: Lane = {
    ...lane,
    player1: state.currentPlayer === 1 ? updatedPlayerSide : lane.player1,
    player2: state.currentPlayer === 2 ? updatedPlayerSide : lane.player2,
  };

  const updatedPlayerState: PlayerState = { ...currentPlayerState, hand: newHand };
  let newState: GameState = {
    ...state,
    player1: state.currentPlayer === 1 ? updatedPlayerState : state.player1,
    player2: state.currentPlayer === 2 ? updatedPlayerState : state.player2,
    lanes: updateLane(state.lanes, updatedLane),
    cardsPlayedThisTurn: state.cardsPlayedThisTurn + 1,
  };

  // Check if lane is ready to resolve (both sides have 3 cards)
  const laneAfterPlay = findLane(newState.lanes, laneId)!;
  if (isLaneReadyToResolve(laneAfterPlay)) {
    newState = resolveLane(newState, laneId);
    
    // Check if someone died from lane resolution
    const gameOver = checkGameOver(newState);
    if (gameOver) {
      return gameOver;
    }
  }

  return newState;
}

function handleDiscardCard(state: GameState, cardId: string): GameState {
  if (state.phase !== 'Main') return state;

  const currentPlayerState = state.currentPlayer === 1 ? state.player1 : state.player2;
  const card = findCardById(currentPlayerState.hand, cardId);
  if (!card) return state;

  const newHand = removeCardById(currentPlayerState.hand, cardId);
  const damage = cardValue(card);
  const updatedPlayerState = applyDamage({ ...currentPlayerState, hand: newHand }, damage);

  const newState: GameState = {
    ...state,
    player1: state.currentPlayer === 1 ? updatedPlayerState : state.player1,
    player2: state.currentPlayer === 2 ? updatedPlayerState : state.player2,
    discardPile: [...state.discardPile, card],
    cardsPlayedThisTurn: state.cardsPlayedThisTurn + 1,
  };

  // Check if player killed themselves by discarding
  const gameOver = checkGameOver(newState);
  if (gameOver) {
    return gameOver;
  }

  return newState;
}

function handleEndTurn(state: GameState): GameState {
  if (state.phase !== 'Main' || state.cardsPlayedThisTurn < CARDS_PER_TURN) return state;

  let player1 = { ...state.player1 };
  let player2 = { ...state.player2 };
  let player1FinalTurnDone = state.player1FinalTurnDone;
  let player2FinalTurnDone = state.player2FinalTurnDone;
  let discardPile = [...state.discardPile];

  const currentPlayer = state.currentPlayer;
  const playerState = currentPlayer === 1 ? player1 : player2;

  if (playerState.deck.length >= CARDS_TO_DRAW) {
    const updated = drawCards(playerState, CARDS_TO_DRAW);
    if (currentPlayer === 1) player1 = updated; else player2 = updated;
  } else if (playerState.deck.length > 0) {
    discardPile = [...discardPile, ...playerState.deck];
    const updated = { ...playerState, deck: [] as Card[] };
    if (currentPlayer === 1) { player1 = updated; player1FinalTurnDone = true; }
    else { player2 = updated; player2FinalTurnDone = true; }
  } else {
    if (currentPlayer === 1) player1FinalTurnDone = true;
    else player2FinalTurnDone = true;
  }

  if (player1FinalTurnDone && player2FinalTurnDone) {
    return { ...state, phase: 'EndOfRoundResolving', player1, player2, discardPile, player1FinalTurnDone, player2FinalTurnDone, cardsPlayedThisTurn: 0 };
  }

  return { ...state, player1, player2, discardPile, currentPlayer: currentPlayer === 1 ? 2 : 1, player1FinalTurnDone, player2FinalTurnDone, cardsPlayedThisTurn: 0 };
}

function resolveLane(state: GameState, laneId: LaneId): GameState {
  const lane = findLane(state.lanes, laneId);
  if (!lane) return state;

  const p1Total = calculateLaneTotal(lane.player1.cards);
  const p2Total = calculateLaneTotal(lane.player2.cards);

  let player1 = { ...state.player1 };
  let player2 = { ...state.player2 };

  if (p1Total > p2Total) player2 = applyDamage(player2, p1Total - p2Total);
  else if (p2Total > p1Total) player1 = applyDamage(player1, p2Total - p1Total);

  const laneCards = [...lane.player1.cards, ...lane.player2.cards];
  const clearedLane: Lane = { ...lane, player1: { cards: [] }, player2: { cards: [] } };

  return { ...state, player1, player2, lanes: updateLane(state.lanes, clearedLane), discardPile: [...state.discardPile, ...laneCards] };
}

function handleResolveEndOfRound(state: GameState): GameState {
  if (state.phase !== 'EndOfRoundResolving') return state;

  let newState = { ...state };
  for (const lane of newState.lanes) {
    if (lane.player1.cards.length > 0 || lane.player2.cards.length > 0) {
      newState = resolveLane(newState, lane.id);
    }
  }

  // Check for game over
  const gameOver = checkGameOver(newState);
  if (gameOver) {
    return gameOver;
  }

  // Both players alive - check for HP tie (sudden death)
  if (newState.player1.hp === newState.player2.hp) {
    return { ...newState, phase: 'SuddenDeath' };
  }

  // Continue to next round
  return startNewRound(newState);
}

function handleSuddenDeathStep(state: GameState): GameState {
  if (state.phase !== 'SuddenDeath') return state;

  const allCards = shuffle(createDeck());
  let index = 0;
  let winner: CurrentPlayer | null = null;

  while (winner === null && index + 1 < allCards.length) {
    const v1 = cardValue(allCards[index]);
    const v2 = cardValue(allCards[index + 1]);
    index += 2;
    if (v1 > v2) winner = 1;
    else if (v2 > v1) winner = 2;
  }

  return { ...state, phase: 'Finished', winner: winner || 1, lanes: createEmptyLanes(), discardPile: allCards };
}

export function canPlayCardToLane(state: GameState, cardId: string, laneId: LaneId): boolean {
  if (state.phase !== 'Main') return false;
  const currentPlayerState = state.currentPlayer === 1 ? state.player1 : state.player2;
  const card = findCardById(currentPlayerState.hand, cardId);
  if (!card) return false;
  const lane = findLane(state.lanes, laneId);
  if (!lane) return false;
  const playerSide = state.currentPlayer === 1 ? lane.player1 : lane.player2;
  if (playerSide.cards.length >= MAX_CARDS_PER_LANE) return false;
  if (playerSide.cards.length > 0) {
    const lastCard = playerSide.cards[playerSide.cards.length - 1];
    if (cardValue(card) < cardValue(lastCard)) return false;
  }
  return true;
}

export function canEndTurn(state: GameState): boolean {
  return state.phase === 'Main' && state.cardsPlayedThisTurn >= CARDS_PER_TURN;
}
