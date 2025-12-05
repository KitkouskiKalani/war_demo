/**
 * Core Types for War-Lanes Poker Game Engine
 */

export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades' | 'joker';
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 'J' | 'Q' | 'K' | 'A' | 'JOKER';
export type StandardRank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 'J' | 'Q' | 'K' | 'A';
export type StandardSuit = 'hearts' | 'diamonds' | 'clubs' | 'spades';

export interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
}

export type LaneId = 'left' | 'middle' | 'right';

export interface LaneSide {
  cards: Card[];
}

export interface Lane {
  id: LaneId;
  player1: LaneSide;
  player2: LaneSide;
}

export interface PlayerState {
  hp: number;
  deck: Card[];
  hand: Card[];
}

export type CurrentPlayer = 1 | 2;

export type GamePhase = 
  | 'InitialFlip' 
  | 'Main' 
  | 'EndOfRoundResolving' 
  | 'SuddenDeath'
  | 'Finished';

export interface GameState {
  phase: GamePhase;
  player1: PlayerState;
  player2: PlayerState;
  lanes: Lane[];
  discardPile: Card[];
  currentPlayer: CurrentPlayer;
  roundNumber: number;
  player1FinalTurnDone: boolean;
  player2FinalTurnDone: boolean;
  cardsPlayedThisTurn: number;
  winner: CurrentPlayer | null;
}


