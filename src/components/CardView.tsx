/**
 * CardView Component - Image-based card rendering
 * Supports active (color) and inactive (grayscale) card art based on owner's chosen suit
 */

import { useState, useRef, useEffect } from 'react'
import type { Card, StandardSuit } from '../game/types'
import { getCardTooltipData, getJokerOnBoardTooltip } from '../game/suitEffects'
import { getJokerMimicInfo } from '../game/poker'

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
  // Lane context for Joker tooltips (when card is on board)
  laneCards?: Card[]  // All cards in the lane (for resolving Joker)
  cardIndexInLane?: number  // This card's index in the lane
  // Drag and drop props
  draggable?: boolean
  isDragging?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragEnd?: () => void
  onTouchStart?: (e: React.TouchEvent) => void
  onTouchMove?: (e: React.TouchEvent) => void
  onTouchEnd?: (e: React.TouchEvent) => void
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
  laneCards,
  cardIndexInLane,
  draggable = false,
  isDragging = false,
  onDragStart,
  onDragEnd,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
}: CardViewProps) {
  const [showTooltip, setShowTooltip] = useState(false)
  const [tooltipPinned, setTooltipPinned] = useState(false)
  const hoverTimeoutRef = useRef<number | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  
  const isActive = isCardActive(card, ownerSuit)
  
  const classes = [
    'card',
    small ? 'card-small' : '',
    faceDown ? 'card-back' : 'card-face',
    selected ? 'card-selected' : '',
    disabled ? 'card-disabled' : '',
    !faceDown && isActive ? 'card-active' : '',
    !faceDown && !isActive ? 'card-inactive' : '',
    isDragging ? 'card-dragging' : '',
    draggable && !disabled ? 'card-draggable' : '',
  ].filter(Boolean).join(' ')

  const imagePath = faceDown 
    ? getCardBackPath(cardBackType, cardBackSuit)
    : getCardImagePath(card, ownerSuit)

  // Generate structured tooltip data for face-up cards with an owner suit
  // For Jokers on the board, show what they're mimicking
  const tooltipData = (() => {
    if (faceDown || !ownerSuit) return null
    
    // Check if this is a Joker on the board (has lane context)
    if (card.rank === 'JOKER' && laneCards && cardIndexInLane !== undefined) {
      const mimicInfo = getJokerMimicInfo(laneCards, cardIndexInLane)
      if (mimicInfo) {
        return getJokerOnBoardTooltip(mimicInfo.rank, mimicInfo.suit, mimicInfo.value)
      }
    }
    
    // Regular card or Joker in hand
    return getCardTooltipData(card, ownerSuit)
  })()

  // Handle drag start event
  const handleDragStart = (e: React.DragEvent) => {
    if (!draggable || disabled) {
      e.preventDefault()
      return
    }
    // Hide tooltip when dragging starts
    setShowTooltip(false)
    setTooltipPinned(false)
    // Set drag data
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', card.id)
    // Hide the browser's default drag image - we'll use our custom ghost instead
    const emptyImg = new Image()
    emptyImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
    e.dataTransfer.setDragImage(emptyImg, 0, 0)
    onDragStart?.(e)
  }

  // Hover handlers for desktop tooltip - instant show on hover
  const handleMouseEnter = () => {
    if (tooltipData && !isDragging && !faceDown) {
      // Clear any pending hide
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current)
        hoverTimeoutRef.current = null
      }
      setShowTooltip(true)
    }
  }

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
    // Hide after a brief delay (allows moving to tooltip if needed)
    if (!tooltipPinned) {
      hoverTimeoutRef.current = window.setTimeout(() => {
        setShowTooltip(false)
      }, 100)
    }
  }

  // Click/tap handler to toggle tooltip (mobile-friendly) and select card
  const handleClick = () => {
    // For mobile: toggle tooltip pin on tap
    if (tooltipData && !isDragging && !faceDown) {
      if (tooltipPinned) {
        setTooltipPinned(false)
        setShowTooltip(false)
      } else {
        setTooltipPinned(true)
        setShowTooltip(true)
      }
    }
    
    // Still call the original onClick handler for card selection
    if (!disabled && onClick) {
      onClick()
    }
  }

  // Close tooltip when clicking outside
  useEffect(() => {
    if (!tooltipPinned) return

    const handleClickOutside = (e: Event) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        setTooltipPinned(false)
        setShowTooltip(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [tooltipPinned])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current)
      }
    }
  }, [])

  return (
    <div 
      ref={cardRef}
      className={classes} 
      onClick={handleClick}
      draggable={draggable && !disabled}
      onDragStart={handleDragStart}
      onDragEnd={onDragEnd}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <img 
        src={imagePath} 
        alt={faceDown ? 'Card back' : `${card.rank} of ${card.suit}`}
        className="card-image"
        draggable={false}
      />
      
      {/* Custom tooltip with structured content */}
      {showTooltip && tooltipData && (
        <div className={`card-tooltip ${card.rank === 'JOKER' ? 'joker' : isActive ? 'active' : 'inactive'}`}>
          <div className="tooltip-header">{tooltipData.header}</div>
          <div className="tooltip-damage">{tooltipData.baseDamage}</div>
          {tooltipData.description && (
            <div className="tooltip-description">{tooltipData.description}</div>
          )}
          {tooltipData.effect && (
            <div className="tooltip-effect">{tooltipData.effect}</div>
          )}
        </div>
      )}
    </div>
  )
}
