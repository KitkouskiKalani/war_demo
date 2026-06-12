/**
 * v2 Suit Effects System
 * 
 * Complete rewrite for the v2 ability system with:
 * - Data-driven effect registry
 * - Rank-tier based triggers (loss-oriented, win-oriented, win-only, on-play)
 * - Half-effect support for Spades/Hearts/Diamonds
 * - Clubs feast-or-famine (no half effects)
 * - Jokers explicitly excluded from suit effects
 */

import type { 
  Card, 
  StandardSuit, 
  Rank, 
  RankTier
} from './types'
import { getRankTier } from './types'
import { cardValue } from './deck'

// ============================================================================
// GLOBAL FEATURE FLAG
// ============================================================================

/**
 * Master switch for all suit-based card effects.
 *
 * When `false`, every suit ability (damage/heal bonuses, Hearts regen, Spades
 * bleed/Blood Debt, Diamonds charges, Clubs replacement/neutralize/move,
 * on-play triggers, damage-to-regen conversion, etc.) is disabled at the
 * source. Tooltips also omit effect descriptions so the UI cannot advertise
 * effects that will not fire.
 *
 * Flip this to `true` (or gate with a future rework) to re-enable effects.
 */
export const SUIT_EFFECTS_ENABLED = false

// ============================================================================
// TRIGGER POLICIES
// ============================================================================

export type TriggerPolicy = 
  | { type: 'loss-only' }                                    // Clubs 2-6: only on loss
  | { type: 'win-only' }                                     // J/Q/K: only on win
  | { type: 'on-play' }                                      // Aces: immediate when played
  | { type: 'loss-oriented'; fullOn: 'loss'; halfOn: 'win' } // 2-6 for S/H/D
  | { type: 'win-oriented'; fullOn: 'win'; halfOn: 'loss' }  // 7-10 for all suits

export type EffectStrength = 'full' | 'half' | 'none'

// ============================================================================
// EFFECT DEFINITIONS
// ============================================================================

export interface EffectDefinition {
  suit: StandardSuit
  rankTier: RankTier
  triggerPolicy: TriggerPolicy
  effectId: string // Unique identifier for the effect
  description: string
  // Values for full and half effects
  fullValue?: number
  halfValue?: number
  // Whether this effect requires player choice
  requiresChoice: boolean
  choiceType?: 'clubs-2-6-replacement' | 'clubs-7-10-option' | 'clubs-ace-option' | 'diamonds-ace-option' | 'diamonds-queen-spend'
}

// Effect registry - maps (suit, rankTier) to effect definition
const EFFECT_REGISTRY: Map<string, EffectDefinition> = new Map()

function registerEffect(def: EffectDefinition): void {
  const key = `${def.suit}-${def.rankTier}`
  EFFECT_REGISTRY.set(key, def)
}

// ============================================================================
// CLUBS - Control/Disruption (v2.2)
// ============================================================================

registerEffect({
  suit: 'clubs',
  rankTier: 'low', // 2-6
  triggerPolicy: { type: 'loss-only' },
  effectId: 'clubs-manipulation',
  description: 'Replace a hand card with Clubs J/Q/K',
  requiresChoice: true,
  choiceType: 'clubs-2-6-replacement'
})

registerEffect({
  suit: 'clubs',
  rankTier: 'mid', // 7-10
  triggerPolicy: { type: 'win-only' },
  effectId: 'clubs-board-control',
  description: 'v2.2: Replace hand card with Clubs Ace',
  requiresChoice: true,
  choiceType: 'clubs-7-10-option'  // Will use clubs-7-10-replacement in handler
})

registerEffect({
  suit: 'clubs',
  rankTier: 'high', // J/Q/K
  triggerPolicy: { type: 'on-play' },
  effectId: 'clubs-rule-breaker',
  description: 'v2.2: J=double poker, Q=move card, K=neutralize',
  requiresChoice: false
})

registerEffect({
  suit: 'clubs',
  rankTier: 'ace',
  triggerPolicy: { type: 'on-play' },
  effectId: 'clubs-ace-rewrite',
  description: 'v2.2: Heal 5, Deal 5 damage',
  requiresChoice: false  // v2.2: No choice needed
})

// ============================================================================
// SPADES - Aggro/Pressure (v2.2)
// ============================================================================

registerEffect({
  suit: 'spades',
  rankTier: 'low', // 2-6
  triggerPolicy: { type: 'loss-oriented', fullOn: 'loss', halfOn: 'win' },
  effectId: 'spades-blood-debt',
  description: 'v2.2: Add Blood Debt (doubles poker bonus on resolve)',
  fullValue: 4,   // v2.2: +4 on loss (was +5)
  halfValue: 2,   // +2 on win (unchanged)
  requiresChoice: false
})

