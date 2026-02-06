/**
 * v2 Effect Handlers
 * 
 * Contains the actual implementation of all suit effects.
 * Each effect handler modifies game state and/or queues player choices.
 */

import type { 
  Card, 
  CurrentPlayer,
  GameState,
  LaneId,
  EffectChoice,
  BleedStack,
  PendingLaneResolution
} from './types'
import { getRankTier } from './types'
import { 
  getEffectDefinition, 
  getEffectValue,
  isCardActiveForEffects,
  type EffectStrength
} from './suitEffects'
import { cardValue } from './deck'

// ============================================================================
// EFFECT EXECUTION CONTEXT
// ============================================================================

export interface EffectContext {
  state: GameState
  card: Card
  player: CurrentPlayer
  opponent: CurrentPlayer
  laneId: LaneId
  isWinner: boolean
  isTie: boolean
  strength: EffectStrength
  // For damage calculations
  opponentHpAfterLaneDamage?: number
  overkillAmount?: number
}

// ============================================================================
// CLUBS EFFECT HANDLERS
// ============================================================================

/**
 * Clubs 2-6: Manipulation Through Failure
 * On LOSS: Choose hand card to replace with Clubs J/Q/K
 */
export function handleClubsLowEffect(ctx: EffectContext): GameState {
  if (ctx.strength === 'none') return ctx.state
  
  const playerState = ctx.player === 1 ? ctx.state.player1 : ctx.state.player2
  
  // If player has no cards in hand, no-op
  if (playerState.hand.length === 0) {
    return ctx.state
  }
  
  // Queue choice for player to select hand card and replacement
  const choice: EffectChoice = {
    type: 'clubs-2-6-replacement',
    player: ctx.player,
    sourceCardId: ctx.card.id,
    laneId: ctx.laneId
  }
  
  return {
    ...ctx.state,
    pendingEffectChoices: [...ctx.state.pendingEffectChoices, choice]
  }
}

/**
 * v2.2 Clubs 7-10: Board Control
 * On WIN: Replace a hand card with Clubs Ace
 */
export function handleClubsMidEffect(ctx: EffectContext): GameState {
  if (ctx.strength === 'none') return ctx.state
  if (!ctx.isWinner) return ctx.state  // Only triggers on WIN
  
  const playerState = ctx.player === 1 ? ctx.state.player1 : ctx.state.player2
  
  // If player has no cards in hand, no-op
  if (playerState.hand.length === 0) {
    return ctx.state
  }
  
  // Queue choice for player to select hand card to replace with Clubs Ace
  const choice: EffectChoice = {
    type: 'clubs-7-10-replacement',
    player: ctx.player,
    sourceCardId: ctx.card.id,
    laneId: ctx.laneId
  }
  
  return {
    ...ctx.state,
    pendingEffectChoices: [...ctx.state.pendingEffectChoices, choice]
  }
}

/**
 * v2.2: Apply Clubs 7-10 ace replacement
 */
export function applyClubsAceReplacement(
  state: GameState,
  player: CurrentPlayer,
  handCardId: string
): GameState {
  const playerState = player === 1 ? state.player1 : state.player2
  
  // Find the hand card to replace
  const handCardIndex = playerState.hand.findIndex(c => c.id === handCardId)
  if (handCardIndex === -1) return state
  
  const replacedCard = playerState.hand[handCardIndex]
  
  // Create the replacement Clubs Ace
  const replacementCard: Card = {
    id: `clubs-ace-replacement-${Date.now()}`,
    suit: 'clubs',
    rank: 'A'
  }
  
  // Update hand
  const newHand = [...playerState.hand]
  newHand[handCardIndex] = replacementCard
  
  // Add replaced card to discard
  const newDiscard = [...state.discardPile, replacedCard]
  
  console.log(`[Clubs] Player ${player} replaced hand card with Clubs Ace`)
  
  if (player === 1) {
    return {
      ...state,
      player1: {
        ...state.player1,
        hand: newHand
      },
      discardPile: newDiscard
    }
  } else {
    return {
      ...state,
      player2: {
        ...state.player2,
        hand: newHand
      },
      discardPile: newDiscard
    }
  }
}

/**
 * Clubs Jack: Double poker bonus for Clubs player
 * Effect is now handled directly in resolveLane() - this is a no-op
 */
export function handleClubsJack(ctx: EffectContext, _laneCards: Card[]): GameState {
  // Effect handled in lane resolution (doubled poker bonus)
  // No additional effect needed here
  return ctx.state
}

/**
 * Clubs Queen: Delay another lane's resolution by 1 turn
 * Queues a lane selection choice for the player
 */
export function handleClubsQueen(ctx: EffectContext, _laneCards: Card[]): GameState {
  if (ctx.strength === 'none') return ctx.state
  
  // Queue a lane selection choice
  const choice: EffectChoice = {
    type: 'clubs-queen-delay',
    player: ctx.player,
    sourceCardId: ctx.card.id,
    laneId: ctx.laneId // The lane this Queen is in (cannot select same lane)
  }
  
  return {
    ...ctx.state,
    pendingEffectChoices: [...ctx.state.pendingEffectChoices, choice]
  }
}

/**
 * Apply Clubs Queen lane delay effect
 * - If target lane is pending: increment turnsUntilResolution by 1
 * - If target lane not pending: set laneDelayedUntilTurn flag
 */
export function applyClubsQueenDelay(
  state: GameState, 
  targetLaneId: LaneId, 
  sourceLaneId: LaneId
): GameState {
  // Cannot target the same lane
  if (targetLaneId === sourceLaneId) return state
  
  // Check if target lane is in pendingResolutionLanes
  const pendingIndex = state.pendingResolutionLanes.findIndex(p => p.laneId === targetLaneId)
  
  if (pendingIndex >= 0) {
    // Lane is pending - increment turnsUntilResolution (max +1 delay)
    const pending = state.pendingResolutionLanes[pendingIndex]
    if (pending.turnsUntilResolution < 2) {
      // Only allow +1 delay (from 1 to 2)
      const updatedPending = [...state.pendingResolutionLanes]
      updatedPending[pendingIndex] = {
        ...pending,
        turnsUntilResolution: pending.turnsUntilResolution + 1
      }
      return {
        ...state,
        pendingResolutionLanes: updatedPending
      }
    }
  } else {
    // Lane not pending - set delay flag
    return {
      ...state,
      laneDelayedUntilTurn: {
        ...state.laneDelayedUntilTurn,
        [targetLaneId]: true
      }
    }
  }
  
  return state
}

