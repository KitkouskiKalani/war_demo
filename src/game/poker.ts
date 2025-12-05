/**
 * Poker Bonus Evaluation
 */

import type { Card, StandardRank, StandardSuit } from './types';
import { isJoker, rankValue, STANDARD_RANKS, STANDARD_SUITS } from './deck';

// Rebalanced bonus values (v1.1)
// - Pair reduced: very common with jokers
// - Three of a kind reduced: easy with pair + joker
// - Flush reduced: slightly easier than straights
// - Straight flush reduced: less swingy but still best
const BONUS_PAIR = 3;
const BONUS_THREE_OF_A_KIND = 12;
const BONUS_STRAIGHT = 10;
const BONUS_FLUSH = 8;
const BONUS_STRAIGHT_FLUSH = 20;

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

export function evaluateLaneBonus(cards: Card[]): number {
  if (cards.length <= 1) return 0;
  if (cards.length === 2) return evaluate2CardBonus(cards);
  if (cards.length === 3) return evaluate3CardBonus(cards);
  return 0;
}

function evaluate2CardBonus(cards: Card[]): number {
  const jokerCount = cards.filter(isJoker).length;
  if (jokerCount >= 1) return BONUS_PAIR;
  const nonJokers = cards.filter(c => !isJoker(c));
  return nonJokers[0].rank === nonJokers[1].rank ? BONUS_PAIR : 0;
}

function evaluate3CardBonus(cards: Card[]): number {
  const jokerCount = cards.filter(isJoker).length;
  const nonJokers = cards.filter(c => !isJoker(c));

  if (jokerCount === 3) return BONUS_STRAIGHT_FLUSH;
  if (jokerCount === 2) return evaluateWith2Jokers(nonJokers);
  if (jokerCount === 1) return evaluateWith1Joker(nonJokers);
  return evaluateFixedHand(cards);
}

function evaluateFixedHand(cards: Card[]): number {
  const ranks = cards.map(c => c.rank as StandardRank);
  const suits = cards.map(c => c.suit as StandardSuit);

  const straight = isStraight(ranks);
  const flush = isFlush(suits);

  if (straight && flush) return BONUS_STRAIGHT_FLUSH;
  if (isThreeOfAKind(ranks)) return BONUS_THREE_OF_A_KIND;
  if (straight) return BONUS_STRAIGHT;
  if (flush) return BONUS_FLUSH;
  if (isPair(ranks)) return BONUS_PAIR;
  return 0;
}

function evaluateWith1Joker(nonJokers: Card[]): number {
  let best = 0;
  const r1 = nonJokers[0].rank as StandardRank;
  const r2 = nonJokers[1].rank as StandardRank;
  const s1 = nonJokers[0].suit as StandardSuit;
  const s2 = nonJokers[1].suit as StandardSuit;

  for (const jr of STANDARD_RANKS) {
    for (const js of STANDARD_SUITS) {
      const bonus = evaluateRanksAndSuits([r1, r2, jr], [s1, s2, js]);
      if (bonus > best) best = bonus;
      if (best === BONUS_STRAIGHT_FLUSH) return best;
    }
  }
  return best;
}

function evaluateWith2Jokers(nonJokers: Card[]): number {
  let best = 0;
  const r1 = nonJokers[0].rank as StandardRank;
  const s1 = nonJokers[0].suit as StandardSuit;

  for (const jr1 of STANDARD_RANKS) {
    for (const js1 of STANDARD_SUITS) {
      for (const jr2 of STANDARD_RANKS) {
        for (const js2 of STANDARD_SUITS) {
          const bonus = evaluateRanksAndSuits([r1, jr1, jr2], [s1, js1, js2]);
          if (bonus > best) best = bonus;
          if (best === BONUS_STRAIGHT_FLUSH) return best;
        }
      }
    }
  }
  return best;
}

function evaluateRanksAndSuits(ranks: StandardRank[], suits: StandardSuit[]): number {
  const straight = isStraight(ranks);
  const flush = isFlush(suits);
  if (straight && flush) return BONUS_STRAIGHT_FLUSH;
  if (isThreeOfAKind(ranks)) return BONUS_THREE_OF_A_KIND;
  if (straight) return BONUS_STRAIGHT;
  if (flush) return BONUS_FLUSH;
  if (isPair(ranks)) return BONUS_PAIR;
  return 0;
}

export function calculateBaseSum(cards: Card[]): number {
  return cards.reduce((sum, card) => sum + rankValue(card.rank), 0);
}

export function calculateLaneTotal(cards: Card[]): number {
  return calculateBaseSum(cards) + evaluateLaneBonus(cards);
}

