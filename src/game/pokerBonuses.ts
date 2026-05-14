/**
 * Poker Hand Bonus Values
 *
 * Damage for a lane = sum(utilized-card base values) + bonus.
 * "Utilized" cards are only the cards that actually participate in the winning hand
 * (e.g. a pair uses 2 cards, a flush-5 uses 5, a high-card uses 1).
 *
 * Bonus values are tuned by relative probability/difficulty of forming the hand
 * out of the 5-card pool (player's 3 cards + per-lane community + all-lane community),
 * with 4 jokers acting as fully-wild cards in the 56-card shared deck.
 *
 * Any changes here must be mirrored in poker_damage_mods.md.
 */

export type HandType =
  | 'high-card'
  | 'pair'
  | 'two-pair'
  | 'three-of-a-kind'
  | 'straight-3'
  | 'straight-4'
  | 'straight-5'
  | 'flush-3'
  | 'flush-4'
  | 'flush-5'
  | 'straight-flush-3'
  | 'straight-flush-4'
  | 'straight-flush-5'
  | 'full-house'
  | 'four-of-a-kind'
  | 'five-of-a-kind';

export const POKER_BONUSES: Record<HandType, number> = {
  'high-card': 0,
  'pair': 1,
  'flush-3': 2,
  'straight-3': 3,
  'two-pair': 4,
  'three-of-a-kind': 5,
  'flush-4': 6,
  'straight-4': 7,
  'straight-flush-3': 8,
  'flush-5': 9,
  'straight-5': 10,
  'full-house': 11,
  'four-of-a-kind': 14,
  'straight-flush-4': 16,
  'five-of-a-kind': 22,
  'straight-flush-5': 27,
};

/** Ordering used as a secondary tie-break when two hand types tie on total damage. */
export const HAND_RANK_ORDER: HandType[] = [
  'high-card',
  'pair',
  'flush-3',
  'straight-3',
  'two-pair',
  'three-of-a-kind',
  'flush-4',
  'straight-4',
  'straight-flush-3',
  'flush-5',
  'straight-5',
  'full-house',
  'four-of-a-kind',
  'straight-flush-4',
  'five-of-a-kind',
  'straight-flush-5',
];

export function handRankIndex(type: HandType): number {
  return HAND_RANK_ORDER.indexOf(type);
}

/** Human-readable label for UI display. */
export const HAND_LABELS: Record<HandType, string> = {
  'high-card': 'High Card',
  'pair': 'Pair',
  'two-pair': 'Two Pair',
  'three-of-a-kind': 'Three of a Kind',
  'straight-3': '3-Card Straight',
  'straight-4': '4-Card Straight',
  'straight-5': 'Straight',
  'flush-3': '3-Card Flush',
  'flush-4': '4-Card Flush',
  'flush-5': 'Flush',
  'straight-flush-3': '3-Card Straight Flush',
  'straight-flush-4': '4-Card Straight Flush',
  'straight-flush-5': 'Straight Flush',
  'full-house': 'Full House',
  'four-of-a-kind': 'Four of a Kind',
  'five-of-a-kind': 'Five of a Kind',
};
