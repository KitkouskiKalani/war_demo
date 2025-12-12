/**
 * AI for War-Lanes Poker
 * 
 * AI Strategy (v2 - Improved):
 * 1. URGENCY: Respond to lanes where player has 3 cards (pending resolution)
 * 2. COMPLETE: Try to complete lanes where AI has 2 cards
 * 3. BUILD: Continue building in lanes where AI has cards
 * 4. START: Start new lanes with lowest value cards
 * 5. DISCARD: Only as last resort (no legal plays)
 * 
 * General principle: Play lowest cards first, save high cards for later
 */

import type { Card, GameState, LaneId, Lane } from './types';
import { cardValue } from './deck';
import { calculateLaneTotal } from './poker';
import { canPlayCardToLane } from './reducer';

export interface AIMove {
  type: 'lane' | 'discard';
  cardId: string;
  laneId?: LaneId;
}

const LANE_IDS: LaneId[] = ['left', 'middle', 'right'];
const MAX_CARDS_PER_LANE = 3;

/**
 * Get the AI's next move.
 * Returns the best move for the current game state.
 */
export function getAIMove(state: GameState): AIMove | null {
  // AI is always player 2
  const hand = state.player2.hand;
  if (hand.length === 0) return null;

  // Sort hand by value (play lowest cards first)
  const sortedHand = [...hand].sort((a, b) => cardValue(a) - cardValue(b));

  // Priority 1: Respond to URGENT lanes (player has 3 cards, will auto-resolve next turn)
  const urgentMove = findUrgentLanePlay(state, sortedHand);
  if (urgentMove) {
    return urgentMove;
  }

  // Priority 2-4: Find best strategic lane play
  const strategicMove = findStrategicLanePlay(state, sortedHand);
  if (strategicMove) {
    return strategicMove;
  }

  // Priority 5: Discard lowest card as last resort
  const lowestCard = sortedHand[0];
  return { type: 'discard', cardId: lowestCard.id };
}

/**
 * Find urgent lane plays - lanes where player has 3 cards (pending resolution).
 * AI MUST respond to these or lose the lane by default.
 */
function findUrgentLanePlay(state: GameState, sortedHand: Card[]): AIMove | null {
  // Find lanes where player (player1) has 3 cards but AI doesn't
  const urgentLanes = state.lanes.filter(lane => 
    lane.player1.cards.length === MAX_CARDS_PER_LANE && 
    lane.player2.cards.length < MAX_CARDS_PER_LANE
  );

  if (urgentLanes.length === 0) return null;

  // For each urgent lane, try to play a card (lowest first)
  for (const lane of urgentLanes) {
    for (const card of sortedHand) {
      if (canPlayCardToLane(state, card.id, lane.id)) {
        return { type: 'lane', cardId: card.id, laneId: lane.id };
      }
    }
  }

  return null;
}

/**
 * Find strategic lane plays following priority order:
 * 1. Complete lanes (AI has 2 cards)
 * 2. Add to existing lanes (AI has 1 card)
 * 3. Start new lanes
 */
function findStrategicLanePlay(state: GameState, sortedHand: Card[]): AIMove | null {
  // Priority 2: Complete lanes where AI has 2 cards
  const almostCompleteLanes = state.lanes.filter(lane => 
    lane.player2.cards.length === 2
  );
  for (const lane of almostCompleteLanes) {
    for (const card of sortedHand) {
      if (canPlayCardToLane(state, card.id, lane.id)) {
        return { type: 'lane', cardId: card.id, laneId: lane.id };
      }
    }
  }

  // Priority 3: Add to lanes where AI has 1 card
  const lanesWithOneCard = state.lanes.filter(lane => 
    lane.player2.cards.length === 1
  );
  // Prefer lanes where player also has cards (contest them)
  const contestedLanes = lanesWithOneCard.filter(lane => lane.player1.cards.length > 0);
  const uncontectedLanes = lanesWithOneCard.filter(lane => lane.player1.cards.length === 0);
  
  for (const lane of [...contestedLanes, ...uncontectedLanes]) {
    for (const card of sortedHand) {
      if (canPlayCardToLane(state, card.id, lane.id)) {
        return { type: 'lane', cardId: card.id, laneId: lane.id };
      }
    }
  }

  // Priority 4: Start new lanes with lowest cards
  const emptyLanes = state.lanes.filter(lane => 
    lane.player2.cards.length === 0
  );
  // Prefer lanes where player has cards (contest) over empty lanes
  const playerStartedLanes = emptyLanes.filter(lane => lane.player1.cards.length > 0);
  const fullyEmptyLanes = emptyLanes.filter(lane => lane.player1.cards.length === 0);
  
  for (const lane of [...playerStartedLanes, ...fullyEmptyLanes]) {
    for (const card of sortedHand) {
      if (canPlayCardToLane(state, card.id, lane.id)) {
        return { type: 'lane', cardId: card.id, laneId: lane.id };
      }
    }
  }

  return null;
}

/**
 * Evaluate how good a lane play is (used for tie-breaking if needed).
 * Higher score = better play.
 */
function evaluateLanePlay(state: GameState, card: Card, laneId: LaneId): number {
  const lane = state.lanes.find(l => l.id === laneId)!;
  const aiSide = lane.player2;
  const playerSide = lane.player1;

  let score = 0;

  // Urgency: Player has 3 cards - must respond!
  if (playerSide.cards.length === MAX_CARDS_PER_LANE) {
    score += 1000; // Highest priority
  }

  // Completion bonus: About to fill the lane
  if (aiSide.cards.length === 2) {
    score += 100;
  }

  // Building bonus: Continue in existing lane
  if (aiSide.cards.length === 1) {
    score += 50;
  }

  // Prefer lower value cards (save high cards)
  score -= cardValue(card) * 2;

  // Evaluate potential poker bonus
  const potentialCards = [...aiSide.cards, card];
  const currentTotal = calculateLaneTotal(aiSide.cards);
  const newTotal = calculateLaneTotal(potentialCards);
  const bonusGained = newTotal - currentTotal - cardValue(card);
  score += bonusGained * 3; // Weight bonus formation highly

  // Consider opponent's strength
  const opponentTotal = calculateLaneTotal(playerSide.cards);
  
  if (playerSide.cards.length > 0) {
    if (newTotal > opponentTotal) {
      score += 20; // Winning the lane
    } else if (newTotal < opponentTotal && aiSide.cards.length === 2) {
      score -= 10; // Completing a losing lane is bad
    }
  }

  // Check for potential pairs/straights/flushes
  if (aiSide.cards.length > 0) {
    const existingRanks = aiSide.cards.map(c => c.rank);
    // Pair bonus
    if (existingRanks.includes(card.rank)) {
      score += 15;
    }
    // Flush potential
    const existingSuits = aiSide.cards.map(c => c.suit);
    if (existingSuits.every(s => s === card.suit)) {
      score += 12;
    }
    // Straight potential
    const values = [...aiSide.cards.map(c => cardValue(c)), cardValue(card)].sort((a, b) => a - b);
    if (values.length >= 2) {
      const gaps = values.slice(1).map((v, i) => v - values[i]);
      if (gaps.every(g => g === 1)) {
        score += 15; // Consecutive cards
      } else if (gaps.every(g => g <= 2)) {
        score += 8; // Close to straight
      }
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