/**
 * Clubs King: Block opponent's suit effects in this lane
 * This is handled during resolution - we just mark it here
 */
export function handleClubsKing(ctx: EffectContext): { blockOpponentEffects: boolean } {
  if (ctx.strength === 'none') return { blockOpponentEffects: false }
  return { blockOpponentEffects: true }
}

/**
 * v2.2 Clubs Ace: On-play - Gain 5 HP AND deal 5 damage (both effects, no choice)
 */
export function handleClubsAceOnPlay(state: GameState, player: CurrentPlayer, _card: Card): GameState {
  const opponent: CurrentPlayer = player === 1 ? 2 : 1
  
  // Heal self 5 HP
  let newState = state
  if (player === 1) {
    newState = {
      ...newState,
      player1: {
        ...newState.player1,
        hp: newState.player1.hp + 5
      }
    }
  } else {
    newState = {
      ...newState,
      player2: {
        ...newState.player2,
        hp: newState.player2.hp + 5
      }
    }
  }
  
  // Deal 5 damage to opponent
  if (opponent === 1) {
    newState = {
      ...newState,
      player1: {
        ...newState.player1,
        hp: newState.player1.hp - 5
      }
    }
  } else {
    newState = {
      ...newState,
      player2: {
        ...newState.player2,
        hp: newState.player2.hp - 5
      }
    }
  }
  
  console.log(`[Clubs Ace] Player ${player} healed 5 HP and dealt 5 damage to opponent`)
  
  return newState
}

// ============================================================================
// SPADES EFFECT HANDLERS
// ============================================================================

/**
 * Spades 2-6: Blood Debt
 * Adds stacks that convert to bonus damage on next lane win
 */
export function handleSpadesLowEffect(ctx: EffectContext): GameState {
  const value = getEffectValue(
    getEffectDefinition(ctx.card, ctx.player === 1 ? ctx.state.player1Suit : ctx.state.player2Suit)!,
    ctx.strength
  )
  
  if (value === 0) return ctx.state
  
  if (ctx.player === 1) {
    return {
      ...ctx.state,
      player1: {
        ...ctx.state.player1,
        bloodDebtStacks: ctx.state.player1.bloodDebtStacks + value
      }
    }
  } else {
    return {
      ...ctx.state,
      player2: {
        ...ctx.state.player2,
        bloodDebtStacks: ctx.state.player2.bloodDebtStacks + value
      }
    }
  }
}

// v2.2 Bleed Constants
const BLEED_DURATION_TURNS = 3  // Each bleed instance lasts 3 turns

/**
 * Spades 7-10: Bleed
 * Apply bleed to opponent as a separate instance (does NOT refresh existing bleed)
 * Each instance has its own duration and damage per turn
 */
export function handleSpadesMidEffect(ctx: EffectContext): GameState {
  const def = getEffectDefinition(ctx.card, ctx.player === 1 ? ctx.state.player1Suit : ctx.state.player2Suit)
  if (!def) return ctx.state
  
  const value = getEffectValue(def, ctx.strength)
  if (value === 0) return ctx.state
  
  // Convert stacks to damage per turn (stacks * 2)
  const damagePerTurn = value * 2
  return applyBleed(ctx.state, ctx.opponent, damagePerTurn)
}

/**
 * Apply bleed as a separate instance (does NOT refresh existing bleed)
 * @param damagePerTurn - the actual damage this bleed does per turn
 */
export function applyBleed(state: GameState, target: CurrentPlayer, damagePerTurn: number): GameState {
  const targetState = target === 1 ? state.player1 : state.player2
  
  // Add new bleed instance WITHOUT refreshing existing ones
  const newBleedInstance: BleedStack = {
    damagePerTurn: damagePerTurn,
    turnsRemaining: BLEED_DURATION_TURNS
  }
  
  const totalBleedAfter = targetState.bleedStacks.reduce((sum, s) => sum + s.damagePerTurn, 0) + damagePerTurn
  console.log(`[Bleed] Applied ${damagePerTurn} bleed/turn to Player ${target} for ${BLEED_DURATION_TURNS} turns. Total bleed: ${totalBleedAfter}/turn`)
  
  if (target === 1) {
    return {
      ...state,
      player1: {
        ...state.player1,
        bleedStacks: [...targetState.bleedStacks, newBleedInstance]
      }
    }
  } else {
    return {
      ...state,
      player2: {
        ...state.player2,
        bleedStacks: [...targetState.bleedStacks, newBleedInstance]
      }
    }
  }
}

/**
 * @deprecated Use applyBleed instead - this is kept for backwards compatibility
 */
export function applyBleedStacks(state: GameState, target: CurrentPlayer, stacks: number): GameState {
  // Convert stacks to damage per turn (stacks * 2)
  const damagePerTurn = stacks * 2
  return applyBleed(state, target, damagePerTurn)
}

/**
 * @deprecated v2.2: Spades J/Q/K now apply blood debt and bleed, not direct damage
 * Kept for backward compatibility
 */
export function handleSpadesHighEffect(ctx: EffectContext): GameState {
  // v2.2: This should not be called - Spades face cards are on-play only
  console.warn('[Spades] handleSpadesHighEffect called but should not be - J/Q/K are on-play effects')
  return ctx.state
}

/**
 * v2.2 Spades Ace: On-play - +5 Blood Debt, +2 Bleed, then menu choice
 */
export function handleSpadesAceOnPlay(state: GameState, player: CurrentPlayer, card: Card): GameState {
  const opponent: CurrentPlayer = player === 1 ? 2 : 1
  
  // Base effect: +5 blood debt to self, +2 bleed to opponent
  let newState = addBloodDebt(state, player, 5)
  newState = applyBleedStacks(newState, opponent, 2)
  
  // Queue choice for additional bonus: +5 more blood debt OR +2 more bleed
  const choice: EffectChoice = {
    type: 'spades-ace-choice',
    player: player,
    sourceCardId: card.id
  }
  
  return {
    ...newState,
    pendingEffectChoices: [...newState.pendingEffectChoices, choice]
  }
}

