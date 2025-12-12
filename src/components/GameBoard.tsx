/**
 * GameBoard - Mobile-first game interface with custom art
 * 
 * Layout:
 * - Top: AI facedown hand + AI avatar/HP
 * - Middle: Draw piles (left) | 3 Lanes | Discard (right)
 * - Bottom: Player avatar/HP + Player hand
 */

import { useReducer, useEffect, useState, useCallback, useRef } from 'react'
import { gameReducer, canPlayCardToLane, canEndTurn, executeAITurn } from '../game'
import { initializeNewGame } from '../game/state'
import type { LaneId, Lane, StandardSuit } from '../game/types'
import { CardView } from './CardView'

// Suit to folder name mapping
const SUIT_FOLDER_MAP: Record<StandardSuit, string> = {
  hearts: 'Hearts',
  diamonds: 'Diamonds',
  clubs: 'Clovers',
  spades: 'Spades',
}

// Map suits to environment background images
const SUIT_TO_ENVIRONMENT: Record<StandardSuit, string> = {
  hearts: '/assets/environment/Hearts_Play_ENV.png',
  diamonds: '/assets/environment/Diamonds_Play_ENV.png',
  clubs: '/assets/environment/Clover_Play_Env.png',
  spades: '/assets/environment/Spades_Play_ENV.png',
}

// Get avatar path for a suit
function getAvatarPath(suit: StandardSuit | null): string {
  if (!suit) return '/assets/cards/Avatars and Supports/Hearts_Avatar.png'
  return `/assets/cards/Avatars and Supports/${SUIT_FOLDER_MAP[suit]}_Avatar.png`
}

// Get support path for a suit
function getSupportPath(suit: StandardSuit | null): string {
  if (!suit) return '/assets/cards/Avatars and Supports/Hearts_Support.png'
  return `/assets/cards/Avatars and Supports/${SUIT_FOLDER_MAP[suit]}_Support.png`
}

// Get background image based on field control suit
function getBackgroundImage(fieldControlSuit: StandardSuit | null): string {
  if (fieldControlSuit) {
    return SUIT_TO_ENVIRONMENT[fieldControlSuit]
  }
  return '/assets/environment/Start_Play_ENV.png'
}

const DISCARD_BACK = '/assets/cards/Draw and Discard Cards/Card Back - Discard.png'

