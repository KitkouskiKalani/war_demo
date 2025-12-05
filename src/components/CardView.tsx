/**
 * CardView Component - Hearthstone-style card rendering
 */

import type { Card } from '../game/types'

interface CardViewProps {
  card: Card
  faceDown?: boolean
  selected?: boolean
  onClick?: () => void
  disabled?: boolean
  small?: boolean
}

const SUIT_SYMBOLS: Record<string, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
}

export function CardView({ 
  card, 
  faceDown = false, 
  selected = false, 
  onClick, 
  disabled = false,
  small = false,
}: CardViewProps) {
  const isJoker = card.rank === 'JOKER'
  const suitSymbol = isJoker ? '★' : SUIT_SYMBOLS[card.suit] || ''
  const rankDisplay = isJoker ? '🃏' : card.rank
  
  const isRed = card.suit === 'hearts' || card.suit === 'diamonds'
  const colorClass = isJoker ? 'joker' : (isRed ? 'red' : 'black')

  const classes = [
    'card',
    small ? 'card-small' : '',
    faceDown ? 'card-back' : 'card-face',
    faceDown ? '' : colorClass,
    selected ? 'card-selected' : '',
    disabled ? 'card-disabled' : '',
  ].filter(Boolean).join(' ')

  if (faceDown) {
    return (
      <div className={classes} onClick={!disabled ? onClick : undefined}>
        <span style={{ color: '#6a4a9a', fontSize: small ? '20px' : '28px' }}>✦</span>
      </div>
    )
  }

  return (
    <div className={classes} onClick={!disabled ? onClick : undefined}>
      <span className="rank">{rankDisplay}</span>
      <span className="suit">{suitSymbol}</span>
    </div>
  )
}