/**
 * Apply Spades Ace choice: +5 blood debt or +2 bleed
 */
export function applySpadesAceChoice(
  state: GameState,
  player: CurrentPlayer,
  choice: 'bloodDebt' | 'bleed'
): GameState {
  const opponent: CurrentPlayer = player === 1 ? 2 : 1
  
  if (choice === 'bloodDebt') {
    return addBloodDebt(state, player, 5)
  } else {
    return applyBleedStacks(state, opponent, 2)
  }
}

/**
 * Helper to add blood debt stacks to a player
 */
function addBloodDebt(state: GameState, player: CurrentPlayer, amount: number): GameState {
  console.log(`[Blood Debt] Player ${player} gains +${amount} Blood Debt stacks`)
  
  if (player === 1) {
    return {
      ...state,
      player1: {
        ...state.player1,
        bloodDebtStacks: state.player1.bloodDebtStacks + amount
      }
    }
  } else {
    return {
      ...state,
      player2: {
        ...state.player2,
        bloodDebtStacks: state.player2.bloodDebtStacks + amount
      }
    }
  }
}

// ============================================================================
// HEARTS EFFECT HANDLERS
// ============================================================================

// v2.2 Hearts Regen Constants
const REGEN_DURATION_TURNS = 5  // Duration in Hearts player turns

/**
 * Apply regen to a player as a new instance (does NOT refresh existing instances)
 * v2.2: Regen now works like bleed - separate instances with independent durations
 */
export function applyRegenGain(state: GameState, player: CurrentPlayer, healingPerTurn: number): GameState {
  const playerState = player === 1 ? state.player1 : state.player2
  
  // Create a new regen instance
  const newRegenInstance = {
    healingPerTurn: healingPerTurn,
    turnsRemaining: REGEN_DURATION_TURNS
  }
  
  // Add to existing regen stacks (does NOT refresh old instances)
  const newRegenStacks = [...playerState.regenStacks, newRegenInstance]
  
  // Calculate total healing per turn for logging
  const totalHealingPerTurn = newRegenStacks.reduce((sum, stack) => sum + stack.healingPerTurn, 0)
  
  console.log(`[Hearts Regen] Player ${player} gains new regen instance: +${healingPerTurn}/turn for ${REGEN_DURATION_TURNS} turns. Total: ${totalHealingPerTurn}/turn (${newRegenStacks.length} instances)`)
  
  if (player === 1) {
    return {
      ...state,
      player1: {
        ...state.player1,
        regenStacks: newRegenStacks
      }
    }
  } else {
    return {
      ...state,
      player2: {
        ...state.player2,
        regenStacks: newRegenStacks
      }
    }
  }
}

/**
 * Apply regen effect bonus to a player
 * Always refreshes bonus duration to full (5 Hearts player turns)
 */
export function applyRegenEffectBonusGain(state: GameState, player: CurrentPlayer, bonusToAdd: number): GameState {
  const playerState = player === 1 ? state.player1 : state.player2
  
  const newRegenEffectBonus = playerState.regenEffectBonus + bonusToAdd
  const newBonusTurnsRemaining = REGEN_DURATION_TURNS // Always refresh to full duration
  
  console.log(`[Hearts Regen] Player ${player} gains +${bonusToAdd} regen effect bonus. Total bonus: ${newRegenEffectBonus}, Duration refreshed to ${newBonusTurnsRemaining} turns`)
  
  if (player === 1) {
    return {
      ...state,
      player1: {
        ...state.player1,
        regenEffectBonus: newRegenEffectBonus,
        regenEffectBonusTurnsRemaining: newBonusTurnsRemaining
      }
    }
  } else {
    return {
      ...state,
      player2: {
        ...state.player2,
        regenEffectBonus: newRegenEffectBonus,
        regenEffectBonusTurnsRemaining: newBonusTurnsRemaining
      }
    }
  }
}

/**
 * Hearts 2-6: Endurance
 * v2: ON LOSS: 50% mitigation (handled in resolveLane)
 *     ON WIN: +1 regen stacks (refresh duration)
 */
export function handleHeartsLowEffect(ctx: EffectContext): GameState {
  if (ctx.strength === 'none') return ctx.state
  
  // ON WIN (half strength in loss-oriented): +1 regen
  if (ctx.isWinner) {
    return applyRegenGain(ctx.state, ctx.player, 1)
  }
  
  // ON LOSS: Mitigation is handled in resolveLane, no additional effect here
  return ctx.state
}

/**
 * Hearts 7-10: Renewal
 * v2: ON WIN: +2 regen stacks (refresh duration)
 *     ON LOSS: 25% mitigation (handled in resolveLane)
 */
export function handleHeartsMidEffect(ctx: EffectContext): GameState {
  if (ctx.strength === 'none') return ctx.state
  
  // ON WIN (full strength in win-oriented): +2 regen
  if (ctx.isWinner) {
    return applyRegenGain(ctx.state, ctx.player, 2)
  }
  
  // ON LOSS: Mitigation is handled in resolveLane, no additional effect here
  return ctx.state
}

/**
 * @deprecated v2: Hearts J/Q/K now trigger on play via handleHeartsFaceCardOnPlay
 * This function is kept for backward compatibility but should not be called
 */
export function handleHeartsJQEffect(ctx: EffectContext): GameState {
  // v2: This should not be called - Hearts face cards are on-play only
  console.warn('[Hearts] handleHeartsJQEffect called but should not be - J/Q are on-play effects')
  return ctx.state
}

/**
 * @deprecated v2: Hearts King now triggers on play via handleHeartsFaceCardOnPlay
 * This function is kept for backward compatibility but should not be called
 */
export function handleHeartsKingEffect(ctx: EffectContext): GameState {
  // v2: This should not be called - Hearts King is an on-play effect
  console.warn('[Hearts] handleHeartsKingEffect called but should not be - K is on-play effect')
  return ctx.state
}

/**
 * v2.2 Hearts Ace: On-play - +1 regen, +1 regen effect, then menu choice for +1 more of either
 */
