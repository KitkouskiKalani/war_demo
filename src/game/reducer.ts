/**
 * Game Reducer - v2 Ability System
 */

import type { Card, CurrentPlayer, FlipResult, GameMode, GameState, Lane, LaneId, PendingLaneResolution, PlayerState, StandardSuit, TriggeredEffect } from './types';
import { getRankTier } from './types';
import { cardValue, createDeck, findCardById, isJoker, removeCardById, shuffle } from './deck';
import { calculateBaseSum, evaluateLaneBonus } from './poker';
import { applyDamage, createEmptyLanes, drawCards, findLane, initializeNewGame, startNewRound, updateLane } from './state';
import { 
  isCardActiveForEffects, 
  getEffectDefinition, 
  shouldEffectTrigger, 
  getEffectStrength,
  DAMAGE_SUITS as SUIT_DAMAGE_SUITS
} from './suitEffects';
import {
  handleAceOnPlay,
  handleFaceCardOnPlay,
  executeCardEffect,
  processBleedTicks,
  processRegenTicks,
  clearLaneNeutralization,
  handleClubsKing,
  applyClubsReplacement,
  applyClubsQueenDelay,
  applyLaneNeutralization,
  moveCardBetweenLanes,
  applyDiamondChargeSpend,
  applyDiamondsAceChoice,
  applyHeartsAceChoice,
  applySpadesAceChoice,
  applyClubsAceReplacement,
  type EffectContext
} from './effectHandlers';

export type GameAction =
  | { type: 'START_NEW_GAME' }
  | { type: 'SELECT_MODE'; mode: GameMode }
  | { type: 'SELECT_SUIT'; suit: StandardSuit }
  | { type: 'SELECT_SUIT_P2'; suit: StandardSuit }
  | { type: 'CONFIRM_READY' }  // For pass device screen
  | { type: 'INITIAL_FLIP_STEP' }
  | { type: 'CONTINUE_FROM_FLIP' }
  | { type: 'PLAY_CARD_TO_LANE'; cardId: string; laneId: LaneId; fromNetwork?: boolean }
  | { type: 'DISCARD_CARD'; cardId: string; fromNetwork?: boolean }
  | { type: 'END_TURN'; fromNetwork?: boolean }  // fromNetwork skips validation for remote actions
  | { type: 'RESOLVE_LANE'; laneId: LaneId }
  | { type: 'RESOLVE_END_OF_ROUND' }
  | { type: 'SUDDEN_DEATH_STEP' }
  | { type: 'USE_SUPPORT'; player: CurrentPlayer }
  // Online multiplayer actions
  | { type: 'GO_TO_CREATE_ROOM' }
  | { type: 'GO_TO_JOIN_ROOM' }
  | { type: 'SET_ROOM_CODE'; code: string }
  | { type: 'SET_LOCAL_PLAYER'; player: CurrentPlayer }
  | { type: 'PLAYER_CONNECTED' }  // Guest connected to host
  | { type: 'SYNC_STATE'; state: GameState }  // Sync full state (for guest)
  | { type: 'OPPONENT_SUIT_SELECTED'; suit: StandardSuit }  // Online: opponent picked suit
  | { type: 'BOTH_SUITS_SELECTED' }  // Online: both players ready
  // v2 Ability System - Effect choices
  | { type: 'EFFECT_CHOICE_CLUBS_REPLACE'; handCardId: string; replacementRank: 'J' | 'Q' | 'K' }
  | { type: 'EFFECT_CHOICE_CLUBS_MID_REPLACE'; handCardId: string }  // v2.2: Replace hand card with Clubs Ace
  | { type: 'EFFECT_CHOICE_CLUBS_MOVE'; cardId: string; fromLane: LaneId; toLane: LaneId }
  | { type: 'EFFECT_CHOICE_CLUBS_NEUTRALIZE'; laneId: LaneId }
  | { type: 'EFFECT_CHOICE_CLUBS_QUEEN_DELAY'; targetLaneId: LaneId }
  | { type: 'EFFECT_CHOICE_DIAMONDS_ACE'; choice: 'charges' | 'chargePower' }  // v2.2: charges or chargePower
  | { type: 'EFFECT_CHOICE_DIAMONDS_QUEEN'; choice: 'damage' | 'heal' }
  | { type: 'EFFECT_CHOICE_HEARTS_ACE'; choice: 'regen' | 'regenEffect' }  // v2.2: +1 regen or +1 regen effect
  | { type: 'EFFECT_CHOICE_SPADES_ACE'; choice: 'bloodDebt' | 'bleed' }  // v2.2: +5 blood debt or +2 bleed
  | { type: 'SPEND_DIAMOND_CHARGE'; choice: 'damage' | 'heal' }
  | { type: 'DISMISS_EFFECT_CHOICE' };  // Cancel/dismiss current choice

const INITIAL_HAND_SIZE = 5;
const CARDS_TO_DRAW_END_TURN = 2;  // Draw at end of your turn (planning phase)
const CARDS_TO_DRAW_START_TURN = 1; // Draw at start of your turn (reactive element)
const CARDS_PER_TURN = 3;
const MAX_CARDS_PER_LANE = 3;

