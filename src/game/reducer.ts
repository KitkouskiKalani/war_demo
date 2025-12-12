/**
 * Game Reducer
 */

import type { Card, CurrentPlayer, FlipResult, GameState, Lane, LaneId, PendingLaneResolution, PlayerState, StandardSuit } from './types';
import { cardValue, createDeck, findCardById, removeCardById, shuffle } from './deck';
import { calculateLaneTotal } from './poker';
import { applyDamage, createEmptyLanes, drawCards, findLane, initializeNewGame, isLaneReadyToResolve, startNewRound, updateLane } from './state';
import { applySuitEffectsToLaneDamage, calculateLaneSuitEffects } from './suitEffects';

export type GameAction =
  | { type: 'START_NEW_GAME' }
  | { type: 'SELECT_SUIT'; suit: StandardSuit }
  | { type: 'INITIAL_FLIP_STEP' }
  | { type: 'CONTINUE_FROM_FLIP' }
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

const ALL_SUITS: StandardSuit[] = ['hearts', 'diamonds', 'clubs', 'spades'];

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'START_NEW_GAME': return initializeNewGame();
    case 'SELECT_SUIT': return handleSelectSuit(state, action.suit);
    case 'INITIAL_FLIP_STEP': return handleInitialFlipStep(state);
    case 'CONTINUE_FROM_FLIP': return handleContinueFromFlip(state);
    case 'PLAY_CARD_TO_LANE': return handlePlayCardToLane(state, action.cardId, action.laneId);
    case 'DISCARD_CARD': return handleDiscardCard(state, action.cardId);
    case 'END_TURN': return handleEndTurn(state);
    case 'RESOLVE_LANE': return resolveLane(state, action.laneId);
    case 'RESOLVE_END_OF_ROUND': return handleResolveEndOfRound(state);
    case 'SUDDEN_DEATH_STEP': return handleSuddenDeathStep(state);
    default: return state;
  }
}

function handleSelectSuit(state: GameState, playerSuit: StandardSuit): GameState {
  if (state.phase !== 'SuitSelection') return state;
  
  // AI gets a random suit (excluding player's choice)
  const availableSuits = ALL_SUITS.filter(s => s !== playerSuit);
  const aiSuit = availableSuits[Math.floor(Math.random() * availableSuits.length)];
  
  return {
    ...state,
    phase: 'InitialFlip',
    player1Suit: playerSuit,
    player2Suit: aiSuit,
  };
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

  let player1Deck = [...state.player1.deck];
  let player2Deck = [...state.player2.deck];
  let player1Card: Card | null = null;
  let player2Card: Card | null = null;
  let winner: CurrentPlayer | null = null;
  let damageToDeal = 0;

  // Keep flipping until we have a winner (handles ties)
  while (winner === null && player1Deck.length > 0 && player2Deck.length > 0) {
    player1Card = player1Deck[0];
    player2Card = player2Deck[0];
    player1Deck = player1Deck.slice(1);
    player2Deck = player2Deck.slice(1);

    const value1 = cardValue(player1Card);
    const value2 = cardValue(player2Card);

    if (value1 > value2) { winner = 1; damageToDeal = value1 - value2; }
    else if (value2 > value1) { winner = 2; damageToDeal = value2 - value1; }
  }

  if (winner === null) winner = 1;
  if (!player1Card || !player2Card) return state;

  const flipResult: FlipResult = {
    player1Card,
    player2Card,
    winner,
    damage: damageToDeal,
  };

  // Update decks (cards removed) and store flip result, transition to result phase
  return { 
    ...state, 
    phase: 'InitialFlipResult',
    player1: { ...state.player1, deck: player1Deck },
    player2: { ...state.player2, deck: player2Deck },
    flipResult,
  };
}

