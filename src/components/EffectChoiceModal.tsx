/**
 * EffectChoiceModal - UI for v2 ability effect choices
 * 
 * Handles player choices for:
 * - Clubs 2-6: Select hand card + replacement J/Q/K
 * - Clubs 7-10 / Ace: Move opponent card OR Neutralize lane
 * - Diamonds Ace: +4 Charges OR Support +2 (then self-damage)
 * - Diamonds Queen: Choose damage or heal (applied twice)
 * - Diamonds Charge Spend: Deal 5 damage or Heal 5
 */

import { useState, type ReactNode } from 'react'
import type { Card, LaneId, EffectChoice, GameState, CurrentPlayer } from '../game/types'
import { CardView } from './CardView'

interface EffectChoiceModalProps {
  choice: EffectChoice
  state: GameState
  onClubsReplace: (handCardId: string, replacementRank: 'J' | 'Q' | 'K') => void
  onClubsMidReplace: (handCardId: string) => void  // v2.2: Replace with Clubs Ace
  onEnterMoveMode: () => void  // Signal to GameBoard to enter move selection mode
  onEnterNeutralizeMode: () => void  // Signal to GameBoard to enter neutralize selection mode
  onClubsQueenDelay: (targetLaneId: LaneId) => void
  onDiamondsAce: (choice: 'charges' | 'chargePower') => void  // v2.2: charges or chargePower
  onDiamondsQueen: (choice: 'damage' | 'heal') => void
  onHeartsAce: (choice: 'regen' | 'regenEffect') => void  // v2.2
  onSpadesAce: (choice: 'bloodDebt' | 'bleed') => void  // v2.2
  onDismiss: () => void
}

