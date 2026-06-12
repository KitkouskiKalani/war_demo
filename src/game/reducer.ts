/**
 * Game Reducer - v2 Ability System
 */

import type { Card, CurrentPlayer, FlipResult, GameMode, GameState, Lane, LaneId, OnlineConnectionStatus, PlayerState, Rank, RelicType, StandardSuit, TriggeredEffect } from './types';
import { cardValue, createDeck, findCardById, removeCardById, shuffle } from './deck';
import { evaluateBestHand, type BestHand } from './poker';
import { applyDamage, applyHeartsStartingRegen, clearMinionEffectsFromCards, createEmptyLaneRelicEffects, createEmptyLanes, drawFromPlayerDeck, findLane, initializeNewGame, startNewRound, updateLane } from './state';
import { 
  isCardActiveForEffects, 
  getEffectDefinition, 
  shouldEffectTrigger, 
  getEffectStrength,
  SUIT_EFFECTS_ENABLED
} from './suitEffects';
import {
  handleAceOnPlay,
  handleFaceCardOnPlay,
  handleHeartsNonFaceOnPlay,
  addTempRegen,
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
  | { type: 'END_TURN'; player?: CurrentPlayer; fromNetwork?: boolean }  // fromNetwork skips validation for remote actions
  | { type: 'RESOLVE_LANE'; laneId: LaneId }
  // v7 Cycling Lane Flow: end-of-round flow is split into two UI-driven steps
  // so each lane's resolution animation can play sequentially before the next
  // round starts.
  | { type: 'RESOLVE_NEXT_END_OF_ROUND_LANE' }
  | { type: 'FINALIZE_ROUND_END' }
  | { type: 'SUDDEN_DEATH_STEP' }
  | { type: 'USE_SUPPORT'; player: CurrentPlayer }
  | { type: 'USE_RELIC_SHIELD'; player: CurrentPlayer; laneId: LaneId }
  | { type: 'USE_RELIC_SWORD'; player: CurrentPlayer; laneId: LaneId }
  | { type: 'USE_RELIC_SKULL'; player: CurrentPlayer; cardId: string; fromLane: LaneId; toLane: LaneId }
  | { type: 'USE_RELIC_SPADES_SKULL_RANDOMIZE'; player: CurrentPlayer; cardId: string; replacement: Card }
  | { type: 'USE_RELIC_HEARTS_SKULL_FROM_DISCARD'; player: CurrentPlayer; cardId: string; sourceDiscardCardId: string }
  | { type: 'USE_MINION_RANDOM_BUFF'; player: CurrentPlayer; cardId: string }
  | { type: 'USE_MINION_SPADES_REROLL'; player: CurrentPlayer; cardIds: string[]; newCards: Card[]; playerDeck: Card[] }
  | { type: 'USE_MINION_HEARTS_RELIC_STACKS'; player: CurrentPlayer; relic: 'sword' | 'shield' }
  | { type: 'USE_MINION_CLUBS_CHANGE_SUIT'; player: CurrentPlayer; cardId: string; suit: StandardSuit }
  | { type: 'USE_MINION_DIAMONDS_RANK_UP'; player: CurrentPlayer; cardId: string }
  // Online multiplayer actions
  | { type: 'GO_TO_CREATE_ROOM' }
  | { type: 'GO_TO_JOIN_ROOM' }
  | { type: 'SET_ROOM_CODE'; code: string }
  | { type: 'SET_LOCAL_PLAYER'; player: CurrentPlayer }
  | { type: 'SET_ONLINE_SESSION'; matchId: string | null; sessionToken: string | null; player: CurrentPlayer | null; isHost: boolean; roomCode?: string | null }
  | { type: 'SET_ONLINE_CONNECTION_STATUS'; status: OnlineConnectionStatus }
  | { type: 'SET_ONLINE_SEQUENCE'; sequence: number }
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
  | { type: 'EFFECT_CHOICE_SPADES_ACE'; choice: 'bloodDebt' | 'bleed' }  // v2.2: +5 blood debt or +2 bleed
  | { type: 'SPEND_DIAMOND_CHARGE'; choice: 'damage' | 'heal' }
  | { type: 'DISMISS_EFFECT_CHOICE' };  // Cancel/dismiss current choice

const INITIAL_HAND_SIZE = 5;
const CARDS_TO_DRAW_END_TURN = 3;  // Draw at end of your turn
const CARDS_PER_TURN = 3;
const MAX_CARDS_PER_LANE = 3;
const LANE_ORDER: LaneId[] = ['left', 'middle', 'right'];

const ALL_SUITS: StandardSuit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
const EMPTY_RELIC_LANE_EFFECT = {
  player1: { shielded: false, swordBonus: false },
  player2: { shielded: false, swordBonus: false },
};
const ABILITY_STACKS_TO_ACTIVATE = 3;

function isLaneLockedByMissingCommunity(state: GameState, laneId: LaneId): boolean {
  return state.laneCommunityCards[laneId] === null;
}

function areAllCommunityLanesLocked(state: GameState): boolean {
  return LANE_ORDER.every((laneId) => isLaneLockedByMissingCommunity(state, laneId));
}

function playerKey(player: CurrentPlayer): 'player1' | 'player2' {
  return player === 1 ? 'player1' : 'player2';
}

function isAbilityActive(stacks: number): boolean {
  return stacks >= ABILITY_STACKS_TO_ACTIVATE;
}

function capAbilityStacks(stacks: number): number {
  return Math.min(ABILITY_STACKS_TO_ACTIVATE, Math.max(0, stacks));
}

function withRelicStack(state: GameState, player: CurrentPlayer, relic: RelicType, stacks: number): GameState {
  const key = playerKey(player);
  const cappedStacks = capAbilityStacks(stacks);
  return {
    ...state,
    [key]: {
      ...state[key],
      relicStacks: {
        ...state[key].relicStacks,
        [relic]: cappedStacks,
      },
      relicsAvailable: {
        ...state[key].relicsAvailable,
        [relic]: isAbilityActive(cappedStacks),
      },
    },
  };
}

function incrementRelicStack(state: GameState, player: CurrentPlayer, relic: RelicType): GameState {
  const key = playerKey(player);
  return withRelicStack(state, player, relic, state[key].relicStacks[relic] + 1);
}

function withMinionStacks(state: GameState, player: CurrentPlayer, stacks: number): GameState {
  const key = playerKey(player);
  const cappedStacks = capAbilityStacks(stacks);
  return {
    ...state,
    [key]: {
      ...state[key],
      minionStacks: cappedStacks,
      minionAvailable: isAbilityActive(cappedStacks),
    },
  };
}

function incrementMinionStack(state: GameState, player: CurrentPlayer): GameState {
  const key = playerKey(player);
  return withMinionStacks(state, player, state[key].minionStacks + 1);
}

function deactivateRelic(state: GameState, player: CurrentPlayer, relic: RelicType): GameState {
  return withRelicStack(state, player, relic, 0);
}

function deactivateMinion(state: GameState, player: CurrentPlayer): GameState {
  return withMinionStacks(state, player, 0);
}

function canUseMinion(state: GameState, player: CurrentPlayer): boolean {
  if (state.phase !== 'Main') return false;
  if (state.currentPlayer !== player) return false;
  return isAbilityActive(state[playerKey(player)].minionStacks);
}

function canUseSpadesMinionReroll(state: GameState, player: CurrentPlayer): boolean {
  if (state.phase !== 'Main') return false;
  if (state.currentPlayer === player) return false;
  const playerSuit = player === 1 ? state.player1Suit : state.player2Suit;
  if (playerSuit !== 'spades') return false;
  const playerState = state[playerKey(player)];
  if (!isAbilityActive(playerState.minionStacks)) return false;
  const playerDeck = player === 1 ? state.player1Deck : state.player2Deck;
  if (playerDeck.length === 0) return false;
  if (playerState.lastEndTurnDrawCardIds.length !== CARDS_TO_DRAW_END_TURN) return false;
  return playerState.lastEndTurnDrawCardIds.every((cardId) => playerState.hand.some((card) => card.id === cardId));
}

function updatePlayerHandCard(
  state: GameState,
  player: CurrentPlayer,
  cardId: string,
  update: (card: Card) => Card,
): GameState {
  const key = playerKey(player);
  return {
    ...state,
    [key]: {
      ...state[key],
      hand: state[key].hand.map((card) => (card.id === cardId ? update(card) : card)),
    },
  };
}

function nextRank(rank: Rank): Rank | null {
  if (rank === 'JOKER') return null;
  if (typeof rank === 'number') {
    return rank === 10 ? 'J' : ((rank + 1) as Rank);
  }
  if (rank === 'J') return 'Q';
  if (rank === 'Q') return 'K';
  if (rank === 'K') return 'A';
  return 'JOKER';
}

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
    case 'END_TURN': return handleEndTurn(state, action.fromNetwork, action.player);
    case 'RESOLVE_LANE': return resolveLane(state, action.laneId);
    case 'RESOLVE_NEXT_END_OF_ROUND_LANE': return handleResolveNextEndOfRoundLane(state);
    case 'FINALIZE_ROUND_END': return handleFinalizeRoundEnd(state);
    case 'SUDDEN_DEATH_STEP': return handleSuddenDeathStep(state);
    case 'USE_SUPPORT': return handleUseSupport(state, action.player);
    case 'USE_RELIC_SHIELD': return handleUseRelicShield(state, action.player, action.laneId);
    case 'USE_RELIC_SWORD': return handleUseRelicSword(state, action.player, action.laneId);
    case 'USE_RELIC_SKULL': return handleUseRelicSkull(state, action.player, action.cardId, action.fromLane, action.toLane);
    case 'USE_RELIC_SPADES_SKULL_RANDOMIZE': return handleUseRelicSpadesSkullRandomize(state, action.player, action.cardId, action.replacement);
    case 'USE_RELIC_HEARTS_SKULL_FROM_DISCARD': return handleUseRelicHeartsSkullFromDiscard(state, action.player, action.cardId, action.sourceDiscardCardId);
    case 'USE_MINION_RANDOM_BUFF': return handleUseMinionRandomBuff(state, action.player, action.cardId);
    case 'USE_MINION_SPADES_REROLL': return handleUseMinionSpadesReroll(state, action.player, action.cardIds, action.newCards, action.playerDeck);
    case 'USE_MINION_HEARTS_RELIC_STACKS': return handleUseMinionHeartsRelicStacks(state, action.player, action.relic);
    case 'USE_MINION_CLUBS_CHANGE_SUIT': return handleUseMinionClubsChangeSuit(state, action.player, action.cardId, action.suit);
    case 'USE_MINION_DIAMONDS_RANK_UP': return handleUseMinionDiamondsRankUp(state, action.player, action.cardId);
    // Online multiplayer
    case 'GO_TO_CREATE_ROOM': return { ...state, phase: 'WaitingForPlayer', isHost: true, localPlayer: 1 };
    case 'GO_TO_JOIN_ROOM': return { ...state, phase: 'JoiningRoom', isHost: false, localPlayer: 2 };
    case 'SET_ROOM_CODE': return { ...state, roomCode: action.code };
    case 'SET_LOCAL_PLAYER': return { ...state, localPlayer: action.player };
    case 'SET_ONLINE_SESSION': return {
      ...state,
      onlineMatchId: action.matchId,
      onlineSessionToken: action.sessionToken,
      localPlayer: action.player,
      isHost: action.isHost,
      roomCode: action.roomCode ?? state.roomCode,
      onlineConnectionStatus: 'connected',
    };
    case 'SET_ONLINE_CONNECTION_STATUS': return { ...state, onlineConnectionStatus: action.status };
    case 'SET_ONLINE_SEQUENCE': return { ...state, onlineLastSequence: action.sequence };
    case 'PLAYER_CONNECTED': return { ...state, phase: 'SuitSelection' };
    case 'SYNC_STATE': return {
      ...action.state,
      localPlayer: state.localPlayer,
      isHost: state.isHost,
      onlineMatchId: state.onlineMatchId || action.state.onlineMatchId,
      onlineSessionToken: state.onlineSessionToken || action.state.onlineSessionToken,
      onlineLastSequence: Math.max(state.onlineLastSequence, action.state.onlineLastSequence ?? 0),
      onlineConnectionStatus: state.onlineConnectionStatus,
    };
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
    return applyHeartsStartingRegen({
      ...state,
      phase: 'SuitSelectionP2',
      player1Suit: playerSuit,
    });
  }
  
  if (state.gameMode === 'online') {
    // In online mode, set local player's suit and wait for opponent
    // The suit goes to player1Suit if host, player2Suit if guest
    if (state.isHost) {
      // Check if opponent already picked
      if (state.player2Suit) {
        return applyHeartsStartingRegen({ ...state, phase: 'InitialFlip', player1Suit: playerSuit });
      }
      return applyHeartsStartingRegen({ ...state, phase: 'WaitingForOpponentSuit', player1Suit: playerSuit });
    } else {
      // Guest - set player2Suit
      if (state.player1Suit) {
        return applyHeartsStartingRegen({ ...state, phase: 'InitialFlip', player2Suit: playerSuit });
      }
      return applyHeartsStartingRegen({ ...state, phase: 'WaitingForOpponentSuit', player2Suit: playerSuit });
    }
  }
  
  // In vs-AI mode, AI gets a random suit (excluding player's choice)
  const availableSuits = ALL_SUITS.filter(s => s !== playerSuit);
  const aiSuit = availableSuits[Math.floor(Math.random() * availableSuits.length)];
  
  return applyHeartsStartingRegen({
    ...state,
    phase: 'InitialFlip',
    player1Suit: playerSuit,
    player2Suit: aiSuit,
  });
}

