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
const DAMAGE_SUITS: StandardSuit[] = ['diamonds', 'spades']

// Healing suits reduce damage or heal
const HEALING_SUITS: StandardSuit[] = ['hearts', 'clubs']

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
 * Apply suit effects to lane resolution damage
 * 
 * @param baseDamage - The base damage from lane total difference
 * @param winnerDamageBonus - Winner's bonus damage from active cards
 * @param loserHealing - Loser's healing from active cards
 * @returns Final damage to apply (can be negative = healing if fully mitigated)
 */
export function applySuitEffectsToLaneDamage(
  baseDamage: number,
  winnerDamageBonus: number,
  loserHealing: number
): { finalDamage: number; healingOverflow: number } {
  // Add winner's damage bonus
  const totalDamage = baseDamage + winnerDamageBonus
  
  // Subtract loser's healing
  const afterHealing = totalDamage - loserHealing
  
  if (afterHealing < 0) {
    // Fully mitigated + overflow = healing for the loser
    return { finalDamage: 0, healingOverflow: Math.abs(afterHealing) }
  }
  
  return { finalDamage: afterHealing, healingOverflow: 0 }
}

