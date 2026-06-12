/**
 * Poker Hand Evaluation for 5-Card Lanes
 *
 * Each player's lane hand is drawn from a pool of up to 5 cards:
 *   - The 3 cards they played into that lane
 *   - The per-lane community poker card
 *   - The all-lane community poker card
 *
 * Damage = sum of utilized-card base values + bonus for the winning hand type.
 * Only the cards that actually form the best hand are "utilized" (e.g. a pair uses 2 cards,
 * a 5-card flush uses 5, a high-card uses 1).
 *
 * Jokers are fully wild: they can stand in for any rank AND any suit.
 *   - In sets (pair / 3oak / 4oak / 5oak / full-house / two-pair) a joker mimics the target rank
 *     and contributes that rank's value.
 *   - In straights / straight-flushes a joker fills the missing rank slot and contributes that
 *     slot's rank value.
 *   - In a pure flush (no straight), a joker acts as an Ace (value 12) to maximize damage.
 *   - In high-card / unused positions, a joker is capped at Ace value (12).
 *
 * J/Q/K each deal 11 damage. Ace and Joker each deal 12 damage.
 */

import type { Card, StandardSuit } from './types';
import { isJoker, rankOrderValue, rankValue, STANDARD_SUITS } from './deck';
import { HAND_LABELS, handRankIndex, POKER_BONUSES, type HandType } from './pokerBonuses';

export type { HandType } from './pokerBonuses';
export { POKER_BONUSES, HAND_LABELS } from './pokerBonuses';

export interface BestHand {
  type: HandType;
  utilizedCards: Card[];
  baseDamage: number;
  bonus: number;
  total: number;
}

