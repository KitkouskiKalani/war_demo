/**
 * CardView Component - Image-based card rendering
 * Supports active (color) and inactive (grayscale) card art based on owner's chosen suit
 */

import { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import type { Card, StandardSuit } from '../game/types'
import { getCardTooltipData, getJokerOnBoardTooltip } from '../game/suitEffects'

// Global event to dismiss all tooltips when a new one opens
const TOOLTIP_DISMISS_EVENT = 'card-tooltip-dismiss'

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
// Jokers now have suits and are active only if their suit matches the owner's suit
function isCardActive(card: Card, ownerSuit: StandardSuit | null | undefined): boolean {
  if (!ownerSuit) return true // If no owner suit specified, default to active
  return card.suit === ownerSuit
}

// Get the image path for a face-up card (active = color, inactive = grayscale)
function getCardImagePath(card: Card, ownerSuit?: StandardSuit | null): string {
  const suitFolder = SUIT_TO_FOLDER[card.suit] || 'Hearts'
  const rankStr = getRankString(card.rank)
  const isActive = isCardActive(card, ownerSuit)
  
  // Jokers are stored as [Suit]_Joker.png in each suit folder
  if (card.rank === 'JOKER') {
    if (isActive) {
      return `/assets/cards/Active Cards - Color/${suitFolder} - Active Cards/${suitFolder}_Joker.png`
    } else {
      return `/assets/cards/Inactive Cards - Grayscale/${suitFolder} - inactive Cards/${suitFolder}_Joker_grey.png`
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
  const [tooltipPortalRect, setTooltipPortalRect] = useState<{ top: number; left: number; position: 'above' | 'below' } | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  
  const isActive = isCardActive(card, ownerSuit)
  
  // Hide tooltip helper
  const hideTooltip = useCallback(() => {
    setShowTooltip(false)
    setTooltipPinned(false)
  }, [])
  
  // Listen for global tooltip dismiss events - ensures only one tooltip at a time
  useEffect(() => {
    const handleDismiss = (e: Event) => {
      const customEvent = e as CustomEvent
      // Don't dismiss if this is the card that triggered the event
      if (customEvent.detail !== card.id) {
        hideTooltip()
      }
    }
    
    window.addEventListener(TOOLTIP_DISMISS_EVENT, handleDismiss)
    return () => window.removeEventListener(TOOLTIP_DISMISS_EVENT, handleDismiss)
  }, [card.id, hideTooltip])
  
  const classes = [
    'card',
    small ? 'card-small' : '',
    faceDown ? 'card-back' : 'card-face',
    selected ? 'card-selected' : '',
    disabled ? 'card-disabled' : '',
    !faceDown && isActive ? 'card-active' : '',
    !faceDown && !isActive ? 'card-inactive' : '',
    isDragging ? 'card-dragging' : '',
    !faceDown && card.minionEffect ? 'card-minion-buffed' : '',
    showTooltip ? 'tooltip-visible' : '',
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
    // Jokers don't resolve until lane resolution - show generic tooltip
    if (card.rank === 'JOKER' && laneCards && cardIndexInLane !== undefined) {
      return getJokerOnBoardTooltip()
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
      // Dismiss any other open tooltips
      window.dispatchEvent(new CustomEvent(TOOLTIP_DISMISS_EVENT, { detail: card.id }))
      
      setShowTooltip(true)
    }
  }

  const handleMouseLeave = () => {
    // Hide immediately (no delay) unless pinned
    if (!tooltipPinned) {
      hideTooltip()
    }
  }

  // Click/tap handler to toggle tooltip (mobile-friendly) and select card
  const handleClick = () => {
    // For mobile: toggle tooltip pin on tap
    if (tooltipData && !isDragging && !faceDown) {
      if (tooltipPinned) {
        hideTooltip()
      } else {
        // Dismiss other tooltips and show this one
        window.dispatchEvent(new CustomEvent(TOOLTIP_DISMISS_EVENT, { detail: card.id }))
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
        hideTooltip()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [tooltipPinned, hideTooltip])

  // Keep portal tooltip position in sync with card (and clear when hidden).
  // Only depend on showTooltip so this callback is stable; tooltipData is recreated every render
  // and would otherwise cause the effect to re-run indefinitely (max update depth).
  const updateTooltipRect = useCallback(() => {
    if (!showTooltip || !cardRef.current) {
      setTooltipPortalRect(null)
      return
    }
    const rect = cardRef.current.getBoundingClientRect()
    const position: 'above' | 'below' = rect.top < 120 ? 'below' : 'above'
    setTooltipPortalRect({
      top: position === 'below' ? rect.bottom + 8 : rect.top - 8,
      left: rect.left + rect.width / 2,
      position,
    })
  }, [showTooltip])

  useLayoutEffect(() => {
    if (!showTooltip) {
      setTooltipPortalRect(null)
      return
    }
    updateTooltipRect()
    window.addEventListener('scroll', updateTooltipRect, true)
    window.addEventListener('resize', updateTooltipRect)
    return () => {
      window.removeEventListener('scroll', updateTooltipRect, true)
      window.removeEventListener('resize', updateTooltipRect)
    }
  }, [showTooltip, updateTooltipRect])


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
      {!faceDown && card.minionEffect && (
        <span className="card-minion-badge" aria-label="Minion buff">
          {card.minionEffect.type === 'spades-damage' ? '♠️' : '♥️'}
        </span>
      )}
      
      {/* Tooltip rendered in portal so it always appears on top of cards */}
      {showTooltip && tooltipData && tooltipPortalRect && typeof document !== 'undefined' && document.body &&
        createPortal(
          <div
            className="card-tooltip-portal"
            style={{
              position: 'fixed',
              left: tooltipPortalRect.left,
              top: tooltipPortalRect.top,
              transform: tooltipPortalRect.position === 'above' ? 'translate(-50%, -100%)' : 'translateX(-50%)',
              zIndex: 9999,
            }}
          >
            <div className={`card-tooltip ${card.rank === 'JOKER' ? 'joker' : isActive ? 'active' : 'inactive'} tooltip-${tooltipPortalRect.position}`}>
              <div className="tooltip-header">{tooltipData.header}</div>
              <div className="tooltip-damage">{tooltipData.baseDamage}</div>
              {tooltipData.description && (
                <div className="tooltip-description">{tooltipData.description}</div>
              )}
              {tooltipData.effect && (
                <div className="tooltip-effect">{tooltipData.effect}</div>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
