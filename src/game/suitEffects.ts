/**
 * Suit Effects System
 * 
 * Active cards (matching owner's suit) provide bonus effects at lane resolution:
 * - Diamonds & Spades: Bonus damage (adds to damage dealt)
 * - Hearts & Clubs: Healing (reduces damage taken or heals if fully mitigated)
 * 
 * Effect values by card rank:
 * - Low (2-5): 7
 * - Mid (6-10): 5
 * - High (J, Q, K, Joker): 3
 */

import type { Card, StandardSuit } from './types'
import { cardValue } from './deck'

// Effect values by rank tier
const EFFECT_VALUES = {
  low: 7,    // ranks 2-5
  mid: 5,    // ranks 6-10
  high: 3,   // J, Q, K, Joker
}

// Damage suits add bonus damage
export const DAMAGE_SUITS: StandardSuit[] = ['diamonds', 'spades']

// Healing suits reduce damage or heal
export const HEALING_SUITS: StandardSuit[] = ['hearts', 'clubs']

/**
 * Get the effect tier for a card based on its rank
 */
function getEffectTier(card: Card): 'low' | 'mid' | 'high' {
  const value = cardValue(card)
  
  // Joker (15), King (13), Queen (12), Jack (11)
  if (value >= 11) return 'high'
  
  // 6-10
  if (value >= 6) return 'mid'
  
  // 2-5
  return 'low'
}

/**
 * Check if a card is active (matches owner's suit)
 * Jokers are always considered active
 */
export function isCardActive(card: Card, ownerSuit: StandardSuit | null): boolean {
  if (!ownerSuit) return false
  if (card.rank === 'JOKER') return true
  return card.suit === ownerSuit
}

/**
 * Get the suit effect value for a single card
 * Returns { damage, healing } - only one will be non-zero based on suit type
 */
export function getSuitEffectValue(
  card: Card, 
  ownerSuit: StandardSuit | null
): { damage: number; healing: number } {
  // Not active = no effect
  if (!isCardActive(card, ownerSuit)) {
    return { damage: 0, healing: 0 }
  }
  
  const tier = getEffectTier(card)
  const effectValue = EFFECT_VALUES[tier]
  
  // Determine effect type based on owner's suit
  if (ownerSuit && DAMAGE_SUITS.includes(ownerSuit)) {
    return { damage: effectValue, healing: 0 }
  }
  
  if (ownerSuit && HEALING_SUITS.includes(ownerSuit)) {
    return { damage: 0, healing: effectValue }
  }
  
  return { damage: 0, healing: 0 }
}

/**
 * Calculate total suit effects for a set of cards in a lane
 * Returns combined damage bonus and healing from all active cards
 */
export function calculateLaneSuitEffects(
  cards: Card[], 
  ownerSuit: StandardSuit | null
): { totalDamage: number; totalHealing: number } {
  let totalDamage = 0
  let totalHealing = 0
  
  for (const card of cards) {
    const effect = getSuitEffectValue(card, ownerSuit)
    totalDamage += effect.damage
    totalHealing += effect.healing
  }
  
  return { totalDamage, totalHealing }
}

/**
 * Apply winner's suit effects to lane resolution
 * 
 * IMPORTANT: Only the WINNER's active cards provide effects!
 * - Damage suits (Diamonds/Spades): Add bonus damage to loser
 * - Healing suits (Hearts/Clubs): Winner heals themselves (applied separately)
 * 
 * @param baseDamage - The base damage from lane total difference
 * @param winnerDamageBonus - Winner's bonus damage from active cards (if damage suit)
 * @returns Final damage to apply to the loser
 */
export function applyWinnerDamageBonus(
  baseDamage: number,
  winnerDamageBonus: number
): number {
  return baseDamage + winnerDamageBonus
}

/**
 * Get tooltip text for a card's suit effect (legacy - simple string)
 * Shows the bonus damage/healing if active, or "No effect" if inactive
 */
export function getCardEffectTooltip(
  card: Card,
  ownerSuit: StandardSuit | null
): string {
  if (!isCardActive(card, ownerSuit)) {
    return 'No effect'
  }
  
  const tier = getEffectTier(card)
  const effectValue = EFFECT_VALUES[tier]
  
  if (ownerSuit && DAMAGE_SUITS.includes(ownerSuit)) {
    return `+${effectValue} bonus damage (if lane won)`
  }
  
  if (ownerSuit && HEALING_SUITS.includes(ownerSuit)) {
    return `+${effectValue} healing (if lane won)`
  }
  
  return 'No effect'
}

/**
 * Get structured tooltip data for a card
 * Returns header (card name), base damage, and effect text (for active cards)
 */
export interface CardTooltipData {
  header: string;       // e.g., "5 of Clubs"
  baseDamage: string;   // e.g., "Deals 5 damage"
  effect: string | null; // e.g., "Effect: +7 bonus damage" or null if inactive
  description?: string; // Optional extra description (for Jokers)
}

export function getRankDisplayName(rank: number | string): string {
  if (rank === 'JOKER') return 'Joker'
  if (rank === 'J') return 'Jack'
  if (rank === 'Q') return 'Queen'
  if (rank === 'K') return 'King'
  if (rank === 'A') return 'Ace'
  return String(rank)
}

export function getSuitDisplayName(suit: string): string {
  return suit.charAt(0).toUpperCase() + suit.slice(1)
}

/**
 * Joker tooltip data for when in hand (not yet played)
 */
export function getJokerInHandTooltip(): CardTooltipData {
  return {
    header: 'Joker',
    baseDamage: 'Deals up to 15 damage',
    effect: null,
    description: 'Becomes the best card wherever played. Value capped by cards played on top.'
  }
}

/**
 * Joker tooltip data for when on the board (not resolved until lane resolution)
 */
export function getJokerOnBoardTooltip(): CardTooltipData {
  return {
    header: 'Joker',
    baseDamage: 'Mimick',
    effect: null, // Jokers never get suit effects
    description: 'Will always resolve as the best card for the situation'
  }
}

export function getCardTooltipData(
  card: Card,
  ownerSuit: StandardSuit | null
): CardTooltipData {
  // Jokers in hand get special tooltip
  if (card.rank === 'JOKER') {
    return getJokerInHandTooltip()
  }
  
  const rankName = getRankDisplayName(card.rank)
  const suitName = getSuitDisplayName(card.suit)
  const value = cardValue(card)
  const isActive = isCardActive(card, ownerSuit)
  
  const header = `${rankName} of ${suitName}`
  const baseDamage = `Deals ${value} damage`
  
  let effect: string | null = null
  if (isActive) {
    const tier = getEffectTier(card)
    const effectValue = EFFECT_VALUES[tier]
    
    if (ownerSuit && DAMAGE_SUITS.includes(ownerSuit)) {
      effect = `Effect: +${effectValue} bonus damage`
    } else if (ownerSuit && HEALING_SUITS.includes(ownerSuit)) {
      effect = `Effect: +${effectValue} healing`
    }
  }
  
  return { header, baseDamage, effect }
}
