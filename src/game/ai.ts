/**
 * Simple AI for War-Lanes Poker
 * 
 * AI Strategy:
 * - Prioritize playing high-value cards to lanes where it can win
 * - Try to form poker bonuses (pairs, straights, flushes)
 * - Avoid discarding high-value cards (self-damage)
 * - Focus on lanes where opponent is weak
 */

import type { Card, GameState, LaneId } from './types';
import { cardValue } from './deck';
import { calculateLaneTotal } from './poker';
import { canPlayCardToLane } from './reducer';

export interface AIMove {
  type: 'lane' | 'discard';
  cardId: string;
  laneId?: LaneId;
}

const LANE_IDS: LaneId[] = ['left', 'middle', 'right'];

/**
 * Get the AI's next move.
 * Returns the best move for the current game state.
 */
export function getAIMove(state: GameState): AIMove | null {
  // AI is always player 2
  const hand = state.player2.hand;
  if (hand.length === 0) return null;

  // Sort hand by value (prefer playing lower cards first, save high cards)
  const sortedHand = [...hand].sort((a, b) => cardValue(a) - cardValue(b));

  // Try to find the best lane play
  const bestLanePlay = findBestLanePlay(state, sortedHand);
  if (bestLanePlay) {
    return bestLanePlay;
  }

  // If no legal lane play, discard the lowest value card to minimize self-damage
  const lowestCard = sortedHand[0];
  return { type: 'discard', cardId: lowestCard.id };
}

/**
 * Find the best lane to play a card to.
 */
function findBestLanePlay(state: GameState, sortedHand: Card[]): AIMove | null {
  let bestMove: AIMove | null = null;
  let bestScore = -Infinity;

  for (const card of sortedHand) {
    for (const laneId of LANE_IDS) {
      if (canPlayCardToLane(state, card.id, laneId)) {
        const score = evaluateLanePlay(state, card, laneId);
        if (score > bestScore) {
          bestScore = score;
          bestMove = { type: 'lane', cardId: card.id, laneId };
        }
      }
    }
  }

  return bestMove;
}

/**
 * Evaluate how good a lane play is.
 * Higher score = better play.
 */
function evaluateLanePlay(state: GameState, card: Card, laneId: LaneId): number {
  const lane = state.lanes.find(l => l.id === laneId)!;
  const aiSide = lane.player2;
  const playerSide = lane.player1;

  let score = 0;

  // Base score: card value contributes to lane total
  score += cardValue(card);

  // Bonus: prefer lanes where we're already invested
  score += aiSide.cards.length * 5;

  // Bonus: prefer lanes where we can complete (get to 3 cards)
  if (aiSide.cards.length === 2) {
    score += 15; // About to complete a lane
  }

  // Evaluate potential poker bonus
  const potentialCards = [...aiSide.cards, card];
  const currentTotal = calculateLaneTotal(aiSide.cards);
  const newTotal = calculateLaneTotal(potentialCards);
  const bonusGained = newTotal - currentTotal - cardValue(card);
  score += bonusGained * 2; // Weight bonus formation highly

  // Consider opponent's strength in this lane
  const opponentTotal = calculateLaneTotal(playerSide.cards);
  
  // If opponent has cards, prefer lanes where we can win
  if (playerSide.cards.length > 0) {
    if (newTotal > opponentTotal) {
      score += 10; // We'd be winning this lane
    } else if (newTotal < opponentTotal) {
      score -= 5; // We'd be losing, but might catch up
    }
  }

  // Prefer empty lanes slightly (spread out initially)
  if (aiSide.cards.length === 0 && playerSide.cards.length === 0) {
    score += 3;
  }

  // Slight preference for middle lane (strategic position)
  if (laneId === 'middle') {
    score += 2;
  }

  // Check for potential pairs/straights with existing cards
  if (aiSide.cards.length > 0) {
    const existingRanks = aiSide.cards.map(c => c.rank);
    // Bonus for forming a pair
    if (existingRanks.includes(card.rank)) {
      score += 8;
    }
    // Bonus for potential straight
    const values = [...aiSide.cards.map(c => cardValue(c)), cardValue(card)].sort((a, b) => a - b);
    if (values.length >= 2) {
      const isConsecutive = values.every((v, i) => i === 0 || v === values[i - 1] + 1);
      if (isConsecutive) {
        score += 10;
      }
    }
    // Bonus for flush potential
    const existingSuits = aiSide.cards.map(c => c.suit);
    if (existingSuits.every(s => s === card.suit)) {
      score += 8;
    }
  }

  return score;
}

/**
 * Execute AI turn - plays 3 cards automatically.
 * Returns array of actions to dispatch.
 */
export function executeAITurn(state: GameState): AIMove[] {
  const moves: AIMove[] = [];
  let currentState = state;

  for (let i = 0; i < 3; i++) {
    const move = getAIMove(currentState);
    if (!move) break;
    
    moves.push(move);
    
    // Simulate the move for next iteration
    currentState = simulateMove(currentState, move);
  }

  return moves;
}

/**
 * Simulate a move to get the resulting state (for AI planning).
 */
function simulateMove(state: GameState, move: AIMove): GameState {
  const hand = [...state.player2.hand];
  const cardIndex = hand.findIndex(c => c.id === move.cardId);
  if (cardIndex === -1) return state;
  
  const card = hand[cardIndex];
  hand.splice(cardIndex, 1);

  if (move.type === 'discard') {
    return {
      ...state,
      player2: { ...state.player2, hand, hp: state.player2.hp - cardValue(card) },
      discardPile: [...state.discardPile, card],
      cardsPlayedThisTurn: state.cardsPlayedThisTurn + 1,
    };
  }

  // Lane play
  const lanes = state.lanes.map(lane => {
    if (lane.id !== move.laneId) return lane;
    return {
      ...lane,
      player2: { cards: [...lane.player2.cards, card] },
    };
  });

  return {
    ...state,
    player2: { ...state.player2, hand },
    lanes,
    cardsPlayedThisTurn: state.cardsPlayedThisTurn + 1,
  };
}