export function handleHeartsAceOnPlay(state: GameState, player: CurrentPlayer, card: Card): GameState {
  // Base effect: +1 regen stacks, +1 regen effect bonus
  let newState = applyRegenGain(state, player, 1)
  newState = applyRegenEffectBonusGain(newState, player, 1)
  
  // Queue choice for additional bonus: +1 more regen OR +1 more regen effect
  const choice: EffectChoice = {
    type: 'hearts-ace-regen-choice',
    player: player,
    sourceCardId: card.id
  }
  
  return {
    ...newState,
    pendingEffectChoices: [...newState.pendingEffectChoices, choice]
  }
}

/**
 * Apply Hearts Ace choice: +1 regen or +1 regen effect
 */
export function applyHeartsAceChoice(
  state: GameState,
  player: CurrentPlayer,
  choice: 'regen' | 'regenEffect'
): GameState {
  if (choice === 'regen') {
    return applyRegenGain(state, player, 1)
  } else {
    return applyRegenEffectBonusGain(state, player, 1)
  }
}

// ============================================================================
// DIAMONDS EFFECT HANDLERS
// ============================================================================

const CHARGE_POWER_CAP = 5
const CHARGE_CAP = 5  // Maximum charges a player can have

/**
 * v2.2 Diamonds 2-6: Power Tithe - Gain charges on lane resolution
 * On LOSS: +3 charges (capped at 5)
 * On WIN: +1 charge (capped at 5)
 */
export function handleDiamondsLowEffect(ctx: EffectContext): GameState {
  if (ctx.strength === 'none') return ctx.state
  
  const playerState = ctx.player === 1 ? ctx.state.player1 : ctx.state.player2
  
  // Check if already at cap
  if (playerState.diamondCharges >= CHARGE_CAP) {
    console.log(`[Diamonds] Player ${ctx.player} already at charge cap (${CHARGE_CAP})`)
    return ctx.state
  }
  
  // +3 charges on loss, +1 charge on win
  const value = ctx.isWinner ? 1 : 3
  const newCharges = Math.min(playerState.diamondCharges + value, CHARGE_CAP)
  
  console.log(`[Diamonds] Player ${ctx.player} gains +${value} charges (${ctx.isWinner ? 'WIN' : 'LOSS'}). Total: ${newCharges}`)
  
  if (ctx.player === 1) {
    return {
      ...ctx.state,
      player1: {
        ...ctx.state.player1,
        diamondCharges: newCharges
      }
    }
  } else {
    return {
      ...ctx.state,
      player2: {
        ...ctx.state.player2,
        diamondCharges: newCharges
      }
    }
  }
}

/**
 * Diamonds 7-10: Soul Charges - Gain charges on lane resolution
 * On WIN: +3 charges (capped at 5)
 * On LOSS: +1 charge (capped at 5)
 */
export function handleDiamondsMidEffect(ctx: EffectContext): GameState {
  if (ctx.strength === 'none') return ctx.state
  
  const playerState = ctx.player === 1 ? ctx.state.player1 : ctx.state.player2
  
  // Check if already at cap
  if (playerState.diamondCharges >= CHARGE_CAP) {
    console.log(`[Diamonds] Player ${ctx.player} already at charge cap (${CHARGE_CAP})`)
    return ctx.state
  }
  
  // +3 charges on win, +1 charge on loss
  const value = ctx.isWinner ? 3 : 1
  const newCharges = Math.min(playerState.diamondCharges + value, CHARGE_CAP)
  
  console.log(`[Diamonds] Player ${ctx.player} gains +${value} charges (${ctx.isWinner ? 'WIN' : 'LOSS'}). Total: ${newCharges}`)
  
  if (ctx.player === 1) {
    return {
      ...ctx.state,
      player1: {
        ...ctx.state.player1,
        diamondCharges: newCharges
      }
    }
  } else {
    return {
      ...ctx.state,
      player2: {
        ...ctx.state.player2,
        diamondCharges: newCharges
      }
    }
  }
}

/**
 * @deprecated v2.2: Diamonds Jack now just gains 2 charges (not double)
 */
export function handleDiamondsJackEffect(ctx: EffectContext): GameState {
  // v2.2: Jack effect is now handled in handleDiamondsFaceCardOnPlay
  console.warn('[Diamonds] handleDiamondsJackEffect called but should not be - J is on-play effect')
  return ctx.state
}

/**
 * @deprecated v2.2: Diamonds Queen now gains +2 charge power (not spend charges)
 */
export function handleDiamondsQueenEffect(ctx: EffectContext): GameState {
  // v2.2: Queen effect is now handled in handleDiamondsFaceCardOnPlay
  console.warn('[Diamonds] handleDiamondsQueenEffect called but should not be - Q is on-play effect')
  return ctx.state
}

/**
 * @deprecated v2.2: Diamonds King now gains +1 charge, +1 charge power
 */
export function handleDiamondsKingEffect(ctx: EffectContext): GameState {
  // v2.2: King effect is now handled in handleDiamondsFaceCardOnPlay
  console.warn('[Diamonds] handleDiamondsKingEffect called but should not be - K is on-play effect')
  return ctx.state
}

/**
 * v2.2 Diamonds Ace: On-play - +1 charge, +1 charge power, then menu choice for +2 charges OR +2 charge power
 * NO SELF-DAMAGE in v2.2
 */
export function handleDiamondsAceOnPlay(state: GameState, player: CurrentPlayer, card: Card): GameState {
  // Base effect: +1 charge, +1 charge power
  let newState = addCharges(state, player, 1)
  newState = addChargePower(newState, player, 1)
  
  // Queue choice for additional bonus: +2 charges OR +2 charge power
  const choice: EffectChoice = {
    type: 'diamonds-ace-option',
    player: player,
    sourceCardId: card.id
  }
  
  return {
    ...newState,
    pendingEffectChoices: [...newState.pendingEffectChoices, choice]
  }
}

/**
 * Helper to add charges to a player
 */
function addCharges(state: GameState, player: CurrentPlayer, amount: number): GameState {
  console.log(`[Diamonds] Player ${player} gains +${amount} charges`)
  
  if (player === 1) {
    return {
      ...state,
      player1: {
        ...state.player1,
        diamondCharges: state.player1.diamondCharges + amount
      }
    }
  } else {
    return {
      ...state,
      player2: {
        ...state.player2,
        diamondCharges: state.player2.diamondCharges + amount
      }
    }
  }
}

