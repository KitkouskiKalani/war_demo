/**
 * GameBoard - Mobile-first game interface with custom art
 * 
 * Layout:
 * - Top: AI facedown hand + AI avatar/HP
 * - Middle: Draw piles (left) | 3 Lanes | Discard (right)
 * - Bottom: Player avatar/HP + Player hand
 */

import { useReducer, useEffect, useState, useCallback, useRef, useLayoutEffect, Fragment } from 'react'
import { createPortal } from 'react-dom'
import { gameReducer, canPlayCardToLane, canEndTurn, executeAITurn, getAIEffectChoice, shuffle, STANDARD_RANKS, STANDARD_SUITS } from '../game'
import { initializeNewGame } from '../game/state'
import { getLaneDisplay, HAND_LABELS } from '../game/poker'
import type { Card, CurrentPlayer, LaneId, Lane, RelicType, StandardSuit, GameMode, Rank } from '../game/types'
import { CardView } from './CardView'
import { EffectChoiceModal, StatusIndicators, ChargesDisplay } from './EffectChoiceModal'
import { playSfx, stopSfx, unlockSfx } from '../audio/sfx'
import { flySpark, pulse } from '../fx/effects'
import * as Network from '../network/peer'
import * as Lobbies from '../network/supabase'
import type { Lobby } from '../network/supabase'
import * as Matches from '../network/matches'

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

type BoardSelectionMode =
  | 'move-source'
  | 'move-target'
  | 'neutralize'
  | 'relic-shield-lane'
  | 'relic-sword-lane'
  | 'relic-skull-card'
  | 'relic-skull-target'

type MinionMenuMode = 'clubs-card' | 'clubs-suit' | 'diamonds-card' | 'spades-skull-card' | 'hearts-minion-choice' | 'hearts-skull-card'

const SUIT_OPTIONS: { suit: StandardSuit; emoji: string; label: string }[] = [
  { suit: 'hearts', emoji: '♥️', label: 'Hearts' },
  { suit: 'diamonds', emoji: '♦️', label: 'Diamonds' },
  { suit: 'clubs', emoji: '♣️', label: 'Clubs' },
  { suit: 'spades', emoji: '♠️', label: 'Spades' },
]

function relicAssetName(relic: RelicType): string {
  return relic[0].toUpperCase() + relic.slice(1)
}

function getAbilitySuitName(suit: StandardSuit | null, useClovers = false): string {
  if (!suit) return 'Hearts'
  if (suit === 'clubs') return useClovers ? 'Clovers' : 'Clover'
  return SUIT_FOLDER_MAP[suit]
}

function getStackArtLabel(stackCount: number, diamondMinion = false): string {
  if (stackCount <= 0) return 'No Bars'
  if (stackCount === 1) return 'One Bar'
  return diamondMinion ? 'Two Bar' : 'Two Bars'
}

function getMinionPath(suit: StandardSuit | null, stackCount = 0): string {
  const suitName = getAbilitySuitName(suit)
  if (stackCount >= 3) {
    return `/assets/abilities/Minions/Minion - ${suitName} - Activated.png`
  }
  const artLabel = getStackArtLabel(stackCount, suit === 'diamonds')
  return `/assets/abilities/Minions/Minion - ${suitName} - ${artLabel}.png`
}

function getRelicPath(suit: StandardSuit | null, relic: RelicType, stackCount = 0): string {
  const prefix = relic === 'skull' ? 'Relic' : relicAssetName(relic)
  const folder = relic === 'skull' ? 'Relics' : relic === 'shield' ? 'Shields' : 'Swords'
  if (stackCount >= 3) {
    return `/assets/abilities/${folder}/${prefix} - Activated - ALL BARS.png`
  }
  const suitName = getAbilitySuitName(suit, relic === 'sword')
  return `/assets/abilities/${folder}/${prefix} - ${suitName} - ${getStackArtLabel(stackCount)}.png`
}

function getRelicTooltip(relic: RelicType, isActive: boolean, stackCount: number, suit: StandardSuit | null): string {
  const status = isActive ? 'active' : 'inactive'
  const progressText = ` Progress: ${Math.min(stackCount, 3)}/3 stacks.`
  if (relic === 'shield') {
    return `Shield (${status}): Select a lane to shield for 50% damage reduction on that lane's next resolve.${progressText}`
  }
  if (relic === 'skull') {
    if (suit === 'hearts') {
      return `Relic (${status}): Choose a card in your hand and transform it into a random card from the discard pile.${progressText}`
    }
    if (suit === 'spades') {
      return `Relic (${status}): Choose a card in your hand and transform it into a random suit and rank.${progressText}`
    }
    return `Relic (${status}): Move one of your played cards to another non-full lane.${progressText}`
  }
  return `Sword (${status}): Select a lane to double your poker bonus on that lane's next resolve.${progressText}`
}

// Mirror of the reducer's stack-granting rules, used only to decide which
// ability icon a "spark" should fly to when a card is played. Returns null when
// a card grants no stack.
type StackAbilityFx = 'minion' | 'sword' | 'shield' | 'skull'
function stackAbilityForPlayedCard(card: Card, ownerSuit: StandardSuit | null): StackAbilityFx | null {
  if (ownerSuit && card.suit === ownerSuit) return 'minion'
  if (!ownerSuit) return null
  const rank = card.rank
  if (typeof rank === 'number') {
    if (rank >= 2 && rank <= 6) return 'sword'
    if (rank >= 7 && rank <= 10) return 'shield'
    return null
  }
  if (rank === 'J') return 'shield'
  if (rank === 'Q' || rank === 'K' || rank === 'A' || rank === 'JOKER') return 'skull'
  return null
}

// Get background image based on field control suit
function getBackgroundImage(fieldControlSuit: StandardSuit | null): string {
  if (fieldControlSuit) {
    return SUIT_TO_ENVIRONMENT[fieldControlSuit]
  }
  return '/assets/environment/Start_Play_ENV.png'
}