function handleOpponentSuitSelected(state: GameState, opponentSuit: StandardSuit): GameState {
  // Online mode: opponent has selected their suit
  if (state.isHost) {
    // Host receives guest's suit (player2Suit)
    const newState = { ...state, player2Suit: opponentSuit };
    // If host already picked, go to flip
    if (state.player1Suit) {
      return applyHeartsStartingRegen({ ...newState, phase: 'InitialFlip' });
    }
    return applyHeartsStartingRegen(newState);
  } else {
    // Guest receives host's suit (player1Suit)
    const newState = { ...state, player1Suit: opponentSuit };
    // If guest already picked, go to flip
    if (state.player2Suit) {
      return applyHeartsStartingRegen({ ...newState, phase: 'InitialFlip' });
    }
    return applyHeartsStartingRegen(newState);
  }
}

function handleSelectSuitP2(state: GameState, player2Suit: StandardSuit): GameState {
  if (state.phase !== 'SuitSelectionP2') return state;
  
  // Player 2 can pick any suit (even the same as player 1 in PvP)
  return applyHeartsStartingRegen({
    ...state,
    phase: 'InitialFlip',
    player2Suit: player2Suit,
  });
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

  // v4 Shared deck War Flip: alternate top cards (P1 first, P2 second) from the shared deck.
  // On ties, draw two more. Flipped cards are tracked so handleContinueFromFlip can
  // discard the winner for the round and recycle the rest.
  // v8 Split Deck: the War Flip draws from the neutral community pool so it
  // never disturbs the two equal personal decks. Flipped cards are returned to
  // the community pool in handleContinueFromFlip.
  let workingDeck = [...state.communityDeck];
  let player1Card: Card | null = null;
  let player2Card: Card | null = null;
  let winner: CurrentPlayer | null = null;

  const player1AllCards: Card[] = [];
  const player2AllCards: Card[] = [];

  while (winner === null && workingDeck.length >= 2) {
    player1Card = workingDeck[0];
    player2Card = workingDeck[1];
    workingDeck = workingDeck.slice(2);

    player1AllCards.push(player1Card);
    player2AllCards.push(player2Card);

    // Get card values.
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

  // Remove flipped cards from the community pool; they'll return to the bottom on continue.
  return {
    ...state,
    phase: 'InitialFlipResult',
    communityDeck: workingDeck,
    flipResult,
  };
}

function handleContinueFromFlip(state: GameState): GameState {
  if (state.phase !== 'InitialFlipResult' || !state.flipResult) return state;

  const { player1AllCards, player2AllCards, winner } = state.flipResult;

  const winningFlipCard = winner === 1 ? state.flipResult.player1Card : state.flipResult.player2Card;

  // Put all flipped cards back at the BOTTOM of the shared deck. The all-lane
  // community card is a round-only duplicate of the winning flip card, so the
  // real winning card can still be drawn later this round.
  const recycledFlipCards: Card[] = [];
  const maxLen = Math.max(player1AllCards.length, player2AllCards.length);
  for (let i = 0; i < maxLen; i++) {
    if (player1AllCards[i]) {
      recycledFlipCards.push(player1AllCards[i]);
    }
    if (player2AllCards[i]) {
      recycledFlipCards.push(player2AllCards[i]);
    }
  }
  const communityWithFlippedCards = [...state.communityDeck, ...recycledFlipCards];

  const winningFlipCommunityCard: Card = {
    ...winningFlipCard,
    id: `${winningFlipCard.id}-war-flip-community-r${state.roundNumber}`,
  };

  // Set field control to winner's suit
  const fieldControlSuit = winner === 1 ? state.player1Suit : state.player2Suit;

  // v8 Split Deck: return the flipped cards to the community pool, then top up
  // each hand to INITIAL_HAND_SIZE from that player's OWN deck (hands carry
  // across rounds). Personal decks are equal, so both players draw evenly.
  let drawState: GameState = {
    ...state,
    communityDeck: communityWithFlippedCards,
  };
  const p1Need = Math.max(0, INITIAL_HAND_SIZE - drawState.player1.hand.length);
  const p2Need = Math.max(0, INITIAL_HAND_SIZE - drawState.player2.hand.length);
  drawState = drawFromPlayerDeck(drawState, 1, p1Need);
  drawState = drawFromPlayerDeck(drawState, 2, p2Need);

  // v5 Round Flow: deal face-up community cards into the three per-lane slots.
  // The all-lane slot is a duplicate of the winning War Flip card and does not
  // consume a card from the deck.
  drawState = dealCommunityCards(drawState, winningFlipCommunityCard);

  const continuedState: GameState = {
    ...drawState,
    phase: 'Main',
    currentPlayer: winner,
    // The flip winner takes the first turn; remember it so the round only ends
    // after the second player's matching turn (equal turns for both players).
    roundStartingPlayer: winner,
    cardsPlayedThisTurn: 0,
    flipResult: null,
    fieldControlSuit,
    // v7 Cycling Lane Flow: ensure the round-end queue is empty when entering
    // a fresh Main phase (it should already be, but be explicit).
    pendingRoundEndLanes: [],
    laneRelicEffects: createEmptyLaneRelicEffects(),
  };
  return checkBothHandsEmpty(continuedState);
}

function relicStackForPlayedCard(card: Card, playerSuit: StandardSuit | null): RelicType | null {
  if (!playerSuit || card.suit === playerSuit) return null;
  if (typeof card.rank === 'number') {
    if (card.rank >= 2 && card.rank <= 6) return 'sword';
    if (card.rank >= 7 && card.rank <= 10) return 'shield';
    return null;
  }
  if (card.rank === 'J') return 'shield';
  if (card.rank === 'Q' || card.rank === 'K' || card.rank === 'A' || card.rank === 'JOKER') return 'skull';
  return null;
}

/**
 * v5 Round Flow: pop up to 3 cards from the top of the shared deck and place
 * them in the per-lane community slots (left, middle, right). The all-lane
 * community slot can be supplied by override (War Flip duplicate), otherwise
 * it is drawn from the deck. No-ops gracefully if the shared deck is empty.
 */
function dealCommunityCards(state: GameState, allLaneCommunityOverride?: Card): GameState {
  const deck = [...state.communityDeck];
  const laneOrder: LaneId[] = ['left', 'middle', 'right'];
  const laneCommunityCards: Record<LaneId, Card | null> = {
    left: null,
    middle: null,
    right: null,
  };
  for (const laneId of laneOrder) {
    if (deck.length === 0) break;
    laneCommunityCards[laneId] = deck.shift()!;
  }
  const allLaneCommunityCard: Card | null = allLaneCommunityOverride ?? (deck.length > 0 ? deck.shift()! : null);
  return {
    ...state,
    communityDeck: deck,
    laneCommunityCards,
    allLaneCommunityCard,
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
  if (isLaneLockedByMissingCommunity(state, laneId)) return state;

  const playerSide = state.currentPlayer === 1 ? lane.player1 : lane.player2;
  if (playerSide.cards.length >= MAX_CARDS_PER_LANE) return state;

  // v6 Poker Rework: no descending-order restriction. Any card can be played in any order.

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

  const playerSuit = state.currentPlayer === 1 ? state.player1Suit : state.player2Suit;
  const relicStack = relicStackForPlayedCard(card, playerSuit);
  if (relicStack) {
    newState = incrementRelicStack(newState, state.currentPlayer, relicStack);
  }
  if (playerSuit && card.suit === playerSuit) {
    newState = incrementMinionStack(newState, state.currentPlayer);
  }

  // v2 Ability System: on-play triggers (Aces, Face Cards, Hearts non-face).
  // All gated behind SUIT_EFFECTS_ENABLED - a future suit rework will
  // re-enable (or replace) these handlers.
  if (SUIT_EFFECTS_ENABLED) {
    if (card.rank === 'A') {
      newState = handleAceOnPlay(newState, card, state.currentPlayer);

      // Check if Ace effect caused game over (e.g., Spades Ace damage)
      const gameOver = checkGameOver(newState);
      if (gameOver) {
        return gameOver;
      }
    }

    if (card.rank === 'J' || card.rank === 'Q' || card.rank === 'K') {
      newState = handleFaceCardOnPlay(newState, card, state.currentPlayer, laneId);

      // Check if Face Card effect caused game over (e.g., Spades J/Q/K damage)
      const gameOver = checkGameOver(newState);
      if (gameOver) {
        return gameOver;
      }
    }

    // v3 Hearts: 2-6 and 7-10 trigger ON PLAY (Hearts only)
    if (playerSuit === 'hearts' && typeof card.rank === 'number' && card.rank >= 2 && card.rank <= 10) {
      newState = handleHeartsNonFaceOnPlay(newState, card, state.currentPlayer);
    }
  }

  // v7 Cycling Lane Flow:
  // A lane resolves the moment BOTH players have 3 cards in it. The lane no
  // longer locks - resolveLane immediately clears the played cards and draws
  // a fresh per-lane community card so the lane is playable again.
  const laneAfterPlay = findLane(newState.lanes, laneId)!;
  const newPlayerSide = state.currentPlayer === 1 ? laneAfterPlay.player1 : laneAfterPlay.player2;
  const newOpponentSide = state.currentPlayer === 1 ? laneAfterPlay.player2 : laneAfterPlay.player1;

  if (
    newPlayerSide.cards.length === MAX_CARDS_PER_LANE &&
    newOpponentSide.cards.length === MAX_CARDS_PER_LANE
  ) {
    newState = resolveLane(newState, laneId);

    // Check if someone died from lane resolution
    const gameOver = checkGameOver(newState);
    if (gameOver) {
      return gameOver;
    }
  }

  // After the play (and any resulting mid-round lane resolution), check if
  // both players' hands are now empty - if so, kick off the end-of-round
  // sequential resolution flow.
  newState = checkBothHandsEmpty(newState);

  return newState;
}

/**
 * v7 Cycling Lane Flow: round-end trigger.
 *
 * A round now ends when BOTH players have empty hands (which, given the
 * per-turn draw rules, only happens when the shared deck is also exhausted).
 * Lanes do not lock during a round; they cycle (resolve → clear → fresh
 * per-lane community card → keep playing) until the shared deck and both
 * hands run dry.
 *
 * On round end we transition to `EndOfRoundResolving` and seed the
 * `pendingRoundEndLanes` queue with every lane that still has at least one
 * card on the board. The UI consumes that queue one lane at a time
 * (dispatching `RESOLVE_NEXT_END_OF_ROUND_LANE`), waiting for each lane's
 * resolution animation to finish before triggering the next. Once the queue
 * is empty the UI dispatches `FINALIZE_ROUND_END`, which moves the all-lane
 * community card to the outOfPlayPile and calls `startNewRound`.
 *
 * IMPORTANT: we do NOT call startNewRound here. Doing so would clobber
 * `lastLaneResolution` and skip every end-of-round animation.
 */
function checkBothHandsEmpty(state: GameState, justEndedPlayer?: CurrentPlayer): GameState {
  // Only fire while we're in normal Main play - never re-enter from
  // EndOfRoundResolving / Finished / etc.
  if (state.phase !== 'Main') return state;
  const bothHandsEmpty = state.player1.hand.length === 0 && state.player2.hand.length === 0;
  const allCommunityLanesLocked = areAllCommunityLanesLocked(state);
  if (!bothHandsEmpty && !allCommunityLanesLocked) return state;

  // Equal-turns guard. When the round would end purely because both hands are
  // empty (not because the board is community-locked), only end it at a turn
  // boundary where both players have taken the same number of turns. Turns
  // alternate starting with `roundStartingPlayer`, so "the non-starting player
  // just ended their turn" is exactly the moment turn counts are equal. We only
  // allow the empty-hands end from the end-of-turn path (which passes
  // `justEndedPlayer`); mid-turn callers leave it undefined and never trigger
  // it - the player presses End Turn instead, routing through the guarded path.
  // (A community-locked board ends immediately regardless, since neither player
  // can play anyway.)
  if (bothHandsEmpty && !allCommunityLanesLocked) {
    const endedByNonStarter = justEndedPlayer !== undefined && justEndedPlayer !== state.roundStartingPlayer;
    if (!endedByNonStarter) {
      return state; // wait for the second player's matching turn so turns stay equal
    }
  }

  // Build the queue of lanes that still have cards on the board. Empty lanes
  // are skipped entirely (no animation, no zero-damage resolve).
  const pending: LaneId[] = LANE_ORDER.filter((id) => {
    const lane = findLane(state.lanes, id);
    if (!lane) return false;
    return lane.player1.cards.length + lane.player2.cards.length > 0;
  });

  console.log(
    `[Round] ${bothHandsEmpty ? 'Both hands empty' : 'All community lanes locked'} - entering EndOfRoundResolving with ${pending.length} lane(s) still to resolve: [${pending.join(', ')}]`
  );

  return {
    ...state,
    phase: 'EndOfRoundResolving',
    pendingRoundEndLanes: pending,
  };
}

function handleEndTurn(state: GameState, fromNetwork?: boolean, endingPlayer?: CurrentPlayer): GameState {
  if (endingPlayer) {
    const nextPlayer: CurrentPlayer = endingPlayer === 1 ? 2 : 1;
    if (state.currentPlayer !== endingPlayer) {
      if (fromNetwork && state.currentPlayer === nextPlayer) {
        console.warn(`[Network] Ignoring duplicate END_TURN from player ${endingPlayer}; already advanced to player ${nextPlayer}`);
        return state;
      }
      console.warn(`[EndTurn] Ignoring END_TURN from player ${endingPlayer}; current player is ${state.currentPlayer}`);
      return state;
    }
  }

  // Only process turn handoff from Main. Network END_TURN is player-specific
  // and idempotent, so we should not force the phase back to Main here.
  if (!fromNetwork && state.phase !== 'Main') {
    console.log(`[EndTurn] Blocked - phase is ${state.phase}, not Main`);
    return state;
  }
  
  if (fromNetwork && state.phase !== 'Main') {
    console.warn(`[Network] Ignoring END_TURN received during ${state.phase}`);
    return state;
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
    const hasPlayableLane = LANE_ORDER.some((laneId) => {
      if (isLaneLockedByMissingCommunity(state, laneId)) return false;
      const lane = findLane(state.lanes, laneId);
      if (!lane) return false;
      const playerSide = currentPlayer === 1 ? lane.player1 : lane.player2;
      return playerSide.cards.length < MAX_CARDS_PER_LANE;
    });
    
    // You can always end your turn if your hand is empty (nothing to play).
    // Otherwise you must have played your full quota (or have no legal lane).
    void playedAtLeast1;
    if (!played3Cards && !handIsEmpty && hasPlayableLane) {
      return state; // Can't end turn yet
    }
  } else {
    console.log(`[Network] Processing END_TURN from network - currentPlayer was ${currentPlayer}, cardsPlayed was ${state.cardsPlayedThisTurn}, skipping validation`);
  }

  // END OF TURN: Draw up to 3 cards for the current player from their OWN deck.
  const currentPlayerDeck = currentPlayer === 1 ? state.player1Deck : state.player2Deck;
  const endTurnDrawnCards = currentPlayerDeck.slice(0, Math.min(CARDS_TO_DRAW_END_TURN, currentPlayerDeck.length));
  let drawState: GameState = drawFromPlayerDeck(state, currentPlayer, CARDS_TO_DRAW_END_TURN);
  drawState = {
    ...drawState,
    [playerKey(currentPlayer)]: {
      ...drawState[playerKey(currentPlayer)],
      lastEndTurnDrawCardIds: endTurnDrawnCards.map((card) => card.id),
    },
  };

  // Switch to next player
  const nextPlayer: CurrentPlayer = currentPlayer === 1 ? 2 : 1;
  console.log(`[Turn] Switching from player ${currentPlayer} to player ${nextPlayer}, cardsPlayedThisTurn will reset to 0`);

  let newState: GameState = {
    ...drawState,
    currentPlayer: nextPlayer,
    cardsPlayedThisTurn: 0,
  };

  // v2: Start/End of turn tick processing (Spades Bleed, Hearts Regen).
  // Gated behind SUIT_EFFECTS_ENABLED - a future suit rework will re-enable
  // these ticks. While disabled, bleedStacks/regenStacks stay empty anyway
  // because no effect ever populates them, so this is belt-and-braces.
  if (SUIT_EFFECTS_ENABLED) {
    // Bleed ticks for the next player (at start of their turn)
    newState = processBleedTicks(newState, nextPlayer);

    // Check if bleed killed them
    const bleedGameOver = checkGameOver(newState);
    if (bleedGameOver) {
      return bleedGameOver;
    }

    // Regen ticks for both players
    newState = processRegenTicks(newState, 1, nextPlayer === 1);
    newState = processRegenTicks(newState, 2, nextPlayer === 2);
  }

  // v7 Cycling Lane Flow: an end-of-turn (with its draws) might still leave
  // both players with empty hands - typically when the shared deck has run
  // dry. In that case we kick off the end-of-round animation flow right here
  // instead of waiting for a play that will never happen.
  newState = checkBothHandsEmpty(newState, currentPlayer);
  if (newState.phase === 'EndOfRoundResolving') {
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

function canUseRelic(state: GameState, player: CurrentPlayer, relic: RelicType): boolean {
  if (state.phase !== 'Main') return false;
  if (state.currentPlayer !== player) return false;
  return isAbilityActive(state[playerKey(player)].relicStacks[relic]);
}

function handleUseRelicShield(state: GameState, player: CurrentPlayer, laneId: LaneId): GameState {
  if (!canUseRelic(state, player, 'shield')) return state;
  if (!findLane(state.lanes, laneId)) return state;

  const key = playerKey(player);
  const newState = deactivateRelic(state, player, 'shield');
  return {
    ...newState,
    laneRelicEffects: {
      ...newState.laneRelicEffects,
      [laneId]: {
        ...newState.laneRelicEffects[laneId],
        [key]: {
          ...newState.laneRelicEffects[laneId][key],
          shielded: true,
        },
      },
    },
  };
}

function handleUseRelicSword(state: GameState, player: CurrentPlayer, laneId: LaneId): GameState {
  if (!canUseRelic(state, player, 'sword')) return state;
  if (!findLane(state.lanes, laneId)) return state;

  const key = playerKey(player);
  const newState = deactivateRelic(state, player, 'sword');
  return {
    ...newState,
    laneRelicEffects: {
      ...newState.laneRelicEffects,
      [laneId]: {
        ...newState.laneRelicEffects[laneId],
        [key]: {
          ...newState.laneRelicEffects[laneId][key],
          swordBonus: true,
        },
      },
    },
  };
}

function handleUseRelicSkull(
  state: GameState,
  player: CurrentPlayer,
  cardId: string,
  fromLaneId: LaneId,
  toLaneId: LaneId,
): GameState {
  if (!canUseRelic(state, player, 'skull')) return state;
  if (fromLaneId === toLaneId) return state;

  const fromLane = findLane(state.lanes, fromLaneId);
  const toLane = findLane(state.lanes, toLaneId);
  if (!fromLane || !toLane) return state;
  if (isLaneLockedByMissingCommunity(state, toLaneId)) return state;

  const key = playerKey(player);
  const fromCards = fromLane[key].cards;
  const toCards = toLane[key].cards;
  if (toCards.length >= MAX_CARDS_PER_LANE) return state;

  const cardIndex = fromCards.findIndex((card) => card.id === cardId);
  if (cardIndex === -1) return state;

  const movedCard = fromCards[cardIndex];
  const nextFromCards = fromCards.filter((card) => card.id !== cardId);
  const nextToCards = [...toCards, movedCard];
  const updatedFromLane: Lane = {
    ...fromLane,
    [key]: { cards: nextFromCards },
  };
  const updatedToLane: Lane = {
    ...toLane,
    [key]: { cards: nextToCards },
  };

  let newState = deactivateRelic(
    {
      ...state,
      lanes: state.lanes.map((lane) => {
        if (lane.id === fromLaneId) return updatedFromLane;
        if (lane.id === toLaneId) return updatedToLane;
        return lane;
      }),
    },
    player,
    'skull',
  );

  const targetAfterMove = findLane(newState.lanes, toLaneId);
  if (
    targetAfterMove &&
    targetAfterMove.player1.cards.length === MAX_CARDS_PER_LANE &&
    targetAfterMove.player2.cards.length === MAX_CARDS_PER_LANE
  ) {
    newState = resolveLane(newState, toLaneId);
    const gameOver = checkGameOver(newState);
    if (gameOver) return gameOver;
  }

  return checkBothHandsEmpty(newState);
}

function handleUseRelicSpadesSkullRandomize(
  state: GameState,
  player: CurrentPlayer,
  cardId: string,
  replacement: Card,
): GameState {
  if (!canUseRelic(state, player, 'skull')) return state;
  const playerSuit = player === 1 ? state.player1Suit : state.player2Suit;
  if (playerSuit !== 'spades') return state;
  const playerState = state[playerKey(player)];
  if (!playerState.hand.some((card) => card.id === cardId)) return state;

  const updatedState = updatePlayerHandCard(state, player, cardId, () => replacement);
  return deactivateRelic(updatedState, player, 'skull');
}

function handleUseRelicHeartsSkullFromDiscard(
  state: GameState,
  player: CurrentPlayer,
  cardId: string,
  sourceDiscardCardId: string,
): GameState {
  if (!canUseRelic(state, player, 'skull')) return state;
  const playerSuit = player === 1 ? state.player1Suit : state.player2Suit;
  if (playerSuit !== 'hearts') return state;
  const playerState = state[playerKey(player)];
  if (!playerState.hand.some((card) => card.id === cardId)) return state;
  const discardCard = state.outOfPlayPile.find((card) => card.id === sourceDiscardCardId);
  if (!discardCard) return state;

  const updatedState = updatePlayerHandCard(state, player, cardId, (handCard) => ({
    ...handCard,
    suit: discardCard.suit,
    rank: discardCard.rank,
  }));
  return deactivateRelic(updatedState, player, 'skull');
}

function handleUseMinionRandomBuff(state: GameState, player: CurrentPlayer, cardId: string): GameState {
  if (!canUseMinion(state, player)) return state;
  const playerSuit = player === 1 ? state.player1Suit : state.player2Suit;
  if (playerSuit !== 'spades' && playerSuit !== 'hearts') return state;
  const card = findCardById(state[playerKey(player)].hand, cardId);
  if (!card) return state;

  const effect = {
    type: playerSuit === 'spades' ? 'spades-damage' as const : 'hearts-heal' as const,
    owner: player,
    value: 3,
  };

  return deactivateMinion(
    updatePlayerHandCard(state, player, cardId, (handCard) => ({
      ...handCard,
      minionEffect: effect,
    })),
    player,
  );
}

function handleUseMinionSpadesReroll(
  state: GameState,
  player: CurrentPlayer,
  cardIds: string[],
  newCards: Card[],
  playerDeck: Card[],
): GameState {
  if (!canUseSpadesMinionReroll(state, player)) return state;
  if (cardIds.length !== CARDS_TO_DRAW_END_TURN || newCards.length !== CARDS_TO_DRAW_END_TURN) return state;

  const key = playerKey(player);
  const requiredIds = state[key].lastEndTurnDrawCardIds;
  const matchesLastDraw = requiredIds.every((cardId) => cardIds.includes(cardId)) &&
    cardIds.every((cardId) => requiredIds.includes(cardId));
  if (!matchesLastDraw) return state;

  const remainingHand = state[key].hand.filter((card) => !cardIds.includes(card.id));
  // The reroll only touches the acting player's OWN deck, so the split stays even.
  const deckKey = player === 1 ? 'player1Deck' : 'player2Deck';
  const rerolledState = {
    ...state,
    [deckKey]: playerDeck,
    [key]: {
      ...state[key],
      hand: [...remainingHand, ...newCards],
      lastEndTurnDrawCardIds: newCards.map((card) => card.id),
    },
  };

  return deactivateMinion(rerolledState, player);
}

function handleUseMinionHeartsRelicStacks(
  state: GameState,
  player: CurrentPlayer,
  relic: 'sword' | 'shield',
): GameState {
  if (!canUseMinion(state, player)) return state;
  const playerSuit = player === 1 ? state.player1Suit : state.player2Suit;
  if (playerSuit !== 'hearts') return state;
  const key = playerKey(player);
  const stackedState = withRelicStack(state, player, relic, state[key].relicStacks[relic] + 2);
  return deactivateMinion(stackedState, player);
}

function handleUseMinionClubsChangeSuit(state: GameState, player: CurrentPlayer, cardId: string, suit: StandardSuit): GameState {
  if (!canUseMinion(state, player)) return state;
  const playerSuit = player === 1 ? state.player1Suit : state.player2Suit;
  if (playerSuit !== 'clubs') return state;
  const card = findCardById(state[playerKey(player)].hand, cardId);
  if (!card) return state;

  return deactivateMinion(
    updatePlayerHandCard(state, player, cardId, (handCard) => ({
      ...handCard,
      suit,
    })),
    player,
  );
}

function handleUseMinionDiamondsRankUp(state: GameState, player: CurrentPlayer, cardId: string): GameState {
  if (!canUseMinion(state, player)) return state;
  const playerSuit = player === 1 ? state.player1Suit : state.player2Suit;
  if (playerSuit !== 'diamonds') return state;
  const card = findCardById(state[playerKey(player)].hand, cardId);
  if (!card) return state;
  const newRank = nextRank(card.rank);
  if (!newRank) return state;

  return deactivateMinion(
    updatePlayerHandCard(state, player, cardId, (handCard) => ({
      ...handCard,
      rank: newRank,
    })),
    player,
  );
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

  // v6 Poker Rework: evaluate each side's best hand from their 3 lane cards + per-lane community + all-lane community.
  // Only the utilized cards contribute their base values; the bonus is the hand's tier bonus.
  const laneCommunityCard = state.laneCommunityCards[laneId] ?? null;
  const allLaneCommunityCard = state.allLaneCommunityCard ?? null;
  const p1Hand: BestHand = evaluateBestHand(lane.player1.cards, laneCommunityCard, allLaneCommunityCard);
  const p2Hand: BestHand = evaluateBestHand(lane.player2.cards, laneCommunityCard, allLaneCommunityCard);
  const p1BaseSum = p1Hand.baseDamage;
  const p2BaseSum = p2Hand.baseDamage;
  let p1PokerBonus = p1Hand.bonus;
  let p2PokerBonus = p2Hand.bonus;
  const relicEffects = state.laneRelicEffects[laneId];
  
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

  // Relic Sword: one-shot lane effect that doubles only the owner's poker
  // bonus contribution for this lane's next resolve.
  if (relicEffects.player1.swordBonus && p1PokerBonus > 0) {
    p1PokerBonus *= 2;
  }
  if (relicEffects.player2.swordBonus && p2PokerBonus > 0) {
    p2PokerBonus *= 2;
  }

  const p1MinionDamageCard = p1Hand.utilizedCards.find(
    (card) => card.minionEffect?.type === 'spades-damage' && card.minionEffect.owner === 1,
  );
  const p2MinionDamageCard = p2Hand.utilizedCards.find(
    (card) => card.minionEffect?.type === 'spades-damage' && card.minionEffect.owner === 2,
  );
  const p1MinionHealCard = p1Hand.utilizedCards.find(
    (card) => card.minionEffect?.type === 'hearts-heal' && card.minionEffect.owner === 1,
  );
  const p2MinionHealCard = p2Hand.utilizedCards.find(
    (card) => card.minionEffect?.type === 'hearts-heal' && card.minionEffect.owner === 2,
  );
  const p1MinionDamage = p1MinionDamageCard?.minionEffect?.value ?? 0;
  const p2MinionDamage = p2MinionDamageCard?.minionEffect?.value ?? 0;
  const p1MinionHealing = p1MinionHealCard?.minionEffect?.value ?? 0;
  const p2MinionHealing = p2MinionHealCard?.minionEffect?.value ?? 0;
  
  // Calculate lane totals with potentially boosted poker bonuses
  let p1Total = p1BaseSum + p1PokerBonus + p1MinionDamage;
  let p2Total = p2BaseSum + p2PokerBonus + p2MinionDamage;

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
    p1Total = p1BaseSum + (p1PokerBonus * 2) + p1MinionDamage;
  } else if (provisionalWinner === 2 && p2HasClubsJack) {
    // Player 2 would win and has Clubs Jack - double their poker bonus (on top of Blood Debt boost)
    p2Total = p2BaseSum + (p2PokerBonus * 2) + p2MinionDamage;
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

  if (p1MinionDamageCard) {
    triggeredEffects.push({
      cardId: p1MinionDamageCard.id,
      suit: 'spades',
      rank: p1MinionDamageCard.rank,
      effectType: `Minion: +${p1MinionDamage} lane damage`,
      strength: 'full',
      value: p1MinionDamage,
    });
  }
  if (p2MinionDamageCard) {
    triggeredEffects.push({
      cardId: p2MinionDamageCard.id,
      suit: 'spades',
      rank: p2MinionDamageCard.rank,
      effectType: `Minion: +${p2MinionDamage} lane damage`,
      strength: 'full',
      value: p2MinionDamage,
    });
  }

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

  // Relic Shield: one-shot lane effect that halves incoming damage for the
  // shield owner on this lane's next resolve. The reduced damage rounds up.
  let mitigatedDamage = baseDamage;
  if (winner && loser && relicEffects[playerKey(loser)].shielded) {
    mitigatedDamage = Math.ceil(baseDamage / 2);
  }

  // Apply base damage first (before suit effects)
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

  if (p1MinionHealing > 0 && p1MinionHealCard) {
    newState = { ...newState, player1: { ...newState.player1, hp: newState.player1.hp + p1MinionHealing } };
    bonusHealing += p1MinionHealing;
    triggeredEffects.push({
      cardId: p1MinionHealCard.id,
      suit: 'hearts',
      rank: p1MinionHealCard.rank,
      effectType: `Minion: healed ${p1MinionHealing} HP`,
      strength: 'full',
      value: p1MinionHealing,
    });
  }

  if (p2MinionHealing > 0 && p2MinionHealCard) {
    newState = { ...newState, player2: { ...newState.player2, hp: newState.player2.hp + p2MinionHealing } };
    bonusHealing += p2MinionHealing;
    triggeredEffects.push({
      cardId: p2MinionHealCard.id,
      suit: 'hearts',
      rank: p2MinionHealCard.rank,
      effectType: `Minion: healed ${p2MinionHealing} HP`,
      strength: 'full',
      value: p2MinionHealing,
    });
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

  // v3 Hearts Ace: if the winner had armed the damage-to-regen flag, consume it
  // and create a temp regen instance equal to the damage dealt this resolution.
  if (winner && loser) {
    const winnerState = winner === 1 ? newState.player1 : newState.player2;
    const winnerSuit = winner === 1 ? state.player1Suit : state.player2Suit;
    if (winnerState.pendingAceDamageToRegen && winnerSuit === 'hearts') {
      const totalDamageDealt = mitigatedDamage + bonusDamage;
      if (totalDamageDealt > 0) {
        newState = addTempRegen(newState, winner, totalDamageDealt, 3);
        triggeredEffects.push({
          cardId: 'hearts-ace-conversion',
          suit: 'hearts',
          rank: 'A',
          effectType: `Ace: converted ${totalDamageDealt} damage into temp Regen (3t)`,
          strength: 'full'
        });
      }
      // Always clear the flag when a lane is won, even if damage was 0
      if (winner === 1) {
        newState = { ...newState, player1: { ...newState.player1, pendingAceDamageToRegen: false } };
      } else {
        newState = { ...newState, player2: { ...newState.player2, pendingAceDamageToRegen: false } };
      }
    }
  }

  // Clear lane neutralization after resolution
  if (wasNeutralized) {
    newState = clearLaneNeutralization(newState, laneId);
  }

  // v7 Cycling Lane Flow: move all played lane cards AND the spent per-lane
  // community card (if any) to outOfPlayPile, then immediately draw a fresh
  // per-lane community card from the top of the shared deck (or null if the
  // deck is empty). The lane itself is cleared so players can keep playing
  // into it later in the round - lanes no longer "lock". The all-lane
  // community card is intentionally NOT touched here; it persists until the
  // round ends.
  const laneCards = clearMinionEffectsFromCards([...lane.player1.cards, ...lane.player2.cards]);
  const spentCommunityCard = newState.laneCommunityCards[laneId];
  const newOutOfPlayPile: Card[] = [
    ...newState.outOfPlayPile,
    ...laneCards,
    ...(spentCommunityCard ? [spentCommunityCard] : []),
  ];
  const clearedLane: Lane = { ...lane, player1: { cards: [] }, player2: { cards: [] } };

  // Draw the replacement per-lane community card right now so the lane is
  // immediately playable again with its new community card visible. v8 Split
  // Deck: community cards come from the neutral community pool, never from a
  // player's deck, so refills don't affect the even player split.
  let nextCommunityDeck = newState.communityDeck;
  let replacementCommunityCard: Card | null = null;
  if (nextCommunityDeck.length > 0) {
    replacementCommunityCard = nextCommunityDeck[0];
    nextCommunityDeck = nextCommunityDeck.slice(1);
  }

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
    wasNeutralized,
    player1HandType: p1Hand.type,
    player2HandType: p2Hand.type,
    player1Cards: lane.player1.cards,
    player2Cards: lane.player2.cards,
    player1BaseDamage: p1BaseSum,
    player2BaseDamage: p2BaseSum,
    player1PokerBonus: p1PokerBonus,
    player2PokerBonus: p2PokerBonus,
  };

  // Reset overkill tracking at end of resolution
  return {
    ...newState,
    lanes: updateLane(newState.lanes, clearedLane),
    communityDeck: nextCommunityDeck,
    outOfPlayPile: newOutOfPlayPile,
    laneCommunityCards: { ...newState.laneCommunityCards, [laneId]: replacementCommunityCard },
    laneRelicEffects: {
      ...newState.laneRelicEffects,
      [laneId]: {
        player1: { ...EMPTY_RELIC_LANE_EFFECT.player1 },
        player2: { ...EMPTY_RELIC_LANE_EFFECT.player2 },
      },
    },
    player1LanesLost,
    player2LanesLost,
    player1SupportAvailable,
    player2SupportAvailable,
    lastLaneResolution,
    overkillThisTurn: 0
  };
}

const BASE_SUPPORT_ABILITY_AMOUNT = 3;

function handleUseSupport(state: GameState, player: CurrentPlayer): GameState {
  // Can only use during Main phase
  if (state.phase !== 'Main') return state;
  
  // Check if the player has support available
  const supportAvailable = player === 1 ? state.player1SupportAvailable : state.player2SupportAvailable;
  if (!supportAvailable) return state;
  
  // Support amount is fixed and always heals the user.
  const supportAmount = BASE_SUPPORT_ABILITY_AMOUNT;
  
  let player1 = { ...state.player1 };
  let player2 = { ...state.player2 };
  
  if (player === 1) {
    player1 = { ...player1, hp: player1.hp + supportAmount };
  } else {
    player2 = { ...player2, hp: player2.hp + supportAmount };
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

/**
 * v7 Cycling Lane Flow: pop the next lane off `pendingRoundEndLanes` and
 * resolve it. Damage / animation / community-card cycling all happen exactly
 * the same as a mid-round resolve - the only difference is that the trigger
 * here is the end-of-round queue, not a 3v3 fill.
 *
 * Lanes in the queue can be partial (1v0, 2v3, etc.); evaluateBestHand handles
 * any number of player cards, so partial sides just contribute the cards they
 * actually played. After the resolve, lane cards + spent community card go to
 * outOfPlayPile and a replacement community card is drawn (which will then be
 * folded back into the deck by FINALIZE_ROUND_END / startNewRound shortly
 * after - that wasted card is intentional and keeps mid-round and
 * end-of-round resolves on the same code path).
 *
 * The UI is responsible for pacing: it dispatches this action only after the
 * previous lane's resolution overlay has finished playing.
 */
function handleResolveNextEndOfRoundLane(state: GameState): GameState {
  if (state.phase !== 'EndOfRoundResolving') return state;
  if (state.pendingRoundEndLanes.length === 0) return state;

  const [nextLaneId, ...rest] = state.pendingRoundEndLanes;
  let newState: GameState = { ...state, pendingRoundEndLanes: rest };

  // Defensive: only resolve if the lane actually still has cards. (It always
  // should, because we filtered when seeding the queue.)
  const lane = findLane(newState.lanes, nextLaneId);
  if (lane && lane.player1.cards.length + lane.player2.cards.length > 0) {
    newState = resolveLane(newState, nextLaneId);

    const gameOver = checkGameOver(newState);
    if (gameOver) {
      return gameOver;
    }
  } else {
    console.log(`[Round] Skipping end-of-round resolve for lane ${nextLaneId} - already empty`);
  }

  return newState;
}

/**
 * v7 Cycling Lane Flow: finalize a round.
 *
 * Called by the UI after every queued lane has finished its resolution
 * animation. Moves the all-lane community card (the only community card that
 * persists across mid-round resolves) into the outOfPlayPile and starts a new
 * round - which pools + reshuffles everything into fresh split decks, transitions to
 * InitialFlip, and re-runs the War Flip + initial deal.
 *
 * Safety nets: if either player has died on the way here, return the
 * GameOver state. If both players are alive and HPs are tied, fall into
 * SuddenDeath instead of starting a new round.
 */
function handleFinalizeRoundEnd(state: GameState): GameState {
  if (state.phase !== 'EndOfRoundResolving') return state;
  if (state.pendingRoundEndLanes.length > 0) {
    console.warn('[Round] FINALIZE_ROUND_END dispatched while lanes still queued - ignoring');
    return state;
  }

  const gameOver = checkGameOver(state);
  if (gameOver) {
    return gameOver;
  }

  if (state.player1.hp === state.player2.hp) {
    return { ...state, phase: 'SuddenDeath' };
  }

  // Move a real all-lane community card to the outOfPlayPile so it's reshuffled
  // back into the deck on the next round's startNewRound. War Flip community
  // cards are round-only duplicates of a real card that was already returned
  // to the deck, so they should disappear instead of creating an extra card.
  let newOutOfPlay = state.outOfPlayPile;
  if (state.allLaneCommunityCard && !state.allLaneCommunityCard.id.includes('-war-flip-community-r')) {
    newOutOfPlay = [...newOutOfPlay, state.allLaneCommunityCard];
  }
  const beforeRound: GameState = {
    ...state,
    outOfPlayPile: newOutOfPlay,
    allLaneCommunityCard: null,
  };

  return startNewRound(beforeRound);
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

  return { ...state, phase: 'Finished', winner: winner || 1, lanes: createEmptyLanes(), outOfPlayPile: allCards, player1Deck: [], player2Deck: [], communityDeck: [] };
}

export function canPlayCardToLane(state: GameState, cardId: string, laneId: LaneId): boolean {
  if (state.phase !== 'Main') return false;
  // v7 Cycling Lane Flow: lanes never lock - they cycle (resolve + clear +
  // fresh community card) on every 3v3 fill, so the only legality checks left
  // here are phase, card ownership, lane existence, and the per-side 3-card cap.
  const currentPlayerState = state.currentPlayer === 1 ? state.player1 : state.player2;
  const card = findCardById(currentPlayerState.hand, cardId);
  if (!card) return false;
  const lane = findLane(state.lanes, laneId);
  if (!lane) return false;
  if (isLaneLockedByMissingCommunity(state, laneId)) return false;
  const playerSide = state.currentPlayer === 1 ? lane.player1 : lane.player2;
  if (playerSide.cards.length >= MAX_CARDS_PER_LANE) return false;
  // v6 Poker Rework: descending-order restriction removed. Any 3 cards may be played in any order.
  return true;
}

export function canEndTurn(state: GameState): boolean {
  if (state.phase !== 'Main') return false;
  
  const currentPlayerState = state.currentPlayer === 1 ? state.player1 : state.player2;
  const handIsEmpty = currentPlayerState.hand.length === 0;
  const played3Cards = state.cardsPlayedThisTurn >= CARDS_PER_TURN;
  const playedAtLeast1 = state.cardsPlayedThisTurn >= 1;
  const hasPlayableLane = LANE_ORDER.some((laneId) => {
    if (isLaneLockedByMissingCommunity(state, laneId)) return false;
    const lane = findLane(state.lanes, laneId);
    if (!lane) return false;
    const playerSide = state.currentPlayer === 1 ? lane.player1 : lane.player2;
    return playerSide.cards.length < MAX_CARDS_PER_LANE;
  });
  
  // Can end turn if: played 3 cards, your hand is empty (nothing left to play),
  // or there are no legal community lanes left to play into.
  void playedAtLeast1;
  return played3Cards || handIsEmpty || !hasPlayableLane;
}