/**
 * Helper to add charge power to a player (respects cap)
 */
function addChargePower(state: GameState, player: CurrentPlayer, amount: number): GameState {
  const playerState = player === 1 ? state.player1 : state.player2
  const newChargePower = Math.min(playerState.chargePower + amount, CHARGE_POWER_CAP)
  
  console.log(`[Diamonds] Player ${player} gains +${amount} charge power. Total: ${newChargePower}`)
  
  if (player === 1) {
    return {
      ...state,
      player1: {
        ...state.player1,
        chargePower: newChargePower
      }
    }
  } else {
    return {
      ...state,
      player2: {
        ...state.player2,
        chargePower: newChargePower
      }
    }
  }
}

// ============================================================================
// MAIN EFFECT EXECUTOR
// ============================================================================

/**
 * Execute a card's effect based on its suit and tier
 */
export function executeCardEffect(ctx: EffectContext, laneCards: Card[]): GameState {
  const ownerSuit = ctx.player === 1 ? ctx.state.player1Suit : ctx.state.player2Suit
  if (!ownerSuit) return ctx.state
  
  const tier = getRankTier(ctx.card.rank)
  
  switch (ownerSuit) {
    case 'clubs':
      return executeClubsEffect(ctx, tier, laneCards)
    case 'spades':
      return executeSpadesEffect(ctx, tier)
    case 'hearts':
      return executeHeartsEffect(ctx, tier)
    case 'diamonds':
      return executeDiamondsEffect(ctx, tier)
    default:
      return ctx.state
  }
}

function executeClubsEffect(ctx: EffectContext, tier: string, laneCards: Card[]): GameState {
  switch (tier) {
    case 'low':
      return handleClubsLowEffect(ctx)
    case 'mid':
      return handleClubsMidEffect(ctx)
    case 'high':
      // Handle specific face cards
      switch (ctx.card.rank) {
        case 'J':
          return handleClubsJack(ctx, laneCards)
        case 'Q':
          return handleClubsQueen(ctx, laneCards)
        case 'K':
          // King effect is handled during resolution - blocks opponent effects
          return ctx.state
        default:
          return ctx.state
      }
    default:
      return ctx.state
  }
}

function executeSpadesEffect(ctx: EffectContext, tier: string): GameState {
  switch (tier) {
    case 'low':
      return handleSpadesLowEffect(ctx)
    case 'mid':
      return handleSpadesMidEffect(ctx)
    case 'high':
      return handleSpadesHighEffect(ctx)
    default:
      return ctx.state
  }
}

function executeHeartsEffect(ctx: EffectContext, tier: string): GameState {
  switch (tier) {
    case 'low':
      return handleHeartsLowEffect(ctx)
    case 'mid':
      return handleHeartsMidEffect(ctx)
    case 'high':
      // v2: High tier (J/Q/K) effects are on-play only
      // They should not trigger during resolution (shouldEffectTrigger returns false for 'on-play')
      // If this is reached, it's a no-op
      return ctx.state
    default:
      return ctx.state
  }
}

function executeDiamondsEffect(ctx: EffectContext, tier: string): GameState {
  switch (tier) {
    case 'low':
      return handleDiamondsLowEffect(ctx)
    case 'mid':
      return handleDiamondsMidEffect(ctx)
    case 'high':
      switch (ctx.card.rank) {
        case 'J':
          return handleDiamondsJackEffect(ctx)
        case 'Q':
          return handleDiamondsQueenEffect(ctx)
        case 'K':
          return handleDiamondsKingEffect(ctx)
        default:
          return ctx.state
      }
    default:
      return ctx.state
  }
}

// ============================================================================
// ON-PLAY ACE HANDLER
// ============================================================================

/**
 * Handle Ace on-play effects (called when ace is played to lane)
 */
export function handleAceOnPlay(state: GameState, card: Card, player: CurrentPlayer): GameState {
  const playerSuit = player === 1 ? state.player1Suit : state.player2Suit
  
  // Only active aces trigger
  if (!isCardActiveForEffects(card, playerSuit)) {
    return state
  }
  
  if (card.rank !== 'A') return state
  
  switch (playerSuit) {
    case 'clubs':
      return handleClubsAceOnPlay(state, player, card)
    case 'spades':
      return handleSpadesAceOnPlay(state, player, card)
    case 'hearts':
      return handleHeartsAceOnPlay(state, player, card)
    case 'diamonds':
      return handleDiamondsAceOnPlay(state, player, card)
    default:
      return state
  }
}

// ============================================================================
// ON-PLAY FACE CARD HANDLER
// ============================================================================

/**
 * Handle face card (J/Q/K) on-play effects
 */
export function handleFaceCardOnPlay(state: GameState, card: Card, player: CurrentPlayer, laneId: LaneId): GameState {
  const playerSuit = player === 1 ? state.player1Suit : state.player2Suit
  
  // Only active face cards trigger
  if (!isCardActiveForEffects(card, playerSuit)) {
    return state
  }
  
  if (card.rank !== 'J' && card.rank !== 'Q' && card.rank !== 'K') return state
  
  const opponent: CurrentPlayer = player === 1 ? 2 : 1
  const opponentState = opponent === 1 ? state.player1 : state.player2
  
  switch (playerSuit) {
    case 'clubs':
      return handleClubsFaceCardOnPlay(state, card, player, laneId)
    case 'spades':
      return handleSpadesFaceCardOnPlay(state, card, player, opponentState.hp)
    case 'hearts':
      return handleHeartsFaceCardOnPlay(state, card, player)
    case 'diamonds':
      return handleDiamondsFaceCardOnPlay(state, card, player, laneId)
    default:
      return state
  }
}

/**
 * v2.2 Clubs face cards on play
 * Jack: Double poker bonus for this lane (unchanged - handled in resolution)
 * Queen: ON PLAY - Move opponent's top card between lanes
 * King: ON PLAY - Neutralize a lane's suit effects
 */
