# War-Lanes Poker – Game Rules v1.3

## Overview

War-Lanes Poker is a 1v1 card game that mixes:
- War-style damage (difference in card values)
- Lane-based play (3 lanes per player)
- Poker-style bonuses on 3-card "hands"

Each player starts at **100 HP**. The game is played over one or more rounds using a **56-card deck**. Rounds continue until a player's HP drops to 0 or below and a winner is determined.

---

## Deck & Card Values

- Deck: **56 cards**
  - 52 standard playing cards (4 suits, 13 ranks)
  - **4 Jokers**

- Card values:
  - 2–10 → 2–10
  - Jack (J) → 11
  - Queen (Q) → 12
  - King (K) → 13
  - Ace (A) → 14
  - Joker → **15**

- Jokers are **wild** for poker-style patterns:
  - They can count as any rank and any suit when evaluating pairs/straights/flushes/etc.
  - When computing a combo, they always choose the assignment that yields the **highest possible bonus**.
  - For base numeric value, a Joker is always **15**, regardless of what rank/suit it mimics.

---

## Objective

Reduce your opponent from **100 HP** to 0 or less.

- If one player's HP ≤ 0 and the other's > 0, the player with HP ≤ 0 loses.
- If both players' HP ≤ 0 after a resolution, the player with the **higher HP** (less negative) wins.
- If both HP values are exactly equal after a full round, a special **sudden death** tiebreaker is used (see below).

---

## Match & Round Structure

The match consists of one or more rounds. Each round uses all 56 cards.

At the start of each round:

1. **Shuffle** the full 56-card deck.
2. Deal **28 cards** to Player 1 and **28 cards** to Player 2. These are each player's **personal deck** for that round.
3. Perform an initial **War flip** (see below).
4. Each player draws **5 cards** from their personal deck into their hand.
5. The player who won the War flip takes the first turn.
6. Players alternate turns until the end-of-round conditions are met; then the board is fully resolved and a new round begins (if nobody is dead).

All cards used in the round (play, discard, initial flip, lane resolutions) eventually go into a **shared discard pile**, which is reshuffled back into a 56-card deck for the next round.

---

## Initial War Flip (Start-of-Round)

At the beginning of each round:

1. Both players reveal the **top card** of their personal deck.
2. Compare value:
   - Higher card value wins the flip.
   - The winner deals **damage equal to the difference in values** to the loser.
   - The winner becomes the **first player** for this round.
3. If the revealed cards are a **tie**:
   - Both players reveal another top card (keeping the previous revealed cards on the table).
   - Repeat until a non-tie reveals a winner.
   - Damage is based on the final non-tie pair (difference in their values).
4. All revealed cards from the War flip go into the **shared discard pile**.

After the War flip, each player draws **5 cards** from their remaining personal deck into their hand.

---

## Turn Structure

The game proceeds in turns, starting with the War flip winner and alternating between players.

On your turn:

1. You must **play exactly 3 cards from your hand**.
   - Cards can be played:
     - Into one of your 3 lanes (Left, Middle, Right), or
     - Into the shared **discard pile**.
2. After you have played 3 cards, your turn ends and you perform a draw step.

### Playing to Lanes