registerEffect({
  suit: 'spades',
  rankTier: 'mid', // 7-10
  triggerPolicy: { type: 'win-oriented', fullOn: 'win', halfOn: 'loss' },
  effectId: 'spades-bleed',
  description: 'v2.2: Apply Bleed (3 turns, refreshes)',
  fullValue: 2,
  halfValue: 1,
  requiresChoice: false
})

registerEffect({
  suit: 'spades',
  rankTier: 'high', // J/Q/K
  triggerPolicy: { type: 'on-play' },
  effectId: 'spades-execution',
  description: 'v2.2: J=+10 debt, Q=+4 bleed, K=+5 debt +2 bleed',
  requiresChoice: false
})

registerEffect({
  suit: 'spades',
  rankTier: 'ace',
  triggerPolicy: { type: 'on-play' },
  effectId: 'spades-ace-assault',
  description: 'v2.2: +5 blood debt, +2 bleed, then choose bonus',
  requiresChoice: true  // v2.2: Choice for additional bonus
})

// ============================================================================
// HEARTS - Sustain/Defense (v2.2)
// ============================================================================

registerEffect({
  suit: 'hearts',
  rankTier: 'low', // 2-6
  triggerPolicy: { type: 'on-play' },
  effectId: 'hearts-temp-regen',
  description: 'v3: +3 temp regen/turn for 3 turns',
  requiresChoice: false
})

registerEffect({
  suit: 'hearts',
  rankTier: 'mid', // 7-10
  triggerPolicy: { type: 'on-play' },
  effectId: 'hearts-renewal-burst',
  description: 'v3: Instant heal for current Regen x4',
  requiresChoice: false
})

registerEffect({
  suit: 'hearts',
  rankTier: 'high', // J/Q/K
  triggerPolicy: { type: 'on-play' },
  effectId: 'hearts-vitality',
  description: 'v3: J=heal Regen x8, Q=+4 perm Regen, K=+2 perm Regen + heal Regen x5',
  requiresChoice: false
})

registerEffect({
  suit: 'hearts',
  rankTier: 'ace',
  triggerPolicy: { type: 'on-play' },
  effectId: 'hearts-ace-damage-conversion',
  description: 'v3: Next lane won converts damage dealt into temp regen (3 turns)',
  requiresChoice: false
})

// ============================================================================
// DIAMONDS - Scaling/Sacrifice (v2.2)
// ============================================================================

registerEffect({
  suit: 'diamonds',
  rankTier: 'low', // 2-6
  triggerPolicy: { type: 'loss-oriented', fullOn: 'loss', halfOn: 'win' },  // v2.2: Loss-oriented for charges
  effectId: 'diamonds-dark-investment',
  description: 'v2.2: Gain Charges on resolution (cap 5)',
  fullValue: 3,  // v2.2: +3 charges on LOSS
  halfValue: 1,  // v2.2: +1 charge on WIN
  requiresChoice: false
})

registerEffect({
  suit: 'diamonds',
  rankTier: 'mid', // 7-10
  triggerPolicy: { type: 'win-oriented', fullOn: 'win', halfOn: 'loss' },
  effectId: 'diamonds-soul-charges',
  description: 'Gain Charges (cap 5)',
  fullValue: 3,  // +3 charges on WIN
  halfValue: 1,  // +1 charge on LOSS
  requiresChoice: false
})

registerEffect({
  suit: 'diamonds',
  rankTier: 'high', // J/Q/K
  triggerPolicy: { type: 'on-play' },
  effectId: 'diamonds-ritual-power',
  description: 'v2.2: J=+2 charges, Q=+2 power, K=+1/+1',
  requiresChoice: false
})

registerEffect({
  suit: 'diamonds',
  rankTier: 'ace',
  triggerPolicy: { type: 'on-play' },
  effectId: 'diamonds-ace-dark-pact',
  description: 'v2.2: +1 charge, +1 power, then choose bonus (no self-damage)',
  requiresChoice: true,
  choiceType: 'diamonds-ace-option'
})

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Check if a card is active for suit effects
 * IMPORTANT: Jokers are NEVER active for suit effects in v2
 */
