/**
 * Poker Bonus Evaluation with Dynamic Joker Resolution
 * 
 * Jokers can be played at any position and adapt to become the optimal card.
 * Key constraint: A Joker's value is capped by the MINIMUM value of cards played AFTER it.
 * This means playing low cards on top of a Joker reduces its potential value.
 */

import type { Card, StandardRank, StandardSuit } from './types';
import { isJoker, rankValue, STANDARD_RANKS, STANDARD_SUITS } from './deck';

// Bonus values for poker hands
const BONUS_PAIR = 3;
const BONUS_THREE_OF_A_KIND = 12;
const BONUS_STRAIGHT = 10;
const BONUS_FLUSH = 8;
const BONUS_STRAIGHT_FLUSH = 20;

// Joker's base value when unconstrained (played last or alone)
const JOKER_BASE_VALUE = 15;

export function isPair(ranks: StandardRank[]): boolean {
  if (ranks.length < 2) return false;
  if (ranks.length === 2) return ranks[0] === ranks[1];
  return ranks[0] === ranks[1] || ranks[1] === ranks[2] || ranks[0] === ranks[2];
}

export function isThreeOfAKind(ranks: StandardRank[]): boolean {
  if (ranks.length !== 3) return false;
  return ranks[0] === ranks[1] && ranks[1] === ranks[2];
}

export function isStraight(ranks: StandardRank[]): boolean {
  if (ranks.length !== 3) return false;
  const values = ranks.map(r => rankValue(r)).sort((a, b) => a - b);
  return values[1] === values[0] + 1 && values[2] === values[1] + 1;
}

export function isFlush(suits: StandardSuit[]): boolean {
  if (suits.length !== 3) return false;
  return suits[0] === suits[1] && suits[1] === suits[2];
}

/**
 * Get the maximum value a joker at a given position can have.
 * A joker's value is capped by the minimum value of all cards played AFTER it.
 */
function getJokerMaxValue(cards: Card[], jokerIndex: number): number {
  let minValueAfter = JOKER_BASE_VALUE;
  
  for (let i = jokerIndex + 1; i < cards.length; i++) {
    const card = cards[i];
    if (!isJoker(card)) {
      const cardValue = rankValue(card.rank);
      minValueAfter = Math.min(minValueAfter, cardValue);
    }
    // If there's another joker after, we skip it (it has its own constraints)
  }
  
  return minValueAfter;
}

/**
 * Get all ranks that a joker can become given a max value constraint
 */
function getRanksWithinLimit(maxValue: number): StandardRank[] {
  return STANDARD_RANKS.filter(r => rankValue(r) <= maxValue);
}

/**
 * Resolve all jokers in a lane to their optimal cards.
 * Returns the resolved ranks, suits, and values for calculation.
 */
interface JokerResolution {
  ranks: StandardRank[];
  suits: StandardSuit[];
  totalValue: number;
  bonus: number;
}