export function GameBoard() {
  const [state, dispatch] = useReducer(gameReducer, undefined, initializeNewGame)
  const stateRef = useRef(state)
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [isAIThinking, setIsAIThinking] = useState(false)
  const aiExecutingRef = useRef(false)
  const [flipAnimationStage, setFlipAnimationStage] = useState<'cards' | 'result' | 'damage'>('cards')
  const [laneResolveEndTurnCooldown, setLaneResolveEndTurnCooldown] = useState(false)
  const laneResolveCooldownTimeoutRef = useRef<number | null>(null)
  // Brief lockout on End Turn right after an ability resolves. Pressing End Turn
  // in the same instant an ability fires lets the two clients diverge (an extra
  // action in flight), which trips the network turn-handoff guard and locks both
  // players out. The cooldown lets the ability action settle/propagate first.
  const [abilityEndTurnCooldown, setAbilityEndTurnCooldown] = useState(false)
  const abilityCooldownTimeoutRef = useRef<number | null>(null)
  
  // HP animation state - track previous HP to show damage/heal animation
  const [player1DisplayHP, setPlayer1DisplayHP] = useState(state.player1.hp)
  const [player2DisplayHP, setPlayer2DisplayHP] = useState(state.player2.hp)
  const [player1TakingDamage, setPlayer1TakingDamage] = useState(false)
  const [player2TakingDamage, setPlayer2TakingDamage] = useState(false)
  const [player1Healing, setPlayer1Healing] = useState(false)
  const [player2Healing, setPlayer2Healing] = useState(false)
  const hpAnimationFrameRefs = useRef<{ player1: number | null; player2: number | null }>({ player1: null, player2: null })
  // Pending HP targets - used to delay animation until after resolution overlay closes
  // pendingHP state removed - HP animations now trigger during resolution overlay
  
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
    p1Cards: Card[]
    p2Cards: Card[]
    p1HandLabel: string
    p2HandLabel: string
    p1BaseDamage: number
    p2BaseDamage: number
    p1PokerBonus: number
    p2PokerBonus: number
  } | null>(null)
  
  // Drag and drop state
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null)
  const dragOverLaneIdRef = useRef<LaneId | null>(null)  // Using ref instead of state to avoid re-renders during drag
  const [showDragGhost, setShowDragGhost] = useState(false)  // Show custom drag ghost (for both touch and PC)
  const draggingCardRef = useRef<{ card: any; ownerSuit: StandardSuit | null } | null>(null)
  const dragGhostRef = useRef<HTMLDivElement | null>(null)
  const dragRAFRef = useRef<number | null>(null)  // For throttling touch move updates
  const previousBoardCardCountRef = useRef<number | null>(null)
  // Snapshot of which cards are on the board, keyed by id, so we can detect the
  // exact card/owner/lane that was just played and fly a spark to its ability.
  const previousBoardCardsRef = useRef<Map<string, { laneId: LaneId; owner: CurrentPlayer }> | null>(null)

  // --- Host-authoritative reconciliation bookkeeping ----------------------
  // The host is the single source of truth. After any gameplay change it
  // broadcasts its full state; the guest reconciles to it. These refs let the
  // guest avoid the "revert bounce" where a host snapshot that predates the
  // guest's own in-flight action would briefly undo it.
  //
  // - lastReceivedRemoteSeqRef: (host) highest sequence number seen from the
  //   guest. Echoed back inside each authoritative snapshot as `ackSeq` so the
  //   guest knows whether the host has already applied its latest action.
  // - pendingLocalSeqRef: (guest) sequence of the last action we sent. We only
  //   adopt an authoritative snapshot once the host has acknowledged at least
  //   this sequence (ackSeq >= pendingLocalSeqRef), so our optimistic move is
  //   never reverted by a stale snapshot.
  // - authoritativeBroadcastTimerRef: (host) debounce handle for the broadcast.
  const lastReceivedRemoteSeqRef = useRef<number>(0)
  const pendingLocalSeqRef = useRef<number>(0)
  const authoritativeBroadcastTimerRef = useRef<number | null>(null)
  // (host) Signature of the last state we broadcast + the ack we sent with it,
  // so we can skip re-broadcasting when nothing meaningful changed.
  const lastBroadcastSignatureRef = useRef<string | null>(null)
  const lastBroadcastAckRef = useRef<number>(-1)
  // (guest) Safety net so we never stay stuck holding a snapshot if the host's
  // state stops changing (e.g. it rejected our action and never re-broadcasts).
  const holdRecoveryTimerRef = useRef<number | null>(null)
  
  // Board selection mode for Clubs effects
  // 'move-source': Selecting which lane to pick the top card from
  // 'move-target': Selecting which lane to move the card to (after source selected)
  // 'neutralize': Selecting which lane to neutralize
  const [boardSelectionMode, setBoardSelectionMode] = useState<BoardSelectionMode | null>(null)
  const [moveSourceLane, setMoveSourceLane] = useState<LaneId | null>(null)
  const [selectedRelicCard, setSelectedRelicCard] = useState<{ cardId: string; fromLane: LaneId } | null>(null)
  const [minionMenuMode, setMinionMenuMode] = useState<MinionMenuMode | null>(null)
  const [selectedMinionCardId, setSelectedMinionCardId] = useState<string | null>(null)
  
  // Online multiplayer state
  const [joinRoomCode, setJoinRoomCode] = useState('')
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [showYourTurn, setShowYourTurn] = useState(false)
  const [activeLobbies, setActiveLobbies] = useState<Lobby[]>([])
  const [isLoadingLobbies, setIsLoadingLobbies] = useState(false)
  const [showManualCode, setShowManualCode] = useState(false)
  const [opponentDisconnected, setOpponentDisconnected] = useState(false)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    const handleUnlock = () => unlockSfx()
    window.addEventListener('pointerdown', handleUnlock, { passive: true })
    window.addEventListener('pointerup', handleUnlock, { passive: true })
    window.addEventListener('touchstart', handleUnlock, { passive: true })
    window.addEventListener('touchend', handleUnlock, { passive: true })
    window.addEventListener('click', handleUnlock)
    window.addEventListener('keydown', handleUnlock)
    document.addEventListener('visibilitychange', handleUnlock)
    return () => {
      window.removeEventListener('pointerdown', handleUnlock)
      window.removeEventListener('pointerup', handleUnlock)
      window.removeEventListener('touchstart', handleUnlock)
      window.removeEventListener('touchend', handleUnlock)
      window.removeEventListener('click', handleUnlock)
      window.removeEventListener('keydown', handleUnlock)
      document.removeEventListener('visibilitychange', handleUnlock)
    }
  }, [])

  // Determine if it's "your" turn based on game mode
  const isPlayerTurn = state.currentPlayer === 1
  const isLocalPlayerTurn = state.gameMode === 'online' 
    ? state.currentPlayer === state.localPlayer
    : state.gameMode === 'vs-player'
      ? true  // Hotseat: always "local" since both players share the device
      : isPlayerTurn

  const getActingPlayer = (): CurrentPlayer => {
    if (state.gameMode === 'online') return state.localPlayer ?? 1
    if (state.gameMode === 'vs-player') return state.currentPlayer
    return 1
  }
  
  // In PvP/online mode, ignore AI-thinking lock entirely.
  // This prevents stale AI flags from blocking input after turn changes.
  const aiLockActive = state.gameMode === 'vs-ai' && isAIThinking
  const canAct = state.phase === 'Main' && !aiLockActive && state.cardsPlayedThisTurn < 3 && isLocalPlayerTurn

  useEffect(() => {
    const boardCardCount = state.lanes.reduce(
      (total, lane) => total + lane.player1.cards.length + lane.player2.cards.length,
      0,
    )

    if (previousBoardCardCountRef.current === null) {
      previousBoardCardCountRef.current = boardCardCount
      return
    }

    if (state.phase === 'Main' && boardCardCount > previousBoardCardCountRef.current) {
      playSfx('playCard')
    }

    previousBoardCardCountRef.current = boardCardCount
  }, [state.lanes, state.phase])

  // Fly a spark from a freshly-played card to the ability icon it charged.
  useEffect(() => {
    const currentCards = new Map<string, { laneId: LaneId; owner: CurrentPlayer }>()
    for (const lane of state.lanes) {
      for (const card of lane.player1.cards) currentCards.set(card.id, { laneId: lane.id, owner: 1 })
      for (const card of lane.player2.cards) currentCards.set(card.id, { laneId: lane.id, owner: 2 })
    }

    const previous = previousBoardCardsRef.current
    previousBoardCardsRef.current = currentCards

    if (previous === null || state.phase !== 'Main') return

    const newlyPlayed: { cardId: string; laneId: LaneId; owner: CurrentPlayer }[] = []
    currentCards.forEach((info, cardId) => {
      if (!previous.has(cardId)) newlyPlayed.push({ cardId, laneId: info.laneId, owner: info.owner })
    })
    if (newlyPlayed.length === 0) return

    // On mobile the gesture that plays a card can bleed into a tap on the
    // freshly-placed card, which would select/enlarge it. Make newly played
    // cards non-interactive for a brief window so that stray tap is ignored.
    for (const { cardId, laneId } of newlyPlayed) {
      const el = document.querySelector(
        `[data-lane-id="${laneId}"] [data-card-id="${cardId}"]`,
      ) as HTMLElement | null
      if (!el) continue
      el.style.pointerEvents = 'none'
      window.setTimeout(() => {
        el.style.pointerEvents = ''
      }, 550)
    }

    const isOnlineGuest = state.gameMode === 'online' && state.localPlayer === 2
    const isHotseatP2Turn = state.gameMode === 'vs-player' && state.currentPlayer === 2
    const localPlayerNumber: CurrentPlayer = isOnlineGuest || isHotseatP2Turn ? 2 : 1

    for (const { cardId, laneId, owner } of newlyPlayed) {
      const lane = state.lanes.find(l => l.id === laneId)
      const side = owner === 1 ? lane?.player1 : lane?.player2
      const card = side?.cards.find(c => c.id === cardId)
      if (!card) continue
      const ownerSuit = owner === 1 ? state.player1Suit : state.player2Suit
      const ability = stackAbilityForPlayedCard(card, ownerSuit)
      if (!ability) continue
      const position = owner === localPlayerNumber ? 'player' : 'opponent'
      // Defer one frame so the new card has settled into its final layout.
      requestAnimationFrame(() => {
        const cardEl = document.querySelector(`[data-lane-id="${laneId}"] [data-card-id="${cardId}"]`)
        const iconEl = document.querySelector(`[data-fx="${position}-${ability}"]`)
        flySpark(cardEl, iconEl)
      })
    }
  }, [state.lanes, state.phase, state.player1Suit, state.player2Suit, state.gameMode, state.localPlayer, state.currentPlayer])
  
  // Debug logging for online mode - log on every render when in Main phase
  useEffect(() => {
    if (state.gameMode === 'online' && state.phase === 'Main') {
      console.log(`[canAct Debug] phase=${state.phase}, currentPlayer=${state.currentPlayer}, localPlayer=${state.localPlayer}, cardsPlayed=${state.cardsPlayedThisTurn}, isLocalPlayerTurn=${isLocalPlayerTurn}, canAct=${canAct}, aiLockActive=${aiLockActive}, isAIThinking=${isAIThinking}`);
    }
  }, [state.gameMode, state.phase, state.currentPlayer, state.localPlayer, state.cardsPlayedThisTurn, isLocalPlayerTurn, canAct, aiLockActive, isAIThinking]);

  // Defensive cleanup: if we are not in AI mode, never keep AI-lock state around.
  useEffect(() => {
    if (state.gameMode !== 'vs-ai' && (isAIThinking || aiExecutingRef.current)) {
      setIsAIThinking(false)
      aiExecutingRef.current = false
    }
  }, [state.gameMode, isAIThinking])

  // Clear stale selection/drag state when turn or phase changes.
  useEffect(() => {
    setSelectedCardId(null)
    setDraggingCardId(null)
    setShowDragGhost(false)
    draggingCardRef.current = null
    setBoardSelectionMode(null)
    setMoveSourceLane(null)
    setSelectedRelicCard(null)
    setMinionMenuMode(null)
    setSelectedMinionCardId(null)
  }, [state.currentPlayer, state.phase])

  // v2 Effect Choice Handlers
  const handleClubsReplace = (handCardId: string, replacementRank: 'J' | 'Q' | 'K') => {
    const action = { type: 'EFFECT_CHOICE_CLUBS_REPLACE' as const, handCardId, replacementRank }
    dispatch(action)
    sendNetworkAction(action)
  }

  const handleClubsMove = (cardId: string, fromLane: LaneId, toLane: LaneId) => {
    const action = { type: 'EFFECT_CHOICE_CLUBS_MOVE' as const, cardId, fromLane, toLane }
    dispatch(action)
    sendNetworkAction(action)
  }

  const handleClubsNeutralize = (laneId: LaneId) => {
    const action = { type: 'EFFECT_CHOICE_CLUBS_NEUTRALIZE' as const, laneId }
    dispatch(action)
    sendNetworkAction(action)
  }

  const handleClubsQueenDelay = (targetLaneId: LaneId) => {
    const action = { type: 'EFFECT_CHOICE_CLUBS_QUEEN_DELAY' as const, targetLaneId }
    dispatch(action)
    sendNetworkAction(action)
  }

  const handleDiamondsAce = (choice: 'charges' | 'chargePower') => {
    const action = { type: 'EFFECT_CHOICE_DIAMONDS_ACE' as const, choice }
    dispatch(action)
    sendNetworkAction(action)
  }

  const handleDiamondsQueen = (choice: 'damage' | 'heal') => {
    const action = { type: 'EFFECT_CHOICE_DIAMONDS_QUEEN' as const, choice }
    dispatch(action)
    sendNetworkAction(action)
  }

  // v2.2 new handlers
  const handleSpadesAce = (choice: 'bloodDebt' | 'bleed') => {
    const action = { type: 'EFFECT_CHOICE_SPADES_ACE' as const, choice }
    dispatch(action)
    sendNetworkAction(action)
  }

  const handleClubsMidReplace = (handCardId: string) => {
    const action = { type: 'EFFECT_CHOICE_CLUBS_MID_REPLACE' as const, handCardId }
    dispatch(action)
    sendNetworkAction(action)
  }

  const handleSpendCharge = (choice: 'damage' | 'heal') => {
    const action = { type: 'SPEND_DIAMOND_CHARGE' as const, choice }
    dispatch(action)
    sendNetworkAction(action)
  }

  const cancelBoardSelection = () => {
    setBoardSelectionMode(null)
    setMoveSourceLane(null)
    setSelectedRelicCard(null)
  }

  const canUseRelic = (relic: RelicType): boolean => {
    if (state.phase !== 'Main' || !isLocalPlayerTurn || aiLockActive) return false
    const player = getActingPlayer()
    if (state.gameMode === 'vs-ai' && player !== 1) return false
    const playerState = player === 1 ? state.player1 : state.player2
    const playerSuit = player === 1 ? state.player1Suit : state.player2Suit
    if (relic === 'skull' && playerSuit === 'spades' && playerState.hand.length === 0) return false
    if (relic === 'skull' && playerSuit === 'hearts' && (playerState.hand.length === 0 || state.outOfPlayPile.length === 0)) return false
    return playerState.relicStacks[relic] >= 3
  }

  const canUseMinion = (): boolean => {
    if (state.phase !== 'Main' || aiLockActive || boardSelectionMode || minionMenuMode) return false
    const player = getActingPlayer()
    if (state.gameMode === 'vs-ai' && player !== 1) return false
    const playerState = player === 1 ? state.player1 : state.player2
    const playerSuit = player === 1 ? state.player1Suit : state.player2Suit
    if (playerSuit === 'spades') {
      return !isLocalPlayerTurn &&
        playerState.minionStacks >= 3 &&
        (player === 1 ? state.player1Deck.length : state.player2Deck.length) > 0 &&
        playerState.lastEndTurnDrawCardIds.length === 3 &&
        playerState.lastEndTurnDrawCardIds.every(cardId => playerState.hand.some(card => card.id === cardId))
    }
    return isLocalPlayerTurn && playerState.minionStacks >= 3
  }

  const canUseAvatarSupport = (): boolean => {
    if (state.phase !== 'Main' || !isLocalPlayerTurn || aiLockActive || boardSelectionMode || minionMenuMode) return false
    const player = getActingPlayer()
    if (state.gameMode === 'vs-ai' && player !== 1) return false
    return player === 1 ? state.player1SupportAvailable : state.player2SupportAvailable
  }

  // Start the short End-Turn lockout after an ability is used.
  const startAbilityEndTurnCooldown = () => {
    setAbilityEndTurnCooldown(true)
    if (abilityCooldownTimeoutRef.current !== null) {
      window.clearTimeout(abilityCooldownTimeoutRef.current)
    }
    abilityCooldownTimeoutRef.current = window.setTimeout(() => {
      setAbilityEndTurnCooldown(false)
      abilityCooldownTimeoutRef.current = null
    }, 500)
  }

  // Play the ability-use sound + icon pulse at the moment an ability actually
  // resolves (after any required decision), rather than when its menu opens.
  const playAbilityUsed = (ability: 'minion' | 'sword' | 'shield' | 'skull') => {
    playSfx('abilityUse')
    pulse(document.querySelector(`[data-fx="player-${ability}"]`))
    startAbilityEndTurnCooldown()
  }

  const handleAvatarSupportClick = () => {
    if (!canUseAvatarSupport()) return
    pulse(document.querySelector('[data-fx="player-avatar"]'))
    startAbilityEndTurnCooldown()
    const action = { type: 'USE_SUPPORT' as const, player: getActingPlayer() }
    dispatch(action)
    sendNetworkAction(action)
  }

  const closeMinionMenu = () => {
    setMinionMenuMode(null)
    setSelectedMinionCardId(null)
  }

  const handleMinionClick = () => {
    if (!canUseMinion()) return
    const player = getActingPlayer()
    const playerState = player === 1 ? state.player1 : state.player2
    const playerSuit = player === 1 ? state.player1Suit : state.player2Suit
    if (!playerSuit || playerState.hand.length === 0) return

    setSelectedCardId(null)
    setDraggingCardId(null)
    closeMinionMenu()

    if (playerSuit === 'spades') {
      // Spades reroll is instant (no decision), so play the feedback now.
      // v8 Split Deck: the reroll shuffles the returned cards back into the
      // acting player's OWN deck and redraws from it, keeping the split even.
      const cardIds = playerState.lastEndTurnDrawCardIds
      const returnedCards = cardIds
        .map(cardId => playerState.hand.find(card => card.id === cardId))
        .filter((card): card is Card => Boolean(card))
      const playerDeckCards = player === 1 ? state.player1Deck : state.player2Deck
      if (returnedCards.length !== 3 || playerDeckCards.length === 0) return
      const rerollDeck = shuffle([...playerDeckCards, ...returnedCards])
      const newCards = rerollDeck.slice(0, 3)
      const playerDeck = rerollDeck.slice(3)
      playAbilityUsed('minion')
      const action = { type: 'USE_MINION_SPADES_REROLL' as const, player, cardIds, newCards, playerDeck }
      dispatch(action)
      sendNetworkAction(action)
      return
    }

    if (playerSuit === 'hearts') {
      setMinionMenuMode('hearts-minion-choice')
      return
    }

    if (playerSuit === 'clubs') {
      setMinionMenuMode('clubs-card')
      return
    }

    const rankableCards = playerState.hand.filter(card => card.rank !== 'JOKER')
    if (rankableCards.length > 0) {
      setMinionMenuMode('diamonds-card')
    }
  }

  const handleMinionClubsCardSelect = (cardId: string) => {
    setSelectedMinionCardId(cardId)
    setMinionMenuMode('clubs-suit')
  }

  const handleMinionSuitSelect = (suit: StandardSuit) => {
    if (!selectedMinionCardId) return
    playAbilityUsed('minion')
    const action = { type: 'USE_MINION_CLUBS_CHANGE_SUIT' as const, player: getActingPlayer(), cardId: selectedMinionCardId, suit }
    dispatch(action)
    sendNetworkAction(action)
    closeMinionMenu()
  }

  const handleMinionDiamondsCardSelect = (cardId: string) => {
    playAbilityUsed('minion')
    const action = { type: 'USE_MINION_DIAMONDS_RANK_UP' as const, player: getActingPlayer(), cardId }
    dispatch(action)
    sendNetworkAction(action)
    closeMinionMenu()
  }

  const handleSpadesSkullCardSelect = (card: Card) => {
    const randomRanks: Rank[] = [...STANDARD_RANKS, 'JOKER']
    const replacement: Card = {
      ...card,
      suit: STANDARD_SUITS[Math.floor(Math.random() * STANDARD_SUITS.length)],
      rank: randomRanks[Math.floor(Math.random() * randomRanks.length)],
    }
    playAbilityUsed('skull')
    const action = { type: 'USE_RELIC_SPADES_SKULL_RANDOMIZE' as const, player: getActingPlayer(), cardId: card.id, replacement }
    dispatch(action)
    sendNetworkAction(action)
    closeMinionMenu()
  }

  const handleHeartsMinionRelicSelect = (relic: 'sword' | 'shield') => {
    playAbilityUsed('minion')
    const action = { type: 'USE_MINION_HEARTS_RELIC_STACKS' as const, player: getActingPlayer(), relic }
    dispatch(action)
    sendNetworkAction(action)
    closeMinionMenu()
  }

  const handleHeartsSkullCardSelect = (card: Card) => {
    if (state.outOfPlayPile.length === 0) return
    const sourceDiscardCard = state.outOfPlayPile[Math.floor(Math.random() * state.outOfPlayPile.length)]
    playAbilityUsed('skull')
    const action = {
      type: 'USE_RELIC_HEARTS_SKULL_FROM_DISCARD' as const,
      player: getActingPlayer(),
      cardId: card.id,
      sourceDiscardCardId: sourceDiscardCard.id,
    }
    dispatch(action)
    sendNetworkAction(action)
    closeMinionMenu()
  }

  const handleRelicClick = (relic: RelicType) => {
    if (!canUseRelic(relic)) return
    setSelectedCardId(null)
    setDraggingCardId(null)
    setSelectedRelicCard(null)
    setMoveSourceLane(null)
    const player = getActingPlayer()
    const playerSuit = player === 1 ? state.player1Suit : state.player2Suit
    if (relic === 'skull' && (playerSuit === 'spades' || playerSuit === 'hearts')) {
      setMinionMenuMode(playerSuit === 'spades' ? 'spades-skull-card' : 'hearts-skull-card')
      return
    }
    if (relic === 'shield') {
      setBoardSelectionMode('relic-shield-lane')
    } else if (relic === 'sword') {
      setBoardSelectionMode('relic-sword-lane')
    } else {
      setBoardSelectionMode('relic-skull-card')
    }
  }

  const handleRelicCardSelect = (card: Card, fromLane: LaneId) => {
    if (boardSelectionMode !== 'relic-skull-card') return
    const player = getActingPlayer()
    const lane = state.lanes.find(l => l.id === fromLane)
    if (!lane) return
    const ownCards = player === 1 ? lane.player1.cards : lane.player2.cards
    if (!ownCards.some(c => c.id === card.id)) return

    setSelectedRelicCard({ cardId: card.id, fromLane })
    setBoardSelectionMode('relic-skull-target')
  }

  const handleDismissEffectChoice = () => {
    const action = { type: 'DISMISS_EFFECT_CHOICE' as const }
    dispatch(action)
    sendNetworkAction(action)
    // Also clear any board selection mode
    setBoardSelectionMode(null)
    setMoveSourceLane(null)
  }

  // Enter board selection modes for Clubs effects
  const handleEnterMoveMode = () => {
    setBoardSelectionMode('move-source')
  }
  
  const handleEnterNeutralizeMode = () => {
    setBoardSelectionMode('neutralize')
  }
  
  // Handle board selection clicks
  const handleBoardSelectionClick = (laneId: LaneId) => {
    if (boardSelectionMode === 'relic-shield-lane') {
      const player = getActingPlayer()
      playAbilityUsed('shield')
      const action = { type: 'USE_RELIC_SHIELD' as const, player, laneId }
      dispatch(action)
      sendNetworkAction(action)
      cancelBoardSelection()
      return
    }

    if (boardSelectionMode === 'relic-sword-lane') {
      const player = getActingPlayer()
      playAbilityUsed('sword')
      const action = { type: 'USE_RELIC_SWORD' as const, player, laneId }
      dispatch(action)
      sendNetworkAction(action)
      cancelBoardSelection()
      return
    }

    if (boardSelectionMode === 'relic-skull-target' && selectedRelicCard) {
      if (laneId === selectedRelicCard.fromLane) return

      const player = getActingPlayer()
      const lane = state.lanes.find(l => l.id === laneId)
      if (!lane) return
      const ownTargetCards = player === 1 ? lane.player1.cards : lane.player2.cards
      if (ownTargetCards.length >= 3) return

      playAbilityUsed('skull')
      const action = {
        type: 'USE_RELIC_SKULL' as const,
        player,
        cardId: selectedRelicCard.cardId,
        fromLane: selectedRelicCard.fromLane,
        toLane: laneId,
      }
      dispatch(action)
      sendNetworkAction(action)
      cancelBoardSelection()
      return
    }

    if (boardSelectionMode === 'neutralize') {
      // Neutralize this lane
      if (!state.neutralizedLanes[laneId]) {
        handleClubsNeutralize(laneId)
      }
      cancelBoardSelection()
      return
    }
    
    if (boardSelectionMode === 'move-source') {
      // Get opponent's side in this lane
      const choice = state.pendingEffectChoices[0]
      if (!choice) return
      
      const opponent = choice.player === 1 ? 2 : 1
      const lane = state.lanes.find(l => l.id === laneId)
      if (!lane) return
      
      const opponentCards = opponent === 1 ? lane.player1.cards : lane.player2.cards
      if (opponentCards.length === 0) return
      
      // Store the source lane and move to target selection
      setMoveSourceLane(laneId)
      setBoardSelectionMode('move-target')
      return
    }
    
    if (boardSelectionMode === 'move-target' && moveSourceLane) {
      // Can't move to same lane
      if (laneId === moveSourceLane) return
      
      // Get the top card from source lane
      const choice = state.pendingEffectChoices[0]
      if (!choice) return
      
      const opponent = choice.player === 1 ? 2 : 1
      const sourceLane = state.lanes.find(l => l.id === moveSourceLane)
      if (!sourceLane) return
      
      const opponentCards = opponent === 1 ? sourceLane.player1.cards : sourceLane.player2.cards
      if (opponentCards.length === 0) return
      
      // Get the top card (last in the array)
      const topCard = opponentCards[opponentCards.length - 1]
      
      // Execute the move
      handleClubsMove(topCard.id, moveSourceLane, laneId)
      cancelBoardSelection()
      return
    }
  }

  // Initialize game
  useEffect(() => {
    dispatch({ type: 'START_NEW_GAME' })
  }, [])

  // Track the last resolution timestamp to detect new resolutions
  const lastResolutionTimestampRef = useRef<number>(0)
  // Track if resolution overlay is showing (ref for synchronous checks)
  const isResolutionShowingRef = useRef<boolean>(false)
  
  // Detect lane resolution and show animation using reducer's lastLaneResolution
  useEffect(() => {
    const resolution = state.lastLaneResolution
    if (!resolution) return
    
    // Only trigger animation for new resolutions (check timestamp)
    if (resolution.timestamp <= lastResolutionTimestampRef.current) return
    lastResolutionTimestampRef.current = resolution.timestamp
    
    // Mark resolution as showing immediately (synchronous)
    isResolutionShowingRef.current = true
    playSfx('startLaneResolve')
    
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
      p1Cards: shouldFlipPerspective ? resolution.player2Cards ?? [] : resolution.player1Cards ?? [],
      p2Cards: shouldFlipPerspective ? resolution.player1Cards ?? [] : resolution.player2Cards ?? [],
      p1HandLabel: HAND_LABELS[shouldFlipPerspective ? resolution.player2HandType ?? 'high-card' : resolution.player1HandType ?? 'high-card'],
      p2HandLabel: HAND_LABELS[shouldFlipPerspective ? resolution.player1HandType ?? 'high-card' : resolution.player2HandType ?? 'high-card'],
      p1BaseDamage: shouldFlipPerspective ? resolution.player2BaseDamage ?? 0 : resolution.player1BaseDamage ?? 0,
      p2BaseDamage: shouldFlipPerspective ? resolution.player1BaseDamage ?? 0 : resolution.player2BaseDamage ?? 0,
      p1PokerBonus: shouldFlipPerspective ? resolution.player2PokerBonus ?? 0 : resolution.player1PokerBonus ?? 0,
      p2PokerBonus: shouldFlipPerspective ? resolution.player1PokerBonus ?? 0 : resolution.player2PokerBonus ?? 0,
    })
    
    // Store HP targets for animation during overlay
    const targetP1 = state.player1.hp
    const targetP2 = state.player2.hp
    
    // Start HP animation near the end of the longer reveal overlay.
    const hpAnimationTimeoutId = setTimeout(() => {
      if (targetP1 !== player1DisplayHP) {
        animateHP(1, player1DisplayHP, targetP1)
      }
      if (targetP2 !== player2DisplayHP) {
        animateHP(2, player2DisplayHP, targetP2)
      }
    }, 4600)
    
    // Clear animation after 5 seconds.
    const overlayTimeoutId = setTimeout(() => {
      playSfx('endLaneResolve')
      isResolutionShowingRef.current = false
      setResolutionAnimation(null)
      setLaneResolveEndTurnCooldown(true)
      if (laneResolveCooldownTimeoutRef.current !== null) {
        window.clearTimeout(laneResolveCooldownTimeoutRef.current)
      }
      laneResolveCooldownTimeoutRef.current = window.setTimeout(() => {
        setLaneResolveEndTurnCooldown(false)
        laneResolveCooldownTimeoutRef.current = null
      }, 1000)
    }, 5200)
    
    return () => {
      clearTimeout(hpAnimationTimeoutId)
      clearTimeout(overlayTimeoutId)
    }
  }, [state.lastLaneResolution, state.gameMode, state.localPlayer, state.currentPlayer])
  
  // Handle HP changes that happen OUTSIDE of lane resolution (e.g., support ability, discard damage)
  // These should animate immediately
  useEffect(() => {
    // Skip if resolution overlay is showing - that's handled separately
    if (isResolutionShowingRef.current || resolutionAnimation) return
    
    const p1Changed = state.player1.hp !== player1DisplayHP
    const p2Changed = state.player2.hp !== player2DisplayHP
    
    if (!p1Changed && !p2Changed) return
    
    // No overlay - animate immediately (for support ability, self-damage from discard, etc.)
    if (p1Changed) {
      animateHP(1, player1DisplayHP, state.player1.hp)
    }
    
    if (p2Changed) {
      animateHP(2, player2DisplayHP, state.player2.hp)
    }
  }, [state.player1.hp, state.player2.hp])
  
  // Helper function to animate HP change (both damage and healing) with flash effect
  const animateHP = (player: 1 | 2, startHP: number, targetHP: number) => {
    const frameKey = player === 1 ? 'player1' : 'player2'
    if (hpAnimationFrameRefs.current[frameKey] !== null) {
      cancelAnimationFrame(hpAnimationFrameRefs.current[frameKey]!)
      hpAnimationFrameRefs.current[frameKey] = null
    }

    const isHealing = targetHP > startHP
    
    // Set the appropriate animation state
    if (player === 1) {
      if (isHealing) {
        setPlayer1Healing(true)
      } else {
        setPlayer1TakingDamage(true)
      }
    } else {
      if (isHealing) {
        setPlayer2Healing(true)
      } else {
        setPlayer2TakingDamage(true)
      }
    }
    
    const duration = 2000
    const startTime = Date.now()
    
    const animate = () => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      // Works for both increase and decrease
      const currentHP = Math.round(startHP + (targetHP - startHP) * progress)
      
      if (player === 1) {
        setPlayer1DisplayHP(currentHP)
      } else {
        setPlayer2DisplayHP(currentHP)
      }
      
      if (progress < 1) {
        hpAnimationFrameRefs.current[frameKey] = requestAnimationFrame(animate)
      } else {
        hpAnimationFrameRefs.current[frameKey] = null
        // Clear the animation state
        if (player === 1) {
          setPlayer1TakingDamage(false)
          setPlayer1Healing(false)
        } else {
          setPlayer2TakingDamage(false)
          setPlayer2Healing(false)
        }
      }
    }
    hpAnimationFrameRefs.current[frameKey] = requestAnimationFrame(animate)
  }

  useEffect(() => {
    return () => {
      if (hpAnimationFrameRefs.current.player1 !== null) {
        cancelAnimationFrame(hpAnimationFrameRefs.current.player1)
      }
      if (hpAnimationFrameRefs.current.player2 !== null) {
        cancelAnimationFrame(hpAnimationFrameRefs.current.player2)
      }
      if (laneResolveCooldownTimeoutRef.current !== null) {
        window.clearTimeout(laneResolveCooldownTimeoutRef.current)
      }
    }
  }, [])

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
      playSfx('warFlip', { loop: true, volume: 0.5 })
      
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
        stopSfx('warFlip')
        if (state.gameMode === 'online' && !state.isHost) return
        const action = { type: 'CONTINUE_FROM_FLIP' as const }
        dispatch(action)
        if (state.gameMode === 'online' && Network.isConnected()) {
          Network.sendAction({ type: 'GAME_ACTION', action })
          dispatch({ type: 'SET_ONLINE_SEQUENCE', sequence: Network.getOutgoingSequence() })
        }
      }, 4000)

      return () => {
        clearTimeout(timer1)
        clearTimeout(timer2)
        clearTimeout(timer3)
        stopSfx('warFlip')
      }
    }
  }, [state.phase, state.gameMode, state.isHost])

  // AI Turn Handler
  const executeAI = useCallback(async () => {
    if (aiExecutingRef.current) return
    if (state.currentPlayer !== 2 || state.phase !== 'Main') return
    
    aiExecutingRef.current = true
    setIsAIThinking(true)
    
    try {
      await new Promise(r => setTimeout(r, 800))
      const moves = executeAITurn(state)
      
      for (const move of moves) {
        await new Promise(r => setTimeout(r, 400))
        if (move.type === 'lane' && move.laneId) {
          dispatch({ type: 'PLAY_CARD_TO_LANE', cardId: move.cardId, laneId: move.laneId })
        }
        // v4 Shared Deck: AI no longer emits discard moves. Any non-lane move is a no-op.
      }
      
      await new Promise(r => setTimeout(r, 300))
      dispatch({ type: 'END_TURN' })
    } finally {
      // Always reset flags, even if there was an error
      setIsAIThinking(false)
      aiExecutingRef.current = false
    }
  }, [state])

  // Trigger AI turn (only in vs-ai mode)
  useEffect(() => {
    if (state.gameMode === 'vs-ai' && state.phase === 'Main' && state.currentPlayer === 2 && !isAIThinking && !aiExecutingRef.current) {
      executeAI()
    }
  }, [state.gameMode, state.phase, state.currentPlayer, isAIThinking, executeAI])

  // v2: Handle AI effect choices automatically
  useEffect(() => {
    if (state.gameMode !== 'vs-ai') return
    if (state.pendingEffectChoices.length === 0) return
    
    const choice = state.pendingEffectChoices[0]
    if (choice.player !== 2) return // Only handle AI's choices
    
    // Small delay before AI makes choice
    const timeoutId = setTimeout(() => {
      const aiAction = getAIEffectChoice(state)
      if (aiAction) {
        dispatch(aiAction)
      }
    }, 500)
    
    return () => clearTimeout(timeoutId)
  }, [state.gameMode, state.pendingEffectChoices])

  // v7 Cycling Lane Flow: end-of-round sequential resolution.
  //
  // We enter EndOfRoundResolving the moment both players' hands are empty.
  // The reducer seeds `pendingRoundEndLanes` with every lane that still has
  // cards on the board. The UI is responsible for pacing:
  //
  //   1. While the queue still has lanes, wait for the previous lane's
  //      resolution overlay to finish (~5000ms), then dispatch
  //      RESOLVE_NEXT_END_OF_ROUND_LANE - the reducer pops the next lane and
  //      runs resolveLane on it, which writes a fresh `lastLaneResolution`
  //      and triggers the overlay animation.
  //   2. Once the queue is empty, wait one more animation cycle for the last
  //      lane to finish playing, then dispatch FINALIZE_ROUND_END to start
  //      the next round (War Flip / fresh deal).
  //
  // RESOLVE_NEXT_END_OF_ROUND_LANE is fully deterministic, so both clients
  // can dispatch it locally in online mode and stay in sync. FINALIZE_ROUND_END
  // calls startNewRound which shuffles - that one is host-only; the guest
  // picks up the resulting state via the existing FLIP_RESULT_SYNC pipeline
  // once the host transitions into InitialFlipResult.
  useEffect(() => {
    if (state.phase !== 'EndOfRoundResolving') return
    if (state.gameMode === 'online' && !state.isHost) return

    const ROUND_END_DELAY_MS = 5400

    if (state.pendingRoundEndLanes.length > 0) {
      const timeoutId = setTimeout(() => {
        const action = { type: 'RESOLVE_NEXT_END_OF_ROUND_LANE' as const }
        dispatch(action)
        if (state.gameMode === 'online' && Network.isConnected()) {
          Network.sendAction({ type: 'GAME_ACTION', action })
          dispatch({ type: 'SET_ONLINE_SEQUENCE', sequence: Network.getOutgoingSequence() })
        }
      }, ROUND_END_DELAY_MS)
      return () => clearTimeout(timeoutId)
    }

    const timeoutId = setTimeout(() => {
      const action = { type: 'FINALIZE_ROUND_END' as const }
      dispatch(action)
      if (state.gameMode === 'online' && Network.isConnected()) {
        Network.sendAction({ type: 'GAME_ACTION', action })
        dispatch({ type: 'SET_ONLINE_SEQUENCE', sequence: Network.getOutgoingSequence() })
      }
    }, ROUND_END_DELAY_MS)
    return () => clearTimeout(timeoutId)
  }, [state.phase, state.pendingRoundEndLanes.length, state.gameMode, state.isHost])

  // Network action handler for online mode
  const handleNetworkAction = useCallback((action: any) => {
    console.log('[GameBoard] Received network action:', action.type, action.action?.type)

    // The host tracks the highest sequence it has seen from the guest. Delivery
    // is ordered (out-of-order/gapped messages are filtered upstream), so by the
    // time we process sequence N we have processed every guest message up to N.
    // This value is echoed back inside authoritative snapshots as `ackSeq`.
    if (stateRef.current.isHost && typeof action.sequence === 'number') {
      lastReceivedRemoteSeqRef.current = Math.max(lastReceivedRemoteSeqRef.current, action.sequence)
    }

    if (action.type === 'SNAPSHOT_REQUESTED') {
      const latestState = stateRef.current
      if (latestState.isHost && latestState.onlineMatchId) {
        Matches.persistSnapshot(latestState.onlineMatchId, latestState, latestState.onlineLastSequence)
        Network.sendAction({ type: 'STATE_SYNC', state: latestState, reason: action.reason })
      }
      return
    }

    if (action.type === 'REQUEST_SNAPSHOT') {
      const latestState = stateRef.current
      if (latestState.isHost) {
        Network.sendAction({ type: 'STATE_SYNC', state: latestState, reason: action.reason ?? 'requested' })
      }
      return
    }
    
    // Handle incoming game actions from opponent
    if (action.type === 'GAME_ACTION') {
      const gameAction = action.action;
      const normalizedGameAction = gameAction.type === 'END_TURN' && !gameAction.player && action.senderSlot
        ? { ...gameAction, player: action.senderSlot as CurrentPlayer }
        : gameAction;
      
      // Mark all game actions as fromNetwork for proper handling
      const actionWithFlag = { ...normalizedGameAction, fromNetwork: true };
      dispatch(actionWithFlag);
      
      // Show "Your Turn" popup when opponent ends turn
      if (normalizedGameAction.type === 'END_TURN') {
        console.log('[Network] Opponent ended turn - should be our turn now');
        playSfx('playersTurnToPlay')
        setShowYourTurn(true)
        setTimeout(() => setShowYourTurn(false), 1500)

        // Self-heal: if the turn handoff didn't actually take effect here (the
        // reducer dropped it because of a transient phase/currentPlayer
        // mismatch), both clients can end up locked out. Detect that and
        // re-sync from the host's authoritative state.
        const endingPlayer = normalizedGameAction.player as CurrentPlayer | undefined
        if (endingPlayer) {
          const expectedCurrentPlayer: CurrentPlayer = endingPlayer === 1 ? 2 : 1
          setTimeout(() => {
            const latest = stateRef.current
            if (
              latest.gameMode === 'online' &&
              latest.phase === 'Main' &&
              latest.currentPlayer !== expectedCurrentPlayer
            ) {
              console.warn('[Network] END_TURN did not advance the turn here - re-syncing to recover')
              if (latest.isHost) {
                Network.sendAction({ type: 'STATE_SYNC', state: latest, reason: 'end-turn-desync-host' })
              } else {
                Network.sendAction({ type: 'REQUEST_SNAPSHOT', reason: 'end-turn-desync-guest' })
              }
            }
          }, 600)
        }
      }
    }
    
    // Handle suit selection from opponent
    if (action.type === 'SUIT_SELECTED') {
      dispatch({ type: 'OPPONENT_SUIT_SELECTED', suit: action.suit })
    }
    
    // Handle state sync from the authoritative host.
    if (action.type === 'STATE_SYNC') {
      // Recovery snapshots (sequence gaps, explicit requests, desync heals)
      // carry a `reason` and must always be adopted. Routine authoritative
      // snapshots are ack-gated: if the host has not yet applied our latest
      // in-flight action (ackSeq < our pending sequence), adopting now would
      // briefly revert our own optimistic move, so we skip it and wait for the
      // next snapshot (the host broadcasts again right after applying it).
      const isRecovery = typeof action.reason === 'string' && action.reason.length > 0
      const ackSeq: number | undefined = typeof action.ackSeq === 'number' ? action.ackSeq : undefined
      const guestHasUnackedAction =
        !stateRef.current.isHost &&
        ackSeq !== undefined &&
        ackSeq < pendingLocalSeqRef.current

      if (!isRecovery && guestHasUnackedAction) {
        console.log('[Network] Holding authoritative snapshot until host acks our action', {
          ackSeq,
          pending: pendingLocalSeqRef.current,
        })
        // Safety net: if the host's state stops changing while we're holding
        // (e.g. it rejected our action and won't re-broadcast), ask for an
        // authoritative snapshot so we can never get stuck.
        if (holdRecoveryTimerRef.current === null) {
          holdRecoveryTimerRef.current = window.setTimeout(() => {
            holdRecoveryTimerRef.current = null
            if (!stateRef.current.isHost && Network.isConnected()) {
              Network.sendAction({ type: 'REQUEST_SNAPSHOT', reason: 'guest-hold-timeout' })
            }
          }, 800)
        }
      } else {
        if (holdRecoveryTimerRef.current !== null) {
          window.clearTimeout(holdRecoveryTimerRef.current)
          holdRecoveryTimerRef.current = null
        }
        dispatch({ type: 'SYNC_STATE', state: action.state })
        if (typeof action.sequence === 'number') {
          dispatch({ type: 'SET_ONLINE_SEQUENCE', sequence: action.sequence })
        }
      }
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
      Network.onPresence((presenceState) => {
        const entries = Object.values((presenceState || {}) as Record<string, unknown[]>).flat()
        if (entries.length >= 2) {
          setOpponentDisconnected(false)
          dispatch({ type: 'SET_ONLINE_CONNECTION_STATUS', status: 'connected' })
        }
      })
    }
    return () => {
      // Cleanup handled by disconnect
    }
  }, [state.gameMode, handleNetworkAction])

  useEffect(() => {
    if (
      state.gameMode !== 'online' ||
      !state.isHost ||
      !state.onlineMatchId ||
      state.onlineConnectionStatus === 'offline'
    ) {
      return
    }

    const timeoutId = setTimeout(() => {
      Matches.persistSnapshot(state.onlineMatchId, state, state.onlineLastSequence)
    }, 250)

    return () => clearTimeout(timeoutId)
  }, [state])

  // Host-authoritative reconciliation.
  //
  // The host is the single source of truth. After any change to the live game
  // state it pushes its full state to the guest, which reconciles to it. This
  // is what keeps the two clients in sync despite non-deterministic reducer
  // steps (e.g. effect handlers that mint card ids with Date.now()) and any
  // dropped/garbled/late action: drift self-corrects within one debounce, and
  // the End-Turn handoff can never leave a client stuck because the guest's
  // currentPlayer is continuously realigned to the host's.
  //
  // Scoped to the Main phase on purpose. Deck reshuffles happen in
  // startNewRound and are already host-authoritative (the guest receives the
  // fresh deck via the FLIP_RESULT_SYNC pipeline each round). The animated
  // flip / end-of-round resolution flows dedupe on Date.now() timestamps, so
  // re-broadcasting full state there would replay their overlays - we leave
  // those to their existing dedicated sync paths.
  useEffect(() => {
    if (state.gameMode !== 'online' || !state.isHost) return
    if (state.phase !== 'Main') return
    if (!Network.isConnected()) return

    if (authoritativeBroadcastTimerRef.current !== null) {
      window.clearTimeout(authoritativeBroadcastTimerRef.current)
    }
    // Debounce so a burst of state changes coalesces into one snapshot built
    // from the final state.
    authoritativeBroadcastTimerRef.current = window.setTimeout(() => {
      authoritativeBroadcastTimerRef.current = null
      if (!Network.isConnected()) return
      const latest = stateRef.current
      if (latest.gameMode !== 'online' || !latest.isHost || latest.phase !== 'Main') return

      // Skip the broadcast when nothing meaningful changed. We still broadcast
      // whenever the ack advanced (the guest may be holding an optimistic move
      // and needs the updated ack to release it), even if state looks identical.
      const ackSeq = lastReceivedRemoteSeqRef.current
      const signature = JSON.stringify(latest)
      if (
        signature === lastBroadcastSignatureRef.current &&
        ackSeq === lastBroadcastAckRef.current
      ) {
        return
      }
      lastBroadcastSignatureRef.current = signature
      lastBroadcastAckRef.current = ackSeq

      Network.sendAction({
        type: 'STATE_SYNC',
        state: latest,
        ackSeq,
      })
    }, 120)

    return () => {
      if (authoritativeBroadcastTimerRef.current !== null) {
        window.clearTimeout(authoritativeBroadcastTimerRef.current)
        authoritativeBroadcastTimerRef.current = null
      }
    }
  }, [state])

  useEffect(() => {
    if (
      state.gameMode !== 'online' ||
      !state.isHost ||
      !state.roomCode ||
      !state.onlineSessionToken ||
      state.phase !== 'WaitingForPlayer'
    ) {
      return
    }

    const roomCode = state.roomCode
    const sessionToken = state.onlineSessionToken
    const intervalId = setInterval(() => {
      Matches.heartbeatLobby(roomCode, sessionToken)
    }, 20_000)

    Matches.heartbeatLobby(roomCode, sessionToken)
    return () => clearInterval(intervalId)
  }, [state.gameMode, state.isHost, state.roomCode, state.onlineSessionToken, state.phase])

  useEffect(() => {
    if (state.gameMode !== 'online' || !state.onlineMatchId || !state.onlineSessionToken || !state.localPlayer) {
      return
    }

    const session: Matches.OnlineSession = {
      matchId: state.onlineMatchId,
      roomCode: state.roomCode ?? '',
      playerSlot: state.localPlayer,
      sessionToken: state.onlineSessionToken,
      isHost: state.isHost,
    }

    const markDisconnected = () => {
      Matches.markPlayerDisconnected(session)
    }

    const touch = () => {
      if (document.visibilityState === 'visible') {
        Matches.touchPlayer(session)
      } else {
        markDisconnected()
      }
    }

    window.addEventListener('pagehide', markDisconnected)
    window.addEventListener('beforeunload', markDisconnected)
    document.addEventListener('visibilitychange', touch)

    return () => {
      window.removeEventListener('pagehide', markDisconnected)
      window.removeEventListener('beforeunload', markDisconnected)
      document.removeEventListener('visibilitychange', touch)
    }
  }, [state.gameMode, state.onlineMatchId, state.onlineSessionToken, state.localPlayer, state.isHost, state.roomCode])

  // Send game actions over network in online mode
  const sendNetworkAction = useCallback((action: any) => {
    if (state.gameMode === 'online' && Network.isConnected()) {
      Network.sendAction({ type: 'GAME_ACTION', action })
      const seq = Network.getOutgoingSequence()
      dispatch({ type: 'SET_ONLINE_SEQUENCE', sequence: seq })
      // Guests: remember the sequence of our latest in-flight action so we can
      // hold off on adopting an authoritative snapshot until the host has
      // applied it (prevents our optimistic move from being reverted).
      if (!stateRef.current.isHost) {
        pendingLocalSeqRef.current = seq
      }
    }
  }, [state.gameMode])

  // Online room handlers
  const handleCreateRoom = async () => {
    setIsConnecting(true)
    setConnectionError(null)
    
    // Force cleanup any stale connections before creating
    Network.forceCleanup()
    Network.onAction(handleNetworkAction)
    
    try {
      const code = await Network.createRoom()
      dispatch({ type: 'SET_ROOM_CODE', code })
      dispatch({ type: 'GO_TO_CREATE_ROOM' })
      
      const session = await Matches.createMatchBackedLobby(code, 'Player 1', {
        ...stateRef.current,
        roomCode: code,
        gameMode: 'online',
        localPlayer: 1,
        isHost: true,
      })
      if (session) {
        dispatch({
          type: 'SET_ONLINE_SESSION',
          matchId: session.matchId,
          sessionToken: session.sessionToken,
          player: 1,
          isHost: true,
          roomCode: code,
        })
        Network.configureSession({
          matchId: session.matchId,
          playerSlot: 1,
          sessionToken: session.sessionToken,
          resetSequence: true,
        })
        Network.trackPresence()
        Matches.saveResumeMetadata(session)
      } else {
        // Register legacy lobby if the durable schema has not been installed yet.
        await Lobbies.createLobby(code, 'Player 1')
      }
      
      // When guest connects, move to suit selection
      Network.onConnection(() => {
        // Remove lobby from list since game is starting
        Matches.closeLobby(code, stateRef.current.onlineSessionToken)
        Lobbies.removeLobby(code)
        dispatch({ type: 'PLAYER_CONNECTED' })
        // Sync current state to guest
        const latestState = {
          ...stateRef.current,
          phase: 'SuitSelection' as const,
          gameMode: 'online' as const,
          isHost: false,
          localPlayer: 2 as CurrentPlayer,
        }
        Network.sendAction({
          type: 'STATE_SYNC',
          state: latestState,
          sequence: Network.getOutgoingSequence(),
        })
      })
      
      // Remove lobby on disconnect
      Network.onDisconnect(() => {
        setOpponentDisconnected(true)
        dispatch({ type: 'SET_ONLINE_CONNECTION_STATUS', status: 'opponent-disconnected' })
      })
    } catch (err: any) {
      setConnectionError(err.message || 'Failed to create room. Please try again.')
      console.error('[Network] Create room error:', err)
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
    
    // Force cleanup any stale connections before joining
    Network.forceCleanup()
    Network.onAction(handleNetworkAction)
    
    try {
      const cleanCode = roomCode.toUpperCase()
      const session = await Matches.joinMatchBackedLobby(cleanCode)
      if (session) {
        dispatch({
          type: 'SET_ONLINE_SESSION',
          matchId: session.matchId,
          sessionToken: session.sessionToken,
          player: 2,
          isHost: false,
          roomCode: cleanCode,
        })
        Network.configureSession({
          matchId: session.matchId,
          playerSlot: 2,
          sessionToken: session.sessionToken,
          resetSequence: true,
        })
        Matches.saveResumeMetadata(session)
      } else {
        const lobby = await Matches.getLobbyByRoomCode(cleanCode)
        if (lobby && !Matches.isLobbyFresh(lobby)) {
          throw new Error('That room has expired. Please ask the host to create a new room.')
        }
      }
      await Network.joinRoom(cleanCode)
      dispatch({ type: 'SET_ROOM_CODE', code: cleanCode })
      // Guest is player 2, transition handled by state sync from host
    } catch (err: any) {
      setConnectionError(err.message || 'Failed to join room. Check the code and try again.')
      console.error('[Network] Join room error:', err)
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
        dispatch({ type: 'SET_ONLINE_SEQUENCE', sequence: Network.getOutgoingSequence() })
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
    if (boardSelectionMode || minionMenuMode) return
    if (!canAct) return
    setSelectedCardId(prev => prev === cardId ? null : cardId)
  }

  const handleLaneClick = (laneId: LaneId) => {
    // Check if in board selection mode (for Clubs effects)
    if (boardSelectionMode) {
      handleBoardSelectionClick(laneId)
      return
    }
    
    // Normal card play logic
    if (!selectedCardId || !canAct) return
    if (!canPlayCardToLane(state, selectedCardId, laneId)) return
    const action = { type: 'PLAY_CARD_TO_LANE' as const, cardId: selectedCardId, laneId }
    dispatch(action)
    sendNetworkAction(action)
    setSelectedCardId(null)
  }

  const handleEndTurn = () => {
    // Only the current player can end their turn
    if (endTurnDisabled) return
    if (!canEndTurn(state)) return
    if (!isLocalPlayerTurn) return
    setSelectedCardId(null)
    const action = { type: 'END_TURN' as const, player: getActingPlayer() }
    dispatch(action)
    sendNetworkAction(action)
  }

  const handleSuddenDeath = () => {
    if (state.phase !== 'SuddenDeath') return
    if (state.gameMode === 'online' && !state.isHost) {
      Network.sendAction({ type: 'REQUEST_SNAPSHOT', reason: 'guest-sudden-death-waiting-for-host' })
      return
    }
    const action = { type: 'SUDDEN_DEATH_STEP' as const }
    dispatch(action)
    sendNetworkAction(action)
  }

  const handleNewGame = () => {
    Matches.clearResumeMetadata()
    Network.forceCleanup()
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

  // Drag handlers for desktop (HTML5 Drag API)
  const handleDragStart = (e: React.DragEvent, cardId: string, card: any, ownerSuit: StandardSuit | null) => {
    if (boardSelectionMode || minionMenuMode) return
    if (!canAct) return
    setDraggingCardId(cardId)
    setSelectedCardId(null) // Deselect when starting drag
    setShowDragGhost(true)  // Show our custom ghost for PC too
    draggingCardRef.current = { card, ownerSuit }
    
    // Set initial ghost position using transform (GPU-accelerated)
    requestAnimationFrame(() => {
      if (dragGhostRef.current) {
        dragGhostRef.current.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0) scale(1.1) rotate(-5deg)`
      }
    })
  }
  
  // Track cursor position during drag (for ghost on PC)
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()  // Required to allow drop
    if (draggingCardId && dragGhostRef.current) {
      // Use transform for GPU-accelerated movement
      dragGhostRef.current.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0) scale(1.1) rotate(-5deg)`
    }
  }

  // Helper to update drag-over lane without causing re-renders
  const setDragOverLane = (laneId: LaneId | null) => {
    // Remove old highlight
    if (dragOverLaneIdRef.current && dragOverLaneIdRef.current !== laneId) {
      document.querySelector(`[data-lane-id="${dragOverLaneIdRef.current}"]`)?.classList.remove('lane-drag-over')
    }
    // Add new highlight
    if (laneId) {
      document.querySelector(`[data-lane-id="${laneId}"]`)?.classList.add('lane-drag-over')
    }
    dragOverLaneIdRef.current = laneId
  }

  const handleDragEnd = () => {
    // Cancel any pending animation frame
    if (dragRAFRef.current) {
      cancelAnimationFrame(dragRAFRef.current)
      dragRAFRef.current = null
    }
    setDraggingCardId(null)
    setDragOverLane(null)
    setShowDragGhost(false)
    draggingCardRef.current = null
  }

  const handleDragOverLane = (e: React.DragEvent, laneId: LaneId) => {
    e.preventDefault()
    if (draggingCardId && canPlayCardToLane(state, draggingCardId, laneId)) {
      setDragOverLane(laneId)
    }
  }

  const handleDragLeaveLane = () => {
    setDragOverLane(null)
  }

  const handleDropOnLane = (laneId: LaneId) => {
    if (!draggingCardId || !canAct) return
    if (!canPlayCardToLane(state, draggingCardId, laneId)) return
    
    const action = { type: 'PLAY_CARD_TO_LANE' as const, cardId: draggingCardId, laneId }
    dispatch(action)
    sendNetworkAction(action)
    handleDragEnd()
  }

  // Touch handlers for mobile - use direct DOM manipulation for ghost position to avoid re-renders
  const handleTouchStart = (e: React.TouchEvent, cardId: string, card: any, ownerSuit: StandardSuit | null) => {
    if (boardSelectionMode || minionMenuMode) return
    if (!canAct) return
    e.preventDefault() // Prevent default to avoid scroll during drag
    
    const touch = e.touches[0]
    setDraggingCardId(cardId)
    setSelectedCardId(null)
    setShowDragGhost(true)  // Show the custom drag ghost
    draggingCardRef.current = { card, ownerSuit }
    
    // Set initial position via ref after render using transform (GPU-accelerated)
    requestAnimationFrame(() => {
      if (dragGhostRef.current) {
        dragGhostRef.current.style.transform = `translate3d(${touch.clientX}px, ${touch.clientY}px, 0) scale(1.1) rotate(-5deg)`
      }
    })
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!draggingCardId) return
    e.preventDefault()
    
    const touch = e.touches[0]
    const clientX = touch.clientX
    const clientY = touch.clientY
    
    // Throttle updates using requestAnimationFrame to prevent screen tearing
    if (dragRAFRef.current) {
      cancelAnimationFrame(dragRAFRef.current)
    }
    
    dragRAFRef.current = requestAnimationFrame(() => {
      // Update ghost position using transform (GPU-accelerated, no layout thrashing)
      if (dragGhostRef.current) {
        dragGhostRef.current.style.transform = `translate3d(${clientX}px, ${clientY}px, 0) scale(1.1) rotate(-5deg)`
      }
      
      // Check what's under the touch point - use helper to avoid re-renders
      const laneId = getLaneUnderPoint(clientX, clientY)
      if (laneId && canPlayCardToLane(state, draggingCardId!, laneId)) {
        setDragOverLane(laneId)
      } else {
        setDragOverLane(null)
      }
      
      dragRAFRef.current = null
    })
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!draggingCardId) return
    
    // Get the final position
    const touch = e.changedTouches[0]
    const laneId = getLaneUnderPoint(touch.clientX, touch.clientY)

    if (laneId && canPlayCardToLane(state, draggingCardId, laneId)) {
      const action = { type: 'PLAY_CARD_TO_LANE' as const, cardId: draggingCardId, laneId }
      dispatch(action)
      sendNetworkAction(action)
    }
    // If not dropped on valid target, card returns to hand (nothing happens)

    handleDragEnd()
  }

  // Lane component - with perspective flip for online AND hotseat mode
  const LaneView = ({ lane }: { lane: Lane }) => {
    const laneCommunityCard = state.laneCommunityCards[lane.id]
    const laneLocked = state.phase === 'Main' && !laneCommunityCard
    const targetable = isLaneTargetable(lane.id)
    const dropTarget = isLaneDropTarget(lane.id)
    // Per-lane community poker card slot id (middle -> "mid" per game design)
    const communitySlotId = `${lane.id === 'middle' ? 'mid' : lane.id}_community_poker_card`

    // v7 Cycling Lane Flow: lanes no longer lock; no glow needed.
    const glowClass = ''
    
    // Board selection mode classes
    const isMoveSource = moveSourceLane === lane.id
    const isNeutralized = state.neutralizedLanes[lane.id]
    
    // Determine if lane is selectable in current board selection mode
    let selectionSelectable = false
    let selectionClass = ''
    if (boardSelectionMode === 'neutralize' && !isNeutralized && !laneLocked) {
      selectionSelectable = true
      selectionClass = 'lane-selection-neutralize'
    } else if (boardSelectionMode === 'move-source') {
      // Check if opponent has cards in this lane
      const choice = state.pendingEffectChoices[0]
      if (choice) {
        const opponent = choice.player === 1 ? 2 : 1
        const opponentCards = opponent === 1 ? lane.player1.cards : lane.player2.cards
        if (opponentCards.length > 0) {
          selectionSelectable = true
          selectionClass = 'lane-selection-move-source'
        }
      }
    } else if (boardSelectionMode === 'move-target' && !isMoveSource && !laneLocked) {
      selectionSelectable = true
      selectionClass = 'lane-selection-move-target'
    } else if (boardSelectionMode === 'relic-shield-lane' && !laneLocked) {
      selectionSelectable = true
      selectionClass = 'lane-selection-relic-shield'
    } else if (boardSelectionMode === 'relic-sword-lane' && !laneLocked) {
      selectionSelectable = true
      selectionClass = 'lane-selection-relic-sword'
    } else if (boardSelectionMode === 'relic-skull-card') {
      const player = getActingPlayer()
      const ownCards = player === 1 ? lane.player1.cards : lane.player2.cards
      if (ownCards.length > 0) {
        selectionSelectable = true
        selectionClass = 'lane-selection-relic-skull-source'
      }
    } else if (boardSelectionMode === 'relic-skull-target' && selectedRelicCard && lane.id !== selectedRelicCard.fromLane && !laneLocked) {
      const player = getActingPlayer()
      const ownCards = player === 1 ? lane.player1.cards : lane.player2.cards
      if (ownCards.length < 3) {
        selectionSelectable = true
        selectionClass = 'lane-selection-relic-skull-target'
      }
    }
    
    // Note: drag-over visual is now handled via direct DOM class manipulation
    // to avoid re-renders during drag operations
    
    // Perspective flip for online AND hotseat mode
    const isOnlineGuest = state.gameMode === 'online' && state.localPlayer === 2
    const isHotseatP2Turn = state.gameMode === 'vs-player' && state.currentPlayer === 2
    const shouldFlipPerspective = isOnlineGuest || isHotseatP2Turn
    
    const topCards = shouldFlipPerspective ? lane.player1.cards : lane.player2.cards
    const bottomCards = shouldFlipPerspective ? lane.player2.cards : lane.player1.cards
    const topSuit = shouldFlipPerspective ? state.player1Suit : state.player2Suit
    const bottomSuit = shouldFlipPerspective ? state.player2Suit : state.player1Suit
    const topPlayerKey = shouldFlipPerspective ? 'player1' : 'player2'
    const bottomPlayerKey = shouldFlipPerspective ? 'player2' : 'player1'
    const topRelicEffects = state.laneRelicEffects[lane.id][topPlayerKey]
    const bottomRelicEffects = state.laneRelicEffects[lane.id][bottomPlayerKey]
    
    // v6 Poker Rework: lane total preview uses evaluateBestHand over
    // player cards + per-lane community + all-lane community.
    const allLaneCommunityCard = state.allLaneCommunityCard ?? null
    const topVisibleCards = topCards.filter((_, idx) => idx !== 2)
    const topDisplay = getLaneDisplay(topVisibleCards, laneCommunityCard ?? null, allLaneCommunityCard)
    const bottomDisplay = getLaneDisplay(bottomCards, laneCommunityCard ?? null, allLaneCommunityCard)
    const topBaseSum = topDisplay.baseSum
    const topBonus = topDisplay.bonus
    const bottomBaseSum = bottomDisplay.baseSum
    const bottomBonus = bottomDisplay.bonus
    const renderRelicIndicators = (
      effects: { shielded: boolean; swordBonus: boolean },
      side: 'opponent' | 'player',
    ) => {
      if (!effects.shielded && !effects.swordBonus) return null
      return (
        <div className={`lane-special-effects ${side}`}>
          {effects.shielded && <span className="lane-special-effect shield" title="Shielded: 50% damage reduction">🛡️</span>}
          {effects.swordBonus && <span className="lane-special-effect sword" title="Sword: double poker bonus">⚔️</span>}
        </div>
      )
    }

    return (
      <div className="lane-wrapper">
        {renderRelicIndicators(topRelicEffects, 'opponent')}
        {/* Opponent lane total (outside, above). The number row and the hand-label
            are wrapped in their own boxes so the cell is a fixed-height flex
            column - that way long hand labels (e.g. "3-Card Straight Flush"
            wrapping to 2 lines) can't push the lane out of vertical alignment
            with its neighbours. */}
        <div className={`lane-total opponent ${topBaseSum > 0 ? 'has-value' : ''}`}>
          {topBaseSum > 0 ? (
            <>
              <div className="lane-total-number">
                {topBonus > 0 ? (
                  <><span className="base-sum">{topBaseSum}</span><span className="bonus-separator">|</span><span className="bonus-value">{topBonus}</span></>
                ) : (
                  <span className="base-sum">{topBaseSum}</span>
                )}
              </div>
              <span className="hand-label">{topDisplay.handLabel}</span>
            </>
          ) : (
            <>
              <div className="lane-total-number"><span className="base-sum">—</span></div>
              <span className="hand-label" aria-hidden="true">&nbsp;</span>
            </>
          )}
        </div>
        
        <div 
          className={`lane ${laneLocked ? 'lane-community-locked' : ''} ${targetable ? 'lane-targetable' : ''} ${dropTarget ? 'lane-drop-target' : ''} ${glowClass} ${selectionClass} ${isMoveSource ? 'lane-move-source' : ''}`}
          onClick={() => {
            if (selectionSelectable) {
              handleLaneClick(lane.id)
            } else if (targetable) {
              handleLaneClick(lane.id)
            }
          }}
          data-lane-id={lane.id}
          onDragOver={(e) => handleDragOverLane(e, lane.id)}
          onDragLeave={handleDragLeaveLane}
          onDrop={() => handleDropOnLane(lane.id)}
          style={{ cursor: selectionSelectable ? 'pointer' : undefined }}
        >

          {/* Opponent cards (top) - stacked horizontally; each card overlaps the prior by 60%.
              Later-played cards render on top (ascending z-index). */}
          <div className="lane-cards-stack opponent">
            {topCards.length === 0 ? (
              <div className="lane-empty">—</div>
            ) : (
              topCards.map((card, idx) => (
                <div key={card.id} className="stacked-card" style={{ zIndex: idx + 1 }}>
                  <CardView
                    card={card}
                    faceDown={idx === 2}
                    small
                    ownerSuit={topSuit}
                    laneCards={topCards}
                    cardIndexInLane={idx}
                  />
                </div>
              ))
            )}
          </div>

        {/* Per-lane community poker card slot. v7 Cycling Lane Flow: this slot
            is refreshed (discarded + redrawn from the community pool) every time the
            lane resolves, so it can change multiple times within a single round. */}
        <div
          className={`community-poker-slot lane-community-slot ${laneLocked ? 'community-slot-locked' : ''}`}
          data-slot-id={communitySlotId}
          aria-label={communitySlotId}
        >
          {laneCommunityCard ? (
            <CardView card={laneCommunityCard} small communityCard />
          ) : laneLocked ? (
            <span className="lane-lock-icon" aria-label="Lane locked">🔒</span>
          ) : (
            targetable && <span className="community-slot-arrow">▼</span>
          )}
        </div>

          {/* Local player cards (bottom) - stacked horizontally; each card overlaps the prior by 60%.
              Later-played cards render on top (ascending z-index). */}
          <div className="lane-cards-stack player">
            {bottomCards.length === 0 ? (
              <div className="lane-empty">—</div>
            ) : (
              bottomCards.map((card, idx) => {
                const isRelicCardSelectable = boardSelectionMode === 'relic-skull-card'
                const isRelicCardSelected = selectedRelicCard?.cardId === card.id
                return (
                <div
                  key={card.id}
                  className={`stacked-card ${isRelicCardSelectable ? 'relic-card-selectable' : ''} ${isRelicCardSelected ? 'relic-card-selected' : ''}`}
                  style={{ zIndex: idx + 1 }}
                  onClick={(event) => {
                    if (!isRelicCardSelectable) return
                    event.stopPropagation()
                    handleRelicCardSelect(card, lane.id)
                  }}
                >
                  <CardView
                    card={card}
                    small
                    selected={isRelicCardSelected}
                    ownerSuit={bottomSuit}
                    laneCards={bottomCards}
                    cardIndexInLane={idx}
                  />
                </div>
                )
              })
            )}
          </div>
        </div>
        
        {/* Player lane total (outside, below). Same fixed-height layout as the
            opponent total - long hand labels wrap inside the cell without
            pushing the lane upward. */}
        <div className={`lane-total player ${bottomBaseSum > 0 ? 'has-value' : ''}`}>
          {bottomBaseSum > 0 ? (
            <>
              <div className="lane-total-number">
                {bottomBonus > 0 ? (
                  <><span className="base-sum">{bottomBaseSum}</span><span className="bonus-separator">|</span><span className="bonus-value">{bottomBonus}</span></>
                ) : (
                  <span className="base-sum">{bottomBaseSum}</span>
                )}
              </div>
              <span className="hand-label">{bottomDisplay.handLabel}</span>
            </>
          ) : (
            <>
              <div className="lane-total-number"><span className="base-sum">—</span></div>
              <span className="hand-label" aria-hidden="true">&nbsp;</span>
            </>
          )}
        </div>
        {renderRelicIndicators(bottomRelicEffects, 'player')}
      </div>
    )
  }

  // Avatar component with pentagonal frame
  const Avatar = ({
    suit,
    isPlayer,
    takingDamage = false,
    healing = false,
    isTurnActive = false,
    supportAvailable = false,
    canUseSupport = false,
    onSupportClick,
    fxKey,
  }: {
    suit: StandardSuit | null
    isPlayer: boolean
    takingDamage?: boolean
    healing?: boolean
    isTurnActive?: boolean
    supportAvailable?: boolean
    canUseSupport?: boolean
    onSupportClick?: () => void
    fxKey?: string
  }) => (
    <div
      data-fx={fxKey}
      className={`avatar-frame ${isPlayer ? 'player' : 'opponent'} ${takingDamage ? 'taking-damage' : ''} ${healing ? 'healing' : ''} ${isTurnActive ? 'turn-active' : ''} ${supportAvailable ? 'support-ready' : ''} ${canUseSupport ? 'clickable' : ''}`}
      onClick={canUseSupport ? onSupportClick : undefined}
      role={canUseSupport ? 'button' : undefined}
      aria-label={canUseSupport ? 'Use avatar heal for 3 health' : undefined}
      title={supportAvailable ? 'Avatar heal ready: gain 3 health' : undefined}
    >
      <img src={getAvatarPath(suit)} alt={isPlayer ? 'Player avatar' : 'AI avatar'} />
    </div>
  )

  const MinionIcon = useCallback(({
    suit,
    stackCount = 0,
    canActivate = false,
    onClick,
    fxKey,
  }: {
    suit: StandardSuit | null
    stackCount?: number
    canActivate?: boolean
    onClick?: () => void
    fxKey?: string
  }) => {
    const [showTooltip, setShowTooltip] = useState(false)
    const [tooltipPinned, setTooltipPinned] = useState(false)
    const [tooltipPortalRect, setTooltipPortalRect] = useState<{ top: number; left: number; position: 'above' | 'below' } | null>(null)
    const minionRef = useRef<HTMLDivElement>(null)
    const isActive = stackCount >= 3
    const status = isActive ? 'Active' : 'Inactive'
    const progressText = `${Math.min(stackCount, 3)}/3 stacks`
    const tooltipData = (() => {
      if (suit === 'spades') {
        return {
          header: `Spades Minion (${status})`,
          damage: `Enemy-Turn Reroll (${progressText})`,
          description: 'Only usable on the enemy turn after you draw 3 cards.',
          effect: 'Shuffle those 3 drawn cards back into the deck, shuffle, then draw 3 new cards. Requires cards remaining in deck.',
        }
      }
      if (suit === 'hearts') {
        return {
          header: `Hearts Minion (${status})`,
          damage: `Ability Charge (${progressText})`,
          description: 'Choose Sword or Shield.',
          effect: 'Gain 2 stacks for the chosen Sword or Shield.',
        }
      }
      if (suit === 'clubs') {
        return {
          header: `Clubs Minion (${status})`,
          damage: `Suit Change (${progressText})`,
          description: 'Choose a card in your hand.',
          effect: 'Change that card to a suit of your choice.',
        }
      }
      return {
        header: `Diamonds Minion (${status})`,
        damage: `Rank Up (${progressText})`,
        description: 'Choose a non-Joker card in your hand.',
        effect: 'Increase its rank by one. Ace becomes Joker.',
      }
    })()

    const updateTooltipRect = useCallback(() => {
      if (!showTooltip || !minionRef.current) {
        setTooltipPortalRect(null)
        return
      }
      const rect = minionRef.current.getBoundingClientRect()
      const spaceAbove = rect.top
      const spaceBelow = window.innerHeight - rect.bottom
      const position: 'above' | 'below' = spaceAbove >= 130 || spaceAbove > spaceBelow ? 'above' : 'below'
      setTooltipPortalRect({
        top: position === 'above' ? rect.top - 8 : rect.bottom + 8,
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

    useEffect(() => {
      if (!tooltipPinned) return
      const handleClickOutside = (e: Event) => {
        if (minionRef.current && !minionRef.current.contains(e.target as Node)) {
          setShowTooltip(false)
          setTooltipPinned(false)
        }
      }
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('touchstart', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
        document.removeEventListener('touchstart', handleClickOutside)
      }
    }, [tooltipPinned])

    return (
      <div
        ref={minionRef}
        data-fx={fxKey}
        className={`support-icon minion-icon ${isActive ? 'minion-active' : ''} ${canActivate ? 'clickable' : ''} ${showTooltip ? 'tooltip-visible' : ''}`}
        aria-label={`Minion ability ${isActive ? 'active' : 'inactive'} ${progressText}`}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => {
          if (!tooltipPinned) setShowTooltip(false)
        }}
        onClick={() => {
          setTooltipPinned(prev => !prev)
          setShowTooltip(true)
          if (canActivate) onClick?.()
        }}
      >
        <img src={getMinionPath(suit, stackCount)} alt="minion ability icon" />

        {showTooltip && tooltipPortalRect && typeof document !== 'undefined' && document.body &&
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
              <div className={`card-tooltip relic-tooltip ${isActive ? 'active' : 'inactive'} tooltip-${tooltipPortalRect.position}`}>
                <div className="tooltip-header">{tooltipData.header}</div>
                <div className="tooltip-damage">{tooltipData.damage}</div>
                <div className="tooltip-description">{tooltipData.description}</div>
                <div className="tooltip-effect">{tooltipData.effect}</div>
              </div>
            </div>,
            document.body,
          )}
      </div>
    )
  }, [])

  const RelicIcon = useCallback(({
    suit,
    relic,
    stackCount = 0,
    canActivate = false,
    onClick,
    fxKey,
  }: {
    suit: StandardSuit | null
    relic: RelicType
    stackCount?: number
    canActivate?: boolean
    onClick?: () => void
    fxKey?: string
  }) => {
    const [showTooltip, setShowTooltip] = useState(false)
    const [tooltipPinned, setTooltipPinned] = useState(false)
    const [tooltipPortalRect, setTooltipPortalRect] = useState<{ top: number; left: number; position: 'above' | 'below' } | null>(null)
    const relicRef = useRef<HTMLDivElement>(null)
    const isActive = stackCount >= 3
    const tooltipText = getRelicTooltip(relic, isActive, stackCount, suit)
    const progressText = `${Math.min(stackCount, 3)}/3 stacks`

    const updateTooltipRect = useCallback(() => {
      if (!showTooltip || !relicRef.current) {
        setTooltipPortalRect(null)
        return
      }

      const rect = relicRef.current.getBoundingClientRect()
      const spaceAbove = rect.top
      const spaceBelow = window.innerHeight - rect.bottom
      const position: 'above' | 'below' = spaceAbove >= 130 || spaceAbove > spaceBelow ? 'above' : 'below'
      setTooltipPortalRect({
        top: position === 'above' ? rect.top - 8 : rect.bottom + 8,
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

    useEffect(() => {
      if (!tooltipPinned) return

      const handleClickOutside = (e: Event) => {
        if (relicRef.current && !relicRef.current.contains(e.target as Node)) {
          setShowTooltip(false)
          setTooltipPinned(false)
        }
      }

      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('touchstart', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
        document.removeEventListener('touchstart', handleClickOutside)
      }
    }, [tooltipPinned])

    const tooltipData = (() => {
      const status = isActive ? 'Active' : 'Inactive'
      if (relic === 'shield') {
        return {
          header: `Shield (${status})`,
          damage: `Lane Defense (${progressText})`,
          description: 'Select any lane to shield your side.',
          effect: 'The next damage you take from that lane is reduced by 50% (rounded up).',
        }
      }
      if (relic === 'skull') {
        if (suit === 'hearts') {
          return {
            header: `Relic (${status})`,
            damage: `Discard Transform (${progressText})`,
            description: 'Choose a card in your hand.',
            effect: 'Transform it into a random card from the discard pile.',
          }
        }
        if (suit === 'spades') {
          return {
            header: `Relic (${status})`,
            damage: `Hand Randomize (${progressText})`,
            description: 'Choose a card in your hand.',
            effect: 'Transform it into a random suit and rank.',
          }
        }
        return {
          header: `Relic (${status})`,
          damage: `Card Movement (${progressText})`,
          description: 'Select one of your played cards, then choose another lane.',
          effect: 'Move that card to a non-full lane on your side.',
        }
      }
      return {
        header: `Sword (${status})`,
        damage: `Poker Bonus (${progressText})`,
        description: 'Select any lane to empower your next resolve there.',
        effect: 'Doubles only your poker bonus contribution on that lane.',
      }
    })()

    return (
      <div
        ref={relicRef}
        data-fx={fxKey}
        className={`support-icon relic-icon relic-${relic} ${isActive ? 'relic-active' : ''} ${canActivate ? 'clickable' : ''} ${showTooltip ? 'tooltip-visible' : ''}`}
        aria-label={tooltipText}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => {
          if (!tooltipPinned) setShowTooltip(false)
        }}
        onClick={() => {
          setTooltipPinned(prev => !prev)
          setShowTooltip(true)
          if (canActivate) onClick?.()
        }}
      >
        <img src={getRelicPath(suit, relic, stackCount)} alt={`${relic === 'skull' ? 'relic' : relic} icon`} />

        {showTooltip && tooltipPortalRect && typeof document !== 'undefined' && document.body &&
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
              <div className={`card-tooltip relic-tooltip ${isActive ? 'active' : 'inactive'} tooltip-${tooltipPortalRect.position}`}>
                <div className="tooltip-header">{tooltipData.header}</div>
                <div className="tooltip-damage">{tooltipData.damage}</div>
                <div className="tooltip-description">{tooltipData.description}</div>
                <div className="tooltip-effect">{tooltipData.effect}</div>
              </div>
            </div>,
            document.body,
          )}
      </div>
    )
  }, [])

  // HP Display component
  const HPDisplay = ({ hp, isPlayer }: { hp: number; isPlayer: boolean }) => (
    <div className={`hp-display-box ${isPlayer ? 'player' : 'opponent'}`}>
      <span className="hp-heart">❤</span>
      <span className={`hp-value ${hp <= 20 ? 'critical' : ''}`}>{hp}</span>
    </div>
  )

  // v8 Split Deck: each player draws from their own deck, so the per-player
  // counts shown in the deck lane are simply the real personal deck sizes.
  const player1DeckCount = state.player1Deck.length
  const player2DeckCount = state.player2Deck.length
  // "Turns of fuel left" is now per-player (3 drawn per turn from your own deck).
  const minDeckCount = Math.min(player1DeckCount, player2DeckCount)
  const turnsRemaining = Math.floor(minDeckCount / 3)
  const deckGlowClass = turnsRemaining === 2 ? 'deck-glow-warning' : turnsRemaining <= 1 ? 'deck-glow-danger' : ''
  const getProjectedDeckCountForPlayer = (player: CurrentPlayer): number =>
    player === 1 ? player1DeckCount : player2DeckCount

  // Draw pile component - now uses field control suit for card back
  const DrawPile = ({ count, glowClass = '', showEmptyOutline = false, hideCount = false }: { count: number; glowClass?: string; showEmptyOutline?: boolean; hideCount?: boolean }) => (
    <div className={`draw-pile ${glowClass}`}>
      {showEmptyOutline ? (
        <div className="draw-pile-empty-outline" aria-label="Empty deck" />
      ) : (
        <CardView
          card={{ id: 'draw-pile', suit: 'hearts', rank: 2 }}
          faceDown
          small
          cardBackType="ai"
          cardBackSuit={state.fieldControlSuit}
        />
      )}
      {!hideCount && <span className="draw-pile-count">{count}</span>}
    </div>
  )

  const renderMinionMenu = () => {
    if (!minionMenuMode) return null
    const player = getActingPlayer()
    const playerState = player === 1 ? state.player1 : state.player2
    const playerSuit = player === 1 ? state.player1Suit : state.player2Suit
    const cards = minionMenuMode === 'diamonds-card'
      ? playerState.hand.filter(card => card.rank !== 'JOKER')
      : playerState.hand
    const selectedCard = playerState.hand.find(card => card.id === selectedMinionCardId)
    const title = minionMenuMode === 'clubs-suit'
      ? 'Choose New Suit'
      : minionMenuMode === 'diamonds-card'
        ? 'Choose a Card to Rank Up'
        : minionMenuMode === 'hearts-minion-choice'
          ? 'Choose Relic Stacks'
          : minionMenuMode === 'hearts-skull-card'
            ? 'Choose a Card to Transform'
            : minionMenuMode === 'spades-skull-card'
              ? 'Choose a Card to Randomize'
              : 'Choose a Card to Change Suit'

    return (
      <div className="minion-menu-overlay">
        <div className="minion-menu">
          <div className="minion-menu-title">{title}</div>
          {minionMenuMode === 'hearts-minion-choice' ? (
            <div className="minion-suit-options">
              <button
                className="minion-suit-option"
                onClick={() => handleHeartsMinionRelicSelect('sword')}
              >
                <span className="minion-suit-emoji">⚔</span>
                <span className="minion-suit-label">Sword</span>
              </button>
              <button
                className="minion-suit-option"
                onClick={() => handleHeartsMinionRelicSelect('shield')}
              >
                <span className="minion-suit-emoji">🛡</span>
                <span className="minion-suit-label">Shield</span>
              </button>
            </div>
          ) : minionMenuMode === 'clubs-suit' && selectedCard ? (
            <>
              <div className="minion-selected-card">
                <CardView card={selectedCard} small ownerSuit={playerSuit} />
              </div>
              <div className="minion-suit-options">
                {SUIT_OPTIONS.map(option => (
                  <button
                    key={option.suit}
                    className="minion-suit-option"
                    onClick={() => handleMinionSuitSelect(option.suit)}
                  >
                    <span className="minion-suit-emoji">{option.emoji}</span>
                    <span className="minion-suit-label">{option.label}</span>
                  </button>
                ))}
              </div>
            </>
          ) : cards.length > 0 ? (
            <div className="minion-card-options">
              {cards.map(card => (
                <button
                  key={card.id}
                  className="minion-card-option"
                  onClick={() => {
                    if (minionMenuMode === 'diamonds-card') {
                      handleMinionDiamondsCardSelect(card.id)
                    } else if (minionMenuMode === 'spades-skull-card') {
                      handleSpadesSkullCardSelect(card)
                    } else if (minionMenuMode === 'hearts-skull-card') {
                      handleHeartsSkullCardSelect(card)
                    } else {
                      handleMinionClubsCardSelect(card.id)
                    }
                  }}
                >
                  <CardView card={card} small ownerSuit={playerSuit} />
                </button>
              ))}
            </div>
          ) : (
            <div className="minion-menu-empty">No valid cards</div>
          )}
          <button className="minion-menu-cancel" onClick={closeMinionMenu}>Cancel</button>
        </div>
      </div>
    )
  }

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
        Matches.closeLobby(state.roomCode, state.onlineSessionToken)
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
    const { player1Card, player2Card, winner } = state.flipResult
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
    state.phase === 'Main' && isLocalPlayerTurn ? '#22c55e' :
    state.phase === 'Main' && !isLocalPlayerTurn ? '#ef4444' :
    state.phase === 'InitialFlip' ? '#3b82f6' :
    state.phase === 'InitialFlipResult' ? '#3b82f6' :
    state.phase === 'EndOfRoundResolving' ? '#f97316' :
    state.phase === 'SuddenDeath' ? '#a855f7' : '#eab308'
  const isOverlayOnlineGuest = state.gameMode === 'online' && state.localPlayer === 2
  const isOverlayHotseatP2Turn = state.gameMode === 'vs-player' && state.currentPlayer === 2
  const shouldFlipOverlayPerspective = isOverlayOnlineGuest || isOverlayHotseatP2Turn
  const resolutionPlayerSuit = shouldFlipOverlayPerspective ? state.player2Suit : state.player1Suit
  const resolutionOpponentSuit = shouldFlipOverlayPerspective ? state.player1Suit : state.player2Suit
  const topDeckCountPlayer: CurrentPlayer = shouldFlipOverlayPerspective ? 1 : 2
  const bottomDeckCountPlayer: CurrentPlayer = shouldFlipOverlayPerspective ? 2 : 1
  const topDeckCount = getProjectedDeckCountForPlayer(topDeckCountPlayer)
  const bottomDeckCount = getProjectedDeckCountForPlayer(bottomDeckCountPlayer)
  const pendingResolutionOverlay = Boolean(
    state.lastLaneResolution && state.lastLaneResolution.timestamp > lastResolutionTimestampRef.current,
  )
  const endTurnDisabled =
    !canEndTurn(state) ||
    !isLocalPlayerTurn ||
    state.phase !== 'Main' ||
    aiLockActive ||
    pendingResolutionOverlay ||
    !!resolutionAnimation ||
    isResolutionShowingRef.current ||
    laneResolveEndTurnCooldown ||
    abilityEndTurnCooldown ||
    !!boardSelectionMode ||
    !!minionMenuMode ||
    state.pendingEffectChoices.length > 0

  return (
    <div 
      className={`game-container ${boardSelectionMode?.startsWith('relic-') ? 'relic-targeting-active' : ''}`}
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

      {opponentDisconnected && (
        <div className="connection-status-banner">
          Opponent disconnected. Waiting for reconnect...
        </div>
      )}
      
      {/* Lane Resolution Animation Overlay */}
      {resolutionAnimation && (
        <div className="resolution-overlay">
          <div className="resolution-content">
            <div className="resolution-lane-name">
              {resolutionAnimation.laneId.toUpperCase()} LANE
            </div>
            <div className="resolution-hands">
              <div className={`resolution-hand opponent ${resolutionAnimation.winner === 2 ? 'winner' : resolutionAnimation.winner === 1 ? 'loser' : ''}`}>
                <span className="resolution-label">OPPONENT</span>
                <div className="resolution-card-row">
                  {resolutionAnimation.p2Cards.map((card, idx) => (
                    <CardView key={`${card.id}-${idx}`} card={card} small ownerSuit={resolutionOpponentSuit} />
                  ))}
                </div>
                <span className="resolution-hand-name">{resolutionAnimation.p2HandLabel}</span>
                <div className="resolution-breakdown">
                  <span>{resolutionAnimation.p2BaseDamage}</span>
                  {resolutionAnimation.p2PokerBonus > 0 && (
                    <>
                      <span className="bonus-separator">|</span>
                      <span>{resolutionAnimation.p2PokerBonus}</span>
                    </>
                  )}
                </div>
                <span className="resolution-value">{resolutionAnimation.p2Total}</span>
              </div>
              <div className="resolution-vs">VS</div>
              <div className={`resolution-hand player ${resolutionAnimation.winner === 1 ? 'winner' : resolutionAnimation.winner === 2 ? 'loser' : ''}`}>
                <span className="resolution-label">YOU</span>
                <div className="resolution-card-row">
                  {resolutionAnimation.p1Cards.map((card, idx) => (
                    <CardView key={`${card.id}-${idx}`} card={card} small ownerSuit={resolutionPlayerSuit} />
                  ))}
                </div>
                <span className="resolution-hand-name">{resolutionAnimation.p1HandLabel}</span>
                <div className="resolution-breakdown">
                  <span>{resolutionAnimation.p1BaseDamage}</span>
                  {resolutionAnimation.p1PokerBonus > 0 && (
                    <>
                      <span className="bonus-separator">|</span>
                      <span>{resolutionAnimation.p1PokerBonus}</span>
                    </>
                  )}
                </div>
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
      
      {/* v2 Effect Choice Modal */}
      {/* Board Selection Mode Instructions */}
      {boardSelectionMode && (
        <>
          {boardSelectionMode.startsWith('relic-') && <div className="relic-targeting-dim" aria-hidden="true" />}
          <div className="board-selection-instructions">
            <div className="board-selection-text">
              {boardSelectionMode === 'neutralize' && 'Click a lane to neutralize it'}
              {boardSelectionMode === 'move-source' && 'Click a lane to pick the top opponent card'}
              {boardSelectionMode === 'move-target' && 'Click a lane to move the card there'}
              {boardSelectionMode === 'relic-shield-lane' && 'Select a lane to shield (50% damage reduction)'}
              {boardSelectionMode === 'relic-sword-lane' && 'Choose a lane to double the poker bonus of'}
              {boardSelectionMode === 'relic-skull-card' && 'Select one of your played cards to move'}
              {boardSelectionMode === 'relic-skull-target' && 'Select a lane to move the selected card to'}
            </div>
            <button
              className="board-selection-cancel"
              onClick={cancelBoardSelection}
            >
              Cancel
            </button>
          </div>
        </>
      )}

      {renderMinionMenu()}
      
      {state.pendingEffectChoices.length > 0 && !boardSelectionMode && (() => {
        const choice = state.pendingEffectChoices[0]
        // Only show modal for the player who needs to make the choice
        const isOnlineGuest = state.gameMode === 'online' && state.localPlayer === 2
        const isHotseatP2Turn = state.gameMode === 'vs-player' && state.currentPlayer === 2
        const shouldFlipPerspective = isOnlineGuest || isHotseatP2Turn
        const localPlayerNum = shouldFlipPerspective ? 2 : 1
        
        // In vs-AI mode, AI choices are handled automatically
        if (state.gameMode === 'vs-ai' && choice.player === 2) {
          return null // AI will handle this
        }
        
        // Only show modal for the local player's choice
        if (choice.player !== localPlayerNum && state.gameMode !== 'vs-ai') {
          return null // Not this player's choice
        }
        
        return (
          <EffectChoiceModal
            choice={choice}
            state={state}
            onClubsReplace={handleClubsReplace}
            onClubsMidReplace={handleClubsMidReplace}
            onEnterMoveMode={handleEnterMoveMode}
            onEnterNeutralizeMode={handleEnterNeutralizeMode}
            onClubsQueenDelay={handleClubsQueenDelay}
            onDiamondsAce={handleDiamondsAce}
            onDiamondsQueen={handleDiamondsQueen}
            onSpadesAce={handleSpadesAce}
            onDismiss={handleDismissEffectChoice}
          />
        )
      })()}
      
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
          const opponentPlayerNumber = shouldFlipPerspective ? 1 : 2
          const opponentDisplayHP = shouldFlipPerspective ? player1DisplayHP : player2DisplayHP
          const opponentTakingDamage = shouldFlipPerspective ? player1TakingDamage : player2TakingDamage
          const opponentHealing = shouldFlipPerspective ? player1Healing : player2Healing
          
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

              {/* Opponent avatar row: keep avatar perfectly centered */}
              <div className="hero-float opponent">
                <div className="hero-slot-left">
                  <MinionIcon suit={opponentSuit} stackCount={opponentData.minionStacks} fxKey="opponent-minion" />
                  {HPDisplay({ hp: opponentDisplayHP, isPlayer: false })}
                </div>
                <div className="hero-slot-center">
                  {Avatar({
                    suit: opponentSuit,
                    isPlayer: false,
                    takingDamage: opponentTakingDamage,
                    healing: opponentHealing,
                    isTurnActive: state.currentPlayer === opponentPlayerNumber,
                    supportAvailable: opponentPlayerNumber === 1 ? state.player1SupportAvailable : state.player2SupportAvailable,
                    fxKey: 'opponent-avatar',
                  })}
                </div>
                <div className="hero-slot-right">
                  <div className="support-relic-row">
                    <RelicIcon suit={opponentSuit} relic="skull" stackCount={opponentData.relicStacks.skull} fxKey="opponent-skull" />
                    <RelicIcon suit={opponentSuit} relic="shield" stackCount={opponentData.relicStacks.shield} fxKey="opponent-shield" />
                    <RelicIcon suit={opponentSuit} relic="sword" stackCount={opponentData.relicStacks.sword} fxKey="opponent-sword" />
                  </div>
                </div>
              </div>
              <div className="hero-meta-row opponent">
                <StatusIndicators player={shouldFlipPerspective ? 1 : 2} state={state} />
                <ChargesDisplay
                  player={shouldFlipPerspective ? 1 : 2}
                  state={state}
                  onSpendCharge={handleSpendCharge}
                  canSpend={false}
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

        {/* Board Row: Lanes (left/center) | All-lane community + Shared Deck + End Turn (right)
            v6: all-lane community card is now on the right side with the draw pile and end turn button. */}
        {state.phase === 'Main' && (
          <div className="board-area">
          <div className="board-row">
            {/* The 3 Lanes - LEFT/CENTER */}
            <div className="lanes-container">
              {state.lanes.map(lane => (
                <Fragment key={lane.id}>{LaneView({ lane })}</Fragment>
              ))}
            </div>

            {/* 4th column: shared deck rendered as a matching lane.
                Top/bottom slots show the draw pile (card backs); the middle
                slot holds the all-lane community card; the score-badge boxes
                above/below show each side's projected remaining draw count. */}
            <div className="lane-wrapper deck-lane-wrapper">
              <div className="lane-total deck-total has-value">
                <div className="lane-total-number"><span className="base-sum">{topDeckCount}</span></div>
                <span className="hand-label" aria-hidden="true">&nbsp;</span>
              </div>

              <div className="lane deck-lane">
                <div className="lane-cards-stack opponent">
                  {DrawPile({ count: topDeckCount, glowClass: deckGlowClass, showEmptyOutline: topDeckCount === 0, hideCount: true })}
                </div>

                <div
                  className="community-poker-slot lane-community-slot"
                  data-slot-id="all_lane_community_poker_card"
                  aria-label="all_lane_community_poker_card"
                >
                  {state.allLaneCommunityCard && (
                    <CardView card={state.allLaneCommunityCard} small communityCard />
                  )}
                </div>

                <div className="lane-cards-stack player">
                  {DrawPile({ count: bottomDeckCount, glowClass: deckGlowClass, showEmptyOutline: bottomDeckCount === 0, hideCount: true })}
                </div>
              </div>

              <div className="lane-total deck-total has-value">
                <div className="lane-total-number"><span className="base-sum">{bottomDeckCount}</span></div>
                <span className="hand-label" aria-hidden="true">&nbsp;</span>
              </div>
            </div>
            </div>
          </div>
        )}

        {/* Phase Banner + turn controls - Below board, on player's side */}
        <div className="phase-row">
          {state.phase === 'Main' && (
            <div className="turn-controls">
              <button
                className="end-turn-btn"
                onClick={handleEndTurn}
                disabled={endTurnDisabled}
              >
                END TURN
              </button>
              <span className="cards-played">{state.cardsPlayedThisTurn}/3</span>
            </div>
          )}
          {state.phase !== 'Main' && (
            <div className="phase-banner" style={{ background: phaseColor, color: '#000' }}>
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
          )}
        </div>

        {/* Hint text */}
        {/* {canAct && state.phase === 'Main' && (
          <div className={`hint-text ${selectedCardId || draggingCardId ? 'active' : ''}`}>
            {selectedCardId ? 'Tap lane or discard' : draggingCardId ? 'Drop on lane or discard' : 'Drag or tap a card'}
          </div>
        )} */}
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
          const localPlayerNumber = shouldFlipPerspective ? 2 : 1
          const localDisplayHP = shouldFlipPerspective ? player2DisplayHP : player1DisplayHP
          const localTakingDamage = shouldFlipPerspective ? player2TakingDamage : player1TakingDamage
          const localHealing = shouldFlipPerspective ? player2Healing : player1Healing
          
          return (
            <>
              <div className="hero-float player">
                <div className="hero-slot-left">
                  <MinionIcon
                    suit={localSuit}
                    stackCount={localData.minionStacks}
                    canActivate={canUseMinion()}
                    onClick={handleMinionClick}
                    fxKey="player-minion"
                  />
                  {HPDisplay({ hp: localDisplayHP, isPlayer: true })}
                </div>
                <div className="hero-slot-center">
                  {Avatar({
                    suit: localSuit,
                    isPlayer: true,
                    takingDamage: localTakingDamage,
                    healing: localHealing,
                    isTurnActive: state.currentPlayer === localPlayerNumber,
                    supportAvailable: localPlayerNumber === 1 ? state.player1SupportAvailable : state.player2SupportAvailable,
                    canUseSupport: canUseAvatarSupport(),
                    onSupportClick: handleAvatarSupportClick,
                    fxKey: 'player-avatar',
                  })}
                </div>
                <div className="hero-slot-right">
                  <div className="support-relic-row">
                    <RelicIcon
                      suit={localSuit}
                      relic="skull"
                      stackCount={localData.relicStacks.skull}
                      canActivate={canUseRelic('skull')}
                      onClick={() => handleRelicClick('skull')}
                      fxKey="player-skull"
                    />
                    <RelicIcon
                      suit={localSuit}
                      relic="shield"
                      stackCount={localData.relicStacks.shield}
                      canActivate={canUseRelic('shield')}
                      onClick={() => handleRelicClick('shield')}
                      fxKey="player-shield"
                    />
                    <RelicIcon
                      suit={localSuit}
                      relic="sword"
                      stackCount={localData.relicStacks.sword}
                      canActivate={canUseRelic('sword')}
                      onClick={() => handleRelicClick('sword')}
                      fxKey="player-sword"
                    />
                  </div>
                </div>
              </div>
              <div className="hero-meta-row player">
                <StatusIndicators player={shouldFlipPerspective ? 2 : 1} state={state} />
                <ChargesDisplay 
                  player={shouldFlipPerspective ? 2 : 1} 
                  state={state} 
                  onSpendCharge={handleSpendCharge}
                  canSpend={state.phase === 'Main' && isLocalPlayerTurn}
                />
              </div>

              {/* Local Player Hand - always clickable at bottom */}
              <div 
                className="hand-container"
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              >
                {state.phase === 'Main' && (
                  localData.hand.map((card, index) => {
                    const isSelected = selectedCardId === card.id
                    const isDragging = draggingCardId === card.id
                    return (
                      <div
                        key={card.id}
                        className={`hand-card-slot${isSelected ? ' is-selected' : ''}${isDragging ? ' is-dragging' : ''}`}
                        style={{ zIndex: isSelected || isDragging ? 40 : index + 1 }}
                      >
                        <CardView
                          card={card}
                          selected={isSelected}
                          onClick={() => handleCardClick(card.id)}
                          disabled={!canAct}
                          ownerSuit={localSuit}
                          draggable={canAct}
                          isDragging={isDragging}
                          onDragStart={(e) => handleDragStart(e, card.id, card, localSuit)}
                          onDragEnd={handleDragEnd}
                          onTouchStart={(e) => handleTouchStart(e, card.id, card, localSuit)}
                        />
                      </div>
                    )
                  })
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