const ALL_RANK_VALUES: number[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

function damageForRankOrderValue(value: number): number {
  if (value >= 11 && value <= 13) return 11;
  if (value === 14) return 12;
  return value;
}

function countByRank(cards: Card[]): Map<number, Card[]> {
  const map = new Map<number, Card[]>();
  for (const c of cards) {
    const v = rankOrderValue(c.rank);
    if (!map.has(v)) map.set(v, []);
    map.get(v)!.push(c);
  }
  return map;
}

function countBySuit(cards: Card[]): Map<StandardSuit, Card[]> {
  const map = new Map<StandardSuit, Card[]>();
  for (const c of cards) {
    const s = c.suit as StandardSuit;
    if (!map.has(s)) map.set(s, []);
    map.get(s)!.push(c);
  }
  return map;
}

function buildPool(
  playerCards: Card[],
  laneCommunity: Card | null,
  allLaneCommunity: Card | null,
): Card[] {
  const pool: Card[] = [...playerCards];
  if (laneCommunity) pool.push(laneCommunity);
  if (allLaneCommunity) pool.push(allLaneCommunity);
  return pool;
}

function makeResult(type: HandType, utilized: Card[], baseDamage: number): BestHand {
  const bonus = POKER_BONUSES[type];
  return { type, utilizedCards: utilized, baseDamage, bonus, total: baseDamage + bonus };
}

// ---------- HAND-TYPE EVALUATORS ----------

function tryNofAKind(regulars: Card[], jokers: Card[], n: 2 | 3 | 4 | 5): BestHand | null {
  const J = jokers.length;
  const counts = countByRank(regulars);
  let bestDamage = -1;
  let bestUtilized: Card[] = [];

  for (const v of ALL_RANK_VALUES) {
    const have = counts.get(v) ?? [];
    if (have.length + J < n) continue;
    const damage = n * damageForRankOrderValue(v);
    if (damage > bestDamage) {
      const usedReal = Math.min(have.length, n);
      const usedJokers = n - usedReal;
      bestDamage = damage;
      bestUtilized = [...have.slice(0, usedReal), ...jokers.slice(0, usedJokers)];
    }
  }
  if (bestDamage < 0) return null;

  const type: HandType =
    n === 2 ? 'pair' : n === 3 ? 'three-of-a-kind' : n === 4 ? 'four-of-a-kind' : 'five-of-a-kind';
  return makeResult(type, bestUtilized, bestDamage);
}

function tryTwoPair(regulars: Card[], jokers: Card[]): BestHand | null {
  const J = jokers.length;
  const counts = countByRank(regulars);
  let bestDamage = -1;
  let bestUtilized: Card[] = [];

  for (const vA of ALL_RANK_VALUES) {
    for (const vB of ALL_RANK_VALUES) {
      if (vA <= vB) continue; // avoid duplicates; vA is higher-valued pair
      const haveA = counts.get(vA) ?? [];
      const haveB = counts.get(vB) ?? [];
      const neededJokersA = Math.max(0, 2 - haveA.length);
      const neededJokersB = Math.max(0, 2 - haveB.length);
      if (neededJokersA + neededJokersB > J) continue;
      const damage = 2 * damageForRankOrderValue(vA) + 2 * damageForRankOrderValue(vB);
      if (damage > bestDamage) {
        const usedRealA = Math.min(2, haveA.length);
        const usedRealB = Math.min(2, haveB.length);
        const jokersForA = jokers.slice(0, neededJokersA);
        const jokersForB = jokers.slice(neededJokersA, neededJokersA + neededJokersB);
        bestDamage = damage;
        bestUtilized = [
          ...haveA.slice(0, usedRealA),
          ...jokersForA,
          ...haveB.slice(0, usedRealB),
          ...jokersForB,
        ];
      }
    }
  }
  if (bestDamage < 0) return null;
  return makeResult('two-pair', bestUtilized, bestDamage);
}

function tryFullHouse(regulars: Card[], jokers: Card[]): BestHand | null {
  const J = jokers.length;
  const counts = countByRank(regulars);
  let bestDamage = -1;
  let bestUtilized: Card[] = [];

  for (const vA of ALL_RANK_VALUES) {
    for (const vB of ALL_RANK_VALUES) {
      if (vA === vB) continue;
      const haveA = counts.get(vA) ?? [];
      const haveB = counts.get(vB) ?? [];
      const neededJokersA = Math.max(0, 3 - haveA.length);
      const neededJokersB = Math.max(0, 2 - haveB.length);
      if (neededJokersA + neededJokersB > J) continue;
      const damage = 3 * damageForRankOrderValue(vA) + 2 * damageForRankOrderValue(vB);
      if (damage > bestDamage) {
        const usedRealA = Math.min(3, haveA.length);
        const usedRealB = Math.min(2, haveB.length);
        const jokersForA = jokers.slice(0, neededJokersA);
        const jokersForB = jokers.slice(neededJokersA, neededJokersA + neededJokersB);
        bestDamage = damage;
        bestUtilized = [
          ...haveA.slice(0, usedRealA),
          ...jokersForA,
          ...haveB.slice(0, usedRealB),
          ...jokersForB,
        ];
      }
    }
  }
  if (bestDamage < 0) return null;
  return makeResult('full-house', bestUtilized, bestDamage);
}

function tryFlush(regulars: Card[], jokers: Card[], k: 3 | 4 | 5): BestHand | null {
  const J = jokers.length;
  const bySuit = countBySuit(regulars);
  let bestDamage = -1;
  let bestUtilized: Card[] = [];

  for (const suit of STANDARD_SUITS) {
    const inSuit = bySuit.get(suit) ?? [];
    if (inSuit.length + J < k) continue;
    const minJokers = Math.max(0, k - inSuit.length);
    const maxJokers = Math.min(J, k);
    const sorted = [...inSuit].sort((a, b) => rankValue(b.rank) - rankValue(a.rank));
    for (let jUsed = minJokers; jUsed <= maxJokers; jUsed++) {
      const realsUsed = k - jUsed;
      if (realsUsed > sorted.length) continue;
      const topReals = sorted.slice(0, realsUsed);
      const realSum = topReals.reduce((sum, c) => sum + rankValue(c.rank), 0);
      const jokerSum = jUsed * 12; // Joker acts as Ace in pure flush
      const damage = realSum + jokerSum;
      if (damage > bestDamage) {
        bestDamage = damage;
        bestUtilized = [...topReals, ...jokers.slice(0, jUsed)];
      }
    }
  }
  if (bestDamage < 0) return null;
  const type: HandType = k === 3 ? 'flush-3' : k === 4 ? 'flush-4' : 'flush-5';
  return makeResult(type, bestUtilized, bestDamage);
}

interface StraightWindow {
  values: number[];        // 1 is used as "ace-low" placeholder
  damageValues: number[];  // ace-low position still contributes Ace damage
}

function generateStraightWindows(k: 3 | 4 | 5): StraightWindow[] {
  const windows: StraightWindow[] = [];
  for (let s = 2; s + k - 1 <= 14; s++) {
    const values: number[] = [];
    const damageValues: number[] = [];
    for (let i = 0; i < k; i++) {
      values.push(s + i);
      damageValues.push(damageForRankOrderValue(s + i));
    }
    windows.push({ values, damageValues });
  }
  // Ace-low window: [1, 2, ..., k]
  const aceLowValues: number[] = [];
  const aceLowDmg: number[] = [];
  for (let i = 0; i < k; i++) {
    const positionValue = 1 + i;
    aceLowValues.push(positionValue);
    aceLowDmg.push(positionValue === 1 ? 12 : positionValue);
  }
  windows.push({ values: aceLowValues, damageValues: aceLowDmg });
  return windows;
}

function tryStraight(regulars: Card[], jokers: Card[], k: 3 | 4 | 5): BestHand | null {
  const J = jokers.length;
  const counts = countByRank(regulars);
  const windows = generateStraightWindows(k);
  let bestDamage = -1;
  let bestUtilized: Card[] = [];

  for (const w of windows) {
    const realsUsed: Card[] = [];
    let jokersNeeded = 0;
    for (const v of w.values) {
      const lookupValue = v === 1 ? 14 : v; // Ace-low maps to Ace rank
      const pool = counts.get(lookupValue);
      if (pool && pool.length > 0) {
        realsUsed.push(pool[0]);
      } else {
        jokersNeeded++;
      }
    }
    if (jokersNeeded > J) continue;
    const damage = w.damageValues.reduce((sum, d) => sum + d, 0);
    if (damage > bestDamage) {
      bestDamage = damage;
      bestUtilized = [...realsUsed, ...jokers.slice(0, jokersNeeded)];
    }
  }
  if (bestDamage < 0) return null;
  const type: HandType = k === 3 ? 'straight-3' : k === 4 ? 'straight-4' : 'straight-5';
  return makeResult(type, bestUtilized, bestDamage);
}

function tryStraightFlush(regulars: Card[], jokers: Card[], k: 3 | 4 | 5): BestHand | null {
  const J = jokers.length;
  const windows = generateStraightWindows(k);
  let bestDamage = -1;
  let bestUtilized: Card[] = [];

  const bySuitRank = new Map<StandardSuit, Map<number, Card[]>>();
  for (const c of regulars) {
    const s = c.suit as StandardSuit;
    if (!bySuitRank.has(s)) bySuitRank.set(s, new Map());
    const rankMap = bySuitRank.get(s)!;
    const v = rankOrderValue(c.rank);
    if (!rankMap.has(v)) rankMap.set(v, []);
    rankMap.get(v)!.push(c);
  }

  for (const suit of STANDARD_SUITS) {
    const rankMap = bySuitRank.get(suit) ?? new Map<number, Card[]>();
    for (const w of windows) {
      const realsUsed: Card[] = [];
      let jokersNeeded = 0;
      for (const v of w.values) {
        const lookupValue = v === 1 ? 14 : v;
        const pool = rankMap.get(lookupValue);
        if (pool && pool.length > 0) {
          realsUsed.push(pool[0]);
        } else {
          jokersNeeded++;
        }
      }
      if (jokersNeeded > J) continue;
      const damage = w.damageValues.reduce((sum, d) => sum + d, 0);
      if (damage > bestDamage) {
        bestDamage = damage;
        bestUtilized = [...realsUsed, ...jokers.slice(0, jokersNeeded)];
      }
    }
  }
  if (bestDamage < 0) return null;
  const type: HandType =
    k === 3 ? 'straight-flush-3' : k === 4 ? 'straight-flush-4' : 'straight-flush-5';
  return makeResult(type, bestUtilized, bestDamage);
}

/**
 * High Card falls back to the single highest card a PLAYER played in the lane.
 * Community cards are intentionally excluded so that players can't "borrow"
 * a strong High Card bonus from cards they didn't actually play.
 * Jokers the player played still count, capped at Ace value (12).
 */
function tryHighCard(playerCards: Card[]): BestHand | null {
  if (playerCards.length === 0) return null;
  let best: Card | null = null;
  let bestVal = -1;
  for (const c of playerCards) {
    const v = rankValue(c.rank);
    if (v > bestVal) {
      best = c;
      bestVal = v;
    }
  }
  if (!best) return null;
  return makeResult('high-card', [best], bestVal);
}

// ---------- MAIN EVALUATOR ----------

export function evaluateBestHand(
  playerCards: Card[],
  laneCommunity: Card | null,
  allLaneCommunity: Card | null,
): BestHand {
  return evaluateBestHandWithBonusMultiplier(playerCards, laneCommunity, allLaneCommunity, 1);
}

export function evaluateBestHandWithBonusMultiplier(
  playerCards: Card[],
  laneCommunity: Card | null,
  allLaneCommunity: Card | null,
  bonusMultiplier: number,
): BestHand {
  const pool = buildPool(playerCards, laneCommunity, allLaneCommunity);
  if (pool.length === 0) {
    return { type: 'high-card', utilizedCards: [], baseDamage: 0, bonus: 0, total: 0 };
  }

  const regulars = pool.filter((c) => !isJoker(c));
  const jokers = pool.filter((c) => isJoker(c));

  const candidates: (BestHand | null)[] = [
    tryNofAKind(regulars, jokers, 5),
    tryStraightFlush(regulars, jokers, 5),
    tryNofAKind(regulars, jokers, 4),
    tryFullHouse(regulars, jokers),
    tryFlush(regulars, jokers, 5),
    tryStraight(regulars, jokers, 5),
    tryStraightFlush(regulars, jokers, 4),
    tryFlush(regulars, jokers, 4),
    tryStraight(regulars, jokers, 4),
    tryStraightFlush(regulars, jokers, 3),
    tryNofAKind(regulars, jokers, 3),
    tryTwoPair(regulars, jokers),
    tryFlush(regulars, jokers, 3),
    tryStraight(regulars, jokers, 3),
    tryNofAKind(regulars, jokers, 2),
    tryHighCard(playerCards),
  ];

  const valid = candidates
    .filter((c): c is BestHand => c !== null)
    .map((c) => ({
      ...c,
      bonus: c.bonus * bonusMultiplier,
      total: c.baseDamage + c.bonus * bonusMultiplier,
    }));

  if (valid.length === 0) {
    return { type: 'high-card', utilizedCards: [], baseDamage: 0, bonus: 0, total: 0 };
  }

  // Tie-break: highest total, then higher-tier hand, then more utilized cards.
  valid.sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    if (handRankIndex(b.type) !== handRankIndex(a.type)) {
      return handRankIndex(b.type) - handRankIndex(a.type);
    }
    return b.utilizedCards.length - a.utilizedCards.length;
  });

  return valid[0];
}

export interface LaneDisplayInfo {
  baseSum: number;
  bonus: number;
  total: number;
  handLabel: string;
  type: HandType;
  utilizedCardIds: string[];
}

export function getLaneDisplay(
  playerCards: Card[],
  laneCommunity: Card | null,
  allLaneCommunity: Card | null,
): LaneDisplayInfo {
  const best = evaluateBestHand(playerCards, laneCommunity, allLaneCommunity);
  return {
    baseSum: best.baseDamage,
    bonus: best.bonus,
    total: best.total,
    handLabel: HAND_LABELS[best.type],
    type: best.type,
    utilizedCardIds: best.utilizedCards.map((c) => c.id),
  };
}