export function EffectChoiceModal({
  choice,
  state,
  onClubsReplace,
  onClubsMidReplace,
  onEnterMoveMode,
  onEnterNeutralizeMode,
  onClubsQueenDelay,
  onDiamondsAce,
  onDiamondsQueen,
  onHeartsAce,
  onSpadesAce,
  onDismiss
}: EffectChoiceModalProps) {
  const [selectedHandCard, setSelectedHandCard] = useState<string | null>(null)
  
  const playerState = choice.player === 1 ? state.player1 : state.player2
  const playerSuit = choice.player === 1 ? state.player1Suit : state.player2Suit
  
  // Get title and description based on choice type
  const getModalContent = () => {
    switch (choice.type) {
      case 'clubs-2-6-replacement':
        return {
          title: 'Manipulation Through Failure',
          description: 'Your active Clubs card triggered on loss. Choose a card from your hand to replace with a Clubs face card.'
        }
      case 'clubs-7-10-replacement':
        return {
          title: 'Board Control',
          description: 'Your active Clubs card triggered on win. Choose a card from your hand to replace with a Clubs Ace.'
        }
      case 'clubs-7-10-option':
        return {
          title: 'Neutralize Lane',
          description: 'Choose a lane to neutralize (disable all suit effects until it resolves).'
        }
      case 'clubs-ace-option':
        return {
          title: 'Rewrite the Board',
          description: 'Ace of Clubs on-play effect. Choose one option:'
        }
      case 'clubs-queen-move':
        return {
          title: 'Board Manipulation',
          description: 'Queen of Clubs triggered. Move an opponent\'s top card from one lane to another.'
        }
      case 'clubs-queen-delay':
        return {
          title: 'Lane Delay',
          description: 'Queen of Clubs triggered. Select another lane to delay its resolution by 1 turn.'
        }
      case 'diamonds-ace-option':
        return {
          title: 'Power Surge',
          description: 'Ace of Diamonds on-play effect. Choose your additional bonus.'
        }
      case 'diamonds-queen-spend':
        return {
          title: 'Ritual Power',
          description: 'Diamonds Queen triggered. All your charges have been consumed. Choose an effect to apply twice.'
        }
      case 'hearts-ace-regen-choice':
        return {
          title: 'Second Wind',
          description: 'Hearts Ace on-play effect. Choose your additional bonus.'
        }
      case 'spades-ace-choice':
        return {
          title: 'Crimson Tide',
          description: 'Spades Ace on-play effect. Choose your additional bonus.'
        }
      default:
        return {
          title: 'Effect Choice',
          description: 'Make a selection.'
        }
    }
  }
  
  const content = getModalContent()
  
  // Create fake card objects for displaying J/Q/K of Clubs
  const jackOfClubs: Card = { id: 'preview-jack-clubs', suit: 'clubs', rank: 'J' }
  const queenOfClubs: Card = { id: 'preview-queen-clubs', suit: 'clubs', rank: 'Q' }
  const kingOfClubs: Card = { id: 'preview-king-clubs', suit: 'clubs', rank: 'K' }
  
  // Clubs 2-6: Card replacement UI
  const renderClubsReplacement = () => {
    if (playerState.hand.length === 0) {
      return (
        <div className="effect-choice-options">
          <p className="effect-choice-description">No cards in hand to replace.</p>
          <button className="effect-choice-btn" onClick={onDismiss}>Close</button>
        </div>
      )
    }
    
    return (
      <div className="effect-choice-options">
        <p className="effect-choice-description">1. Select a card from your hand:</p>
        <div className="card-selection-grid">
          {playerState.hand.map(card => (
            <div 
              key={card.id}
              className={`card-selection-item ${selectedHandCard === card.id ? 'selected' : ''}`}
              onClick={() => setSelectedHandCard(card.id)}
            >
              <CardView 
                card={card} 
                ownerSuit={playerSuit} 
                small
              />
            </div>
          ))}
        </div>
        
        {selectedHandCard && (
          <>
            <p className="effect-choice-description" style={{marginTop: '16px'}}>
              2. Choose replacement:
            </p>
            <div className="card-selection-grid replacement-cards">
              <div 
                className="card-selection-item replacement-option"
                onClick={() => onClubsReplace(selectedHandCard, 'J')}
              >
                <CardView 
                  card={jackOfClubs} 
                  ownerSuit="clubs" 
                  small
                />
              </div>
              <div 
                className="card-selection-item replacement-option"
                onClick={() => onClubsReplace(selectedHandCard, 'Q')}
              >
                <CardView 
                  card={queenOfClubs} 
                  ownerSuit="clubs" 
                  small
                />
              </div>
              <div 
                className="card-selection-item replacement-option"
                onClick={() => onClubsReplace(selectedHandCard, 'K')}
              >
                <CardView 
                  card={kingOfClubs} 
                  ownerSuit="clubs" 
                  small
                />
              </div>
            </div>
          </>
        )}
      </div>
    )
  }
  
  // Clubs 7-10 / Ace: Move or Neutralize - just show option buttons
  // Actual selection happens on the game board after modal closes
  const renderClubsBoardControl = () => {
    // Check if there are any opponent cards to move
    const opponent = choice.player === 1 ? 2 : 1
    let hasOpponentCards = false
    for (const lane of state.lanes) {
      const opponentSide = opponent === 1 ? lane.player1 : lane.player2
      if (opponentSide.cards.length > 0) {
        hasOpponentCards = true
        break
      }
    }
    
    // Check if there are any lanes that can be neutralized
    const hasNeutralizableLanes = ['left', 'middle', 'right'].some(
      laneId => !state.neutralizedLanes[laneId as LaneId]
    )
    
    return (
      <div className="effect-choice-options">
        <button 
          className="effect-choice-btn clubs"
          onClick={onEnterMoveMode}
          disabled={!hasOpponentCards}
        >
          Move Opponent Card
          <span className="effect-choice-btn-subtitle">
            {hasOpponentCards 
              ? 'Click a lane to pick its top card, then another lane to move it'
              : 'No opponent cards to move'
            }
          </span>
        </button>
        <button 
          className="effect-choice-btn clubs"
          onClick={onEnterNeutralizeMode}
          disabled={!hasNeutralizableLanes}
        >
          Neutralize Lane
          <span className="effect-choice-btn-subtitle">
            {hasNeutralizableLanes
              ? 'Click a lane to disable all suit effects until it resolves'
              : 'All lanes already neutralized'
            }
          </span>
        </button>
        <button 
          className="effect-choice-btn"
          onClick={onDismiss}
          style={{marginTop: '8px', opacity: 0.7}}
        >
          Skip (No Action)
        </button>
      </div>
    )
  }
  
  // Clubs Queen: Lane delay selection
  const renderClubsQueenDelay = () => {
    // Get the source lane that the Queen was played in (exclude it from selection)
    const sourceLaneId = choice.laneId
    const availableLanes = (['left', 'middle', 'right'] as LaneId[]).filter(l => l !== sourceLaneId)
    
    return (
      <div className="effect-choice-options">
        <p className="effect-choice-description">Select a lane to delay:</p>
        <div className="lane-selection-grid">
          {availableLanes.map(laneId => {
            // Check if this lane is already delayed
            const isAlreadyDelayed = state.laneDelayedUntilTurn[laneId]
            // Check if this lane has a pending resolution
            const pending = state.pendingResolutionLanes.find(p => p.laneId === laneId)
            const isPending = !!pending
            const turnsRemaining = pending?.turnsUntilResolution
            
            return (
              <button
                key={laneId}
                className={`lane-selection-btn ${isAlreadyDelayed ? 'delayed' : ''}`}
                onClick={() => !isAlreadyDelayed && onClubsQueenDelay(laneId)}
                disabled={isAlreadyDelayed}
              >
                {laneId.toUpperCase()}
                {isPending && ` (Resolves in ${turnsRemaining})`}
                {isAlreadyDelayed && ' (Already Delayed)'}
              </button>
            )
          })}
        </div>
        <button 
          className="effect-choice-btn"
          onClick={onDismiss}
          style={{marginTop: '12px', opacity: 0.7}}
        >
          Skip (No Delay)
        </button>
      </div>
    )
  }
  
  // v2.2 Clubs 7-10: Replace hand card with Clubs Ace
  const renderClubsMidReplacement = () => {
    if (playerState.hand.length === 0) {
      return (
        <div className="effect-choice-options">
          <p className="effect-choice-description">No cards in hand to replace.</p>
          <button className="effect-choice-btn" onClick={onDismiss}>Close</button>
        </div>
      )
    }
    
    return (
      <div className="effect-choice-options">
        <p className="effect-choice-description">Select a card from your hand to replace with Clubs Ace:</p>
        <div className="card-selection-grid">
          {playerState.hand.map(card => (
            <div 
              key={card.id}
              className="card-selection-item replacement-option"
              onClick={() => onClubsMidReplace(card.id)}
            >
              <CardView 
                card={card} 
                ownerSuit={playerSuit} 
                small
              />
            </div>
          ))}
        </div>
        <button 
          className="effect-choice-btn"
          onClick={onDismiss}
          style={{marginTop: '12px', opacity: 0.7}}
        >
          Skip (No Replacement)
        </button>
      </div>
    )
  }
  
  // v2.2 Clubs Queen: Move opponent card (signal to enter move mode)
  const renderClubsQueenMove = () => {
    // Check if there are any opponent cards to move
    const opponent = choice.player === 1 ? 2 : 1
    let hasOpponentCards = false
    for (const lane of state.lanes) {
      const opponentSide = opponent === 1 ? lane.player1 : lane.player2
      if (opponentSide.cards.length > 0) {
        hasOpponentCards = true
        break
      }
    }
    
    return (
      <div className="effect-choice-options">
        <button 
          className="effect-choice-btn clubs"
          onClick={onEnterMoveMode}
          disabled={!hasOpponentCards}
        >
          Select Card to Move
          <span className="effect-choice-btn-subtitle">
            {hasOpponentCards 
              ? 'Click a lane to pick its top card, then another lane to move it'
              : 'No opponent cards to move'
            }
          </span>
        </button>
        <button 
          className="effect-choice-btn"
          onClick={onDismiss}
          style={{marginTop: '8px', opacity: 0.7}}
        >
          Skip (No Move)
        </button>
      </div>
    )
  }
  
  // v2.2 Diamonds Ace: +2 Charges or +2 Charge Power (no self-damage)
  const renderDiamondsAce = () => {
    const currentChargePower = playerState.chargePower
    const maxChargePower = 5
    const canGetChargePower = currentChargePower < maxChargePower
    
    return (
      <div className="effect-choice-options">
        <button 
          className="effect-choice-btn diamonds"
          onClick={() => onDiamondsAce('charges')}
        >
          +2 Charges
          <span className="effect-choice-btn-subtitle">Current: {playerState.diamondCharges} → {playerState.diamondCharges + 2}</span>
        </button>
        <button 
          className="effect-choice-btn diamonds"
          onClick={() => onDiamondsAce('chargePower')}
          disabled={!canGetChargePower}
        >
          Charge Power +2
          <span className="effect-choice-btn-subtitle">
            {canGetChargePower 
              ? `Current: +${currentChargePower} → +${Math.min(currentChargePower + 2, maxChargePower)}`
              : 'Already at max (+5)'
            }
          </span>
        </button>
      </div>
    )
  }
  
  // v2.2 Hearts Ace: +1 Regen or +1 Regen Effect
  const renderHeartsAce = () => {
    const bonusMultiplier = 1 + playerState.regenEffectBonus
    const baseHealPerTurn = playerState.regenStacks.reduce((sum, stack) => sum + stack.healingPerTurn, 0)
    const currentRegenPerTurn = Math.floor(baseHealPerTurn * bonusMultiplier)
    // Adding +1 regen adds a new instance with 1 healing/turn
    const newRegenPerTurn = Math.floor((baseHealPerTurn + 1) * bonusMultiplier)
    // Adding +1 bonus increases multiplier
    const newRegenWithBonusPerTurn = Math.floor(baseHealPerTurn * (bonusMultiplier + 1))
    
    return (
      <div className="effect-choice-options">
        <button 
          className="effect-choice-btn heal"
          onClick={() => onHeartsAce('regen')}
        >
          +1 Regen/turn (5 turns)
          <span className="effect-choice-btn-subtitle">
            Current: {currentRegenPerTurn}/turn → {newRegenPerTurn}/turn
          </span>
        </button>
        <button 
          className="effect-choice-btn heal"
          onClick={() => onHeartsAce('regenEffect')}
        >
          +1 Regen Effect Bonus
          <span className="effect-choice-btn-subtitle">
            Healing: {currentRegenPerTurn}/turn → {newRegenWithBonusPerTurn}/turn
          </span>
        </button>
      </div>
    )
  }
  
  // v2.2 Spades Ace: +5 Blood Debt or +4 Bleed damage/turn (2 stacks * 2)
  const renderSpadesAce = () => {
    return (
      <div className="effect-choice-options">
        <button 
          className="effect-choice-btn damage"
          onClick={() => onSpadesAce('bloodDebt')}
        >
          +5 Blood Debt
          <span className="effect-choice-btn-subtitle">
            Consumed to double poker bonus on lane wins
          </span>
        </button>
        <button 
          className="effect-choice-btn damage"
          onClick={() => onSpadesAce('bleed')}
        >
          +4 Bleed/turn to Opponent
          <span className="effect-choice-btn-subtitle">
            Deals 4 damage per turn for 3 turns
          </span>
        </button>
      </div>
    )
  }
  
  // Diamonds Queen: Damage or Heal (applied twice with charge power)
  const renderDiamondsQueen = () => {
    const effectValue = 5 + playerState.chargePower
    const totalEffect = effectValue * 2
    
    return (
      <div className="effect-choice-options">
        <button 
          className="effect-choice-btn damage"
          onClick={() => onDiamondsQueen('damage')}
        >
          Deal {totalEffect} Damage
          <span className="effect-choice-btn-subtitle">{effectValue} damage × 2</span>
        </button>
        <button 
          className="effect-choice-btn heal"
          onClick={() => onDiamondsQueen('heal')}
        >
          Heal {totalEffect} HP
          <span className="effect-choice-btn-subtitle">{effectValue} healing × 2</span>
        </button>
      </div>
    )
  }
  
  // Render appropriate content based on choice type
  const renderContent = () => {
    switch (choice.type) {
      case 'clubs-2-6-replacement':
        return renderClubsReplacement()
      case 'clubs-7-10-replacement':
        return renderClubsMidReplacement()
      case 'clubs-7-10-option':
        return renderClubsBoardControl()  // v2.2: Now only for King neutralize
      case 'clubs-ace-option':
        return renderClubsBoardControl()  // Legacy
      case 'clubs-queen-move':
        return renderClubsQueenMove()
      case 'clubs-queen-delay':
        return renderClubsQueenDelay()
      case 'diamonds-ace-option':
        return renderDiamondsAce()
      case 'diamonds-queen-spend':
        return renderDiamondsQueen()
      case 'hearts-ace-regen-choice':
        return renderHeartsAce()
      case 'spades-ace-choice':
        return renderSpadesAce()
      default:
        return (
          <div className="effect-choice-options">
            <button className="effect-choice-btn" onClick={onDismiss}>Close</button>
          </div>
        )
    }
  }
  
  return (
    <div className="effect-choice-overlay">
      <div className="effect-choice-modal">
        <div className="effect-choice-title">{content.title}</div>
        <div className="effect-choice-description">{content.description}</div>
        {renderContent()}
      </div>
    </div>
  )
}