function resolveJokersOptimally(cards: Card[]): JokerResolution {
  if (cards.length === 0) {
    return { ranks: [], suits: [], totalValue: 0, bonus: 0 };
  }
  
  // Find joker positions and their max values
  const jokerIndices: number[] = [];
  const jokerMaxValues: number[] = [];
  
  for (let i = 0; i < cards.length; i++) {
    if (isJoker(cards[i])) {
      jokerIndices.push(i);
      jokerMaxValues.push(getJokerMaxValue(cards, i));
    }
  }
  
  // If no jokers, simple evaluation
  if (jokerIndices.length === 0) {
    const ranks = cards.map(c => c.rank as StandardRank);
    const suits = cards.map(c => c.suit as StandardSuit);
    const totalValue = cards.reduce((sum, c) => sum + rankValue(c.rank), 0);
    const bonus = evaluateRanksAndSuits(ranks, suits);
    return { ranks, suits, totalValue, bonus };
  }
  
  // Get non-joker cards info
  const nonJokerInfo: { index: number; rank: StandardRank; suit: StandardSuit; value: number }[] = [];
  for (let i = 0; i < cards.length; i++) {
    if (!isJoker(cards[i])) {
      nonJokerInfo.push({
        index: i,
        rank: cards[i].rank as StandardRank,
        suit: cards[i].suit as StandardSuit,
        value: rankValue(cards[i].rank)
      });
    }
  }
  
  // Try all valid joker configurations and find the best one
  // "Best" = highest (bonus + totalValue) to maximize lane impact
  let bestResult: JokerResolution = {
    ranks: [],
    suits: [],
    totalValue: 0,
    bonus: 0
  };
  let bestScore = -1;
  
  // Get possible ranks for each joker
  const jokerOptions: { rank: StandardRank; suit: StandardSuit }[][] = jokerIndices.map((_, idx) => {
    const allowedRanks = getRanksWithinLimit(jokerMaxValues[idx]);
    const options: { rank: StandardRank; suit: StandardSuit }[] = [];
    for (const r of allowedRanks) {
      for (const s of STANDARD_SUITS) {
        options.push({ rank: r, suit: s });
      }
    }
    return options;
  });
  
  // Generate all combinations
  function tryAllCombinations(jokerIdx: number, currentChoices: { rank: StandardRank; suit: StandardSuit }[]) {
    if (jokerIdx === jokerIndices.length) {
      // Evaluate this configuration
      const resolvedRanks: StandardRank[] = [];
      const resolvedSuits: StandardSuit[] = [];
      let totalValue = 0;
      
      let jokerChoiceIdx = 0;
      for (let i = 0; i < cards.length; i++) {
        if (isJoker(cards[i])) {
          const choice = currentChoices[jokerChoiceIdx];
          resolvedRanks.push(choice.rank);
          resolvedSuits.push(choice.suit);
          totalValue += rankValue(choice.rank);
          jokerChoiceIdx++;
        } else {
          resolvedRanks.push(cards[i].rank as StandardRank);
          resolvedSuits.push(cards[i].suit as StandardSuit);
          totalValue += rankValue(cards[i].rank);
        }
      }
      
      const bonus = evaluateRanksAndSuits(resolvedRanks, resolvedSuits);
      const score = totalValue + bonus;
      
      if (score > bestScore) {
        bestScore = score;
        bestResult = { ranks: resolvedRanks, suits: resolvedSuits, totalValue, bonus };
      }
      return;
    }
    
    // Try each option for this joker
    for (const option of jokerOptions[jokerIdx]) {
      currentChoices.push(option);
      tryAllCombinations(jokerIdx + 1, currentChoices);
      currentChoices.pop();
    }
  }
  
  tryAllCombinations(0, []);
  
  return bestResult;
}

function evaluateRanksAndSuits(ranks: StandardRank[], suits: StandardSuit[]): number {
  if (ranks.length <= 1) return 0;
  
  if (ranks.length === 2) {
    return ranks[0] === ranks[1] ? BONUS_PAIR : 0;
  }
  
  // 3 cards
  const straight = isStraight(ranks);
  const flush = isFlush(suits);
  if (straight && flush) return BONUS_STRAIGHT_FLUSH;
  if (isThreeOfAKind(ranks)) return BONUS_THREE_OF_A_KIND;
  if (straight) return BONUS_STRAIGHT;
  if (flush) return BONUS_FLUSH;
  if (isPair(ranks)) return BONUS_PAIR;
  return 0;
}

/**
 * Calculate the base sum of cards (with jokers resolved to their optimal values)
 */
export function calculateBaseSum(cards: Card[]): number {
  const resolution = resolveJokersOptimally(cards);
  return resolution.totalValue;
}

/**
 * Evaluate the poker bonus for a lane (with jokers resolved optimally)
 */
export function evaluateLaneBonus(cards: Card[]): number {
  const resolution = resolveJokersOptimally(cards);
  return resolution.bonus;
}

/**
 * Calculate total lane value (base sum + poker bonus)
 */
export function calculateLaneTotal(cards: Card[]): number {
  const resolution = resolveJokersOptimally(cards);
  return resolution.totalValue + resolution.bonus;
}

/**
 * Get what a Joker resolves to in a given lane context.
 * Used for tooltips to show "Mimicking a X of Y".
 */
export interface JokerMimicInfo {
  rank: StandardRank;
  suit: StandardSuit;
  value: number;
}

export function getJokerMimicInfo(laneCards: Card[], jokerIndex: number): JokerMimicInfo | null {
  if (jokerIndex < 0 || jokerIndex >= laneCards.length) return null;
  if (!isJoker(laneCards[jokerIndex])) return null;
  
  const resolution = resolveJokersOptimally(laneCards);
  
  // The resolution has ranks/suits in order matching the card positions
  return {
    rank: resolution.ranks[jokerIndex],
    suit: resolution.suits[jokerIndex],
    value: rankValue(resolution.ranks[jokerIndex])
  };
}

