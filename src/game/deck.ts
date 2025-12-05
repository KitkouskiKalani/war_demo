/**
 * Deck Creation and Card Helpers
 */

import type { Card, Rank, StandardRank, StandardSuit } from './types';

export const STANDARD_SUITS: StandardSuit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
export const STANDARD_RANKS: StandardRank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 'J', 'Q', 'K', 'A'];
export const JOKER_COUNT = 4;
export const DECK_SIZE = 56;

export function cardValue(card: Card): number {
  return rankValue(card.rank);
}

export function rankValue(rank: Rank): number {
  if (typeof rank === 'number') return rank;
  switch (rank) {
    case 'J': return 11;
    case 'Q': return 12;
    case 'K': return 13;
    case 'A': return 14;
    case 'JOKER': return 15;
  }
}

export function createDeck(): Card[] {
  const cards: Card[] = [];
  let cardIndex = 0;

  for (const suit of STANDARD_SUITS) {
    for (const rank of STANDARD_RANKS) {
      cards.push({ id: `card-${cardIndex++}`, suit, rank });
    }
  }

  for (let i = 0; i < JOKER_COUNT; i++) {
    cards.push({ id: `card-${cardIndex++}`, suit: 'joker', rank: 'JOKER' });
  }

  return cards;
}

export function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function isJoker(card: Card): boolean {
  return card.rank === 'JOKER';
}

export function findCardById(cards: Card[], cardId: string): Card | undefined {
  return cards.find(card => card.id === cardId);
}

export function removeCardById(cards: Card[], cardId: string): Card[] {
  return cards.filter(card => card.id !== cardId);
}

export function cardToString(card: Card): string {
  if (card.rank === 'JOKER') return '🃏';
  const suitSymbols: Record<StandardSuit, string> = {
    hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠',
  };
  return `${card.rank}${suitSymbols[card.suit as StandardSuit]}`;
}