function handleClubsFaceCardOnPlay(state: GameState, card: Card, player: CurrentPlayer, laneId: LaneId): GameState {
  switch (card.rank) {
    case 'J':
      // Jack: Double poker bonus - this is a flag for lane resolution
      // Effect will be applied during resolution, nothing to do on play
      return state
      
    case 'Q':
      // v2.2 Queen: Move opponent's top card between lanes (ON PLAY)
      const queenChoice: EffectChoice = {
        type: 'clubs-queen-move',
        player: player,
        sourceCardId: card.id,
        laneId: laneId
      }
      return {
        ...state,
        pendingEffectChoices: [...state.pendingEffectChoices, queenChoice]
      }
      
    case 'K':
      // v2.2 King: Neutralize a lane's suit effects (ON PLAY)
      // Queue choice for player to select which lane to neutralize
      const kingChoice: EffectChoice = {
        type: 'clubs-7-10-option',  // Re-use the option type for neutralize selection
        player: player,
        sourceCardId: card.id,
        laneId: laneId
      }
      return {
        ...state,
        pendingEffectChoices: [...state.pendingEffectChoices, kingChoice]
      }
      
    default:
      return state
  }
}

/**
 * v2.2 Spades face cards on play - blood debt and bleed, not direct damage
 * Jack: +10 blood debt
 * Queen: +4 bleed to opponent
 * King: +5 blood debt, +2 bleed to opponent
 */
function handleSpadesFaceCardOnPlay(state: GameState, card: Card, player: CurrentPlayer, _opponentHp: number): GameState {
  const opponent: CurrentPlayer = player === 1 ? 2 : 1
  let newState = state
  
  switch (card.rank) {
    case 'J':
      // Jack: +10 blood debt
      newState = addBloodDebt(newState, player, 10)
      break
      
    case 'Q':
      // Queen: +4 bleed to opponent
      newState = applyBleedStacks(newState, opponent, 4)
      break
      
    case 'K':
      // King: +5 blood debt, +2 bleed to opponent
      newState = addBloodDebt(newState, player, 5)
      newState = applyBleedStacks(newState, opponent, 2)
      break
      
    default:
      break
  }
  
  return newState
}

/**
 * v2.2 Hearts face cards on play
 * Jack: +2 regen effect bonus (was +1)
 * Queen: +2 regen stacks (unchanged)
 * King: +1 regen, +1 regen effect (was +2/+2)
 */
function handleHeartsFaceCardOnPlay(state: GameState, card: Card, player: CurrentPlayer): GameState {
  let newState = state
  
  switch (card.rank) {
    case 'J':
      // v2.2 Jack: +2 regen effect bonus (refreshes duration)
      newState = applyRegenEffectBonusGain(newState, player, 2)
      break
      
    case 'Q':
      // Queen: +2 regen stacks (refreshes duration) - unchanged
      newState = applyRegenGain(newState, player, 2)
      break
      
    case 'K':
      // v2.2 King: +1 regen effect bonus AND +1 regen stacks (was +2/+2)
      newState = applyRegenEffectBonusGain(newState, player, 1)
      newState = applyRegenGain(newState, player, 1)
      break
      
    default:
      break
  }
  
  return newState
}

/**
 * v2.2 Diamonds face cards on play
 * Jack: Gain 2 charges (was double charges)
 * Queen: Gain +2 charge power (was spend charges)
 * King: +1 charge, +1 charge power (was deal/heal)
 */
function handleDiamondsFaceCardOnPlay(state: GameState, card: Card, player: CurrentPlayer, _laneId: LaneId): GameState {
  let newState = state
  
  switch (card.rank) {
    case 'J':
      // v2.2 Jack: Gain 2 charges
      newState = addCharges(newState, player, 2)
      break
      
    case 'Q':
      // v2.2 Queen: Gain +2 charge power
      newState = addChargePower(newState, player, 2)
      break
      
    case 'K':
      // v2.2 King: +1 charge, +1 charge power
      newState = addCharges(newState, player, 1)
      newState = addChargePower(newState, player, 1)
      break
      
    default:
      break
  }
  
  return newState
}

// ============================================================================
// BLOOD DEBT CONSUMPTION
// ============================================================================

/**
 * Consume Blood Debt stacks when a player wins a lane
 * Returns the bonus damage to apply
 */
export function consumeBloodDebt(state: GameState, player: CurrentPlayer): { newState: GameState; bonusDamage: number } {
  const playerState = player === 1 ? state.player1 : state.player2
  const bonusDamage = playerState.bloodDebtStacks
  
  if (bonusDamage === 0) {
    return { newState: state, bonusDamage: 0 }
  }
  
  let newState = state
  if (player === 1) {
    newState = {
      ...newState,
      player1: {
        ...newState.player1,
        bloodDebtStacks: 0
      }
    }
  } else {
    newState = {
      ...newState,
      player2: {
        ...newState.player2,
        bloodDebtStacks: 0
      }
    }
  }
  
  return { newState, bonusDamage }
}

// ============================================================================
// TICK PROCESSORS (Start of Turn)
// ============================================================================

/**
 * Process Bleed ticks at start of turn
 * Each bleed instance deals its damagePerTurn independently
 * Instances don't affect each other's duration
 */
export function processBleedTicks(state: GameState, player: CurrentPlayer): GameState {
  const playerState = player === 1 ? state.player1 : state.player2
  
  if (playerState.bleedStacks.length === 0) {
    return state
  }
  
  // Calculate total bleed damage from all active instances
  let totalDamage = 0
  const updatedStacks: BleedStack[] = []
  
  for (const instance of playerState.bleedStacks) {
    totalDamage += instance.damagePerTurn
    
    // Decrement turns remaining for this instance
    if (instance.turnsRemaining > 1) {
      updatedStacks.push({
        damagePerTurn: instance.damagePerTurn,
        turnsRemaining: instance.turnsRemaining - 1
      })
    }
    // If turnsRemaining === 1, this instance expires (don't add it)
  }
  
  console.log(`[Bleed] Player ${player} takes ${totalDamage} bleed damage. ${updatedStacks.length} instance(s) remaining.`)
  
  if (player === 1) {
    return {
      ...state,
      player1: {
        ...state.player1,
        hp: state.player1.hp - totalDamage,
        bleedStacks: updatedStacks
      }
    }
  } else {
    return {
      ...state,
      player2: {
        ...state.player2,
        hp: state.player2.hp - totalDamage,
        bleedStacks: updatedStacks
      }
    }
  }
}

