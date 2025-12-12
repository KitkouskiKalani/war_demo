/**
 * CardView Component - Image-based card rendering
 * Supports active (color) and inactive (grayscale) card art based on owner's chosen suit
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
  ownerSuit?: StandardSuit | null  // The suit chosen by the card's owner (for active/inactive art)
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

// Check if a card is "active" (matches the owner's chosen suit)
function isCardActive(card: Card, ownerSuit: StandardSuit | null | undefined): boolean {
  if (!ownerSuit) return true // If no owner suit specified, default to active
  // Jokers are always active for their owner
  if (card.rank === 'JOKER') return true
  return card.suit === ownerSuit
}

// Get the image path for a face-up card (active = color, inactive = grayscale)
function getCardImagePath(card: Card, ownerSuit?: StandardSuit | null): string {
  const suitFolder = SUIT_TO_FOLDER[card.suit] || 'Hearts'
  const rankStr = getRankString(card.rank)
  const isActive = isCardActive(card, ownerSuit)
  
  // Jokers are stored as [Suit]_Joker.png in each suit folder
  if (card.rank === 'JOKER') {
    const jokerSuit = card.suit === 'joker' ? 'Hearts' : suitFolder
    if (isActive) {
      return `/assets/cards/Active Cards - Color/${jokerSuit} - Active Cards/${jokerSuit}_Joker.png`
    } else {
      return `/assets/cards/Inactive Cards - Grayscale/${jokerSuit} - inactive Cards/${jokerSuit}_Joker_grey.png`
    }
  }
  
  if (isActive) {
    return `/assets/cards/Active Cards - Color/${suitFolder} - Active Cards/${suitFolder}_${rankStr}.png`
  } else {
    return `/assets/cards/Inactive Cards - Grayscale/${suitFolder} - inactive Cards/${suitFolder}_${rankStr}_grey.png`
  }
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
  ownerSuit,
}: CardViewProps) {
  const isActive = isCardActive(card, ownerSuit)
  
  const classes = [
    'card',
    small ? 'card-small' : '',
    faceDown ? 'card-back' : 'card-face',
    selected ? 'card-selected' : '',
    disabled ? 'card-disabled' : '',
    !faceDown && isActive ? 'card-active' : '',
    !faceDown && !isActive ? 'card-inactive' : '',
  ].filter(Boolean).join(' ')

  const imagePath = faceDown 
    ? getCardBackPath(cardBackType, cardBackSuit)
    : getCardImagePath(card, ownerSuit)

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
