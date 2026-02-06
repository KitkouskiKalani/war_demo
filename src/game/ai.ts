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
 * 
 * v2 Ability System:
 * - AI handles effect choices automatically
 * - Chooses randomly among valid options for simplicity
 */

import type { Card, GameState, LaneId } from './types';
import { cardValue } from './deck';
import { canPlayCardToLane } from './reducer';

export interface AIMove {
  type: 'lane' | 'discard';
  cardId: string;
  laneId?: LaneId;
}

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

// ============================================================================
// v2 ABILITY SYSTEM - AI Effect Choice Handling
// ============================================================================

export type AIEffectChoiceAction = 
  | { type: 'EFFECT_CHOICE_CLUBS_REPLACE'; handCardId: string; replacementRank: 'J' | 'Q' | 'K' }
  | { type: 'EFFECT_CHOICE_CLUBS_MID_REPLACE'; handCardId: string }  // v2.2: Replace with Clubs Ace
  | { type: 'EFFECT_CHOICE_CLUBS_MOVE'; cardId: string; fromLane: LaneId; toLane: LaneId }
  | { type: 'EFFECT_CHOICE_CLUBS_NEUTRALIZE'; laneId: LaneId }
  | { type: 'EFFECT_CHOICE_CLUBS_QUEEN_DELAY'; targetLaneId: LaneId }
  | { type: 'EFFECT_CHOICE_DIAMONDS_ACE'; choice: 'charges' | 'chargePower' }  // v2.2
  | { type: 'EFFECT_CHOICE_DIAMONDS_QUEEN'; choice: 'damage' | 'heal' }
  | { type: 'EFFECT_CHOICE_HEARTS_ACE'; choice: 'regen' | 'regenEffect' }  // v2.2
  | { type: 'EFFECT_CHOICE_SPADES_ACE'; choice: 'bloodDebt' | 'bleed' }  // v2.2
  | { type: 'DISMISS_EFFECT_CHOICE' }

/**
 * Get the AI's choice for a pending effect.
 * AI chooses randomly among valid options.
 */
export function getAIEffectChoice(state: GameState): AIEffectChoiceAction | null {
  if (state.pendingEffectChoices.length === 0) return null
  
  const choice = state.pendingEffectChoices[0]
  
  // Only handle AI's choices (player 2)
  if (choice.player !== 2) return null
  
  switch (choice.type) {
    case 'clubs-2-6-replacement':
      return handleAIClubsReplacement(state)
    case 'clubs-7-10-replacement':
      return handleAIClubsMidReplacement(state)
    case 'clubs-7-10-option':
      // v2.2: Now used for King neutralize
      return handleAIClubsNeutralizeOnly(state)
    case 'clubs-ace-option':
      // Legacy - dismiss
      return { type: 'DISMISS_EFFECT_CHOICE' }
    case 'clubs-queen-move':
      // v2.2: Queen now moves cards
      return handleAIClubsQueenMove(state)
    case 'clubs-queen-delay':
      return handleAIClubsQueenDelay(state, choice.laneId)
    case 'diamonds-ace-option':
      return handleAIDiamondsAce(state)
    case 'diamonds-queen-spend':
      return handleAIDiamondsQueen(state)
    case 'hearts-ace-regen-choice':
      return handleAIHeartsAce(state)
    case 'spades-ace-choice':
      return handleAISpadesAce(state)
    default:
      // Unknown choice type - dismiss
      return { type: 'DISMISS_EFFECT_CHOICE' }
  }
}

/**
 * AI handles Clubs 2-6 card replacement.
 * Strategy: Replace lowest value non-Clubs card with King (highest value face card)
 */
function handleAIClubsReplacement(state: GameState): AIEffectChoiceAction {
  const hand = state.player2.hand
  
  if (hand.length === 0) {
    return { type: 'DISMISS_EFFECT_CHOICE' }
  }
  
  // Find lowest value card to replace (prefer non-Clubs cards)
  const nonClubsCards = hand.filter(c => c.suit !== 'clubs')
  const cardsToConsider = nonClubsCards.length > 0 ? nonClubsCards : hand
  
  const sortedCards = [...cardsToConsider].sort((a, b) => cardValue(a) - cardValue(b))
  const cardToReplace = sortedCards[0]
  
  // Always replace with King (highest value)
  return {
    type: 'EFFECT_CHOICE_CLUBS_REPLACE',
    handCardId: cardToReplace.id,
    replacementRank: 'K'
  }
}