export function GameBoard() {
  const [state, dispatch] = useReducer(gameReducer, undefined, initializeNewGame)
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [isAIThinking, setIsAIThinking] = useState(false)
  const aiExecutingRef = useRef(false)
  const [flipAnimationStage, setFlipAnimationStage] = useState<'cards' | 'result' | 'damage'>('cards')

  const isPlayerTurn = state.currentPlayer === 1
  const canAct = isPlayerTurn && state.phase === 'Main' && !isAIThinking && state.cardsPlayedThisTurn < 3

  // Initialize game
  useEffect(() => {
    dispatch({ type: 'START_NEW_GAME' })
  }, [])

  // Handle flip animation stages
  useEffect(() => {
    if (state.phase === 'InitialFlipResult') {
      setFlipAnimationStage('cards')
      
      // Stage 1: Show cards (1.5s)
      const timer1 = setTimeout(() => {
        setFlipAnimationStage('result')
      }, 1500)

      // Stage 2: Show result (1.5s more)
      const timer2 = setTimeout(() => {
        setFlipAnimationStage('damage')
      }, 3000)

      // Stage 3: Continue to main phase (1s more)
      const timer3 = setTimeout(() => {
        dispatch({ type: 'CONTINUE_FROM_FLIP' })
      }, 4000)

      return () => {
        clearTimeout(timer1)
        clearTimeout(timer2)
        clearTimeout(timer3)
      }
    }
  }, [state.phase])

  // AI Turn Handler
  const executeAI = useCallback(async () => {
    if (aiExecutingRef.current) return
    if (state.currentPlayer !== 2 || state.phase !== 'Main') return
    
    aiExecutingRef.current = true
    setIsAIThinking(true)
    
    await new Promise(r => setTimeout(r, 800))
    const moves = executeAITurn(state)
    
    for (const move of moves) {
      await new Promise(r => setTimeout(r, 400))
      if (move.type === 'lane' && move.laneId) {
        dispatch({ type: 'PLAY_CARD_TO_LANE', cardId: move.cardId, laneId: move.laneId })
      } else {
        dispatch({ type: 'DISCARD_CARD', cardId: move.cardId })
      }
    }
    
    await new Promise(r => setTimeout(r, 300))
    dispatch({ type: 'END_TURN' })
    setIsAIThinking(false)
    aiExecutingRef.current = false
  }, [state])

  // Trigger AI turn
  useEffect(() => {
    if (state.phase === 'Main' && state.currentPlayer === 2 && !isAIThinking && !aiExecutingRef.current) {
      executeAI()
    }
  }, [state.phase, state.currentPlayer, isAIThinking, executeAI])

  // Auto-resolve end of round
  useEffect(() => {
    if (state.phase === 'EndOfRoundResolving') {
      setTimeout(() => dispatch({ type: 'RESOLVE_END_OF_ROUND' }), 500)
    }
  }, [state.phase])

  // Handlers
  const handleSuitSelect = (suit: StandardSuit) => {
    if (state.phase === 'SuitSelection') {
      dispatch({ type: 'SELECT_SUIT', suit })
    }
  }

  const handleInitialFlip = () => {
    if (state.phase === 'InitialFlip') dispatch({ type: 'INITIAL_FLIP_STEP' })
  }

  const handleCardClick = (cardId: string) => {
    if (!canAct) return
    setSelectedCardId(prev => prev === cardId ? null : cardId)
  }

  const handleLaneClick = (laneId: LaneId) => {
    if (!selectedCardId || !canAct) return
    if (!canPlayCardToLane(state, selectedCardId, laneId)) return
    dispatch({ type: 'PLAY_CARD_TO_LANE', cardId: selectedCardId, laneId })
    setSelectedCardId(null)
  }

  const handleDiscard = () => {
    if (!selectedCardId || !canAct) return
    dispatch({ type: 'DISCARD_CARD', cardId: selectedCardId })
    setSelectedCardId(null)
  }

  const handleEndTurn = () => {
    if (!canEndTurn(state) || !isPlayerTurn) return
    setSelectedCardId(null)
    dispatch({ type: 'END_TURN' })
  }

  const handleSuddenDeath = () => {
    if (state.phase === 'SuddenDeath') dispatch({ type: 'SUDDEN_DEATH_STEP' })
  }

  const handleNewGame = () => {
    dispatch({ type: 'START_NEW_GAME' })
    setSelectedCardId(null)
  }

  const isLaneTargetable = (laneId: LaneId) => {
    if (!selectedCardId || !canAct) return false
    return canPlayCardToLane(state, selectedCardId, laneId)
  }

  // Get pending resolution info for a lane
  const getPendingInfo = (laneId: LaneId) => {
    return state.pendingResolutionLanes.find(p => p.laneId === laneId)
  }

  // Lane component
  const LaneView = ({ lane }: { lane: Lane }) => {
    const targetable = isLaneTargetable(lane.id)
    const labels: Record<string, string> = { left: 'Left', middle: 'Mid', right: 'Right' }
    const pendingInfo = getPendingInfo(lane.id)
    
    // Determine glow class based on turns until resolution
    const glowClass = pendingInfo 
      ? pendingInfo.turnsUntilResolution === 2 
        ? 'lane-glow-warning' 
        : 'lane-glow-danger'
      : ''

    return (
      <div 
        className={`lane ${targetable ? 'lane-targetable' : ''} ${glowClass}`}
        onClick={() => targetable && handleLaneClick(lane.id)}
      >
        {/* Pending resolution indicator */}
        {pendingInfo && (
          <div className={`lane-pending-indicator ${pendingInfo.turnsUntilResolution === 1 ? 'urgent' : ''}`}>
            Resolves in {pendingInfo.turnsUntilResolution}
          </div>
        )}

        {/* Opponent cards - stacked vertically */}
        <div className="lane-cards-stack opponent">
          {lane.player2.cards.length === 0 ? (
            <div className="lane-empty">—</div>
          ) : (
            lane.player2.cards.map((card, idx) => (
              <div key={card.id} className="stacked-card" style={{ zIndex: idx }}>
                <CardView card={card} small ownerSuit={state.player2Suit} />
              </div>
            ))
          )}
        </div>

        {/* Lane label */}
        <div className="lane-label">
          {labels[lane.id]}
          {targetable && <span style={{ color: '#fbbf24' }}> ▼</span>}
        </div>

        {/* Player cards - stacked vertically */}
        <div className="lane-cards-stack player">
          {lane.player1.cards.length === 0 ? (
            <div className="lane-empty">—</div>
          ) : (
            lane.player1.cards.map((card, idx) => (
              <div key={card.id} className="stacked-card" style={{ zIndex: idx }}>
                <CardView card={card} small ownerSuit={state.player1Suit} />
              </div>
            ))
          )}
        </div>
      </div>
    )
  }

  // Avatar component with pentagonal frame
  const Avatar = ({ suit, isPlayer }: { suit: StandardSuit | null; isPlayer: boolean }) => (
    <div className={`avatar-frame ${isPlayer ? 'player' : 'opponent'}`}>
      <img src={getAvatarPath(suit)} alt={isPlayer ? 'Player avatar' : 'AI avatar'} />
    </div>
  )

  // Support icon component (circular)
  const SupportIcon = ({ suit }: { suit: StandardSuit | null }) => (
    <div className="support-icon">
      <img src={getSupportPath(suit)} alt="Support" />
    </div>
  )

  // HP Display component
  const HPDisplay = ({ hp, isPlayer }: { hp: number; isPlayer: boolean }) => (
    <div className={`hp-display-box ${isPlayer ? 'player' : 'opponent'}`}>
      <span className="hp-heart">❤</span>
      <span className={`hp-value ${hp <= 20 ? 'critical' : ''}`}>{hp}</span>
    </div>
  )

  // Draw pile component - now uses field control suit for card back
  const DrawPile = ({ count }: { count: number }) => (
    <div className="draw-pile">
      <CardView 
        card={{ id: 'draw-pile', suit: 'hearts', rank: 2 }} 
        faceDown 
        small 
        cardBackType="ai"
        cardBackSuit={state.fieldControlSuit}
      />
      <span className="draw-pile-count">{count}</span>
    </div>
  )

  // Get dynamic background style
  const backgroundStyle = {
    backgroundImage: `url('${getBackgroundImage(state.fieldControlSuit)}')`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'center center',
    backgroundSize: 'cover',
  }

  // Suit Selection Screen
  if (state.phase === 'SuitSelection') {
    return (
      <div className="game-container">
        <div className="suit-selection-screen">
          <h2 className="suit-selection-title">Choose Your Suit</h2>
          <p className="suit-selection-subtitle">This will determine your champion</p>
          <div className="suit-options">
            {(['hearts', 'diamonds', 'clubs', 'spades'] as StandardSuit[]).map(suit => (
              <button
                key={suit}
                className={`suit-option ${suit}`}
                onClick={() => handleSuitSelect(suit)}
              >
                <img src={getAvatarPath(suit)} alt={suit} />
                <span className="suit-name">{suit.charAt(0).toUpperCase() + suit.slice(1)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // War Flip Result Animation Screen
  if (state.phase === 'InitialFlipResult' && state.flipResult) {
    const { player1Card, player2Card, winner, damage } = state.flipResult
    const playerWon = winner === 1

    return (
      <div className="game-container" style={backgroundStyle}>
        <div className="flip-result-screen">
          <h2 className="flip-title">WAR FLIP!</h2>
          
          {/* Cards Display */}
          <div className="flip-cards-container">
            {/* AI Card */}
            <div className={`flip-card-wrapper ${flipAnimationStage !== 'cards' ? (playerWon ? 'loser' : 'winner') : ''}`}>
              <div className="flip-card-label">AI</div>
              <div className="flip-card-display">
                <CardView card={player2Card} ownerSuit={state.player2Suit} />
              </div>
            </div>

            {/* VS */}
            <div className="flip-vs">VS</div>

            {/* Player Card */}
            <div className={`flip-card-wrapper ${flipAnimationStage !== 'cards' ? (playerWon ? 'winner' : 'loser') : ''}`}>
              <div className="flip-card-label">YOU</div>
              <div className="flip-card-display">
                <CardView card={player1Card} ownerSuit={state.player1Suit} />
              </div>
            </div>
          </div>

          {/* Result Text */}
          {flipAnimationStage !== 'cards' && (
            <div className={`flip-result-text ${playerWon ? 'win' : 'lose'}`}>
              {playerWon ? 'YOU WIN THE FLIP!' : 'AI WINS THE FLIP!'}
            </div>
          )}

          {/* Damage Display */}
          {flipAnimationStage === 'damage' && damage > 0 && (
            <div className="flip-damage-display">
              <span className={playerWon ? 'damage-to-ai' : 'damage-to-player'}>
                -{damage} HP to {playerWon ? 'AI' : 'You'}
              </span>
            </div>
          )}

          {/* Who goes first */}
          {flipAnimationStage === 'damage' && (
            <div className="flip-first-turn">
              {playerWon ? 'You go first!' : 'AI goes first!'}
            </div>
          )}
        </div>
      </div>
    )
  }

  const phaseColor = 
    state.phase === 'Main' && isPlayerTurn ? '#22c55e' :
    state.phase === 'Main' && !isPlayerTurn ? '#ef4444' :
    state.phase === 'InitialFlip' ? '#3b82f6' :
    state.phase === 'InitialFlipResult' ? '#3b82f6' :
    state.phase === 'EndOfRoundResolving' ? '#f97316' :
    state.phase === 'SuddenDeath' ? '#a855f7' : '#eab308'

  return (
    <div className="game-container" style={backgroundStyle}>
      
      {/* ===== TOP: AI Section ===== */}
      <div className="top-section">
        {/* AI Hand (face down with field control suit card back) */}
        <div className="ai-hand">
          {state.player2.hand.slice(0, 8).map(card => (
            <CardView 
              key={card.id} 
              card={card} 
              faceDown 
              small 
              cardBackType="ai" 
              cardBackSuit={state.fieldControlSuit}
            />
          ))}
        </div>

        {/* AI Avatar area with HP */}
        <div className="hero-float opponent">
          <HPDisplay hp={state.player2.hp} isPlayer={false} />
          <Avatar suit={state.player2Suit} isPlayer={false} />
          <SupportIcon suit={state.player2Suit} />
        </div>
      </div>

      {/* ===== MIDDLE: Game Board ===== */}
      <div className="middle-section">
        {/* Phase-specific buttons */}
        {state.phase === 'InitialFlip' && (
          <button onClick={handleInitialFlip} className="action-button flip">
            Flip to Start!
          </button>
        )}

        {state.phase === 'SuddenDeath' && (
          <button onClick={handleSuddenDeath} className="action-button sudden">
            Sudden Death
          </button>
        )}

        {state.phase === 'Finished' && (
          <button onClick={handleNewGame} className="action-button newgame">
            Play Again
          </button>
        )}

        {/* Board Row: Draw Piles | Lanes | Discard + End Turn */}
        {state.phase === 'Main' && (
          <div className="board-area">
            <div className="board-row">
              {/* Draw Piles - LEFT */}
              <div className="draw-piles-column">
                <DrawPile count={state.player2.deck.length} />
                <DrawPile count={state.player1.deck.length} />
              </div>

              {/* The 3 Lanes - CENTER */}
              <div className="lanes-container">
                {state.lanes.map(lane => (
                  <LaneView key={lane.id} lane={lane} />
                ))}
              </div>

              {/* Discard + End Turn - RIGHT */}
              <div className="side-action-right">
                <div 
                  className={`discard-pile ${selectedCardId && canAct ? 'discard-pile-targetable' : ''}`}
                  onClick={handleDiscard}
                >
                  <img src={DISCARD_BACK} alt="Discard pile" className="discard-image" />
                  <span className="discard-count">{state.discardPile.length}</span>
                </div>
                <button 
                  className="end-turn-btn"
                  onClick={handleEndTurn}
                  disabled={!canEndTurn(state) || !isPlayerTurn}
                >
                  END<br/>TURN
                </button>
                <span className="cards-played">{state.cardsPlayedThisTurn}/3</span>
              </div>
            </div>
          </div>
        )}

        {/* Phase Banner - Below board, on player's side */}
        <div className="phase-row">
          <div className="phase-banner" style={{ background: phaseColor, color: '#000' }}>
            {state.phase === 'Main' && isPlayerTurn && 'YOUR TURN'}
            {state.phase === 'Main' && !isPlayerTurn && 'AI TURN'}
            {state.phase === 'InitialFlip' && 'WAR FLIP'}
            {state.phase === 'EndOfRoundResolving' && 'RESOLVING'}
            {state.phase === 'SuddenDeath' && 'SUDDEN DEATH'}
            {state.phase === 'Finished' && (state.winner === 1 ? 'YOU WIN!' : 'YOU LOSE')}
          </div>
        </div>

        {/* Hint text */}
        {canAct && state.phase === 'Main' && (
          <div className={`hint-text ${selectedCardId ? 'active' : ''}`}>
            {selectedCardId ? 'Tap lane or discard' : 'Select a card'}
          </div>
        )}
      </div>

      {/* ===== BOTTOM: Player Section ===== */}
      <div className="bottom-section">
        {/* Player Avatar area with HP */}
        <div className="hero-float player">
          <HPDisplay hp={state.player1.hp} isPlayer={true} />
          <Avatar suit={state.player1Suit} isPlayer={true} />
          <SupportIcon suit={state.player1Suit} />
        </div>

        {/* Player Hand */}
        <div className="hand-container">
          {state.phase === 'Main' && state.player1.hand.map(card => (
            <CardView
              key={card.id}
              card={card}
              selected={selectedCardId === card.id}
              onClick={() => handleCardClick(card.id)}
              disabled={!canAct}
              ownerSuit={state.player1Suit}
            />
          ))}
          {state.phase === 'Main' && state.player1.hand.length === 0 && (
            <span className="no-cards">No cards</span>
          )}
        </div>
      </div>
    </div>
  )
}
