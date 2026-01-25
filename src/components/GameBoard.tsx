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
import { calculateBaseSum, evaluateLaneBonus } from '../game/poker'
import type { LaneId, Lane, StandardSuit, GameMode, CurrentPlayer } from '../game/types'
import { CardView } from './CardView'
import * as Network from '../network/peer'
import * as Lobbies from '../network/supabase'
import type { Lobby } from '../network/supabase'

// Suit to folder name mapping
const SUIT_FOLDER_MAP: Record<StandardSuit, string> = {
  hearts: 'Hearts',
  diamonds: 'Diamonds',
  clubs: 'Clovers',
  spades: 'Spades',
}

// Map suits to environment background images
const SUIT_TO_ENVIRONMENT: Record<StandardSuit, string> = {
  hearts: '/assets/environment/Play_ENV_Hearts_ALL.png',
  diamonds: '/assets/environment/Play_ENV_Diamonds_ALL.png',
  clubs: '/assets/environment/Play_ENV_Clovers_ALL.png',
  spades: '/assets/environment/Play_ENV_Spades_ALL.png',
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
  const [aiSupportGlowing, setAISupportGlowing] = useState(false)
  
  // HP animation state - track previous HP to show damage animation
  const [player1DisplayHP, setPlayer1DisplayHP] = useState(state.player1.hp)
  const [player2DisplayHP, setPlayer2DisplayHP] = useState(state.player2.hp)
  const [player1TakingDamage, setPlayer1TakingDamage] = useState(false)
  const [player2TakingDamage, setPlayer2TakingDamage] = useState(false)
  // Pending HP targets - used to delay animation until after resolution overlay closes
  const [pendingHP, setPendingHP] = useState<{ p1: number; p2: number } | null>(null)
  
  // Lane resolution animation state
  const [resolutionAnimation, setResolutionAnimation] = useState<{
    laneId: LaneId
    p1Total: number
    p2Total: number
    winner: 1 | 2 | 'tie'
    damage: number
    baseDamage: number
    bonusDamage: number
    bonusHealing: number
  } | null>(null)
  
  // Drag and drop state
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null)
  const [dragOverLaneId, setDragOverLaneId] = useState<LaneId | null>(null)
  const [showDragGhost, setShowDragGhost] = useState(false)  // Show custom drag ghost (for both touch and PC)
  const draggingCardRef = useRef<{ card: any; ownerSuit: StandardSuit | null } | null>(null)
  const dragGhostRef = useRef<HTMLDivElement | null>(null)
  
  // Online multiplayer state
  const [joinRoomCode, setJoinRoomCode] = useState('')
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [showYourTurn, setShowYourTurn] = useState(false)
  const [activeLobbies, setActiveLobbies] = useState<Lobby[]>([])
  const [isLoadingLobbies, setIsLoadingLobbies] = useState(false)
  const [showManualCode, setShowManualCode] = useState(false)

  // Determine if it's "your" turn based on game mode
  const isPlayerTurn = state.currentPlayer === 1
  const isLocalPlayerTurn = state.gameMode === 'online' 
    ? state.currentPlayer === state.localPlayer
    : state.gameMode === 'vs-player'
      ? true  // Hotseat: always "local" since both players share the device
      : isPlayerTurn
  
  // In PvP/online mode, both players can act on their turn; in AI mode, only player 1
  const canAct = state.phase === 'Main' && !isAIThinking && state.cardsPlayedThisTurn < 3 && isLocalPlayerTurn

  // Handler for player using support ability
  const handlePlayerUseSupport = () => {
    // Determine which player the "local" player is (the one at the bottom of the screen)
    const isOnlineGuest = state.gameMode === 'online' && state.localPlayer === 2
    const isHotseatP2Turn = state.gameMode === 'vs-player' && state.currentPlayer === 2
    const shouldFlipPerspective = isOnlineGuest || isHotseatP2Turn
    
    const playerNum: CurrentPlayer = shouldFlipPerspective ? 2 : 1
    const supportAvailable = playerNum === 1 ? state.player1SupportAvailable : state.player2SupportAvailable
    
    if (supportAvailable && state.phase === 'Main') {
      const action = { type: 'USE_SUPPORT' as const, player: playerNum }
      dispatch(action)
      sendNetworkAction(action)
    }
  }

  // Initialize game
  useEffect(() => {
    dispatch({ type: 'START_NEW_GAME' })
  }, [])

  // Track the last resolution timestamp to detect new resolutions
  const lastResolutionTimestampRef = useRef<number>(0)
  
  // Detect lane resolution and show animation using reducer's lastLaneResolution
  useEffect(() => {
    const resolution = state.lastLaneResolution
    if (!resolution) return
    
    // Only trigger animation for new resolutions (check timestamp)
    if (resolution.timestamp <= lastResolutionTimestampRef.current) return
    lastResolutionTimestampRef.current = resolution.timestamp
    
    // Determine winner relative to local perspective
    const isOnlineGuest = state.gameMode === 'online' && state.localPlayer === 2
    const isHotseatP2Turn = state.gameMode === 'vs-player' && state.currentPlayer === 2
    const shouldFlipPerspective = isOnlineGuest || isHotseatP2Turn
    
    // In flipped perspective: P2 is "you", P1 is "opponent"
    const localWinner = resolution.winner === null 
      ? 'tie' as const
      : shouldFlipPerspective 
        ? (resolution.winner === 2 ? 1 : 2) 
        : resolution.winner
    
    setResolutionAnimation({
      laneId: resolution.laneId,
      p1Total: shouldFlipPerspective ? resolution.player2Total : resolution.player1Total,
      p2Total: shouldFlipPerspective ? resolution.player1Total : resolution.player2Total,
      winner: localWinner === 'tie' ? 'tie' : (localWinner as 1 | 2),
      damage: resolution.damage,
      baseDamage: resolution.baseDamage,
      bonusDamage: resolution.bonusDamage,
      bonusHealing: resolution.bonusHealing,
    })
    
    // Clear animation after 3.5 seconds (extra second to show bonus effects)
    const timeoutId = setTimeout(() => {
      setResolutionAnimation(null)
    }, 3500)
    
    return () => clearTimeout(timeoutId)
  }, [state.lastLaneResolution, state.gameMode, state.localPlayer, state.currentPlayer])

  // Animate HP changes with damage flash effect
  // When HP changes during resolution overlay, store as pending instead of animating immediately
  useEffect(() => {
    const p1Changed = state.player1.hp !== player1DisplayHP
    const p2Changed = state.player2.hp !== player2DisplayHP
    
    if (!p1Changed && !p2Changed) return
    
    // If resolution animation is showing, delay the HP animation
    if (resolutionAnimation) {
      setPendingHP({ p1: state.player1.hp, p2: state.player2.hp })
      return
    }
    
    // No overlay - animate immediately
    if (state.player1.hp < player1DisplayHP) {
      animateHP(1, player1DisplayHP, state.player1.hp)
    } else if (p1Changed) {
      setPlayer1DisplayHP(state.player1.hp)
    }
    
    if (state.player2.hp < player2DisplayHP) {
      animateHP(2, player2DisplayHP, state.player2.hp)
    } else if (p2Changed) {
      setPlayer2DisplayHP(state.player2.hp)
    }
  }, [state.player1.hp, state.player2.hp])
  
  // When resolution overlay closes, trigger pending HP animation
  useEffect(() => {
    if (resolutionAnimation === null && pendingHP) {
      // Overlay just closed - now animate the HP change
      if (pendingHP.p1 < player1DisplayHP) {
        animateHP(1, player1DisplayHP, pendingHP.p1)
      } else if (pendingHP.p1 !== player1DisplayHP) {
        setPlayer1DisplayHP(pendingHP.p1)
      }
      
      if (pendingHP.p2 < player2DisplayHP) {
        animateHP(2, player2DisplayHP, pendingHP.p2)
      } else if (pendingHP.p2 !== player2DisplayHP) {
        setPlayer2DisplayHP(pendingHP.p2)
      }
      
      setPendingHP(null)
    }
  }, [resolutionAnimation, pendingHP])
  
  // Helper function to animate HP decrease with flash effect
  const animateHP = (player: 1 | 2, startHP: number, targetHP: number) => {
    if (player === 1) {
      setPlayer1TakingDamage(true)
    } else {
      setPlayer2TakingDamage(true)
    }
    
    const duration = 2000
    const startTime = Date.now()
    
    const animate = () => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      const currentHP = Math.round(startHP - (startHP - targetHP) * progress)
      
      if (player === 1) {
        setPlayer1DisplayHP(currentHP)
      } else {
        setPlayer2DisplayHP(currentHP)
      }
      
      if (progress < 1) {
        requestAnimationFrame(animate)
      } else {
        if (player === 1) {
          setPlayer1TakingDamage(false)
        } else {
          setPlayer2TakingDamage(false)
        }
      }
    }
    requestAnimationFrame(animate)
  }

  // Auto-trigger the war flip when entering InitialFlip phase
  // In online mode, only the HOST executes the flip to avoid desync
  useEffect(() => {
    if (state.phase === 'InitialFlip') {
      // In online mode, only host triggers the flip
      if (state.gameMode === 'online' && !state.isHost) {
        // Guest waits for host to send flip result
        return
      }
      
      // Small delay before auto-flipping for smoother transition
      const flipTimer = setTimeout(() => {
        dispatch({ type: 'INITIAL_FLIP_STEP' })
      }, 500)
      
      return () => clearTimeout(flipTimer)
    }
  }, [state.phase, state.gameMode, state.isHost])

  // Handle flip animation stages
  useEffect(() => {
    if (state.phase === 'InitialFlipResult') {
      setFlipAnimationStage('cards')
      
      // In online mode, host syncs the flip result state to guest
      if (state.gameMode === 'online' && state.isHost && Network.isConnected()) {
        // Send the full state including flip result and deck state to guest
        Network.sendAction({ 
          type: 'FLIP_RESULT_SYNC', 
          state: {
            ...state,
            // Guest needs to know they're not host
            isHost: false,
            localPlayer: 2,
          }
        })
      }
      
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
  }, [state.phase, state.gameMode, state.isHost])

  // AI Turn Handler
  const executeAI = useCallback(async () => {
    if (aiExecutingRef.current) return
    if (state.currentPlayer !== 2 || state.phase !== 'Main') return
    
    aiExecutingRef.current = true
    setIsAIThinking(true)
    
    // Check if AI should use support ability (use it at start of turn if available)
    if (state.player2SupportAvailable) {
      // Show glow effect for 1.5 seconds before using
      setAISupportGlowing(true)
      await new Promise(r => setTimeout(r, 1500))
      dispatch({ type: 'USE_SUPPORT', player: 2 })
      setAISupportGlowing(false)
      await new Promise(r => setTimeout(r, 500))
    }
    
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

  // Trigger AI turn (only in vs-ai mode)
  useEffect(() => {
    if (state.gameMode === 'vs-ai' && state.phase === 'Main' && state.currentPlayer === 2 && !isAIThinking && !aiExecutingRef.current) {
      executeAI()
    }
  }, [state.gameMode, state.phase, state.currentPlayer, isAIThinking, executeAI])

  // Auto-resolve end of round
  useEffect(() => {
    if (state.phase === 'EndOfRoundResolving') {
      setTimeout(() => dispatch({ type: 'RESOLVE_END_OF_ROUND' }), 500)
    }
  }, [state.phase])

  // Network action handler for online mode
  const handleNetworkAction = useCallback((action: any) => {
    console.log('[GameBoard] Received network action:', action.type)
    
    // Handle incoming game actions from opponent
    if (action.type === 'GAME_ACTION') {
      dispatch(action.action)
      
      // Show "Your Turn" popup when opponent ends turn
      if (action.action.type === 'END_TURN') {
        setShowYourTurn(true)
        setTimeout(() => setShowYourTurn(false), 1500)
      }
    }
    
    // Handle suit selection from opponent
    if (action.type === 'SUIT_SELECTED') {
      dispatch({ type: 'OPPONENT_SUIT_SELECTED', suit: action.suit })
    }
    
    // Handle state sync (for guest joining)
    if (action.type === 'STATE_SYNC') {
      dispatch({ type: 'SYNC_STATE', state: action.state })
    }
    
    // Handle flip result sync from host (fixes war flip desync between clients)
    if (action.type === 'FLIP_RESULT_SYNC') {
      console.log('[GameBoard] Received flip result sync from host')
      dispatch({ type: 'SYNC_STATE', state: action.state })
    }
  }, [])

  // Set up network listeners when in online mode
  useEffect(() => {
    if (state.gameMode === 'online') {
      Network.onAction(handleNetworkAction)
    }
    return () => {
      // Cleanup handled by disconnect
    }
  }, [state.gameMode, handleNetworkAction])

  // Send game actions over network in online mode
  const sendNetworkAction = useCallback((action: any) => {
    if (state.gameMode === 'online' && Network.isConnected()) {
      Network.sendAction({ type: 'GAME_ACTION', action })
    }
  }, [state.gameMode])

  // Online room handlers
  const handleCreateRoom = async () => {
    setIsConnecting(true)
    setConnectionError(null)
    try {
      const code = await Network.createRoom()
      dispatch({ type: 'SET_ROOM_CODE', code })
      dispatch({ type: 'GO_TO_CREATE_ROOM' })
      
      // Register lobby in database (if Supabase is configured)
      await Lobbies.createLobby(code, 'Player 1')
      
      // When guest connects, move to suit selection
      Network.onConnection(() => {
        // Remove lobby from list since game is starting
        Lobbies.removeLobby(code)
        dispatch({ type: 'PLAYER_CONNECTED' })
        // Sync current state to guest
        Network.sendAction({ type: 'STATE_SYNC', state: { ...state, phase: 'SuitSelection', gameMode: 'online', isHost: false, localPlayer: 2 } })
      })
      
      // Remove lobby on disconnect
      Network.onDisconnect(() => {
        Lobbies.removeLobby(code)
      })
    } catch (err: any) {
      setConnectionError(err.message || 'Failed to create room. Please try again.')
      console.error(err)
    }
    setIsConnecting(false)
  }

  const handleJoinRoom = async (code?: string) => {
    const roomCode = code || joinRoomCode.trim()
    if (!roomCode) {
      setConnectionError('Please enter a room code')
      return
    }
    setIsConnecting(true)
    setConnectionError(null)
    try {
      await Network.joinRoom(roomCode.toUpperCase())
      dispatch({ type: 'SET_ROOM_CODE', code: roomCode.toUpperCase() })
      // Guest is player 2, transition handled by state sync from host
    } catch (err: any) {
      setConnectionError(err.message || 'Failed to join room. Check the code and try again.')
      console.error(err)
    }
    setIsConnecting(false)
  }

  // Load active lobbies when entering join screen
  const loadLobbies = useCallback(async () => {
    setIsLoadingLobbies(true)
    const lobbies = await Lobbies.getLobbies()
    setActiveLobbies(lobbies)
    setIsLoadingLobbies(false)
  }, [])

  // Subscribe to lobby updates when on join screen
  useEffect(() => {
    if (state.phase === 'JoiningRoom' && Lobbies.isSupabaseConfigured()) {
      const unsubscribe = Lobbies.subscribeToLobbies(setActiveLobbies)
      return unsubscribe
    }
  }, [state.phase])

  // Load lobbies when entering join room screen
  useEffect(() => {
    if (state.phase === 'JoiningRoom') {
      loadLobbies()
      setShowManualCode(false)
      setJoinRoomCode('')
      setConnectionError(null)
    }
  }, [state.phase, loadLobbies])

  // Handlers
  const handleModeSelect = (mode: GameMode) => {
    if (state.phase === 'ModeSelection') {
      dispatch({ type: 'SELECT_MODE', mode })
    }
  }

  const handleSuitSelect = (suit: StandardSuit) => {
    if (state.phase === 'SuitSelection') {
      dispatch({ type: 'SELECT_SUIT', suit })
      // In online mode, send suit selection to opponent
      if (state.gameMode === 'online' && Network.isConnected()) {
        Network.sendAction({ type: 'SUIT_SELECTED', suit })
      }
    }
  }

  const handleSuitSelectP2 = (suit: StandardSuit) => {
    if (state.phase === 'SuitSelectionP2') {
      dispatch({ type: 'SELECT_SUIT_P2', suit })
    }
  }

  const handleConfirmReady = () => {
    if (state.phase === 'PassDevice') {
      dispatch({ type: 'CONFIRM_READY' })
    }
  }

  const handleCardClick = (cardId: string) => {
    if (!canAct) return
    setSelectedCardId(prev => prev === cardId ? null : cardId)
  }

  const handleLaneClick = (laneId: LaneId) => {
    if (!selectedCardId || !canAct) return
    if (!canPlayCardToLane(state, selectedCardId, laneId)) return
    const action = { type: 'PLAY_CARD_TO_LANE' as const, cardId: selectedCardId, laneId }
    dispatch(action)
    sendNetworkAction(action)
    setSelectedCardId(null)
  }

  const handleDiscard = () => {
    if (!selectedCardId || !canAct) return
    const action = { type: 'DISCARD_CARD' as const, cardId: selectedCardId }
    dispatch(action)
    sendNetworkAction(action)
    setSelectedCardId(null)
  }

  const handleEndTurn = () => {
    // Only the current player can end their turn
    if (!canEndTurn(state)) return
    if (!isLocalPlayerTurn) return
    setSelectedCardId(null)
    const action = { type: 'END_TURN' as const }
    dispatch(action)
    sendNetworkAction(action)
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

  // Check if a lane can accept the currently dragged card
  const isLaneDropTarget = (laneId: LaneId) => {
    if (!draggingCardId || !canAct) return false
    return canPlayCardToLane(state, draggingCardId, laneId)
  }

  // Get lane element under a point (for touch hit detection)
  const getLaneUnderPoint = (x: number, y: number): LaneId | null => {
    const element = document.elementFromPoint(x, y)
    const laneEl = element?.closest('[data-lane-id]')
    return laneEl?.getAttribute('data-lane-id') as LaneId | null
  }

  // Check if discard pile is under a point
  const isDiscardUnderPoint = (x: number, y: number): boolean => {
    const element = document.elementFromPoint(x, y)
    return element?.closest('.discard-pile') !== null
  }

  // Drag handlers for desktop (HTML5 Drag API)
  const handleDragStart = (e: React.DragEvent, cardId: string, card: any, ownerSuit: StandardSuit | null) => {
    if (!canAct) return
    setDraggingCardId(cardId)
    setSelectedCardId(null) // Deselect when starting drag
    setShowDragGhost(true)  // Show our custom ghost for PC too
    draggingCardRef.current = { card, ownerSuit }
    
    // Set initial ghost position
    requestAnimationFrame(() => {
      if (dragGhostRef.current) {
        dragGhostRef.current.style.left = `${e.clientX}px`
        dragGhostRef.current.style.top = `${e.clientY}px`
      }
    })
  }
  
  // Track cursor position during drag (for ghost on PC)
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()  // Required to allow drop
    if (draggingCardId && dragGhostRef.current) {
      dragGhostRef.current.style.left = `${e.clientX}px`
      dragGhostRef.current.style.top = `${e.clientY}px`
    }
  }

  const handleDragEnd = () => {
    setDraggingCardId(null)
    setDragOverLaneId(null)
    setShowDragGhost(false)
    draggingCardRef.current = null
  }

  const handleDragOverLane = (e: React.DragEvent, laneId: LaneId) => {
    e.preventDefault()
    if (draggingCardId && canPlayCardToLane(state, draggingCardId, laneId)) {
      setDragOverLaneId(laneId)
    }
  }

  const handleDragLeaveLane = () => {
    setDragOverLaneId(null)
  }

  const handleDropOnLane = (laneId: LaneId) => {
    if (!draggingCardId || !canAct) return
    if (!canPlayCardToLane(state, draggingCardId, laneId)) return
    
    const action = { type: 'PLAY_CARD_TO_LANE' as const, cardId: draggingCardId, laneId }
    dispatch(action)
    sendNetworkAction(action)
    handleDragEnd()
  }

  const handleDragOverDiscard = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDropOnDiscard = () => {
    if (!draggingCardId || !canAct) return
    
    const action = { type: 'DISCARD_CARD' as const, cardId: draggingCardId }
    dispatch(action)
    sendNetworkAction(action)
    handleDragEnd()
  }

  // Touch handlers for mobile - use direct DOM manipulation for ghost position to avoid re-renders
  const handleTouchStart = (e: React.TouchEvent, cardId: string, card: any, ownerSuit: StandardSuit | null) => {
    if (!canAct) return
    e.preventDefault() // Prevent default to avoid scroll during drag
    
    const touch = e.touches[0]
    setDraggingCardId(cardId)
    setSelectedCardId(null)
    setShowDragGhost(true)  // Show the custom drag ghost
    draggingCardRef.current = { card, ownerSuit }
    
    // Set initial position via ref after render
    requestAnimationFrame(() => {
      if (dragGhostRef.current) {
        dragGhostRef.current.style.left = `${touch.clientX}px`
        dragGhostRef.current.style.top = `${touch.clientY}px`
      }
    })
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!draggingCardId) return
    e.preventDefault()
    
    const touch = e.touches[0]
    
    // Update ghost position directly via DOM ref - no state update, no re-render
    if (dragGhostRef.current) {
      dragGhostRef.current.style.left = `${touch.clientX}px`
      dragGhostRef.current.style.top = `${touch.clientY}px`
    }
    
    // Check what's under the touch point (hide ghost briefly to detect element underneath)
    if (dragGhostRef.current) {
      dragGhostRef.current.style.pointerEvents = 'none'
    }
    const laneId = getLaneUnderPoint(touch.clientX, touch.clientY)
    if (laneId && canPlayCardToLane(state, draggingCardId, laneId)) {
      setDragOverLaneId(laneId)
    } else {
      setDragOverLaneId(null)
    }
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!draggingCardId) return
    
    // Get the final position
    const touch = e.changedTouches[0]
    const laneId = getLaneUnderPoint(touch.clientX, touch.clientY)
    const isOverDiscard = isDiscardUnderPoint(touch.clientX, touch.clientY)
    
    if (laneId && canPlayCardToLane(state, draggingCardId, laneId)) {
      const action = { type: 'PLAY_CARD_TO_LANE' as const, cardId: draggingCardId, laneId }
      dispatch(action)
      sendNetworkAction(action)
    } else if (isOverDiscard) {
      const action = { type: 'DISCARD_CARD' as const, cardId: draggingCardId }
      dispatch(action)
      sendNetworkAction(action)
    }
    // If not dropped on valid target, card returns to hand (nothing happens)
    
    handleDragEnd()
  }

  // Get pending resolution info for a lane
  const getPendingInfo = (laneId: LaneId) => {
    return state.pendingResolutionLanes.find(p => p.laneId === laneId)
  }

  // Lane component - with perspective flip for online AND hotseat mode
  const LaneView = ({ lane }: { lane: Lane }) => {
    const targetable = isLaneTargetable(lane.id)
    const dropTarget = isLaneDropTarget(lane.id)
    const labels: Record<string, string> = { left: 'Left', middle: 'Mid', right: 'Right' }
    const pendingInfo = getPendingInfo(lane.id)
    
    // Determine glow class based on turns until resolution
    const glowClass = pendingInfo 
      ? pendingInfo.turnsUntilResolution === 2 
        ? 'lane-glow-warning' 
        : 'lane-glow-danger'
      : ''
    
    // Determine if this lane is being dragged over
    const isDragOver = dragOverLaneId === lane.id && dropTarget
    
    // Perspective flip for online AND hotseat mode
    const isOnlineGuest = state.gameMode === 'online' && state.localPlayer === 2
    const isHotseatP2Turn = state.gameMode === 'vs-player' && state.currentPlayer === 2
    const shouldFlipPerspective = isOnlineGuest || isHotseatP2Turn
    
    const topCards = shouldFlipPerspective ? lane.player1.cards : lane.player2.cards
    const bottomCards = shouldFlipPerspective ? lane.player2.cards : lane.player1.cards
    const topSuit = shouldFlipPerspective ? state.player1Suit : state.player2Suit
    const bottomSuit = shouldFlipPerspective ? state.player2Suit : state.player1Suit
    
    // Calculate lane totals for display (base sum + poker bonus)
    const topBaseSum = calculateBaseSum(topCards)
    const topBonus = evaluateLaneBonus(topCards)
    const bottomBaseSum = calculateBaseSum(bottomCards)
    const bottomBonus = evaluateLaneBonus(bottomCards)

    return (
      <div className="lane-wrapper">
        {/* Opponent lane total (outside, above) */}
        <div className={`lane-total opponent ${topBaseSum > 0 ? 'has-value' : ''}`}>
          {topBaseSum > 0 ? (
            topBonus > 0 ? (
              <><span className="base-sum">{topBaseSum}</span><span className="bonus-separator">|</span><span className="bonus-value">{topBonus}</span></>
            ) : topBaseSum
          ) : '—'}
        </div>
        
        <div 
          className={`lane ${targetable ? 'lane-targetable' : ''} ${dropTarget ? 'lane-drop-target' : ''} ${isDragOver ? 'lane-drag-over' : ''} ${glowClass}`}
        onClick={() => targetable && handleLaneClick(lane.id)}
          data-lane-id={lane.id}
          onDragOver={(e) => handleDragOverLane(e, lane.id)}
          onDragLeave={handleDragLeaveLane}
          onDrop={() => handleDropOnLane(lane.id)}
        >
          {/* Pending resolution indicator */}
          {pendingInfo && (
            <div className={`lane-pending-indicator ${pendingInfo.turnsUntilResolution === 1 ? 'urgent' : ''}`}>
              Resolves in {pendingInfo.turnsUntilResolution}
            </div>
          )}

          {/* Opponent cards (top) - stacked vertically */}
          <div className="lane-cards-stack opponent">
            {topCards.length === 0 ? (
              <div className="lane-empty">—</div>
            ) : (
              topCards.map((card, idx) => (
                <div key={card.id} className="stacked-card" style={{ zIndex: idx }}>
                  <CardView 
                    card={card} 
                    small 
                    ownerSuit={topSuit}
                    laneCards={topCards}
                    cardIndexInLane={idx}
                  />
                </div>
            ))
          )}
        </div>

        {/* Lane label */}
        <div className="lane-label">
          {labels[lane.id]}
          {targetable && <span style={{ color: '#fbbf24' }}> ▼</span>}
        </div>

          {/* Local player cards (bottom) - stacked vertically */}
          <div className="lane-cards-stack player">
            {bottomCards.length === 0 ? (
              <div className="lane-empty">—</div>
            ) : (
              bottomCards.map((card, idx) => (
                <div key={card.id} className="stacked-card" style={{ zIndex: idx }}>
                  <CardView 
                    card={card} 
                    small 
                    ownerSuit={bottomSuit}
                    laneCards={bottomCards}
                    cardIndexInLane={idx}
                  />
                </div>
              ))
            )}
          </div>
        </div>
        
        {/* Player lane total (outside, below) */}
        <div className={`lane-total player ${bottomBaseSum > 0 ? 'has-value' : ''}`}>
          {bottomBaseSum > 0 ? (
            bottomBonus > 0 ? (
              <><span className="base-sum">{bottomBaseSum}</span><span className="bonus-separator">|</span><span className="bonus-value">{bottomBonus}</span></>
            ) : bottomBaseSum
          ) : '—'}
        </div>
      </div>
    )
  }

  // Avatar component with pentagonal frame
  const Avatar = ({ suit, isPlayer, takingDamage = false }: { suit: StandardSuit | null; isPlayer: boolean; takingDamage?: boolean }) => (
    <div className={`avatar-frame ${isPlayer ? 'player' : 'opponent'} ${takingDamage ? 'taking-damage' : ''}`}>
      <img src={getAvatarPath(suit)} alt={isPlayer ? 'Player avatar' : 'AI avatar'} />
    </div>
  )

  // Support icon component (circular) - now clickable when ability is available
  const SupportIcon = ({ 
    suit, 
    isPlayer, 
    available, 
    onClick 
  }: { 
    suit: StandardSuit | null; 
    isPlayer: boolean;
    available: boolean;
    onClick?: () => void;
  }) => (
    <div 
      className={`support-icon ${available ? 'support-available' : ''} ${isPlayer && available ? 'clickable' : ''}`}
      onClick={isPlayer && available ? onClick : undefined}
      title={available ? (isPlayer ? 'Click to use support ability!' : 'Support ability ready!') : undefined}
    >
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

  // Calculate hands remaining (minimum of both players' decks / 3)
  const handsRemaining = Math.floor(Math.min(state.player1.deck.length, state.player2.deck.length) / 3)
  const deckGlowClass = handsRemaining === 2 ? 'deck-glow-warning' : handsRemaining <= 1 ? 'deck-glow-danger' : ''

  // Draw pile component - now uses field control suit for card back
  const DrawPile = ({ count, glowClass = '' }: { count: number; glowClass?: string }) => (
    <div className={`draw-pile ${glowClass}`}>
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

  // Mode Selection Screen
  if (state.phase === 'ModeSelection') {
    return (
      <div className="game-container">
        <div className="mode-selection-screen">
          <h2 className="mode-selection-title">War-Lanes Poker</h2>
          <p className="mode-selection-subtitle">Select Game Mode</p>
          <div className="mode-options">
            <button
              className="mode-option vs-ai"
              onClick={() => handleModeSelect('vs-ai')}
            >
              <div className="mode-icon">🤖</div>
              <span className="mode-name">vs AI</span>
              <span className="mode-desc">Play against the computer</span>
            </button>
            <button
              className="mode-option vs-player"
              onClick={() => handleModeSelect('vs-player')}
            >
              <div className="mode-icon">👥</div>
              <span className="mode-name">vs Player</span>
              <span className="mode-desc">Local multiplayer (hot seat)</span>
            </button>
            <button
              className="mode-option online"
              onClick={() => handleModeSelect('online')}
            >
              <div className="mode-icon">🌐</div>
              <span className="mode-name">Online</span>
              <span className="mode-desc">Play with a friend online</span>
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Online Lobby - Create or Join
  if (state.phase === 'OnlineLobby') {
    return (
      <div className="game-container">
        <div className="online-lobby-screen">
          <h2 className="online-lobby-title">Online Play</h2>
          <p className="online-lobby-subtitle">Create a room or join an existing one</p>
          {connectionError && <div className="connection-error">{connectionError}</div>}
          <div className="lobby-options">
            <button 
              className="lobby-option create"
              onClick={handleCreateRoom}
              disabled={isConnecting}
            >
              <div className="lobby-icon">🏠</div>
              <span className="lobby-name">Create Room</span>
              <span className="lobby-desc">Host a game for a friend to join</span>
            </button>
            <button 
              className="lobby-option join"
              onClick={() => dispatch({ type: 'GO_TO_JOIN_ROOM' })}
              disabled={isConnecting}
            >
              <div className="lobby-icon">🚪</div>
              <span className="lobby-name">Join Room</span>
              <span className="lobby-desc">Enter a room code to join</span>
            </button>
          </div>
          <button className="back-button" onClick={handleNewGame}>
            ← Back
          </button>
        </div>
      </div>
    )
  }

  // Waiting for Player (Host)
  if (state.phase === 'WaitingForPlayer') {
    const handleCancelHost = () => {
      if (state.roomCode) {
        Lobbies.removeLobby(state.roomCode)
      }
      Network.disconnect()
      handleNewGame()
    }
    
    return (
      <div className="game-container">
        <div className="waiting-screen">
          <h2 className="waiting-title">Waiting for Player</h2>
          <p className="waiting-subtitle">Share this code with your friend:</p>
          <div className="room-code-display">
            {state.roomCode || '------'}
          </div>
          <p className="waiting-hint">Or they can find your lobby in the "Join Game" list</p>
          <div className="waiting-spinner"></div>
          <button className="back-button" onClick={handleCancelHost}>
            Cancel
          </button>
        </div>
      </div>
    )
  }

  // Join Room (Guest) - Shows active lobbies
  if (state.phase === 'JoiningRoom') {
    return (
      <div className="game-container">
        <div className="join-room-screen">
          <h2 className="join-room-title">Join Game</h2>
          {connectionError && <div className="connection-error">{connectionError}</div>}
          
          {!showManualCode ? (
            <>
              <p className="join-room-subtitle">Active Lobbies</p>
              
              <div className="lobbies-list">
                {isLoadingLobbies ? (
                  <div className="lobbies-loading">
                    <div className="waiting-spinner"></div>
                    <span>Loading lobbies...</span>
                  </div>
                ) : activeLobbies.length === 0 ? (
                  <div className="no-lobbies">
                    <p>No active lobbies found</p>
                    <p className="no-lobbies-hint">Ask a friend to create a room, or enter a code manually</p>
                  </div>
                ) : (
                  activeLobbies.map(lobby => (
                    <button
                      key={lobby.id}
                      className="lobby-item"
                      onClick={() => handleJoinRoom(lobby.id)}
                      disabled={isConnecting}
                    >
                      <span className="lobby-host">{lobby.host_name}'s Game</span>
                      <span className="lobby-code">{lobby.id}</span>
                    </button>
                  ))
                )}
              </div>
              
              <div className="lobby-actions">
                <button 
                  className="refresh-button" 
                  onClick={loadLobbies}
                  disabled={isLoadingLobbies}
                >
                  🔄 Refresh
                </button>
                <button 
                  className="manual-code-button"
                  onClick={() => setShowManualCode(true)}
                >
                  Enter Code
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="join-room-subtitle">Enter room code:</p>
              <input
                type="tel"
                inputMode="numeric"
                pattern="[0-9]*"
                className="room-code-input"
                value={joinRoomCode}
                onChange={(e) => setJoinRoomCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                maxLength={6}
                disabled={isConnecting}
                autoFocus
              />
              <button 
                className="join-button" 
                onClick={() => handleJoinRoom()}
                disabled={isConnecting || !joinRoomCode.trim()}
              >
                {isConnecting ? 'Connecting...' : 'Join Game'}
              </button>
              <button 
                className="back-button small"
                onClick={() => { setShowManualCode(false); setConnectionError(null); }}
              >
                ← Back to Lobbies
              </button>
            </>
          )}
          
          <button className="back-button" onClick={() => dispatch({ type: 'SELECT_MODE', mode: 'online' })}>
            ← Back to Menu
          </button>
        </div>
      </div>
    )
  }

  // Waiting for opponent to pick suit (Online)
  if (state.phase === 'WaitingForOpponentSuit') {
    return (
      <div className="game-container">
        <div className="waiting-screen">
          <h2 className="waiting-title">Waiting for Opponent</h2>
          <p className="waiting-subtitle">Your opponent is choosing their suit...</p>
          <div className="your-suit-display">
            <span>Your suit:</span>
            <img src={getAvatarPath(state.isHost ? state.player1Suit : state.player2Suit)} alt="Your suit" />
          </div>
          <div className="waiting-spinner"></div>
        </div>
      </div>
    )
  }

  // Suit Selection Screen
  if (state.phase === 'SuitSelection') {
    const title = state.gameMode === 'vs-player' 
      ? 'Player 1: Choose Your Suit' 
      : state.gameMode === 'online'
        ? 'Choose Your Suit'
        : 'Choose Your Suit'
    
    return (
      <div className="game-container">
        <div className="suit-selection-screen">
          <h2 className="suit-selection-title">{title}</h2>
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

  // Suit Selection Screen - Player 2 (PvP only)
  if (state.phase === 'SuitSelectionP2') {
    return (
      <div className="game-container">
        <div className="suit-selection-screen player2">
          <h2 className="suit-selection-title">Player 2: Choose Your Suit</h2>
          <p className="suit-selection-subtitle">Pass the device to Player 2</p>
          <div className="suit-options">
            {(['hearts', 'diamonds', 'clubs', 'spades'] as StandardSuit[]).map(suit => (
              <button
                key={suit}
                className={`suit-option ${suit}`}
                onClick={() => handleSuitSelectP2(suit)}
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

  // Pass Device Screen (PvP only)
  if (state.phase === 'PassDevice') {
    const nextPlayerNum = state.currentPlayer
    return (
      <div className="game-container">
        <div className="pass-device-screen">
          <h2 className="pass-device-title">Pass the Device</h2>
          <div className="pass-device-avatar">
            <img 
              src={getAvatarPath(nextPlayerNum === 1 ? state.player1Suit : state.player2Suit)} 
              alt={`Player ${nextPlayerNum}`} 
            />
          </div>
          <p className="pass-device-subtitle">
            Hand the device to <strong>Player {nextPlayerNum}</strong>
          </p>
          <button className="ready-button" onClick={handleConfirmReady}>
            I'm Ready!
          </button>
        </div>
      </div>
    )
  }

  // War Flip Result Animation Screen
  if (state.phase === 'InitialFlipResult' && state.flipResult) {
    const { player1Card, player2Card, winner, damage } = state.flipResult
    const playerWon = winner === 1
    const isPvP = state.gameMode === 'vs-player'
    const isOnline = state.gameMode === 'online'
    const localWon = isOnline ? winner === state.localPlayer : playerWon
    
    // Labels for the flip display
    let opponentLabel = 'AI'
    let youLabel = 'YOU'
    if (isPvP) {
      opponentLabel = 'P2'
      youLabel = 'P1'
    } else if (isOnline) {
      opponentLabel = 'OPP'
      youLabel = 'YOU'
    }

    return (
      <div className="game-container" style={backgroundStyle}>
        <div className="flip-result-screen">
          <h2 className="flip-title">WAR FLIP!</h2>
          
          {/* Cards Display */}
          <div className="flip-cards-container">
            {/* Opponent Card */}
            <div className={`flip-card-wrapper ${flipAnimationStage !== 'cards' ? (localWon ? 'loser' : 'winner') : ''}`}>
              <div className="flip-card-label">{opponentLabel}</div>
              <div className="flip-card-display">
                <CardView card={player2Card} ownerSuit={state.player2Suit} />
              </div>
            </div>

            {/* VS */}
            <div className="flip-vs">VS</div>

            {/* Your Card */}
            <div className={`flip-card-wrapper ${flipAnimationStage !== 'cards' ? (localWon ? 'winner' : 'loser') : ''}`}>
              <div className="flip-card-label">{youLabel}</div>
              <div className="flip-card-display">
                <CardView card={player1Card} ownerSuit={state.player1Suit} />
              </div>
            </div>
          </div>

          {/* Result Text */}
          {flipAnimationStage !== 'cards' && (
            <div className={`flip-result-text ${localWon ? 'win' : 'lose'}`}>
              {isPvP 
                ? (playerWon ? 'PLAYER 1 WINS THE FLIP!' : 'PLAYER 2 WINS THE FLIP!')
                : isOnline
                  ? (localWon ? 'YOU WIN THE FLIP!' : 'OPPONENT WINS THE FLIP!')
                  : (playerWon ? 'YOU WIN THE FLIP!' : 'AI WINS THE FLIP!')}
            </div>
          )}

          {/* Damage Display */}
          {flipAnimationStage === 'damage' && damage > 0 && (
            <div className="flip-damage-display">
              <span className={localWon ? 'damage-to-ai' : 'damage-to-player'}>
                -{damage} HP to {isPvP 
                  ? (playerWon ? 'Player 2' : 'Player 1') 
                  : isOnline
                    ? (localWon ? 'Opponent' : 'You')
                    : (playerWon ? 'AI' : 'You')}
              </span>
            </div>
          )}

          {/* Who goes first */}
          {flipAnimationStage === 'damage' && (
            <div className="flip-first-turn">
              {isPvP 
                ? (playerWon ? 'Player 1 goes first!' : 'Player 2 goes first!')
                : isOnline
                  ? (localWon ? 'You go first!' : 'Opponent goes first!')
                  : (playerWon ? 'You go first!' : 'AI goes first!')}
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
    <div 
      className="game-container" 
      style={backgroundStyle}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onDragOver={handleDragOver}
    >
      
      {/* Your Turn Popup (Online mode) */}
      {showYourTurn && (
        <div className="your-turn-popup">
          <div className="your-turn-text">YOUR TURN!</div>
        </div>
      )}
      
      {/* Lane Resolution Animation Overlay */}
      {resolutionAnimation && (
        <div className="resolution-overlay">
          <div className="resolution-content">
            <div className="resolution-lane-name">
              {resolutionAnimation.laneId.toUpperCase()} LANE
            </div>
            <div className="resolution-totals">
              <div className={`resolution-total opponent ${resolutionAnimation.winner === 2 ? 'winner' : resolutionAnimation.winner === 1 ? 'loser' : ''}`}>
                <span className="resolution-label">OPPONENT</span>
                <span className="resolution-value">{resolutionAnimation.p2Total}</span>
              </div>
              <div className="resolution-vs">VS</div>
              <div className={`resolution-total player ${resolutionAnimation.winner === 1 ? 'winner' : resolutionAnimation.winner === 2 ? 'loser' : ''}`}>
                <span className="resolution-label">YOU</span>
                <span className="resolution-value">{resolutionAnimation.p1Total}</span>
              </div>
            </div>
            {resolutionAnimation.winner !== 'tie' && (
              <div className={`resolution-damage ${resolutionAnimation.winner === 1 ? 'dealt' : 'taken'}`}>
                {resolutionAnimation.winner === 1 
                  ? `${resolutionAnimation.damage} DAMAGE DEALT!` 
                  : `${resolutionAnimation.damage} DAMAGE TAKEN!`}
              </div>
            )}
            {/* Show effects section if there are any bonuses */}
            {resolutionAnimation.winner !== 'tie' && (resolutionAnimation.bonusDamage > 0 || resolutionAnimation.bonusHealing > 0) && (
              <div className="resolution-effects">
                <span className="effects-label">Effects:</span>
                {resolutionAnimation.bonusDamage > 0 && (
                  <span className="effect-item damage-effect">+{resolutionAnimation.bonusDamage} damage</span>
                )}
                {resolutionAnimation.bonusHealing > 0 && (
                  <span className={`effect-item heal-effect ${resolutionAnimation.winner === 1 ? 'to-you' : 'to-opponent'}`}>
                    +{resolutionAnimation.bonusHealing} heal to {resolutionAnimation.winner === 1 ? 'you' : 'opponent'}
                  </span>
                )}
              </div>
            )}
            {resolutionAnimation.winner === 'tie' && (
              <div className="resolution-tie">TIE - NO DAMAGE</div>
            )}
          </div>
        </div>
      )}
      
      {/* ===== TOP: Opponent Section ===== */}
      <div className="top-section">
        {/* Opponent Hand - perspective flip for online AND hotseat mode */}
        {(() => {
          // Determine if we need to flip perspective (current player sees their stuff at bottom)
          const isOnlineGuest = state.gameMode === 'online' && state.localPlayer === 2
          const isHotseatP2Turn = state.gameMode === 'vs-player' && state.currentPlayer === 2
          const shouldFlipPerspective = isOnlineGuest || isHotseatP2Turn
          
          // Opponent is shown at top
          const opponentData = shouldFlipPerspective ? state.player1 : state.player2
          const opponentSuit = shouldFlipPerspective ? state.player1Suit : state.player2Suit
          const opponentSupportAvailable = shouldFlipPerspective ? state.player1SupportAvailable : state.player2SupportAvailable
          const opponentDisplayHP = shouldFlipPerspective ? player1DisplayHP : player2DisplayHP
          const opponentTakingDamage = shouldFlipPerspective ? player1TakingDamage : player2TakingDamage
          
          return (
            <>
              <div className="ai-hand">
                {/* Opponent's cards are always face down at the top */}
                {opponentData.hand.slice(0, 8).map(card => (
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

              {/* Opponent Avatar area with HP */}
              <div className="hero-float opponent">
                <HPDisplay hp={opponentDisplayHP} isPlayer={false} />
                <Avatar suit={opponentSuit} isPlayer={false} takingDamage={opponentTakingDamage} />
                <SupportIcon 
                  suit={opponentSuit} 
                  isPlayer={false} 
                  available={opponentSupportAvailable || aiSupportGlowing}
                />
          </div>
            </>
          )
        })()}
        </div>

      {/* ===== MIDDLE: Game Board ===== */}
      <div className="middle-section">
        {/* Phase-specific buttons */}
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
              {/* Draw Piles - LEFT (with perspective flip for online AND hotseat) */}
              <div className="draw-piles-column">
                {(() => {
                  const isOnlineGuest = state.gameMode === 'online' && state.localPlayer === 2
                  const isHotseatP2Turn = state.gameMode === 'vs-player' && state.currentPlayer === 2
                  const shouldFlipPerspective = isOnlineGuest || isHotseatP2Turn
                  
                  const topDeckCount = shouldFlipPerspective ? state.player1.deck.length : state.player2.deck.length
                  const bottomDeckCount = shouldFlipPerspective ? state.player2.deck.length : state.player1.deck.length
                  return (
                    <>
                      <DrawPile count={topDeckCount} glowClass={deckGlowClass} />
                      <DrawPile count={bottomDeckCount} glowClass={deckGlowClass} />
                    </>
                  )
                })()}
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
                  className={`discard-pile ${selectedCardId && canAct ? 'discard-pile-targetable' : ''} ${draggingCardId && canAct ? 'discard-drop-target' : ''}`}
                  onClick={handleDiscard}
                  onDragOver={handleDragOverDiscard}
                  onDrop={handleDropOnDiscard}
                >
                  <img src={DISCARD_BACK} alt="Discard pile" className="discard-image" />
                  <span className="discard-count">{state.discardPile.length}</span>
                </div>
              <button 
                className="end-turn-btn"
                onClick={handleEndTurn}
                  disabled={!canEndTurn(state) || !isLocalPlayerTurn}
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
            {state.phase === 'Main' && isLocalPlayerTurn && (
              handsRemaining <= 2 && handsRemaining > 0
                ? `${handsRemaining} HAND${handsRemaining > 1 ? 'S' : ''} REMAINING`
                : state.gameMode === 'vs-player' ? (isPlayerTurn ? 'PLAYER 1 TURN' : 'PLAYER 2 TURN') : 
                  state.gameMode === 'online' ? 'YOUR TURN' : 'YOUR TURN'
            )}
            {state.phase === 'Main' && !isLocalPlayerTurn && (
              handsRemaining <= 2 && handsRemaining > 0
                ? `${handsRemaining} HAND${handsRemaining > 1 ? 'S' : ''} REMAINING`
                : state.gameMode === 'vs-player' ? (isPlayerTurn ? 'PLAYER 1 TURN' : 'PLAYER 2 TURN') :
                  state.gameMode === 'online' ? 'OPPONENT TURN' : 'AI TURN'
            )}
            {state.phase === 'InitialFlip' && 'WAR FLIP'}
            {state.phase === 'EndOfRoundResolving' && 'RESOLVING'}
            {state.phase === 'SuddenDeath' && 'SUDDEN DEATH'}
            {state.phase === 'Finished' && (
              state.gameMode === 'vs-player' 
                ? (state.winner === 1 ? 'PLAYER 1 WINS!' : 'PLAYER 2 WINS!')
                : state.gameMode === 'online'
                  ? (state.winner === state.localPlayer ? 'YOU WIN!' : 'YOU LOSE!')
                  : (state.winner === 1 ? 'YOU WIN!' : 'YOU LOSE')
            )}
          </div>
        </div>

        {/* Hint text */}
        {canAct && state.phase === 'Main' && (
          <div className={`hint-text ${selectedCardId || draggingCardId ? 'active' : ''}`}>
            {selectedCardId ? 'Tap lane or discard' : draggingCardId ? 'Drop on lane or discard' : 'Drag or tap a card'}
          </div>
        )}
      </div>

      {/* ===== BOTTOM: Local Player Section ===== */}
      <div className="bottom-section">
        {/* Local Player Avatar area with HP - perspective flip for online AND hotseat mode */}
        {(() => {
          // Determine if we need to flip perspective
          const isOnlineGuest = state.gameMode === 'online' && state.localPlayer === 2
          const isHotseatP2Turn = state.gameMode === 'vs-player' && state.currentPlayer === 2
          const shouldFlipPerspective = isOnlineGuest || isHotseatP2Turn
          
          // Local player (current player in hotseat) is shown at bottom
          const localData = shouldFlipPerspective ? state.player2 : state.player1
          const localSuit = shouldFlipPerspective ? state.player2Suit : state.player1Suit
          const localSupportAvailable = shouldFlipPerspective ? state.player2SupportAvailable : state.player1SupportAvailable
          const localDisplayHP = shouldFlipPerspective ? player2DisplayHP : player1DisplayHP
          const localTakingDamage = shouldFlipPerspective ? player2TakingDamage : player1TakingDamage
          
          return (
            <>
              <div className="hero-float player">
                <HPDisplay hp={localDisplayHP} isPlayer={true} />
                <Avatar suit={localSuit} isPlayer={true} takingDamage={localTakingDamage} />
                <SupportIcon 
                  suit={localSuit} 
                  isPlayer={true} 
                  available={localSupportAvailable}
                  onClick={handlePlayerUseSupport}
                />
        </div>

              {/* Local Player Hand - always clickable at bottom */}
              <div 
                className="hand-container"
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              >
                {state.phase === 'Main' && (
                  localData.hand.map(card => (
            <CardView
              key={card.id}
              card={card}
              selected={selectedCardId === card.id}
              onClick={() => handleCardClick(card.id)}
              disabled={!canAct}
                      ownerSuit={localSuit}
                      draggable={canAct}
                      isDragging={draggingCardId === card.id}
                      onDragStart={(e) => handleDragStart(e, card.id, card, localSuit)}
                      onDragEnd={handleDragEnd}
                      onTouchStart={(e) => handleTouchStart(e, card.id, card, localSuit)}
                    />
                  ))
                )}
                {state.phase === 'Main' && localData.hand.length === 0 && (
                  <span className="no-cards">No cards</span>
          )}
        </div>
            </>
          )
        })()}
      </div>

      {/* Drag Ghost - floating card that follows cursor/touch position */}
      {draggingCardId && draggingCardRef.current && showDragGhost && (
        <div 
          ref={dragGhostRef}
          className="drag-ghost"
        >
          <CardView 
            card={draggingCardRef.current.card} 
            ownerSuit={draggingCardRef.current.ownerSuit}
          />
        </div>
      )}
    </div>
  )
}