export function isCardActiveForEffects(card: Card, ownerSuit: StandardSuit | null): boolean {
  // Master feature flag: all suit effects disabled.
  if (!SUIT_EFFECTS_ENABLED) return false
  if (!ownerSuit) return false
  // Jokers do NOT trigger suit effects (even though they now have suits)
  if (card.rank === 'JOKER') return false
  return card.suit === ownerSuit
}

/**
 * Get the effect definition for a card
 */
export function getEffectDefinition(card: Card, ownerSuit: StandardSuit | null): EffectDefinition | null {
  if (!isCardActiveForEffects(card, ownerSuit)) return null
  
  const rankTier = getRankTier(card.rank)
  const key = `${ownerSuit}-${rankTier}`
  return EFFECT_REGISTRY.get(key) || null
}

/**
 * Determine if an effect should trigger based on win/loss outcome
 */
export function shouldEffectTrigger(
  def: EffectDefinition,
  isWinner: boolean,
  isTie: boolean
): boolean {
  // Master feature flag: all suit effects disabled.
  if (!SUIT_EFFECTS_ENABLED) return false
  // Ties never trigger effects
  if (isTie) return false

  switch (def.triggerPolicy.type) {
    case 'loss-only':
      return !isWinner
    case 'win-only':
      return isWinner
    case 'on-play':
      return false // On-play effects don't trigger at resolution
    case 'loss-oriented':
      return true // Triggers on both win and loss (with different strengths)
    case 'win-oriented':
      return true // Triggers on both win and loss (with different strengths)
    default:
      return false
  }
}

/**
 * Get the effect strength (full/half/none) for a triggered effect
 */
export function getEffectStrength(
  def: EffectDefinition,
  isWinner: boolean
): EffectStrength {
  switch (def.triggerPolicy.type) {
    case 'loss-only':
      return isWinner ? 'none' : 'full'
    case 'win-only':
      return isWinner ? 'full' : 'none'
    case 'on-play':
      return 'full' // On-play always full
    case 'loss-oriented':
      return isWinner ? 'half' : 'full'
    case 'win-oriented':
      return isWinner ? 'full' : 'half'
    default:
      return 'none'
  }
}

/**
 * Get the effect value based on strength
 */
export function getEffectValue(def: EffectDefinition, strength: EffectStrength): number {
  if (strength === 'none') return 0
  if (strength === 'full') return def.fullValue ?? 0
  if (strength === 'half') return def.halfValue ?? 0
  return 0
}

// ============================================================================
// SPECIFIC EFFECT VALUE GETTERS
// ============================================================================

/**
 * Get Spades J/Q/K direct damage values (now triggered on play)
 */
export function getSpadesHighDamage(rank: Rank, opponentHp: number): number {
  const lowHpThreshold = 30
  switch (rank) {
    case 'J': 
      // 6 damage (+3 if opponent HP < 30)
      return opponentHp < lowHpThreshold ? 9 : 6
    case 'Q': 
      // 9 damage (+4 if opponent HP < 30)
      return opponentHp < lowHpThreshold ? 13 : 9
    case 'K': 
      // 12 damage (+6 if opponent HP < 30)
      return opponentHp < lowHpThreshold ? 18 : 12
    default: return 0
  }
}

/**
 * Get Hearts J/Q healing values (now triggered on play)
 */
export function getHeartsHighHealing(rank: Rank): number {
  switch (rank) {
    case 'J': return 6
    case 'Q': return 9
    // K heals 12 on play (no longer overkill-based)
    default: return 0
  }
}

// ============================================================================
// TOOLTIP FUNCTIONS (Updated for v2)
// ============================================================================

export interface CardTooltipData {
  header: string
  baseDamage: string
  effect: string | null
  description?: string
}