/**
 * AI handles Clubs Queen lane delay.
 * Strategy: Prefer delaying lanes where player has more/stronger cards, or pending lanes
 */
function handleAIClubsQueenDelay(state: GameState, sourceLaneId?: LaneId): AIEffectChoiceAction {
  const laneIds: LaneId[] = ['left', 'middle', 'right']
  
  // Get available lanes (exclude source lane and already delayed lanes)
  const availableLanes = laneIds.filter(laneId => {
    if (laneId === sourceLaneId) return false
    if (state.laneDelayedUntilTurn[laneId]) return false
    return true
  })
  
  if (availableLanes.length === 0) {
    return { type: 'DISMISS_EFFECT_CHOICE' }
  }
  
  // Prioritize lanes with pending resolutions (delay opponent's lane resolution)
  const pendingLanes = availableLanes.filter(laneId => 
    state.pendingResolutionLanes.some(p => p.laneId === laneId && p.filledByPlayer === 1)
  )
  
  if (pendingLanes.length > 0) {
    // Pick the pending lane with the shortest resolution time
    const sortedPending = pendingLanes.sort((a, b) => {
      const pendingA = state.pendingResolutionLanes.find(p => p.laneId === a)!
      const pendingB = state.pendingResolutionLanes.find(p => p.laneId === b)!
      return pendingA.turnsUntilResolution - pendingB.turnsUntilResolution
    })
    return { type: 'EFFECT_CHOICE_CLUBS_QUEEN_DELAY', targetLaneId: sortedPending[0] }
  }
  
  // Otherwise, delay a lane where player has more cards
  const sortedByPlayerCards = availableLanes.sort((a, b) => {
    const laneA = state.lanes.find(l => l.id === a)!
    const laneB = state.lanes.find(l => l.id === b)!
    return laneB.player1.cards.length - laneA.player1.cards.length
  })
  
  return { type: 'EFFECT_CHOICE_CLUBS_QUEEN_DELAY', targetLaneId: sortedByPlayerCards[0] }
}

/**
 * v2.2 AI handles Clubs 7-10 ace replacement.
 * Strategy: Replace lowest value card with Clubs Ace
 */
function handleAIClubsMidReplacement(state: GameState): AIEffectChoiceAction {
  const hand = state.player2.hand
  
  if (hand.length === 0) {
    return { type: 'DISMISS_EFFECT_CHOICE' }
  }
  
  // Find lowest value card to replace (prefer non-Clubs cards)
  const nonClubsCards = hand.filter(c => c.suit !== 'clubs')
  const cardsToConsider = nonClubsCards.length > 0 ? nonClubsCards : hand
  
  const sortedCards = [...cardsToConsider].sort((a, b) => cardValue(a) - cardValue(b))
  const cardToReplace = sortedCards[0]
  
  return {
    type: 'EFFECT_CHOICE_CLUBS_MID_REPLACE',
    handCardId: cardToReplace.id
  }
}

/**
 * v2.2 AI handles Clubs King neutralize only.
 */
function handleAIClubsNeutralizeOnly(state: GameState): AIEffectChoiceAction {
  const laneIds: LaneId[] = ['left', 'middle', 'right']
  
  // Neutralize a non-neutralized lane (prefer lanes with opponent cards)
  const availableLanes = laneIds.filter(l => !state.neutralizedLanes[l])
  if (availableLanes.length > 0) {
    const sortedLanes = availableLanes.sort((a, b) => {
      const laneA = state.lanes.find(l => l.id === a)!
      const laneB = state.lanes.find(l => l.id === b)!
      return laneB.player1.cards.length - laneA.player1.cards.length
    })
    
    return {
      type: 'EFFECT_CHOICE_CLUBS_NEUTRALIZE',
      laneId: sortedLanes[0]
    }
  }
  
  return { type: 'DISMISS_EFFECT_CHOICE' }
}

/**
 * v2.2 AI handles Clubs Queen card move.
 */