function handleContinueFromFlip(state: GameState): GameState {
  if (state.phase !== 'InitialFlipResult' || !state.flipResult) return state;

  const { player1Card, player2Card, winner, damage } = state.flipResult;
  
  let player1 = { ...state.player1 };
  let player2 = { ...state.player2 };

  // Apply damage to loser
  if (winner === 1) {
    player2 = applyDamage(player2, damage);
  } else {
    player1 = applyDamage(player1, damage);
  }

  // Add flipped cards to discard
  const discardPile = [...state.discardPile, player1Card, player2Card];

  // Set field control to winner's suit
  const fieldControlSuit = winner === 1 ? state.player1Suit : state.player2Suit;

  // Check if someone died from the initial flip
  const stateAfterDamage: GameState = {
    ...state,
    player1,
    player2,
    discardPile,
    flipResult: null,
    fieldControlSuit,
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
    discardPile, 
    currentPlayer: winner, 
    cardsPlayedThisTurn: 0,
    flipResult: null,
    fieldControlSuit,
    pendingResolutionLanes: [],
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
  const opponentSide = state.currentPlayer === 1 ? lane.player2 : lane.player1;
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

  // Check if this play fills the current player's side of the lane (3 cards)
  const laneAfterPlay = findLane(newState.lanes, laneId)!;
  const newPlayerSide = state.currentPlayer === 1 ? laneAfterPlay.player1 : laneAfterPlay.player2;
  const newOpponentSide = state.currentPlayer === 1 ? laneAfterPlay.player2 : laneAfterPlay.player1;

  if (newPlayerSide.cards.length === MAX_CARDS_PER_LANE) {
    // Current player just filled their side of the lane
    if (newOpponentSide.cards.length === MAX_CARDS_PER_LANE) {
      // Both sides full - resolve immediately
      newState = resolveLane(newState, laneId);
      
      // Remove from pending if it was there
      newState = {
        ...newState,
        pendingResolutionLanes: newState.pendingResolutionLanes.filter(p => p.laneId !== laneId),
      };
      
      // Check if someone died from lane resolution
      const gameOver = checkGameOver(newState);
      if (gameOver) {
        return gameOver;
      }
    } else {
      // Only current player has filled - add to pending (opponent gets one turn to respond)
      // But first check if this lane was already pending from opponent - if so, resolve now
      const existingPending = newState.pendingResolutionLanes.find(p => p.laneId === laneId);
      if (existingPending) {
        // This shouldn't happen normally, but handle it
        newState = resolveLane(newState, laneId);
        newState = {
          ...newState,
          pendingResolutionLanes: newState.pendingResolutionLanes.filter(p => p.laneId !== laneId),
        };
        const gameOver = checkGameOver(newState);
        if (gameOver) {
          return gameOver;
        }
      } else {
        // Add to pending with 2 turns until resolution
        const newPending: PendingLaneResolution = {
          laneId,
          filledByPlayer: state.currentPlayer,
          turnsUntilResolution: 2, // Opponent gets 2 turns to respond
        };
        newState = {
          ...newState,
          pendingResolutionLanes: [...newState.pendingResolutionLanes, newPending],
        };
      }
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

/**
 * Process pending lanes at the start of a player's turn.
 * Decrements countdown for lanes filled by this player and resolves when countdown reaches 0.
 */
function processPendingLanesForPlayer(state: GameState, player: CurrentPlayer): GameState {
  let newState = { ...state };
  const playerPendingLanes = newState.pendingResolutionLanes.filter(p => p.filledByPlayer === player);
  const otherPendingLanes = newState.pendingResolutionLanes.filter(p => p.filledByPlayer !== player);
  
  const lanesToResolve: PendingLaneResolution[] = [];
  const lanesToKeep: PendingLaneResolution[] = [];
  
  for (const pending of playerPendingLanes) {
    const newTurns = pending.turnsUntilResolution - 1;
    if (newTurns <= 0) {
      // Time's up - resolve this lane
      lanesToResolve.push(pending);
    } else {
      // Decrement counter, keep pending
      lanesToKeep.push({
        ...pending,
        turnsUntilResolution: newTurns,
      });
    }
  }
  
  // Resolve lanes that hit 0
  for (const pending of lanesToResolve) {
    newState = resolveLane(newState, pending.laneId);
    
    // Check if someone died
    const gameOver = checkGameOver(newState);
    if (gameOver) {
      return gameOver;
    }
  }
  
  // Update pending lanes list
  newState = {
    ...newState,
    pendingResolutionLanes: [...otherPendingLanes, ...lanesToKeep],
  };
  
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
    return { 
      ...state, 
      phase: 'EndOfRoundResolving', 
      player1, 
      player2, 
      discardPile, 
      player1FinalTurnDone, 
      player2FinalTurnDone, 
      cardsPlayedThisTurn: 0,
      pendingResolutionLanes: [], // Clear pending - all will resolve at end of round
    };
  }

  // Switch to next player
  const nextPlayer: CurrentPlayer = currentPlayer === 1 ? 2 : 1;
  
  let newState: GameState = { 
    ...state, 
    player1, 
    player2, 
    discardPile, 
    currentPlayer: nextPlayer, 
    player1FinalTurnDone, 
    player2FinalTurnDone, 
    cardsPlayedThisTurn: 0 
  };

  // At the start of the next player's turn, process pending lanes they filled
  // (decrement countdown, resolve if countdown reaches 0)
  newState = processPendingLanesForPlayer(newState, nextPlayer);
  
  // Check if game ended from resolution
  if (newState.phase === 'Finished' || newState.phase === 'SuddenDeath') {
    return newState;
  }

  return newState;
}

function resolveLane(state: GameState, laneId: LaneId): GameState {
  const lane = findLane(state.lanes, laneId);
  if (!lane) return state;

  // Calculate base lane totals (card values + poker bonuses)
  const p1Total = calculateLaneTotal(lane.player1.cards);
  const p2Total = calculateLaneTotal(lane.player2.cards);

  // Calculate suit effects for each player's active cards
  const p1Effects = calculateLaneSuitEffects(lane.player1.cards, state.player1Suit);
  const p2Effects = calculateLaneSuitEffects(lane.player2.cards, state.player2Suit);

  let player1 = { ...state.player1 };
  let player2 = { ...state.player2 };

  if (p1Total > p2Total) {
    // Player 1 wins this lane
    const baseDamage = p1Total - p2Total;
    const { finalDamage, healingOverflow } = applySuitEffectsToLaneDamage(
      baseDamage,
      p1Effects.totalDamage,  // Winner's damage bonus
      p2Effects.totalHealing  // Loser's healing mitigation
    );
    
    // Apply damage to player 2
    if (finalDamage > 0) {
      player2 = applyDamage(player2, finalDamage);
    }
    // Apply overflow healing to player 2 (they mitigated more than the damage)
    if (healingOverflow > 0) {
      player2 = { ...player2, hp: player2.hp + healingOverflow };
    }
  } else if (p2Total > p1Total) {
    // Player 2 wins this lane
    const baseDamage = p2Total - p1Total;
    const { finalDamage, healingOverflow } = applySuitEffectsToLaneDamage(
      baseDamage,
      p2Effects.totalDamage,  // Winner's damage bonus
      p1Effects.totalHealing  // Loser's healing mitigation
    );
    
    // Apply damage to player 1
    if (finalDamage > 0) {
      player1 = applyDamage(player1, finalDamage);
    }
    // Apply overflow healing to player 1 (they mitigated more than the damage)
    if (healingOverflow > 0) {
      player1 = { ...player1, hp: player1.hp + healingOverflow };
    }
  }
  // If tied, no damage is dealt

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