export function getRankDisplayName(rank: Rank): string {
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
 * Get v2 tooltip for a card showing its suit ability
 */
export function getCardTooltipData(
  card: Card,
  ownerSuit: StandardSuit | null
): CardTooltipData {
  // Jokers get special tooltip - no suit effects
  if (card.rank === 'JOKER') {
    return getJokerInHandTooltip(card, ownerSuit)
  }

  const rankName = getRankDisplayName(card.rank)
  const suitName = getSuitDisplayName(card.suit)
  const value = cardValue(card)

  const header = `${rankName} of ${suitName}`
  const baseDamage = `Deals ${value} damage`

  const stackEffect = getAbilityStackTooltip(card, ownerSuit)

  // Master feature flag: suit abilities disabled -> omit the effect line so
  // the tooltip cannot advertise an effect that will not fire.
  if (!SUIT_EFFECTS_ENABLED) {
    return { header, baseDamage, effect: stackEffect }
  }

  const def = getEffectDefinition(card, ownerSuit)
  if (!def) {
    return { header, baseDamage, effect: stackEffect }
  }

  // Build effect description based on suit and tier
  const effect = getEffectDescriptionForTooltip(card, def, ownerSuit!)

  return { header, baseDamage, effect: stackEffect ? `${stackEffect}\n${effect}` : effect }
}

function getAbilityStackTooltip(card: Card, ownerSuit: StandardSuit | null): string | null {
  if (!ownerSuit) return null
  if (card.suit === ownerSuit) return 'Gives a stack of Minion ability'
  if (typeof card.rank === 'number') {
    if (card.rank >= 2 && card.rank <= 6) return 'Gives a stack of Sword'
    if (card.rank >= 7 && card.rank <= 10) return 'Gives a stack of Shield'
    return null
  }
  if (card.rank === 'J') return 'Gives a stack of Shield'
  if (card.rank === 'Q' || card.rank === 'K' || card.rank === 'A' || card.rank === 'JOKER') {
    return 'Gives a stack of Relic'
  }
  return null
}

function getEffectDescriptionForTooltip(
  card: Card,
  def: EffectDefinition,
  ownerSuit: StandardSuit
): string {
  const tier = getRankTier(card.rank)
  
  switch (ownerSuit) {
    case 'clubs':
      return getClubsTooltip(card.rank, tier)
    case 'spades':
      return getSpadesTooltip(card.rank, tier, def)
    case 'hearts':
      return getHeartsTooltip(card.rank, tier, def)
    case 'diamonds':
      return getDiamondsTooltip(card.rank, tier, def)
    default:
      return def.description
  }
}

function getClubsTooltip(rank: Rank, tier: RankTier): string {
  if (tier === 'ace') {
    return 'ON PLAY: Heal 5 HP AND deal 5 damage'
  }
  if (tier === 'low') {
    return 'LOSS: Replace a hand card with Clubs J/Q/K'
  }
  if (tier === 'mid') {
    return 'WIN: Replace a hand card with Clubs Ace'
  }
  // v2.2 High tier (J/Q/K) - trigger on play
  switch (rank) {
    case 'J': return 'ON PLAY: Double poker bonus for this lane'
    case 'Q': return 'ON PLAY: Move opponent top card between lanes'
    case 'K': return 'ON PLAY: Neutralize a lane (disable effects)'
    default: return 'No effect'
  }
}

function getSpadesTooltip(rank: Rank, tier: RankTier, def: EffectDefinition): string {
  if (tier === 'ace') {
    // +2 bleed stacks = 4 damage/turn, +5 debt OR +2 bleed = +4 damage
    return 'ON PLAY: +5 Blood Debt, +4 Bleed/turn, then choose +5 debt OR +4 bleed'
  }
  if (tier === 'low') {
    return `LOSS: +${def.fullValue} Blood Debt | WIN: +${def.halfValue} Blood Debt`
  }
  if (tier === 'mid') {
    // Bleed stacks * 2 = actual damage per turn
    const fullDmg = (def.fullValue ?? 2) * 2
    const halfDmg = (def.halfValue ?? 1) * 2
    return `WIN: +${fullDmg} Bleed/turn (3t) | LOSS: +${halfDmg} Bleed/turn (3t)`
  }
  // v2.2 High tier - blood debt and bleed, not damage
  switch (rank) {
    case 'J': return 'ON PLAY: +10 Blood Debt'
    case 'Q': return 'ON PLAY: +8 Bleed/turn to opponent'  // 4 stacks * 2
    case 'K': return 'ON PLAY: +5 Blood Debt, +4 Bleed/turn'  // 2 stacks * 2
    default: return 'No effect'
  }
}

function getHeartsTooltip(rank: Rank, tier: RankTier, _def: EffectDefinition): string {
  if (tier === 'ace') {
    return 'ON PLAY: Next lane you win converts damage dealt into temp Regen (3 turns)'
  }
  if (tier === 'low') {
    return 'ON PLAY: +3 temp Regen/turn for 3 turns'
  }
  if (tier === 'mid') {
    return 'ON PLAY: Heal for current Regen x4'
  }
  // v3 High tier - trigger on play
  switch (rank) {
    case 'J': return 'ON PLAY: Heal for current Regen x8'
    case 'Q': return 'ON PLAY: +4 permanent Regen'
    case 'K': return 'ON PLAY: +2 permanent Regen, then heal for current Regen x5'
    default: return 'No effect'
  }
}

function getDiamondsTooltip(rank: Rank, tier: RankTier, def: EffectDefinition): string {
  if (tier === 'ace') {
    return 'ON PLAY: +1 Charge, +1 Power, then choose +2 charges OR +2 power'
  }
  if (tier === 'low') {
    return `LOSS: +${def.fullValue ?? 3} Charges | WIN: +${def.halfValue ?? 1} Charge (cap 5)`
  }
  if (tier === 'mid') {
    return `WIN: +${def.fullValue ?? 3} Charges | LOSS: +${def.halfValue ?? 1} Charge (cap 5)`
  }
  // v2.2 High tier - trigger on play
  switch (rank) {
    case 'J': return 'ON PLAY: Gain 2 Charges'
    case 'Q': return 'ON PLAY: Charge Power +2'
    case 'K': return 'ON PLAY: +1 Charge, +1 Charge Power'
    default: return 'No effect'
  }
}

/**
 * Joker tooltip - Jokers have NO suit effects
 */
export function getJokerInHandTooltip(card?: Card, ownerSuit?: StandardSuit | null): CardTooltipData {
  const stackEffect = card ? getAbilityStackTooltip(card, ownerSuit ?? null) : null
  return {
    header: 'Joker',
    baseDamage: 'Deals up to 12 damage',
    effect: stackEffect, // Jokers never have suit effects
    description: 'Wild card: becomes optimal rank/suit for poker bonuses, capped at Ace value. No suit ability.'
  }
}

export function getJokerOnBoardTooltip(): CardTooltipData {
  return {
    header: 'Joker',
    baseDamage: 'Variable damage',
    effect: null,
    description: 'Will resolve as optimal card. No suit ability triggers.'
  }
}

/**
 * Tooltip for a shared community poker card. Community cards have no owner and
 * trigger no suit abilities - they only contribute to both players' poker hands.
 */
export function getCommunityCardTooltip(card: Card): CardTooltipData {
  if (card.rank === 'JOKER') {
    return {
      header: 'Joker',
      baseDamage: 'Wild card',
      effect: null,
      description: 'Community card shared by both players. Becomes the optimal rank/suit for poker bonuses. No suit ability.',
    }
  }
  const rankName = getRankDisplayName(card.rank)
  const suitName = getSuitDisplayName(card.suit)
  return {
    header: `${rankName} of ${suitName}`,
    baseDamage: `Worth ${cardValue(card)}`,
    effect: null,
    description: 'Community card: counts toward both players’ poker hands in this lane. No suit ability.',
  }
}

// ============================================================================
// LEGACY COMPATIBILITY (for existing code that uses old functions)
// ============================================================================

// These are kept for backward compatibility during transition

export const DAMAGE_SUITS: StandardSuit[] = ['diamonds', 'spades']
export const HEALING_SUITS: StandardSuit[] = ['hearts', 'clubs']

/**
 * @deprecated Use isCardActiveForEffects instead
 * Note: This old function treated Jokers as active; new one does not
 */
export function isCardActive(card: Card, ownerSuit: StandardSuit | null): boolean {
  if (!ownerSuit) return false
  if (card.rank === 'JOKER') return true // Legacy behavior
  return card.suit === ownerSuit
}

/**
 * @deprecated Use v2 effect system instead
 * This provides simple damage/healing values for backward compatibility
 */
export function calculateLaneSuitEffects(
  _cards: Card[], 
  _ownerSuit: StandardSuit | null
): { totalDamage: number; totalHealing: number } {
  // For now, return 0s - the v2 system handles effects differently
  // Effects are applied individually per card with proper trigger logic
  return { totalDamage: 0, totalHealing: 0 }
}

/**
 * @deprecated Use v2 effect system instead
 */
export function applyWinnerDamageBonus(
  baseDamage: number,
  winnerDamageBonus: number
): number {
  return baseDamage + winnerDamageBonus
}

/**
 * @deprecated Use getCardTooltipData instead
 */
export function getCardEffectTooltip(
  card: Card,
  ownerSuit: StandardSuit | null
): string {
  // Master feature flag: never surface an effect string when disabled.
  if (!SUIT_EFFECTS_ENABLED) return ''
  const data = getCardTooltipData(card, ownerSuit)
  return data.effect || 'No effect'
}

/**
 * @deprecated Use v2 effect system instead  
 */
export function getSuitEffectValue(
  _card: Card, 
  _ownerSuit: StandardSuit | null
): { damage: number; healing: number } {
  // V2 system doesn't use simple damage/healing values
  return { damage: 0, healing: 0 }
}