const ALL_SUITS: StandardSuit[] = ['hearts', 'diamonds', 'clubs', 'spades'];

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'START_NEW_GAME': return initializeNewGame();
    case 'SELECT_MODE': return handleSelectMode(state, action.mode);
    case 'SELECT_SUIT': return handleSelectSuit(state, action.suit);
    case 'SELECT_SUIT_P2': return handleSelectSuitP2(state, action.suit);
    case 'CONFIRM_READY': return handleConfirmReady(state);
    case 'INITIAL_FLIP_STEP': return handleInitialFlipStep(state);
    case 'CONTINUE_FROM_FLIP': return handleContinueFromFlip(state);
    case 'PLAY_CARD_TO_LANE': return handlePlayCardToLane(state, action.cardId, action.laneId, action.fromNetwork);
    case 'DISCARD_CARD': return handleDiscardCard(state, action.cardId, action.fromNetwork);
    case 'END_TURN': return handleEndTurn(state, action.fromNetwork);
    case 'RESOLVE_LANE': return resolveLane(state, action.laneId);
    case 'RESOLVE_END_OF_ROUND': return handleResolveEndOfRound(state);
    case 'SUDDEN_DEATH_STEP': return handleSuddenDeathStep(state);
    case 'USE_SUPPORT': return handleUseSupport(state, action.player);
    // Online multiplayer
    case 'GO_TO_CREATE_ROOM': return { ...state, phase: 'WaitingForPlayer', isHost: true, localPlayer: 1 };
    case 'GO_TO_JOIN_ROOM': return { ...state, phase: 'JoiningRoom', isHost: false, localPlayer: 2 };
    case 'SET_ROOM_CODE': return { ...state, roomCode: action.code };
    case 'SET_LOCAL_PLAYER': return { ...state, localPlayer: action.player };
    case 'PLAYER_CONNECTED': return { ...state, phase: 'SuitSelection' };
    case 'SYNC_STATE': return { ...action.state, localPlayer: state.localPlayer, isHost: state.isHost };
    case 'OPPONENT_SUIT_SELECTED': return handleOpponentSuitSelected(state, action.suit);
    case 'BOTH_SUITS_SELECTED': return { ...state, phase: 'InitialFlip' };
    // v2 Ability System - Effect choices
    case 'EFFECT_CHOICE_CLUBS_REPLACE': return handleClubsReplacementChoice(state, action.handCardId, action.replacementRank);
    case 'EFFECT_CHOICE_CLUBS_MID_REPLACE': return handleClubsMidReplacementChoice(state, action.handCardId);
    case 'EFFECT_CHOICE_CLUBS_MOVE': return handleClubsMoveChoice(state, action.cardId, action.fromLane, action.toLane);
    case 'EFFECT_CHOICE_CLUBS_NEUTRALIZE': return handleClubsNeutralizeChoice(state, action.laneId);
    case 'EFFECT_CHOICE_CLUBS_QUEEN_DELAY': return handleClubsQueenDelayChoice(state, action.targetLaneId);
    case 'EFFECT_CHOICE_DIAMONDS_ACE': return handleDiamondsAceChoiceV22(state, action.choice);
    case 'EFFECT_CHOICE_DIAMONDS_QUEEN': return handleDiamondsQueenChoice(state, action.choice);
    case 'EFFECT_CHOICE_HEARTS_ACE': return handleHeartsAceChoiceV22(state, action.choice);
    case 'EFFECT_CHOICE_SPADES_ACE': return handleSpadesAceChoiceV22(state, action.choice);
    case 'SPEND_DIAMOND_CHARGE': return handleSpendDiamondCharge(state, action.choice);
    case 'DISMISS_EFFECT_CHOICE': return handleDismissEffectChoice(state);
    default: return state;
  }
}

function handleSelectMode(state: GameState, mode: GameMode): GameState {
  if (state.phase !== 'ModeSelection') return state;
  
  // Online mode goes to lobby first
  if (mode === 'online') {
    return {
      ...state,
      phase: 'OnlineLobby',
      gameMode: mode,
    };
  }
  
  return {
    ...state,
    phase: 'SuitSelection',
    gameMode: mode,
  };
}

function handleSelectSuit(state: GameState, playerSuit: StandardSuit): GameState {
  if (state.phase !== 'SuitSelection') return state;
  
  if (state.gameMode === 'vs-player') {
    // In PvP hotseat mode, go to player 2 suit selection
    return {
      ...state,
      phase: 'SuitSelectionP2',
      player1Suit: playerSuit,
    };
  }
  
  if (state.gameMode === 'online') {
    // In online mode, set local player's suit and wait for opponent
    // The suit goes to player1Suit if host, player2Suit if guest
    if (state.isHost) {
      // Check if opponent already picked
      if (state.player2Suit) {
        return { ...state, phase: 'InitialFlip', player1Suit: playerSuit };
      }
      return { ...state, phase: 'WaitingForOpponentSuit', player1Suit: playerSuit };
    } else {
      // Guest - set player2Suit
      if (state.player1Suit) {
        return { ...state, phase: 'InitialFlip', player2Suit: playerSuit };
      }
      return { ...state, phase: 'WaitingForOpponentSuit', player2Suit: playerSuit };
    }
  }
  
  // In vs-AI mode, AI gets a random suit (excluding player's choice)
  const availableSuits = ALL_SUITS.filter(s => s !== playerSuit);
  const aiSuit = availableSuits[Math.floor(Math.random() * availableSuits.length)];
  
  return {
    ...state,
    phase: 'InitialFlip',
    player1Suit: playerSuit,
    player2Suit: aiSuit,
  };
}

function handleOpponentSuitSelected(state: GameState, opponentSuit: StandardSuit): GameState {
  // Online mode: opponent has selected their suit
  if (state.isHost) {
    // Host receives guest's suit (player2Suit)
    const newState = { ...state, player2Suit: opponentSuit };
    // If host already picked, go to flip
    if (state.player1Suit) {
      return { ...newState, phase: 'InitialFlip' };
    }
    return newState;
  } else {
    // Guest receives host's suit (player1Suit)
    const newState = { ...state, player1Suit: opponentSuit };
    // If guest already picked, go to flip
    if (state.player2Suit) {
      return { ...newState, phase: 'InitialFlip' };
    }
    return newState;
  }
}

function handleSelectSuitP2(state: GameState, player2Suit: StandardSuit): GameState {
  if (state.phase !== 'SuitSelectionP2') return state;
  
  // Player 2 can pick any suit (even the same as player 1 in PvP)
  return {
    ...state,
    phase: 'InitialFlip',
    player2Suit: player2Suit,
  };
}