/**
 * Process Regen ticks at start of turn
 * v2.2: Regen works like bleed - each instance is processed independently
 * Each instance has its own duration that doesn't refresh
 * Healing is multiplied by (1 + regenEffectBonus)
 */
export function processRegenTicks(state: GameState, player: CurrentPlayer, isPlayersTurn: boolean): GameState {
  const playerState = player === 1 ? state.player1 : state.player2
  const playerSuit = player === 1 ? state.player1Suit : state.player2Suit
  
  // v2: Regen only ticks on the Hearts player's OWN turn
  if (playerSuit !== 'hearts' || !isPlayersTurn) {
    return state
  }
  
  // Check if player has any active regen instances
  if (playerState.regenStacks.length === 0) {
    return state
  }
  
  // Calculate total base healing from all instances
  const baseHealing = playerState.regenStacks.reduce((sum, stack) => sum + stack.healingPerTurn, 0)
  
  // Apply effect bonus multiplier
  const bonusMultiplier = 1 + playerState.regenEffectBonus
  const totalHealing = Math.floor(baseHealing * bonusMultiplier)
  
  // Decrement turns remaining for each instance and filter out expired ones
  const updatedStacks = playerState.regenStacks
    .map(stack => ({
      ...stack,
      turnsRemaining: stack.turnsRemaining - 1
    }))
    .filter(stack => stack.turnsRemaining > 0)
  
  // Also decrement bonus turns (bonus expires independently)
  let newBonusTurns = playerState.regenEffectBonusTurnsRemaining
  let newBonus = playerState.regenEffectBonus
  
  if (newBonusTurns > 0) {
    newBonusTurns -= 1
    if (newBonusTurns <= 0) {
      newBonus = 0
      newBonusTurns = 0
    }
  }
  
  console.log(`[Hearts Regen Tick] Player ${player}: Healed ${totalHealing} HP (base: ${baseHealing}/turn × ${bonusMultiplier} bonus). Active instances: ${updatedStacks.length}`)
  
  if (player === 1) {
    return {
      ...state,
      player1: {
        ...state.player1,
        hp: state.player1.hp + totalHealing,
        regenStacks: updatedStacks,
        regenEffectBonus: newBonus,
        regenEffectBonusTurnsRemaining: newBonusTurns
      }
    }
  } else {
    return {
      ...state,
      player2: {
        ...state.player2,
        hp: state.player2.hp + totalHealing,
        regenStacks: updatedStacks,
        regenEffectBonus: newBonus,
        regenEffectBonusTurnsRemaining: newBonusTurns
      }
    }
  }
}

/**
 * Clear/reset all regen fields at end of round
 * NOTE: v2.2 regen now persists across rounds, so this function is deprecated
 * Kept for potential future use
 */
export function clearExpiredRegenBuffs(state: GameState): GameState {
  console.log('[Hearts Regen] Clearing regen at end of round')
  
  return {
    ...state,
    player1: {
      ...state.player1,
      regenStacks: [],
      regenEffectBonus: 0,
      regenEffectBonusTurnsRemaining: 0
    },
    player2: {
      ...state.player2,
      regenStacks: [],
      regenEffectBonus: 0,
      regenEffectBonusTurnsRemaining: 0
    }
  }
}

// ============================================================================
// EFFECT CHOICE RESOLUTION
// ============================================================================

/**
 * Apply Clubs 2-6 card replacement
 */
export function applyClubsReplacement(
  state: GameState, 
  player: CurrentPlayer, 
  handCardId: string, 
  replacementRank: 'J' | 'Q' | 'K'
): GameState {
  const playerState = player === 1 ? state.player1 : state.player2
  
  // Find the hand card to replace
  const handCardIndex = playerState.hand.findIndex(c => c.id === handCardId)
  if (handCardIndex === -1) return state
  
  const replacedCard = playerState.hand[handCardIndex]
  
  // Create the replacement card
  const replacementCard: Card = {
    id: `clubs-${replacementRank}-replacement-${Date.now()}`,
    suit: 'clubs',
    rank: replacementRank
  }
  
  // Update hand
  const newHand = [...playerState.hand]
  newHand[handCardIndex] = replacementCard
  
  // Add replaced card to discard
  const newDiscard = [...state.discardPile, replacedCard]
  
  if (player === 1) {
    return {
      ...state,
      player1: {
        ...state.player1,
        hand: newHand
      },
      discardPile: newDiscard
    }
  } else {
    return {
      ...state,
      player2: {
        ...state.player2,
        hand: newHand
      },
      discardPile: newDiscard
    }
  }
}

/**
 * Apply lane neutralization
 */
export function applyLaneNeutralization(state: GameState, laneId: LaneId): GameState {
  return {
    ...state,
    neutralizedLanes: {
      ...state.neutralizedLanes,
      [laneId]: true
    }
  }
}

/**
 * Clear lane neutralization after resolution
 */
export function clearLaneNeutralization(state: GameState, laneId: LaneId): GameState {
  return {
    ...state,
    neutralizedLanes: {
      ...state.neutralizedLanes,
      [laneId]: false
    }
  }
}

/**
 * Move a card from one lane to another
 * Also updates pending resolution lanes:
 * - If source lane no longer has 3+ cards on either side, remove from pending
 * - If destination lane now has 3+ cards on one side, add to pending (if not already)
 * - If destination lane now has 3 cards on both sides, mark for immediate resolution
 */
