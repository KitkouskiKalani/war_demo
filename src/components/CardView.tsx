/**
 * CardView Component - Image-based card rendering
 */

import type { Card, StandardSuit } from '../game/types'

interface CardViewProps {
  card: Card
  faceDown?: boolean
  selected?: boolean
  onClick?: () => void
  disabled?: boolean
  small?: boolean
  cardBackType?: 'ai' | 'discard'  // ai = dynamic suit back, discard = Discard back
  cardBackSuit?: StandardSuit | null  // For dynamic card backs based on field control
}

// Map internal suit names to asset folder names
const SUIT_TO_FOLDER: Record<string, string> = {
  hearts: 'Hearts',
  diamonds: 'Diamonds',
  clubs: 'Clovers',
  spades: 'Spades',
  joker: 'Hearts', // Jokers use Hearts folder (they have their own Joker file)
}

// Map internal rank to file rank string
function getRankString(rank: number | string): string {
  if (rank === 'JOKER') return 'Joker'
  if (rank === 'J') return 'J'
  if (rank === 'Q') return 'Q'
  if (rank === 'K') return 'K'
  if (rank === 'A') return 'A'
  return String(rank)
}

// Get the image path for a face-up card
function getCardImagePath(card: Card): string {
  const suitFolder = SUIT_TO_FOLDER[card.suit] || 'Hearts'
  const rankStr = getRankString(card.rank)
  
  // Jokers are stored as [Suit]_Joker.png in each suit folder
  if (card.rank === 'JOKER') {
    // Use the suit from the card for joker (they're in each suit folder)
    const jokerSuit = card.suit === 'joker' ? 'Hearts' : suitFolder
    return `/assets/cards/Active Cards - Color/${jokerSuit} - Active Cards/${jokerSuit}_Joker.png`
  }
  
  return `/assets/cards/Active Cards - Color/${suitFolder} - Active Cards/${suitFolder}_${rankStr}.png`
}

// Map suit to card back file name
const SUIT_TO_CARD_BACK: Record<StandardSuit, string> = {
  hearts: 'Card Back - Hearts.png',
  diamonds: 'Card Back - Diamonds.png',
  clubs: 'Card Back - Clovers.png',
  spades: 'Card Back - Spades.png',
}

// Get the image path for a face-down card
function getCardBackPath(type: 'ai' | 'discard', suit?: StandardSuit | null): string {
  if (type === 'discard') {
    return '/assets/cards/Draw and Discard Cards/Card Back - Discard.png'
  }
  // For ai/draw pile type, use suit-based back if provided
  if (suit) {
    return `/assets/cards/Draw and Discard Cards/${SUIT_TO_CARD_BACK[suit]}`
  }
  // Default to Hearts if no suit specified
  return '/assets/cards/Draw and Discard Cards/Card Back - Hearts.png'
}

export function CardView({ 
  card, 
  faceDown = false, 
  selected = false, 
  onClick, 
  disabled = false,
  small = false,
  cardBackType = 'ai',
  cardBackSuit,
}: CardViewProps) {
  const classes = [
    'card',
    small ? 'card-small' : '',
    faceDown ? 'card-back' : 'card-face',
    selected ? 'card-selected' : '',
    disabled ? 'card-disabled' : '',
  ].filter(Boolean).join(' ')

  const imagePath = faceDown 
    ? getCardBackPath(cardBackType, cardBackSuit)
    : getCardImagePath(card)

  return (
    <div className={classes} onClick={!disabled ? onClick : undefined}>
      <img 
        src={imagePath} 
        alt={faceDown ? 'Card back' : `${card.rank} of ${card.suit}`}
        className="card-image"
        draggable={false}
      />
    </div>
  )
}
