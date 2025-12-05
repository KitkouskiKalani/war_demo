/**
 * GameBoard - Mobile-first Hearthstone-style game interface
 * 
 * Layout:
 * - Top: AI facedown hand + AI hero panel below
 * - Middle: Discard (left) | 3 Lanes | End Turn (right)
 * - Bottom: Player hero panel above + Player hand below
 */

import { useReducer, useEffect, useState, useCallback, useRef } from 'react'
import { gameReducer, canPlayCardToLane, canEndTurn, executeAITurn } from '../game'
import { initializeNewGame } from '../game/state'
import type { LaneId, Lane } from '../game/types'
import { CardView } from './CardView'

export function GameBoard() {
  const [state, dispatch] = useReducer(gameReducer, undefined, initializeNewGame)
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [isAIThinking, setIsAIThinking] = useState(false)
  const aiExecutingRef = useRef(false)

  const isPlayerTurn = state.currentPlayer === 1
  const canAct = isPlayerTurn && state.phase === 'Main' && !isAIThinking

  // Initialize game
  useEffect(() => {
    dispatch({ type: 'START_NEW_GAME' })
  }, [])

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

  // Lane component
  const LaneView = ({ lane }: { lane: Lane }) => {
    const targetable = isLaneTargetable(lane.id)
    const labels: Record<string, string> = { left: 'Left', middle: 'Mid', right: 'Right' }

    return (
      <div 
        className={`lane ${targetable ? 'lane-targetable' : ''}`}
        onClick={() => targetable && handleLaneClick(lane.id)}
      >
        {/* Opponent cards */}
        <div className="lane-cards">
          {lane.player2.cards.length === 0 ? (
            <span style={{ color: '#4a5568', fontSize: '11px' }}>—</span>
          ) : (
            lane.player2.cards.map(card => (
              <CardView key={card.id} card={card} small />
            ))
          )}
        </div>

        {/* Lane label */}
        <div className="lane-label">
          {labels[lane.id]}
          {targetable && <span style={{ color: '#fbbf24' }}> ▼</span>}
        </div>

        {/* Player cards */}
        <div className="lane-cards">
          {lane.player1.cards.length === 0 ? (
            <span style={{ color: '#4a5568', fontSize: '11px' }}>—</span>
          ) : (
            lane.player1.cards.map(card => (
              <CardView key={card.id} card={card} small />
            ))
          )}
        </div>
      </div>
    )
  }

  const phaseColor = 
    state.phase === 'Main' && isPlayerTurn ? '#22c55e' :
    state.phase === 'Main' && !isPlayerTurn ? '#ef4444' :
    state.phase === 'InitialFlip' ? '#3b82f6' :
    state.phase === 'EndOfRoundResolving' ? '#f97316' :
    state.phase === 'SuddenDeath' ? '#a855f7' : '#eab308'

  return (
    <div className="game-container">
      
      {/* ===== TOP: AI Section ===== */}
      <div className="top-section">
        {/* AI Hand (face down) */}
        <div style={{ display: 'flex', gap: '3px', justifyContent: 'center' }}>
          {state.player2.hand.slice(0, 8).map(card => (
            <CardView key={card.id} card={card} faceDown small />
          ))}
        </div>

        {/* AI Hero Panel (below their cards) */}
        <div className={`hero-panel opponent ${!isPlayerTurn ? 'active' : ''}`} style={{ color: '#ef4444' }}>
          <div className="hero-avatar opponent">🤖</div>
          <div>
            <div style={{ fontSize: '11px', color: '#9ca3af' }}>AI</div>
            <div className="hp-display">
              <span className="heart">❤</span>
              <span style={{ color: state.player2.hp <= 20 ? '#ef4444' : 'white' }}>{state.player2.hp}</span>
            </div>
          </div>
          <div style={{ fontSize: '11px', color: '#6b7280' }}>📚{state.player2.deck.length}</div>
        </div>
      </div>

      {/* ===== MIDDLE: Game Board ===== */}
      <div className="middle-section">
        {/* Phase Banner + Round */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="phase-banner" style={{ background: phaseColor, color: '#000' }}>
            {state.phase === 'Main' && isPlayerTurn && '🎯 YOUR TURN'}
            {state.phase === 'Main' && !isPlayerTurn && '🤖 AI...'}
            {state.phase === 'InitialFlip' && '🎲 FLIP'}
            {state.phase === 'EndOfRoundResolving' && '⚔️ RESOLVE'}
            {state.phase === 'SuddenDeath' && '💀 SUDDEN'}
            {state.phase === 'Finished' && (state.winner === 1 ? '🏆 WIN!' : '💔 LOSE')}
          </div>
          <div style={{ fontSize: '12px', color: '#6b7280' }}>
            R<span style={{ color: 'white', fontWeight: 'bold' }}>{state.roundNumber}</span>
          </div>
        </div>

        {/* Phase-specific buttons */}
        {state.phase === 'InitialFlip' && (
          <button onClick={handleInitialFlip} style={{
            padding: '14px 28px', fontSize: '16px', fontWeight: 'bold',
            background: 'linear-gradient(145deg, #3b82f6, #2563eb)',
            color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer'
          }}>
            🎲 Flip to Start!
          </button>
        )}

        {state.phase === 'SuddenDeath' && (
          <button onClick={handleSuddenDeath} style={{
            padding: '14px 28px', fontSize: '16px', fontWeight: 'bold',
            background: 'linear-gradient(145deg, #a855f7, #7c3aed)',
            color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer'
          }}>
            ⚔️ Sudden Death
          </button>
        )}

        {state.phase === 'Finished' && (
          <button onClick={handleNewGame} style={{
            padding: '14px 28px', fontSize: '16px', fontWeight: 'bold',
            background: 'linear-gradient(145deg, #eab308, #ca8a04)',
            color: 'black', border: 'none', borderRadius: '10px', cursor: 'pointer'
          }}>
            🔄 Play Again
          </button>
        )}

        {/* Board Row: Discard | Lanes | End Turn */}
        {state.phase === 'Main' && (
          <div className="board-row">
            {/* Discard Pile - LEFT */}
            <div className="side-action">
              <div 
                className={`discard-pile ${selectedCardId && canAct ? 'discard-pile-targetable' : ''}`}
                onClick={handleDiscard}
              >
                <span style={{ fontSize: '18px' }}>🗑️</span>
                <span style={{ fontSize: '10px', color: '#9ca3af' }}>{state.discardPile.length}</span>
              </div>
              <span style={{ fontSize: '9px', color: '#6b7280' }}>Discard</span>
            </div>

            {/* The 3 Lanes - CENTER */}
            <div className="lanes-container">
              {state.lanes.map(lane => (
                <LaneView key={lane.id} lane={lane} />
              ))}
            </div>

            {/* End Turn - RIGHT */}
            <div className="side-action">
              <button 
                className="end-turn-btn"
                onClick={handleEndTurn}
                disabled={!canEndTurn(state) || !isPlayerTurn}
              >
                END<br/>TURN
              </button>
              <span style={{ fontSize: '9px', color: '#6b7280' }}>
                {state.cardsPlayedThisTurn}/3
              </span>
            </div>
          </div>
        )}

        {/* Hint text */}
        {canAct && state.phase === 'Main' && (
          <div style={{ 
            color: selectedCardId ? '#fbbf24' : '#6b7280', 
            fontSize: '11px', textAlign: 'center'
          }}>
            {selectedCardId ? '✨ Tap lane or discard' : '👆 Select a card'}
          </div>
        )}
      </div>

      {/* ===== BOTTOM: Player Section ===== */}
      <div className="bottom-section">
        {/* Player Hero Panel (above their cards) */}
        <div className={`hero-panel player ${isPlayerTurn ? 'active' : ''}`} style={{ color: '#22c55e' }}>
          <div className="hero-avatar player">👤</div>
          <div>
            <div style={{ fontSize: '11px', color: '#9ca3af' }}>You</div>
            <div className="hp-display">
              <span className="heart">❤</span>
              <span style={{ color: state.player1.hp <= 20 ? '#ef4444' : 'white' }}>{state.player1.hp}</span>
            </div>
          </div>
          <div style={{ fontSize: '11px', color: '#6b7280' }}>📚{state.player1.deck.length}</div>
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
            />
          ))}
          {state.phase === 'Main' && state.player1.hand.length === 0 && (
            <span style={{ color: '#6b7280', fontSize: '12px' }}>No cards</span>
          )}
        </div>
      </div>
    </div>
  )
}