- Each player has **3 lanes**: left, middle, right.
- Each lane holds up to **3 cards per player** (so up to 6 total: 3 on your side, 3 on the opponent's side).

For your side of a lane:

- If the lane is empty for you, you can play **any card** there.
- If you already have one or more cards in that lane, the new card must have a value **greater than or equal to** the value of your last card in that lane.
- You can have at most **3 cards** in a lane.

Examples (values only):
- Valid: 2 → 6 → 7
- Valid: 9 alone in a lane
- Invalid: 7 → 5 (cannot play a lower value after a higher one)

You may also spread your three cards across lanes (e.g., 2 in left, 3 in middle, 9 in right) as long as each placement is legal per-lane.

### Discarding Cards

- Instead of playing to a lane, you may play a card **directly to the discard pile**.
- This is always allowed, even if you still have legal lane plays.
- **Penalty:** Each card discarded this way deals **damage to you equal to that card's value**.

Example:
- Discarding a Queen (Q = 12) directly to discard causes you to **lose 12 HP**.

---

## Draw Step & Deck Exhaustion

At the end of your turn, you try to draw **3 cards** from your personal deck:

- If your deck has **3 or more cards**:
  - Draw 3 cards into your hand.
- If your deck has **1 or 2 cards**:
  - Move those **1 or 2 cards directly into the discard pile** (they are **not** drawn into your hand).
  - You take **no damage** for this.
  - Your deck now has 0 cards.
  - This turn counts as your **final turn** for this round.
- If your deck already has **0 cards** at the start of your turn:
  - You still must play 3 cards from your hand (if possible), but you do **not** draw at the end of the turn.
  - This is also considered a final-turn state.

A round moves toward its end as both players run out of cards in their personal decks.

---

## Lanes and Mid-Round Resolution

Each lane is shared: there is a left lane, middle lane, and right lane. Each player has their own side in each lane.

### Lane Completion

- A lane is considered **complete for a player** when that player has placed **3 cards** in that lane.
- A lane is considered **ready to resolve** when **both players** have exactly **3 cards** in that same lane (3 on each side, 6 total).

### Delayed Lane Resolution (v1.2)

When a player fills a lane (places their 3rd card), the lane enters a **pending resolution** state. The opponent then has **two turns to respond** before the lane automatically resolves.

**Resolution Rules:**

1. **Immediate Resolution (Both Filled)**: If both players have exactly 3 cards in a lane (the 6th card is played), the lane **resolves immediately**.

2. **Delayed Resolution (Two-Turn Response Window)**: When Player A fills a lane (places their 3rd card) and Player B has fewer than 3 cards:
   - The lane is marked as **pending resolution** with a 2-turn countdown.
   - Player B gets their next **two turns** to respond (they can add cards to the lane if they have legal plays).
   - At the **start of Player A's turn after 2 full rounds**, the lane **automatically resolves** regardless of how many cards Player B has.
   - A visual indicator shows "Resolves in 2" (yellow glow) or "Resolves in 1" (red glow).
   
3. **Default Win**: If a player has 3 cards in a lane and their opponent has 0 cards when the lane resolves, the filling player's total is compared against 0, dealing full damage.

This system gives defenders two opportunities to respond to a filled lane before being forced to accept the resolution.

#### Lane Resolution Procedure

For each player in that lane:

1. Compute the **base sum**:
   - Sum the numeric values of the 3 cards (with Jokers counted as 15).
2. Compute the **poker bonus** for that 3-card set (see "Poker Bonuses" below).
3. Lane total = base sum + poker bonus.

Then:

- Compare lane totals:
  - If Player A total > Player B total:
    - Player A deals damage = (Player A total − Player B total) to Player B.
  - If Player B total > Player A total:
    - Player B deals damage = (Player B total − Player A total) to Player A.
  - If totals are equal:
    - The lane is a **tie** and no damage is dealt.

After resolving the lane:

- All 6 cards (3 from each player) in that lane are moved to the **shared discard pile**.
- The lane becomes **empty** and can be used again.

---

## Poker Bonuses

Poker-style bonuses are **additive damage bonuses** based on the ranks and suits in your 3-card lane.

- These bonuses modify your lane total when the lane resolves.
- Jokers are wild for the purposes of these patterns.

### Bonus Types

For a **3-card set** (your side of a lane):

- **Pair (2 of the same rank)**: +3
- **Three of a kind (all 3 same rank)**: +12
- **Straight (3 consecutive ranks)**: +10
- **Flush (all 3 cards same suit)**: +8
- **Straight flush (both straight and flush)**: +20

Notes:

- Straights, flushes, three-of-a-kind, and straight flushes **only exist on 3-card sets**.
- At the end of the round (see below), **pairs can also apply to 2-card lanes** (2 of the same rank) for +5.
- Jokers can change rank and suit freely when evaluating patterns and will always choose the configuration that produces the **highest bonus**.
- Base numeric value of Jokers remains 15, regardless of the rank they mimic for combos.

---

## End-of-Round Condition

Each player's personal deck will eventually run out.

- When a player attempts to draw and has **1–2 cards left**:
  - Those cards go to **discard** with no damage.
  - That turn is that player's **final turn** for this round.
- Once **both players have completed a final turn** (i.e., their decks have hit zero and they've had a turn in that 0-deck state), the round ends.

At that point, some lanes may be:

- Completely filled (3 cards on each side)
- Partially filled (e.g., 1 or 2 cards on one or both sides)
- Empty

### Full-Board Resolution at End of Round

When the round ends, **all lanes resolve**, even if they are not full.

For each lane, for each player:

1. Compute base sum:
   - Sum the values of all cards they have in that lane (0–3 cards).
2. Compute poker bonuses:
   - **Pairs**:
     - If the player has exactly 2 or 3 cards and at least two share the same rank, they gain **+3**.
   - **Three of a kind**:
     - If all 3 cards share the same rank, they gain **+12** (instead of just the pair bonus).
   - **Straight / Flush / Straight Flush**:
     - Only apply if the player has **3 cards** in the lane.
     - Straight: 3 consecutive ranks (+10)
     - Flush: all 3 same suit (+8)
     - Straight flush: both straight and flush (+20)
   - Jokers are wild exactly as described above.

3. Lane total = base sum + applicable bonuses.

Then:

- Compare lane totals between the two players:
  - Higher total deals damage equal to the **difference** to the other player.
  - If lane totals are equal, no damage is dealt from that lane.

After all lanes are resolved:

- Move all lane cards into the discard pile.
- The round is over.

---

## New Round & Sudden Death

After a round ends and all lane cards have been discarded:

1. Check each player's HP.
2. If one HP ≤ 0 and the other HP > 0, the player with HP ≤ 0 loses the match.
3. If both HP ≤ 0:
   - The player with the **higher HP** (less negative) wins.
4. If both HP are exactly equal:
   - A **sudden death tiebreaker** is used:
     - Shuffle all 56 cards into a deck.
     - Both players reveal top cards (War-style).
     - If tied, repeat reveals until one player wins.
     - The winner of this War flip wins the match outright.

If both players' HP are still > 0 and not tied after a round:

- Gather all 56 cards (discard + any remaining in decks/hands).
- Shuffle to form a new deck.
- Start a new round from the initial War flip.

---

## Summary of Damage Sources

Damage can occur in four main ways:

1. **Initial War flip** at the start of each round:
   - Higher card deals damage equal to value difference.
2. **Immediate lane resolution** when both sides of a lane reach 3 cards:
   - Higher lane total (base + bonus) deals damage equal to lane total difference.
   - Active card suit effects (damage bonus/healing) are applied (v1.3).
3. **End-of-round full-board resolution**:
   - All lanes resolve; each winner per lane deals damage equal to lane total difference.
   - Active card suit effects (damage bonus/healing) are applied (v1.3).
4. **Discard damage**:
   - Whenever a player discards a card directly from hand to the discard pile, that player takes damage equal to the **value of that card**.
   - This applies for every such discard, and discarding is always allowed.

These rules define the complete behavior for the v1.3 implementation.

---

## Active Cards and Suit Effects (v1.3)

At the start of the game, each player chooses a suit. Cards of their chosen suit become "active" and provide special effects.

### Visual Distinction

- **Active Cards**: Displayed in full color
- **Inactive Cards**: Displayed in grayscale
- **Jokers**: Always count as active for their owner

### Suit Effect Types

Each suit provides a unique effect when active cards are played in lanes:

**Damage Suits (Diamonds, Spades)**
- Active cards add bonus damage when their lane resolves
- The bonus is added to the total damage dealt to the opponent

**Healing Suits (Hearts, Clubs)**
- Active cards provide healing when their lane resolves
- First, healing reduces incoming damage
- Any remaining healing after damage mitigation restores HP

### Effect Values by Card Rank

| Card Ranks | Effect Value |
|------------|--------------|
| 2, 3, 4, 5 | +7 |
| 6, 7, 8, 9, 10 | +5 |
| J, Q, K, Joker | +3 |

### Lane Resolution with Suit Effects

When a lane resolves:

1. Calculate base lane totals (card values + poker bonuses)
2. Determine the winner (higher total)
3. Calculate base damage (winner total - loser total)
4. Add winner's damage bonus (if any active Diamonds/Spades cards)
5. Subtract loser's healing (if any active Hearts/Clubs cards)
6. Apply final damage (minimum 0)
7. If healing exceeds damage, overflow restores loser's HP

**Example:**
- Player (Diamonds) has 3 active cards with +7, +5, +3 bonus = +15 damage
- AI (Hearts) has 2 active cards with +5, +3 bonus = +8 healing
- Base damage to AI: 10
- With bonuses: 10 + 15 - 8 = 17 final damage to AI

---

## Balance Notes (v1.1)

The poker bonus values were rebalanced from v1.0 to account for:

- **Jokers are very powerful** (wild + highest value), making pairs and three-of-a-kind too easy
- **Pairs** reduced from +5 to +3 (extremely common with jokers)
- **Three of a kind** reduced from +15 to +12 (any pair + joker = instant bonus)
- **Flush** reduced from +10 to +8 (slightly easier than straights)
- **Straight flush** reduced from +25 to +20 (still best, but less swingy)
- **Straight** unchanged at +10 (hardest to set up intentionally)

---

## Lane Resolution Changes (v1.2)

The lane resolution system was updated in v1.2 to provide more strategic depth:

- **Delayed Resolution**: Instead of lanes only resolving when both players have 3 cards, a filled lane now auto-resolves after a 2-turn countdown
- **Response Window**: The opponent gets exactly two turns to respond to a filled lane
- **Visual Indicators**: Pending lanes display "Resolves in X" text and glow (yellow for 2 turns, red for 1 turn)
- **Strategic Implications**: Players have more time to respond, creating opportunities for tactical counterplay

### AI Strategy (v1.2)

The AI opponent uses the following priority system:

1. **Urgency First**: Respond to opponent-filled lanes that will auto-resolve next turn
2. **Complete Lanes**: Fill lanes where AI has 2 cards
3. **Build Lanes**: Continue building in lanes where AI has 1 card
4. **Start Lanes**: Begin new lanes with lowest value cards
5. **Discard**: Only as absolute last resort (when no legal lane plays exist)

General principle: AI plays lowest value cards first to preserve high-value cards for later turns.