function handleConfirmReady(state: GameState): GameState {
  if (state.phase !== 'PassDevice') return state;
  
  // Transition back to Main phase - the current player is ready
  return {
    ...state,
    phase: 'Main',
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
  
  // Track ALL cards flipped (in case of ties)
  const player1AllCards: Card[] = [];
  const player2AllCards: Card[] = [];

  // Keep flipping until we have a winner (handles ties)
  while (winner === null && player1Deck.length > 0 && player2Deck.length > 0) {
    player1Card = player1Deck[0];
    player2Card = player2Deck[0];
    player1Deck = player1Deck.slice(1);
    player2Deck = player2Deck.slice(1);
    
    // Track all cards flipped
    player1AllCards.push(player1Card);
    player2AllCards.push(player2Card);

    // Get card values - Joker is highest (15), Ace is 14, etc.
    const value1 = cardValue(player1Card);
    const value2 = cardValue(player2Card);
    
    console.log(`[War Flip] P1: ${player1Card.rank} (${value1}) vs P2: ${player2Card.rank} (${value2})`);

    if (value1 > value2) { winner = 1; }
    else if (value2 > value1) { winner = 2; }
    // If equal, winner stays null and we flip again
  }

  // Edge case: ran out of cards with no winner
  if (winner === null) winner = 1;
  if (!player1Card || !player2Card) return state;
  
  console.log(`[War Flip] Winner: Player ${winner}, flipped ${player1AllCards.length} card(s) each`);

  const flipResult: FlipResult = {
    player1Card,          // The final/winning card shown in UI
    player2Card,          // The final/winning card shown in UI
    player1AllCards,      // All cards P1 flipped
    player2AllCards,      // All cards P2 flipped
    winner,
    damage: 0, // War flip no longer deals damage, only decides who goes first
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

  const { player1AllCards, player2AllCards, winner } = state.flipResult;
  
  // Put flipped cards at the BOTTOM of each player's deck (in order they were flipped)
  // This returns the cards to the game instead of discarding them
  const player1DeckWithFlippedCards = [...state.player1.deck, ...player1AllCards];
  const player2DeckWithFlippedCards = [...state.player2.deck, ...player2AllCards];

  // Set field control to winner's suit
  const fieldControlSuit = winner === 1 ? state.player1Suit : state.player2Suit;

  // Draw cards and start main phase - winner goes first
  let player1 = drawCards({ ...state.player1, deck: player1DeckWithFlippedCards }, INITIAL_HAND_SIZE);
  let player2 = drawCards({ ...state.player2, deck: player2DeckWithFlippedCards }, INITIAL_HAND_SIZE);

  return { 
    ...state, 
    phase: 'Main', 
    player1, 
    player2, 
    discardPile: state.discardPile, // Don't add flip cards to discard anymore
    currentPlayer: winner, 
    cardsPlayedThisTurn: 0,
    flipResult: null,
    fieldControlSuit,
    pendingResolutionLanes: [],
  };
}

function handlePlayCardToLane(state: GameState, cardId: string, laneId: LaneId, fromNetwork?: boolean): GameState {
  // For local actions, require Main phase
  if (!fromNetwork && state.phase !== 'Main') {
    console.log(`[PlayCard] Blocked - phase is ${state.phase}, not Main`);
    return state;
  }
  
  // For network actions, be more lenient - the sender validated it
  if (fromNetwork) {
    console.log(`[Network] Received PLAY_CARD_TO_LANE from network for player ${state.currentPlayer}, phase=${state.phase}`);
    if (state.phase !== 'Main') {
      console.warn(`[Network] PLAY_CARD received but phase is ${state.phase} - processing anyway`);
    }
  }

  const currentPlayerState = state.currentPlayer === 1 ? state.player1 : state.player2;
  const card = findCardById(currentPlayerState.hand, cardId);
  if (!card) return state;

  const lane = findLane(state.lanes, laneId);
  if (!lane) return state;

  const playerSide = state.currentPlayer === 1 ? lane.player1 : lane.player2;
  if (playerSide.cards.length >= MAX_CARDS_PER_LANE) return state;

  // Joker-aware card play check: only non-joker cards restrict what can be played
  if (playerSide.cards.length > 0) {
    let lastNonJokerValue = 0;
    for (const c of playerSide.cards) {
      if (!isJoker(c)) {
        lastNonJokerValue = cardValue(c);
      }
    }
    // Only restrict if there's a non-joker card; jokers don't block plays
    if (lastNonJokerValue > 0 && cardValue(card) < lastNonJokerValue) return state;
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

  // v2 Ability System: Check for Ace on-play trigger
  if (card.rank === 'A') {
    newState = handleAceOnPlay(newState, card, state.currentPlayer);
    
    // Check if Ace effect caused game over (e.g., Spades Ace damage)
    const gameOver = checkGameOver(newState);
    if (gameOver) {
      return gameOver;
    }
  }
  
  // v2 Ability System: Check for Face Card (J/Q/K) on-play trigger
  if (card.rank === 'J' || card.rank === 'Q' || card.rank === 'K') {
    newState = handleFaceCardOnPlay(newState, card, state.currentPlayer, laneId);
    
    // Check if Face Card effect caused game over (e.g., Spades J/Q/K damage)
    const gameOver = checkGameOver(newState);
    if (gameOver) {
      return gameOver;
    }
  }

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

function handleDiscardCard(state: GameState, cardId: string, fromNetwork?: boolean): GameState {
  // For local actions, require Main phase
  if (!fromNetwork && state.phase !== 'Main') {
    console.log(`[Discard] Blocked - phase is ${state.phase}, not Main`);
    return state;
  }
  
  // For network actions, be more lenient
  if (fromNetwork) {
    console.log(`[Network] Received DISCARD_CARD from network for player ${state.currentPlayer}, phase=${state.phase}`);
    if (state.phase !== 'Main') {
      console.warn(`[Network] DISCARD received but phase is ${state.phase} - processing anyway`);
    }
  }

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
 * Respects laneDelayedUntilTurn flag from Clubs Queen (skips one auto-resolve).
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
      // Check if lane has delay flag (Clubs Queen effect)
      if (newState.laneDelayedUntilTurn[pending.laneId]) {
        // Skip resolution this turn, clear the delay flag
        newState = {
          ...newState,
          laneDelayedUntilTurn: {
            ...newState.laneDelayedUntilTurn,
            [pending.laneId]: false
          }
        };
        // Keep pending with 1 turn remaining
        lanesToKeep.push({
          ...pending,
          turnsUntilResolution: 1
        });
      } else {
        // Time's up - resolve this lane
        lanesToResolve.push(pending);
      }
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

function handleEndTurn(state: GameState, fromNetwork?: boolean): GameState {
  // For local actions, require Main phase
  // For network actions, be more lenient to handle desync
  if (!fromNetwork && state.phase !== 'Main') {
    console.log(`[EndTurn] Blocked - phase is ${state.phase}, not Main`);
    return state;
  }
  
  // If from network but not in Main phase, log warning but still try to process
  if (fromNetwork && state.phase !== 'Main') {
    console.warn(`[Network] END_TURN received but phase is ${state.phase} - forcing phase to Main`);
    state = { ...state, phase: 'Main' };
  }
  
  const currentPlayer = state.currentPlayer;
  const currentPlayerState = currentPlayer === 1 ? state.player1 : state.player2;
  
  // Skip validation for network actions - they've already been validated by the sender
  // This prevents desync issues where local cardsPlayedThisTurn doesn't match remote
  if (!fromNetwork) {
    // Can end turn if: played 3 cards OR (played at least 1 card AND hand is empty)
    const handIsEmpty = currentPlayerState.hand.length === 0;
    const played3Cards = state.cardsPlayedThisTurn >= CARDS_PER_TURN;
    const playedAtLeast1 = state.cardsPlayedThisTurn >= 1;
    
    if (!played3Cards && !(playedAtLeast1 && handIsEmpty)) {
      return state; // Can't end turn yet
    }
  } else {
    console.log(`[Network] Processing END_TURN from network - currentPlayer was ${currentPlayer}, cardsPlayed was ${state.cardsPlayedThisTurn}, skipping validation`);
  }

  let player1 = { ...state.player1 };
  let player2 = { ...state.player2 };
  let player1FinalTurnDone = state.player1FinalTurnDone;
  let player2FinalTurnDone = state.player2FinalTurnDone;
  const discardPile = [...state.discardPile];

  let playerState = currentPlayer === 1 ? player1 : player2;

  // END OF TURN: Draw 2 cards for current player (planning phase)
  if (playerState.deck.length > 0) {
    const cardsToDraw = Math.min(playerState.deck.length, CARDS_TO_DRAW_END_TURN);
    const updated = drawCards(playerState, cardsToDraw);
    if (currentPlayer === 1) player1 = updated; else player2 = updated;
    console.log(`[Draw] Player ${currentPlayer} draws ${cardsToDraw} cards at end of turn`);
  }
  
  // Check if current player is done (empty deck AND empty hand after drawing)
  const updatedCurrentPlayer = currentPlayer === 1 ? player1 : player2;
  if (updatedCurrentPlayer.deck.length === 0 && updatedCurrentPlayer.hand.length === 0) {
    if (currentPlayer === 1) player1FinalTurnDone = true;
    else player2FinalTurnDone = true;
    console.log(`[Round] Player ${currentPlayer} has played all cards - final turn done`);
  }

  // Check if both players have exhausted their decks and hands
  if (player1FinalTurnDone && player2FinalTurnDone) {
    console.log('[Round] Both players exhausted - ending round');
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
  console.log(`[Turn] Switching from player ${currentPlayer} to player ${nextPlayer}, cardsPlayedThisTurn will reset to 0`);
  
  // START OF TURN: Draw 1 card for next player (reactive element)
  // BUT only if they've already had a turn (hand < initial size)
  // This prevents player 2 from getting 6 cards on their first turn
  const nextPlayerState = nextPlayer === 1 ? player1 : player2;
  if (nextPlayerState.deck.length > 0 && nextPlayerState.hand.length < INITIAL_HAND_SIZE) {
    const cardsToDraw = Math.min(nextPlayerState.deck.length, CARDS_TO_DRAW_START_TURN);
    const updated = drawCards(nextPlayerState, cardsToDraw);
    if (nextPlayer === 1) player1 = updated; else player2 = updated;
    console.log(`[Draw] Player ${nextPlayer} draws ${cardsToDraw} card at start of turn`);
  }
  
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

  // v2: Process Bleed ticks for the next player (at start of their turn)
  newState = processBleedTicks(newState, nextPlayer);
  
  // Check if bleed killed them
  let gameOver = checkGameOver(newState);
  if (gameOver) {
    return gameOver;
  }
  
  // v2: Process Regen ticks for both players
  // Player 1's regen: ticks if mode='full' OR if it's player 1's turn
  newState = processRegenTicks(newState, 1, nextPlayer === 1);
  // Player 2's regen: ticks if mode='full' OR if it's player 2's turn
  newState = processRegenTicks(newState, 2, nextPlayer === 2);

  // At the start of the next player's turn, process pending lanes they filled
  // (decrement countdown, resolve if countdown reaches 0)
  newState = processPendingLanesForPlayer(newState, nextPlayer);
  
  // Check if game ended from resolution
  if (newState.phase === 'Finished' || newState.phase === 'SuddenDeath') {
    return newState;
  }

  // In PvP mode, show pass device screen between turns
  if (state.gameMode === 'vs-player') {
    return {
      ...newState,
      phase: 'PassDevice',
    };
  }

  return newState;
}

const LANES_TO_UNLOCK_SUPPORT = 2;

/**
 * v2 Lane Resolution
 * 
 * Resolution order:
 * 1. Calculate lane totals (base sum + poker bonus)
 * 2. Apply lane damage (difference)
 * 3. Check for lane neutralization - if neutralized, skip all suit effects
 * 4. Resolve suit effects (post-resolution phase):
 *    a. Check for Clubs King blocking opponent effects
 *    b. Winner effects first
 *    c. Loser effects second
 * 5. Consume Blood Debt if winner has stacks
 * 6. Track overkill for Hearts King
 */
function resolveLane(state: GameState, laneId: LaneId): GameState {
  const lane = findLane(state.lanes, laneId);
  if (!lane) return state;

  // v2.2 Blood Debt Poker Doubling - calculate base sums and poker bonuses separately
  const p1BaseSum = calculateBaseSum(lane.player1.cards);
  const p2BaseSum = calculateBaseSum(lane.player2.cards);
  let p1PokerBonus = evaluateLaneBonus(lane.player1.cards);
  let p2PokerBonus = evaluateLaneBonus(lane.player2.cards);
  
  let newState = { ...state };
  
  // v2.2: Apply Blood Debt to boost poker bonus DURING resolution
  // This affects the lane totals and winner determination
  let p1BloodDebtUsed = 0;
  let p2BloodDebtUsed = 0;
  
  // Player 1 Blood Debt consumption
  if (newState.player1.bloodDebtStacks > 0 && p1PokerBonus > 0) {
    const available = newState.player1.bloodDebtStacks;
    if (available >= p1PokerBonus) {
      // Full double: consume pokerBonus amount, double the bonus
      p1BloodDebtUsed = p1PokerBonus;
      p1PokerBonus *= 2;
      console.log(`[Blood Debt] Player 1 consumes ${p1BloodDebtUsed} Blood Debt to double poker bonus to ${p1PokerBonus}`);
    } else {
      // Partial: consume all available, add to bonus
      p1BloodDebtUsed = available;
      p1PokerBonus += available;
      console.log(`[Blood Debt] Player 1 consumes ${p1BloodDebtUsed} Blood Debt (partial) to increase poker bonus to ${p1PokerBonus}`);
    }
    newState = {
      ...newState,
      player1: {
        ...newState.player1,
        bloodDebtStacks: newState.player1.bloodDebtStacks - p1BloodDebtUsed
      }
    };
  }
  
  // Player 2 Blood Debt consumption
  if (newState.player2.bloodDebtStacks > 0 && p2PokerBonus > 0) {
    const available = newState.player2.bloodDebtStacks;
    if (available >= p2PokerBonus) {
      // Full double: consume pokerBonus amount, double the bonus
      p2BloodDebtUsed = p2PokerBonus;
      p2PokerBonus *= 2;
      console.log(`[Blood Debt] Player 2 consumes ${p2BloodDebtUsed} Blood Debt to double poker bonus to ${p2PokerBonus}`);
    } else {
      // Partial: consume all available, add to bonus
      p2BloodDebtUsed = available;
      p2PokerBonus += available;
      console.log(`[Blood Debt] Player 2 consumes ${p2BloodDebtUsed} Blood Debt (partial) to increase poker bonus to ${p2PokerBonus}`);
    }
    newState = {
      ...newState,
      player2: {
        ...newState.player2,
        bloodDebtStacks: newState.player2.bloodDebtStacks - p2BloodDebtUsed
      }
    };
  }
  
  // Calculate lane totals with potentially boosted poker bonuses
  let p1Total = p1BaseSum + p1PokerBonus;
  let p2Total = p2BaseSum + p2PokerBonus;

  // Clubs Jack: Double poker bonus for Clubs player if they would win
  // Check if Player 1 has active Clubs Jack
  const p1HasClubsJack = state.player1Suit === 'clubs' && 
    lane.player1.cards.some(card => isCardActiveForEffects(card, state.player1Suit) && card.rank === 'J');
  // Check if Player 2 has active Clubs Jack
  const p2HasClubsJack = state.player2Suit === 'clubs' && 
    lane.player2.cards.some(card => isCardActiveForEffects(card, state.player2Suit) && card.rank === 'J');
  
  // Apply Clubs Jack bonus only if the Clubs player wins
  // Fixed-point approach: calculate provisional winner first, then apply bonus
  const provisionalWinner = p1Total > p2Total ? 1 : (p2Total > p1Total ? 2 : null);
  
  if (provisionalWinner === 1 && p1HasClubsJack) {
    // Player 1 would win and has Clubs Jack - double their poker bonus (on top of Blood Debt boost)
    p1Total = p1BaseSum + (p1PokerBonus * 2);
  } else if (provisionalWinner === 2 && p2HasClubsJack) {
    // Player 2 would win and has Clubs Jack - double their poker bonus (on top of Blood Debt boost)
    p2Total = p2BaseSum + (p2PokerBonus * 2);
  }
  let player1LanesLost = state.player1LanesLost;
  let player2LanesLost = state.player2LanesLost;
  let player1SupportAvailable = state.player1SupportAvailable;
  let player2SupportAvailable = state.player2SupportAvailable;
  
  // Track resolution result for animation
  let winner: CurrentPlayer | null = null;
  let loser: CurrentPlayer | null = null;
  let finalDamage = 0;
  let baseDamage = 0;
  let bonusDamage = 0;
  let bonusHealing = 0;
  const triggeredEffects: TriggeredEffect[] = [];
  const wasNeutralized = state.neutralizedLanes[laneId] || false;
  // Note: tie is determined by checking if winner/loser remain null after comparison

  // Track Clubs Jack poker bonus doubling effect if it was applied
  if (provisionalWinner === 1 && p1HasClubsJack) {
    const jackCard = lane.player1.cards.find(card => card.rank === 'J' && state.player1Suit === 'clubs');
    if (jackCard) {
      triggeredEffects.push({
        cardId: jackCard.id,
        suit: 'clubs',
        rank: 'J',
        effectType: 'Doubled poker bonus',
        strength: 'full'
      });
    }
  } else if (provisionalWinner === 2 && p2HasClubsJack) {
    const jackCard = lane.player2.cards.find(card => card.rank === 'J' && state.player2Suit === 'clubs');
    if (jackCard) {
      triggeredEffects.push({
        cardId: jackCard.id,
        suit: 'clubs',
        rank: 'J',
        effectType: 'Doubled poker bonus',
        strength: 'full'
      });
    }
  }

  // Determine winner and apply base damage
  if (p1Total > p2Total) {
    winner = 1;
    loser = 2;
    baseDamage = p1Total - p2Total;
    
    // Track lane loss for Player 2
    if (lane.player2.cards.length > 0) {
      player2LanesLost++;
      if (!player2SupportAvailable && player2LanesLost >= LANES_TO_UNLOCK_SUPPORT) {
        player2SupportAvailable = true;
      }
    }
  } else if (p2Total > p1Total) {
    winner = 2;
    loser = 1;
    baseDamage = p2Total - p1Total;
    
    // Track lane loss for Player 1
    if (lane.player1.cards.length > 0) {
      player1LanesLost++;
      if (!player1SupportAvailable && player1LanesLost >= LANES_TO_UNLOCK_SUPPORT) {
        player1SupportAvailable = true;
      }
    }
  }
  // If tied, no damage, no lane loss, no suit effects

  // v2 Hearts Mitigation System
  // Calculate mitigation BEFORE applying base damage
  // Only applies to base lane-diff damage, NOT Blood Debt, Bleed, or on-play damage
  let mitigationPercent = 0;
  let mitigatedDamage = baseDamage;
  
  if (winner && loser && !wasNeutralized) {
    const loserSuit = loser === 1 ? state.player1Suit : state.player2Suit;
    const loserCards = loser === 1 ? lane.player1.cards : lane.player2.cards;
    
    // Check if loser is Hearts player with active low/mid tier cards
    if (loserSuit === 'hearts') {
      for (const card of loserCards) {
        if (!isCardActiveForEffects(card, loserSuit)) continue;
        const tier = getRankTier(card.rank);
        
        if (tier === 'low') {
          // Hearts 2-6 on LOSS: 50% mitigation (use max, non-stacking)
          mitigationPercent = Math.max(mitigationPercent, 50);
        } else if (tier === 'mid') {
          // Hearts 7-10 on LOSS: 25% mitigation (use max, non-stacking)
          mitigationPercent = Math.max(mitigationPercent, 25);
        }
      }
      
      if (mitigationPercent > 0) {
        mitigatedDamage = Math.floor(baseDamage * (1 - mitigationPercent / 100));
        console.log(`[Hearts Mitigation] Player ${loser} mitigates ${mitigationPercent}%: ${baseDamage} → ${mitigatedDamage} damage`);
        
        // Track mitigation as a triggered effect
        triggeredEffects.push({
          cardId: 'mitigation',
          suit: 'hearts',
          rank: mitigationPercent === 50 ? 2 : 7, // Representative rank
          effectType: `${mitigationPercent}% damage mitigation`,
          strength: 'full'
        });
      }
    }
  }

  // Apply mitigated base damage first (before suit effects)
  if (winner && loser) {
    if (loser === 1) {
      newState = {
        ...newState,
        player1: applyDamage(newState.player1, mitigatedDamage)
      };
    } else {
      newState = {
        ...newState,
        player2: applyDamage(newState.player2, mitigatedDamage)
      };
    }
    finalDamage = mitigatedDamage;
    
    // Track overkill for Hearts King
    const loserHpAfterDamage = loser === 1 ? newState.player1.hp : newState.player2.hp;
    if (loserHpAfterDamage < 0) {
      newState = {
        ...newState,
        overkillThisTurn: Math.abs(loserHpAfterDamage)
      };
    }
  }

  // v2 Suit Effects Resolution (only if not neutralized and not a tie)
  if (!wasNeutralized && winner && loser) {
    const winnerCards = winner === 1 ? lane.player1.cards : lane.player2.cards;
    const loserCards = loser === 1 ? lane.player1.cards : lane.player2.cards;
    const winnerSuit = winner === 1 ? state.player1Suit : state.player2Suit;
    const loserSuit = loser === 1 ? state.player1Suit : state.player2Suit;
    const opponentHpAfterLaneDamage = loser === 1 ? newState.player1.hp : newState.player2.hp;
    
    // Check for Clubs King blocking opponent effects
    let blockOpponentEffects = false;
    for (const card of winnerCards) {
      if (isCardActiveForEffects(card, winnerSuit) && card.rank === 'K' && winnerSuit === 'clubs') {
        const result = handleClubsKing({
          state: newState,
          card,
          player: winner,
          opponent: loser,
          laneId,
          isWinner: true,
          isTie: false,
          strength: 'full'
        });
        blockOpponentEffects = result.blockOpponentEffects;
        if (blockOpponentEffects) {
          triggeredEffects.push({
            cardId: card.id,
            suit: 'clubs',
            rank: card.rank,
            effectType: 'Block opponent effects',
            strength: 'full'
          });
        }
      }
    }
    
    // Winner effects first
    for (const card of winnerCards) {
      if (!isCardActiveForEffects(card, winnerSuit)) continue;
      
      const def = getEffectDefinition(card, winnerSuit);
      if (!def) continue;
      
      if (shouldEffectTrigger(def, true, false)) {
        const strength = getEffectStrength(def, true);
        if (strength !== 'none') {
          const ctx: EffectContext = {
            state: newState,
            card,
            player: winner,
            opponent: loser,
            laneId,
            isWinner: true,
            isTie: false,
            strength,
            opponentHpAfterLaneDamage
          };
          
          newState = executeCardEffect(ctx, winnerCards);
          
          triggeredEffects.push({
            cardId: card.id,
            suit: card.suit as 'hearts' | 'diamonds' | 'clubs' | 'spades',
            rank: card.rank,
            effectType: def.description,
            strength
          });
        }
      }
    }
    
    // v2.2: Blood Debt is now consumed DURING resolution to double poker bonus
    // Track Blood Debt usage as a triggered effect if it was used
    if (winner === 1 && p1BloodDebtUsed > 0) {
      triggeredEffects.push({
        cardId: 'blood-debt-p1',
        suit: 'spades',
        rank: 2, // Representative rank
        effectType: `Blood Debt doubled poker bonus (+${p1BloodDebtUsed} consumed)`,
        strength: 'full'
      });
    } else if (winner === 2 && p2BloodDebtUsed > 0) {
      triggeredEffects.push({
        cardId: 'blood-debt-p2',
        suit: 'spades',
        rank: 2, // Representative rank
        effectType: `Blood Debt doubled poker bonus (+${p2BloodDebtUsed} consumed)`,
        strength: 'full'
      });
    }
    
    // Loser effects second (only if not blocked by Clubs King)
    if (!blockOpponentEffects) {
      for (const card of loserCards) {
        if (!isCardActiveForEffects(card, loserSuit)) continue;
        
        const def = getEffectDefinition(card, loserSuit);
        if (!def) continue;
        
        if (shouldEffectTrigger(def, false, false)) {
          const strength = getEffectStrength(def, false);
          if (strength !== 'none') {
            const ctx: EffectContext = {
              state: newState,
              card,
              player: loser,
              opponent: winner,
              laneId,
              isWinner: false,
              isTie: false,
              strength
            };
            
            newState = executeCardEffect(ctx, loserCards);
            
            triggeredEffects.push({
              cardId: card.id,
              suit: card.suit as 'hearts' | 'diamonds' | 'clubs' | 'spades',
              rank: card.rank,
              effectType: def.description,
              strength
            });
          }
        }
      }
    }
  }

  // Clear lane neutralization after resolution
  if (wasNeutralized) {
    newState = clearLaneNeutralization(newState, laneId);
  }

  // Move cards to discard and clear lane
  const laneCards = [...lane.player1.cards, ...lane.player2.cards];
  const clearedLane: Lane = { ...lane, player1: { cards: [] }, player2: { cards: [] } };

  // Create resolution result for animation
  const lastLaneResolution = {
    laneId,
    player1Total: p1Total,
    player2Total: p2Total,
    winner,
    loser,
    damage: finalDamage,
    baseDamage,
    bonusDamage,
    bonusHealing,
    timestamp: Date.now(),
    triggeredEffects,
    wasNeutralized
  };

  // Reset overkill tracking at end of resolution
  return { 
    ...newState, 
    lanes: updateLane(newState.lanes, clearedLane), 
    discardPile: [...newState.discardPile, ...laneCards],
    player1LanesLost,
    player2LanesLost,
    player1SupportAvailable,
    player2SupportAvailable,
    lastLaneResolution,
    overkillThisTurn: 0
  };
}

const BASE_SUPPORT_ABILITY_AMOUNT = 5;

function handleUseSupport(state: GameState, player: CurrentPlayer): GameState {
  // Can only use during Main phase
  if (state.phase !== 'Main') return state;
  
  // Check if the player has support available
  const supportAvailable = player === 1 ? state.player1SupportAvailable : state.player2SupportAvailable;
  if (!supportAvailable) return state;
  
  const playerSuit = player === 1 ? state.player1Suit : state.player2Suit;
  if (!playerSuit) return state;
  
  // Support amount is fixed at base value (5) - not affected by chargePower
  const supportAmount = BASE_SUPPORT_ABILITY_AMOUNT;
  
  let player1 = { ...state.player1 };
  let player2 = { ...state.player2 };
  
  if (SUIT_DAMAGE_SUITS.includes(playerSuit)) {
    // Damage suits: Deal damage to opponent
    if (player === 1) {
      player2 = applyDamage(player2, supportAmount);
    } else {
      player1 = applyDamage(player1, supportAmount);
    }
  } else {
    // Healing suits: Heal self (can go above max)
    if (player === 1) {
      player1 = { ...player1, hp: player1.hp + supportAmount };
    } else {
      player2 = { ...player2, hp: player2.hp + supportAmount };
    }
  }
  
  // Mark support as used (no longer available) and reset lanes lost counter
  const newState: GameState = {
    ...state,
    player1,
    player2,
    player1SupportAvailable: player === 1 ? false : state.player1SupportAvailable,
    player2SupportAvailable: player === 2 ? false : state.player2SupportAvailable,
    // Reset lanes lost counter so they need to lose 2 more lanes to unlock again
    player1LanesLost: player === 1 ? 0 : state.player1LanesLost,
    player2LanesLost: player === 2 ? 0 : state.player2LanesLost,
  };
  
  // Check if opponent died from damage
  const gameOver = checkGameOver(newState);
  if (gameOver) {
    return gameOver;
  }
  
  return newState;
}

// ============================================================================
// v2 EFFECT CHOICE HANDLERS
// ============================================================================

function handleClubsReplacementChoice(state: GameState, handCardId: string, replacementRank: 'J' | 'Q' | 'K'): GameState {
  if (state.pendingEffectChoices.length === 0) return state;
  
  const currentChoice = state.pendingEffectChoices[0];
  if (currentChoice.type !== 'clubs-2-6-replacement') return state;
  
  let newState = applyClubsReplacement(state, currentChoice.player, handCardId, replacementRank);
  
  // Remove the processed choice
  newState = {
    ...newState,
    pendingEffectChoices: newState.pendingEffectChoices.slice(1)
  };
  
  return newState;
}

function handleClubsMoveChoice(state: GameState, cardId: string, fromLane: LaneId, toLane: LaneId): GameState {
  if (state.pendingEffectChoices.length === 0) return state;
  
  const currentChoice = state.pendingEffectChoices[0];
  // Accept clubs-queen-move (v2.2 Queen), clubs-7-10-option, and clubs-ace-option
  if (currentChoice.type !== 'clubs-queen-move' && 
      currentChoice.type !== 'clubs-7-10-option' && 
      currentChoice.type !== 'clubs-ace-option') return state;
  
  let newState = moveCardBetweenLanes(state, cardId, fromLane, toLane, true, currentChoice.player);
  
  // Remove the processed choice
  newState = {
    ...newState,
    pendingEffectChoices: newState.pendingEffectChoices.slice(1)
  };
  
  // Check for lanes that need immediate resolution (turnsUntilResolution === 0)
  const immediateResolutions = newState.pendingResolutionLanes.filter(p => p.turnsUntilResolution === 0);
  for (const pending of immediateResolutions) {
    console.log(`[Clubs Move] Resolving lane ${pending.laneId} immediately (both sides filled)`);
    newState = resolveLane(newState, pending.laneId);
    newState = {
      ...newState,
      pendingResolutionLanes: newState.pendingResolutionLanes.filter(p => p.laneId !== pending.laneId),
    };
    
    // Check if someone died from lane resolution
    const gameOver = checkGameOver(newState);
    if (gameOver) {
      return gameOver;
    }
  }
  
  return newState;
}

function handleClubsNeutralizeChoice(state: GameState, laneId: LaneId): GameState {
  if (state.pendingEffectChoices.length === 0) return state;
  
  const currentChoice = state.pendingEffectChoices[0];
  if (currentChoice.type !== 'clubs-7-10-option' && currentChoice.type !== 'clubs-ace-option') return state;
  
  let newState = applyLaneNeutralization(state, laneId);
  
  // Remove the processed choice
  newState = {
    ...newState,
    pendingEffectChoices: newState.pendingEffectChoices.slice(1)
  };
  
  return newState;
}

function handleClubsQueenDelayChoice(state: GameState, targetLaneId: LaneId): GameState {
  if (state.pendingEffectChoices.length === 0) return state;
  
  const currentChoice = state.pendingEffectChoices[0];
  if (currentChoice.type !== 'clubs-queen-delay') return state;
  
  // Get the source lane from the choice (the lane the Queen resolved in)
  const sourceLaneId = currentChoice.laneId || 'middle'; // fallback
  
  let newState = applyClubsQueenDelay(state, targetLaneId, sourceLaneId);
  
  // Remove the processed choice
  newState = {
    ...newState,
    pendingEffectChoices: newState.pendingEffectChoices.slice(1)
  };
  
  return newState;
}

function handleDiamondsQueenChoice(state: GameState, choice: 'damage' | 'heal'): GameState {
  if (state.pendingEffectChoices.length === 0) return state;
  
  const currentChoice = state.pendingEffectChoices[0];
  if (currentChoice.type !== 'diamonds-queen-spend') return state;
  
  const opponent = currentChoice.player === 1 ? 2 : 1;
  const playerState = currentChoice.player === 1 ? state.player1 : state.player2;
  
  // Effect value = (5 + chargePower) * 2 (applied twice)
  const effectValue = (5 + playerState.chargePower) * 2;
  
  let newState = state;
  
  // Apply effect twice using calculated value
  if (choice === 'damage') {
    if (opponent === 1) {
      newState = {
        ...newState,
        player1: applyDamage(newState.player1, effectValue)
      };
    } else {
      newState = {
        ...newState,
        player2: applyDamage(newState.player2, effectValue)
      };
    }
  } else {
    if (currentChoice.player === 1) {
      newState = {
        ...newState,
        player1: { ...newState.player1, hp: newState.player1.hp + effectValue }
      };
    } else {
      newState = {
        ...newState,
        player2: { ...newState.player2, hp: newState.player2.hp + effectValue }
      };
    }
  }
  
  // Remove the processed choice
  newState = {
    ...newState,
    pendingEffectChoices: newState.pendingEffectChoices.slice(1)
  };
  
  // Check if damage caused game over
  const gameOver = checkGameOver(newState);
  if (gameOver) {
    return gameOver;
  }
  
  return newState;
}

function handleSpendDiamondCharge(state: GameState, choice: 'damage' | 'heal'): GameState {
  // This can be triggered anytime during main phase if player has charges
  if (state.phase !== 'Main') return state;
  
  let newState = applyDiamondChargeSpend(state, state.currentPlayer, choice);
  
  // Check if damage caused game over
  const gameOver = checkGameOver(newState);
  if (gameOver) {
    return gameOver;
  }
  
  return newState;
}

function handleDismissEffectChoice(state: GameState): GameState {
  if (state.pendingEffectChoices.length === 0) return state;
  
  // Remove the current choice (player chose not to use it or no valid options)
  return {
    ...state,
    pendingEffectChoices: state.pendingEffectChoices.slice(1)
  };
}

// v2.2 NEW HANDLERS
function handleClubsMidReplacementChoice(state: GameState, handCardId: string): GameState {
  if (state.pendingEffectChoices.length === 0) return state;
  
  const currentChoice = state.pendingEffectChoices[0];
  if (currentChoice.type !== 'clubs-7-10-replacement') return state;
  
  let newState = applyClubsAceReplacement(state, currentChoice.player, handCardId);
  
  // Remove the processed choice
  newState = {
    ...newState,
    pendingEffectChoices: newState.pendingEffectChoices.slice(1)
  };
  
  return newState;
}

function handleDiamondsAceChoiceV22(state: GameState, choice: 'charges' | 'chargePower'): GameState {
  if (state.pendingEffectChoices.length === 0) return state;
  
  const currentChoice = state.pendingEffectChoices[0];
  if (currentChoice.type !== 'diamonds-ace-option') return state;
  
  let newState = applyDiamondsAceChoice(state, currentChoice.player, choice === 'charges' ? 'charges' : 'support');
  
  // Remove the processed choice
  newState = {
    ...newState,
    pendingEffectChoices: newState.pendingEffectChoices.slice(1)
  };
  
  // v2.2: No self-damage from Diamonds Ace
  
  return newState;
}

function handleHeartsAceChoiceV22(state: GameState, choice: 'regen' | 'regenEffect'): GameState {
  if (state.pendingEffectChoices.length === 0) return state;
  
  const currentChoice = state.pendingEffectChoices[0];
  if (currentChoice.type !== 'hearts-ace-regen-choice') return state;
  
  let newState = applyHeartsAceChoice(state, currentChoice.player, choice);
  
  // Remove the processed choice
  newState = {
    ...newState,
    pendingEffectChoices: newState.pendingEffectChoices.slice(1)
  };
  
  return newState;
}

function handleSpadesAceChoiceV22(state: GameState, choice: 'bloodDebt' | 'bleed'): GameState {
  if (state.pendingEffectChoices.length === 0) return state;
  
  const currentChoice = state.pendingEffectChoices[0];
  if (currentChoice.type !== 'spades-ace-choice') return state;
  
  let newState = applySpadesAceChoice(state, currentChoice.player, choice);
  
  // Remove the processed choice
  newState = {
    ...newState,
    pendingEffectChoices: newState.pendingEffectChoices.slice(1)
  };
  
  // Check if bleed damage caused game over
  const gameOver = checkGameOver(newState);
  if (gameOver) {
    return gameOver;
  }
  
  return newState;
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

  // v2.2: Regen now persists across rounds (like bleed)
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
    // Find the last non-joker card's value - jokers don't restrict what can be played on top
    // New cards must be >= the most recent non-joker card's value
    let lastNonJokerValue = 0;
    for (const c of playerSide.cards) {
      if (!isJoker(c)) {
        lastNonJokerValue = cardValue(c);
      }
    }
    // If there's a non-joker somewhere, new card must be >= its value
    if (lastNonJokerValue > 0 && cardValue(card) < lastNonJokerValue) return false;
    // If only jokers in lane, any card can be played
  }
  return true;
}

export function canEndTurn(state: GameState): boolean {
  if (state.phase !== 'Main') return false;
  
  const currentPlayerState = state.currentPlayer === 1 ? state.player1 : state.player2;
  const handIsEmpty = currentPlayerState.hand.length === 0;
  const played3Cards = state.cardsPlayedThisTurn >= CARDS_PER_TURN;
  const playedAtLeast1 = state.cardsPlayedThisTurn >= 1;
  
  // Can end turn if: played 3 cards OR (played at least 1 AND hand is empty)
  return played3Cards || (playedAtLeast1 && handIsEmpty);
}