export function moveCardBetweenLanes(
  state: GameState,
  cardId: string,
  fromLane: LaneId,
  toLane: LaneId,
  isOpponentCard: boolean,
  movingPlayer: CurrentPlayer
): GameState {
  // Find the lanes
  const fromLaneObj = state.lanes.find(l => l.id === fromLane)
  const toLaneObj = state.lanes.find(l => l.id === toLane)
  
  if (!fromLaneObj || !toLaneObj) return state
  
  // Determine which side the card is on
  const cardOwner = isOpponentCard ? (movingPlayer === 1 ? 2 : 1) : movingPlayer
  const fromSide = cardOwner === 1 ? fromLaneObj.player1 : fromLaneObj.player2
  const toSide = cardOwner === 1 ? toLaneObj.player1 : toLaneObj.player2
  
  // Find the card
  const cardIndex = fromSide.cards.findIndex(c => c.id === cardId)
  if (cardIndex === -1) return state
  
  const card = fromSide.cards[cardIndex]
  
  // Check if move is legal (non-decreasing rule)
  if (toSide.cards.length > 0) {
    const lastCardValue = cardValue(toSide.cards[toSide.cards.length - 1])
    if (cardValue(card) < lastCardValue) {
      return state // Illegal move
    }
  }
  
  // Remove from source
  const newFromCards = [...fromSide.cards]
  newFromCards.splice(cardIndex, 1)
  
  // Add to destination
  const newToCards = [...toSide.cards, card]
  
  // Calculate new card counts for source lane
  const fromP1Cards = cardOwner === 1 ? newFromCards.length : fromLaneObj.player1.cards.length
  const fromP2Cards = cardOwner === 2 ? newFromCards.length : fromLaneObj.player2.cards.length
  
  // Calculate new card counts for destination lane
  const toP1Cards = cardOwner === 1 ? newToCards.length : toLaneObj.player1.cards.length
  const toP2Cards = cardOwner === 2 ? newToCards.length : toLaneObj.player2.cards.length
  
  // Update lanes
  const newLanes = state.lanes.map(lane => {
    if (lane.id === fromLane) {
      if (cardOwner === 1) {
        return { ...lane, player1: { cards: newFromCards } }
      } else {
        return { ...lane, player2: { cards: newFromCards } }
      }
    }
    if (lane.id === toLane) {
      if (cardOwner === 1) {
        return { ...lane, player1: { cards: newToCards } }
      } else {
        return { ...lane, player2: { cards: newToCards } }
      }
    }
    return lane
  })
  
  // Update pending resolution lanes
  let newPendingResolutionLanes = [...state.pendingResolutionLanes]
  
  // Check source lane - if neither side has 3+ cards, remove from pending
  const sourceStillFilled = fromP1Cards >= 3 || fromP2Cards >= 3
  if (!sourceStillFilled) {
    newPendingResolutionLanes = newPendingResolutionLanes.filter(p => p.laneId !== fromLane)
    console.log(`[Clubs Move] Source lane ${fromLane} no longer has 3+ cards - removed from pending`)
  }
  
  // Check destination lane - add to pending if one side now has 3+ cards
  const destP1Filled = toP1Cards >= 3
  const destP2Filled = toP2Cards >= 3
  const destAlreadyPending = newPendingResolutionLanes.some(p => p.laneId === toLane)
  
  // If both sides have 3 cards, mark for immediate resolution (handled by reducer)
  // by setting turnsUntilResolution to 0
  if (destP1Filled && destP2Filled && !destAlreadyPending) {
    const newPending: PendingLaneResolution = {
      laneId: toLane,
      filledByPlayer: cardOwner,
      turnsUntilResolution: 0, // Resolve immediately
    }
    newPendingResolutionLanes.push(newPending)
    console.log(`[Clubs Move] Destination lane ${toLane} now has 3 cards on both sides - marked for immediate resolution`)
  } else if ((destP1Filled || destP2Filled) && !destAlreadyPending) {
    // One side filled - add to pending with countdown
    const fillingPlayer: CurrentPlayer = destP1Filled ? 1 : 2
    const newPending: PendingLaneResolution = {
      laneId: toLane,
      filledByPlayer: fillingPlayer,
      turnsUntilResolution: 2, // Opponent gets 2 turns to respond
    }
    newPendingResolutionLanes.push(newPending)
    console.log(`[Clubs Move] Destination lane ${toLane} now has 3+ cards on P${fillingPlayer} side - added to pending`)
  }
  
  return {
    ...state,
    lanes: newLanes,
    pendingResolutionLanes: newPendingResolutionLanes,
  }
}

/**
 * Apply Diamond charge spend (damage or heal)
 * Effect value = 5 + chargePower
 */
export function applyDiamondChargeSpend(
  state: GameState,
  player: CurrentPlayer,
  choice: 'damage' | 'heal'
): GameState {
  const playerState = player === 1 ? state.player1 : state.player2
  
  if (playerState.diamondCharges === 0) {
    return state
  }
  
  // Calculate effect value using charge power
  const effectValue = 5 + playerState.chargePower
  
  let newState = state
  
  // Decrement charge
  if (player === 1) {
    newState = {
      ...newState,
      player1: {
        ...newState.player1,
        diamondCharges: newState.player1.diamondCharges - 1
      }
    }
  } else {
    newState = {
      ...newState,
      player2: {
        ...newState.player2,
        diamondCharges: newState.player2.diamondCharges - 1
      }
    }
  }
  
  // Apply effect (5 + chargePower damage or heal)
  const opponent = player === 1 ? 2 : 1
  
  if (choice === 'damage') {
    if (opponent === 1) {
      newState = {
        ...newState,
        player1: {
          ...newState.player1,
          hp: newState.player1.hp - effectValue
        }
      }
    } else {
      newState = {
        ...newState,
        player2: {
          ...newState.player2,
          hp: newState.player2.hp - effectValue
        }
      }
    }
  } else {
    if (player === 1) {
      newState = {
        ...newState,
        player1: {
          ...newState.player1,
          hp: newState.player1.hp + effectValue
        }
      }
    } else {
      newState = {
        ...newState,
        player2: {
          ...newState.player2,
          hp: newState.player2.hp + effectValue
        }
      }
    }
  }
  
  return newState
}

/**
 * v2.2 Apply Diamond Ace choice: +2 charges OR +2 charge power
 * NO SELF-DAMAGE in v2.2
 */
export function applyDiamondsAceChoice(
  state: GameState,
  player: CurrentPlayer,
  choice: 'charges' | 'support'
): GameState {
  if (choice === 'charges') {
    // +2 Charges
    return addCharges(state, player, 2)
  } else {
    // Charge Power +2 (cap +5)
    return addChargePower(state, player, 2)
  }
  // v2.2: NO self-damage
}