function handleAIClubsQueenMove(state: GameState): AIEffectChoiceAction {
  const laneIds: LaneId[] = ['left', 'middle', 'right']
  
  // Find opponent (player 1) cards on the board
  const opponentCards: { cardId: string; fromLane: LaneId }[] = []
  for (const lane of state.lanes) {
    for (const card of lane.player1.cards) {
      opponentCards.push({ cardId: card.id, fromLane: lane.id })
    }
  }
  
  if (opponentCards.length > 0) {
    // Move a random opponent card to a different lane
    const randomCard = opponentCards[Math.floor(Math.random() * opponentCards.length)]
    const otherLanes = laneIds.filter(l => l !== randomCard.fromLane)
    const targetLane = otherLanes[Math.floor(Math.random() * otherLanes.length)]
    
    return {
      type: 'EFFECT_CHOICE_CLUBS_MOVE',
      cardId: randomCard.cardId,
      fromLane: randomCard.fromLane,
      toLane: targetLane
    }
  }
  
  return { type: 'DISMISS_EFFECT_CHOICE' }
}

/**
 * v2.2 AI handles Diamonds Ace choice.
 * Strategy: Prefer charges if charge power is already high, otherwise balance
 */
function handleAIDiamondsAce(state: GameState): AIEffectChoiceAction {
  const chargePower = state.player2.chargePower
  const maxChargePower = 5
  
  // If charge power is at max, always choose charges
  if (chargePower >= maxChargePower) {
    return { type: 'EFFECT_CHOICE_DIAMONDS_ACE', choice: 'charges' }
  }
  
  // 60% chance to choose charges (more immediate benefit), 40% for charge power
  if (Math.random() > 0.4) {
    return { type: 'EFFECT_CHOICE_DIAMONDS_ACE', choice: 'charges' }
  }
  
  return { type: 'EFFECT_CHOICE_DIAMONDS_ACE', choice: 'chargePower' }
}

/**
 * v2.2 AI handles Hearts Ace choice.
 * Strategy: Prefer regen effect if already has regen instances, otherwise prefer new regen
 */
function handleAIHeartsAce(state: GameState): AIEffectChoiceAction {
  const regenInstances = state.player2.regenStacks
  
  // If already has regen instances, boost the effect multiplier
  if (regenInstances.length > 0) {
    return { type: 'EFFECT_CHOICE_HEARTS_ACE', choice: 'regenEffect' }
  }
  
  // Otherwise, prefer more regen instances
  return { type: 'EFFECT_CHOICE_HEARTS_ACE', choice: 'regen' }
}

/**
 * v2.2 AI handles Spades Ace choice.
 * Strategy: Prefer blood debt if poker bonuses are available, otherwise bleed
 */
function handleAISpadesAce(_state: GameState): AIEffectChoiceAction {
  // 60% chance for blood debt (more burst potential), 40% for bleed
  if (Math.random() > 0.4) {
    return { type: 'EFFECT_CHOICE_SPADES_ACE', choice: 'bloodDebt' }
  }
  
  return { type: 'EFFECT_CHOICE_SPADES_ACE', choice: 'bleed' }
}

/**
 * AI handles Diamonds Queen spend choice.
 * Strategy: Choose damage if opponent is low HP, otherwise prefer heal if AI is low
 */
function handleAIDiamondsQueen(state: GameState): AIEffectChoiceAction {
  const aiHP = state.player2.hp
  const opponentHP = state.player1.hp
  
  // If opponent is low HP (< 30), deal damage
  if (opponentHP < 30) {
    return { type: 'EFFECT_CHOICE_DIAMONDS_QUEEN', choice: 'damage' }
  }
  
  // If AI is low HP (< 50), prefer heal
  if (aiHP < 50) {
    return { type: 'EFFECT_CHOICE_DIAMONDS_QUEEN', choice: 'heal' }
  }
  
  // Otherwise, 60% damage, 40% heal
  if (Math.random() > 0.4) {
    return { type: 'EFFECT_CHOICE_DIAMONDS_QUEEN', choice: 'damage' }
  }
  
  return { type: 'EFFECT_CHOICE_DIAMONDS_QUEEN', choice: 'heal' }
}