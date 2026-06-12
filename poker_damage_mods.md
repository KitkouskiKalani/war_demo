# Poker Damage Mods

This document specifies how lane damage is calculated under the v6 Horizontal Stacking + 5-Card Poker system. The values in this file are mirrored by the constants in [`src/game/pokerBonuses.ts`](src/game/pokerBonuses.ts); any tuning change must be made in both places.

---

## Damage Formula

For each side of a lane:

```
lane_damage = sum(baseValue of every "utilized" card) + bonus(best_hand_type)
```

A player's 5-card pool is:

- The 3 cards they played into that lane
- The per-lane community poker card (`left_/mid_/right_community_poker_card`)
- The all-lane community poker card (`all_lane_community_poker_card`)

"Utilized" cards are only the cards that actually form the winning hand, **not** every card in the pool.

- High Card uses **1** card: the single highest card **from the player's own 3 played cards only**. Community cards are *not* eligible for the High Card fallback (you can't borrow a High Card value from a card you didn't play). Jokers the player played still count, capped at Ace value (12).
- Pair uses **2** cards.
- Two Pair uses **4** cards.
- Three of a Kind uses **3** cards.
- Four of a Kind uses **4** cards.
- Five of a Kind uses **5** cards (requires a joker).
- Full House uses **5** cards (3 + 2).
- Flush / Straight / Straight Flush use exactly their length (3, 4, or 5).

If two hand types tie on total damage the evaluator prefers the higher-tier hand, then the one using more cards.

---

## Card Base Values

| Rank | Value |
|-----:|------:|
| 2-10 | face value |
| J    | 11 |
| Q    | 11 |
| K    | 11 |
| A    | 12 (always 12 for damage, even when used as the low end of an A-2-3-4-5 straight) |
| Joker | 12 when not mimicking anything (high-card / unused position); otherwise takes the damage value of the rank it mimics, capped at Ace value |

---

## Wild Card (Joker) Rules

Jokers are **fully wild**: they can stand in for any rank AND any suit.

- In sets (pair, three-of-a-kind, four-of-a-kind, five-of-a-kind, full house, two pair) a joker mimics the target rank and contributes that rank's value.
- In straights / straight flushes a joker fills the missing rank slot and contributes that slot's damage value (A in an ace-low straight still contributes 12).
- In a pure flush (no straight) a joker acts as an **Ace (value 12)** so a flush player is rewarded for having a joker.
- In a high-card hand a joker is worth **12**, tied with Ace and never above Ace.

Five of a Kind is **only possible with a joker** (standard decks have 4 suits per rank).

---

## Hand-Type Bonuses

Bonuses are sized by the relative probability of forming each hand from the 5-card pool (3 played + 2 community, drawn against a 56-card shared deck containing 4 jokers), then halved and rounded down.

### 3-card hands

| Hand                  | Bonus | Utilized | Notes |
|-----------------------|:-----:|:--------:|-------|
| High Card             | 0     | 1        | Default fallback when no other bonus applies. Only the highest card **from the player's 3 played cards** contributes (community cards are excluded from High Card). |
| Pair                  | 1     | 2        | Easiest set on the table. |
| 3-Card Flush          | 2     | 3        | 3 same-suit cards anywhere in the pool. |
| 3-Card Straight       | 3     | 3        | 3 consecutive ranks (aces can be low or high). |
| Three of a Kind       | 5     | 3        | 3 same-rank cards. |
| 3-Card Straight Flush | 8     | 3        | 3 consecutive same-suit cards. |

### 4-card hands

| Hand                  | Bonus | Utilized | Notes |
|-----------------------|:-----:|:--------:|-------|
| Two Pair              | 4     | 4        | Two different pair ranks. |
| 4-Card Flush          | 6     | 4        | 4 same-suit cards. |
| 4-Card Straight       | 7     | 4        | 4 consecutive ranks. |
| Four of a Kind        | 14    | 4        | 4 same-rank cards. |
| 4-Card Straight Flush | 16    | 4        | 4 consecutive same-suit cards. |

### 5-card hands

| Hand                  | Bonus | Utilized | Notes |
|-----------------------|:-----:|:--------:|-------|
| 5-Card Flush          | 9     | 5        | All 5 pool cards share a suit. |
| 5-Card Straight       | 10    | 5        | 5 consecutive ranks. |
| Full House            | 11    | 5        | 3 of rank A + 2 of rank B. |
| 5 of a Kind           | 22    | 5        | Requires at least one joker. |
| 5-Card Straight Flush | 27    | 5        | 5 consecutive same-suit cards. Rarest and highest-damage hand. |

---

## Worked Example (matches the user's prompt)

- Left-lane community card: `5C`
- All-lane community card: `7H`
- Player plays into left lane: `6S`, `8H`, `9H`

Pool: `{5C, 6S, 7H, 8H, 9H}` - no jokers.

Two winning candidates:

1. **5-card Straight** (5-6-7-8-9): uses all 5 cards.
   - Base damage = 5 + 6 + 7 + 8 + 9 = **35**
   - Bonus = 10
   - Total = **45**

2. **3-card Straight Flush** (7H-8H-9H): uses 3 cards.
   - Base damage = 7 + 8 + 9 = **24**
   - Bonus = 8
   - Total = **32**

The evaluator picks the Straight (45 > 32). The player deals 45 damage worth out of the lane; the non-utilized cards (`5C`, `6S`) in this comparison are still utilized because a 5-card straight uses all 5 cards - so in this specific case every card in the pool is utilized anyway.

### Example where only a subset is utilized

- Pool: `2C, 4D, 6H, 8S, 8C` (no straight, no flush)
- Best hand: **Pair of 8s** (8S + 8C).
  - Base damage = 8 + 8 = **16**
  - Bonus = 1 (pair)
  - Total = **17**
- The `2C`, `4D`, and `6H` are **not utilized** - they contribute nothing to the damage because they do not form part of the winning pair.

This is the key rule for mid-tier hands: cards outside the winning hand are discarded for damage purposes. Only 5-card hands (flush-5, straight-5, full house, 5-of-a-kind, straight-flush-5) benefit from summing every pool card.