/**
 * StatusIndicators - Shows active buffs/debuffs for a player
 */
interface StatusIndicatorsProps {
  player: CurrentPlayer
  state: GameState
}

export function StatusIndicators({ player, state }: StatusIndicatorsProps) {
  const playerState = player === 1 ? state.player1 : state.player2
  
  const indicators: ReactNode[] = []
  
  // Blood Debt stacks
  if (playerState.bloodDebtStacks > 0) {
    indicators.push(
      <div key="blood-debt" className="status-badge blood-debt">
        Debt {playerState.bloodDebtStacks}
      </div>
    )
  }
  
  // Bleed - show total damage per turn from all active instances
  const bleedDamagePerTurn = playerState.bleedStacks.reduce((sum, s) => sum + s.damagePerTurn, 0)
  if (bleedDamagePerTurn > 0) {
    indicators.push(
      <div key="bleed" className="status-badge bleed">
        Bleed {bleedDamagePerTurn}/t
      </div>
    )
  }
  
  // v2.2 Hearts Regen System - instance-based (like bleed)
  if (playerState.regenStacks.length > 0) {
    const baseHealPerTurn = playerState.regenStacks.reduce((sum, stack) => sum + stack.healingPerTurn, 0)
    const bonusMultiplier = 1 + playerState.regenEffectBonus
    const totalHealPerTurn = Math.floor(baseHealPerTurn * bonusMultiplier)
    indicators.push(
      <div key="regen" className="status-badge regen">
        Regen {totalHealPerTurn}/t
      </div>
    )
  }
  
  // Regen Effect Bonus (separate indicator if bonus is active)
  if (playerState.regenEffectBonus > 0 && playerState.regenEffectBonusTurnsRemaining > 0) {
    indicators.push(
      <div key="regen-bonus" className="status-badge regen-bonus">
        Regen +{playerState.regenEffectBonus} ({playerState.regenEffectBonusTurnsRemaining}t)
      </div>
    )
  }
  
  // Charge Power
  if (playerState.chargePower > 0) {
    indicators.push(
      <div key="charge-power" className="status-badge charge-power">
        Power +{playerState.chargePower}
      </div>
    )
  }
  
  if (indicators.length === 0) return null
  
  return (
    <div className="status-indicators">
      {indicators}
    </div>
  )
}

