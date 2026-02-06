/**
 * War-Lanes Poker Game Engine
 */

export type { Card, CurrentPlayer, GamePhase, GameState, Lane, LaneId, LaneSide, PlayerState, Rank, StandardRank, StandardSuit, Suit } from './types';
export { cardToString, cardValue, createDeck, DECK_SIZE, findCardById, isJoker, JOKER_COUNT, rankValue, removeCardById, shuffle, STANDARD_RANKS, STANDARD_SUITS } from './deck';
export { calculateBaseSum, calculateLaneTotal, evaluateLaneBonus, getJokerMimicInfo, isFlush, isPair, isStraight, isThreeOfAKind } from './poker';
export type { JokerMimicInfo } from './poker';
export { applyDamage, createEmptyLanes, drawCards, findLane, initializeNewGame, isLaneReadyToResolve, startNewRound, updateLane } from './state';
export type { GameAction } from './reducer';
export { canEndTurn, canPlayCardToLane, gameReducer } from './reducer';
export { executeAITurn, getAIMove, getAIEffectChoice } from './ai';
export type { AIMove, AIEffectChoiceAction } from './ai';
export { applyWinnerDamageBonus, calculateLaneSuitEffects, getCardEffectTooltip, getSuitEffectValue, isCardActive, DAMAGE_SUITS, HEALING_SUITS } from './suitEffects';