/**
 * ChargesDisplay - Shows Diamond charges with spend button
 */
interface ChargesDisplayProps {
  player: CurrentPlayer
  state: GameState
  onSpendCharge: (choice: 'damage' | 'heal') => void
  canSpend: boolean
}

export function ChargesDisplay({ player, state, onSpendCharge, canSpend }: ChargesDisplayProps) {
  const [showSpendMenu, setShowSpendMenu] = useState(false)
  const playerState = player === 1 ? state.player1 : state.player2
  const playerSuit = player === 1 ? state.player1Suit : state.player2Suit
  
  // Only show for Diamonds players with resources
  if (playerSuit !== 'diamonds' || (playerState.diamondCharges === 0 && playerState.chargePower === 0)) {
    return null
  }
  
  const effectValue = 5 + playerState.chargePower

  return (
    <div className={`charges-display ${canSpend ? 'can-spend' : 'read-only'}`}>
      <div className="charges-main">
        {playerState.chargePower > 0 && (
          <div className="charges-chip">Power +{playerState.chargePower}</div>
        )}
        {playerState.diamondCharges > 0 && (
          <div className="charges-chip">{playerState.diamondCharges} Charges</div>
        )}
      </div>
      {canSpend && !showSpendMenu && (
        <button 
          className="spend-charge-btn"
          onClick={() => setShowSpendMenu(true)}
        >
          Spend
        </button>
      )}
      {showSpendMenu && (
        <div className="spend-menu">
          <button 
            className="spend-charge-btn"
            onClick={() => { onSpendCharge('damage'); setShowSpendMenu(false); }}
            style={{background: 'rgba(248, 113, 113, 0.8)', borderColor: '#f87171'}}
          >
            {effectValue} Dmg
          </button>
          <button 
            className="spend-charge-btn"
            onClick={() => { onSpendCharge('heal'); setShowSpendMenu(false); }}
            style={{background: 'rgba(74, 222, 128, 0.8)', borderColor: '#4ade80'}}
          >
            {effectValue} Heal
          </button>
          <button 
            className="spend-charge-btn"
            onClick={() => setShowSpendMenu(false)}
            style={{opacity: 0.7}}
          >
            ×
          </button>
        </div>
      )}
    </div>
  )
}
