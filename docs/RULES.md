# War-Lanes Poker – Game Rules v2.0

## Overview

War-Lanes Poker is a 1v1 card game that mixes:
- War-style damage (difference in card values)
- Lane-based play (3 lanes per player)
- Poker-style bonuses on 3-card "hands"
- **Suit-based abilities** that trigger on play or lane resolution

Each player starts at **100 HP**. The game is played over one or more rounds using a **56-card deck**. Rounds continue until a player's HP drops to 0 or below and a winner is determined.

---

## Deck & Card Values

- Deck: **56 cards**
  - 52 standard playing cards (4 suits, 13 ranks)
  - **4 Jokers** (one of each suit: Hearts, Diamonds, Clubs, Spades)

- Card values:
  - 2–10 → 2–10
  - Jack (J) → 11
  - Queen (Q) → 12
  - King (K) → 13
  - Ace (A) → 14
  - Joker → **15**

- **Joker Mechanics**:
  - **Suited**: Each Joker belongs to a specific suit. The Joker matching your chosen suit appears in color (active), others appear grayscale (inactive).
  - **Wild for Poker**: Jokers dynamically become the optimal rank/suit for the best poker bonus.
  - **Position-Flexible**: Can be played at any position in a lane.
  - **Value Cap Rule**: A Joker's resolved value is capped by the minimum value of cards played AFTER it.
    - Example: Joker → Queen → King (same suit) = Joker becomes Jack for straight flush (J-Q-K)
    - Example: Joker → 2 = Joker becomes 2 (pair)
  - **No Suit Abilities**: Jokers never trigger suit effects, even if they match your suit.

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
   - The winner becomes the **first player** for this round.
   - **No damage is dealt** from the War flip (v2.0 change).
3. If the revealed cards are a **tie**:
   - Both players reveal another top card (keeping the previous revealed cards on the table).
   - Repeat until a non-tie reveals a winner.
4. All revealed cards from the War flip go into the **shared discard pile**.
5. The winner's suit becomes the **Field Control suit**, affecting the battlefield appearance.

After the War flip, each player draws **5 cards** from their remaining personal deck into their hand.

---

## Turn Structure

The game proceeds in turns, starting with the War flip winner and alternating between players.

On your turn:

1. You must **play up to 3 cards from your hand**.
   - Cards can be played:
     - Into one of your 3 lanes (Left, Middle, Right), or
     - Into the shared **discard pile**.
2. **Ending your turn:**
   - Normally, you must play 3 cards before ending your turn.
   - If your **hand is empty** (because you drew fewer cards near the end of the round), you may end your turn early after playing at least 1 card.
3. After ending your turn, you perform a draw step.

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

Drawing is split between end-of-turn and start-of-turn to allow strategic planning while maintaining reactive gameplay:

### End of Turn Draw (Planning Phase)
When you end your turn, draw **2 cards** from your deck (if available):
- This lets you plan your next turn with most of your hand ready
- If your deck has fewer than 2 cards, draw whatever remains

### Start of Turn Draw (Reactive Element)
When your turn begins, draw **1 card** from your deck (if available):
- This adds an element of adapting on-the-fly
- You must incorporate this new card into your existing plans

### Deck Exhaustion

- If your deck has **0 cards**: No cards are drawn at that phase
- Continue playing with whatever cards remain in your hand

### Ending Your Turn

Normally, you must play or discard **3 cards** before ending your turn. However:

- If your **hand becomes empty** before playing 3 cards (because you drew fewer cards), you may end your turn early after playing at least 1 card.
- This ensures both players can play **all cards** from their decks before the round ends.

### Round Completion

A player's turn is considered their **final turn** when:
- Their deck is empty, AND
- Their hand is empty (after playing their cards)

The round ends when **both players have completed their final turns** (both have empty decks AND empty hands). At that point, all remaining lanes are resolved.

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

Each player's personal deck will eventually run out. The round ends when **both players have exhausted all their cards**.

**A player is finished for the round when:**
- Their deck is empty, AND
- Their hand is empty (after playing all remaining cards)

This ensures both players get to play **every card** in their deck before the round ends. If you draw only 2 cards because that's all that remains, you play those 2 cards (and may end your turn early once your hand is empty).

**Once both players have finished**, the round ends. At that point, some lanes may be:

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

Damage can occur in several ways:

1. **On-Play Effects** (v2.0):
   - **Aces and Face Cards (J/Q/K)** of your active suit trigger effects immediately when played
   - Spades J/Q/K/A deal direct damage
   - Diamonds Ace deals self-damage as a cost

2. **Lane Resolution**:
   - Higher lane total (base + poker bonus) deals damage equal to the difference
   - Low-tier (2-6) and Mid-tier (7-10) suit effects trigger based on win/loss
   - Blood Debt stacks are consumed on lane wins for bonus damage

3. **Damage Over Time**:
   - Bleed stacks deal 2 damage per stack at the start of your turn

4. **Discard Damage**:
   - Discarding a card from hand deals damage to you equal to that card's value

5. **Support Ability** (damage suits):
   - Diamonds and Spades Support abilities deal 5 damage (+ Charge Power for Diamonds)

**Note:** The War flip no longer deals damage in v2.0 – it only determines turn order and field control.

---

## Active Cards and Suit Abilities (v2.0)

At the start of the game, each player chooses a suit. Cards of their chosen suit become "active" and provide unique abilities based on the card's rank tier.

### Visual Distinction

- **Active Cards**: Displayed in full color
- **Inactive Cards**: Displayed in grayscale
- **Jokers**: Display based on their suit (each Joker has a suit), but **never trigger suit abilities**

---

## Suit Ability System (v2.1)

Each suit has unique abilities that trigger at different times based on card rank. For detailed information on all suit effects, see **[SUIT_EFFECTS.md](SUIT_EFFECTS.md)**.

### Trigger Timing by Rank

| Rank Tier | Trigger |
|-----------|---------|
| **Low (2-6)** | On lane resolution (loss-oriented) |
| **Mid (7-10)** | On lane resolution (win-oriented) |
| **High (J/Q/K)** | **ON PLAY** (immediate when card is played) |
| **Ace** | **ON PLAY** (immediate when card is played) |

### Suit Overviews

| Suit | Theme | Key Mechanics |
|------|-------|---------------|
| **Clubs** | Control & Disruption | Card replacement, board manipulation, lane neutralization |
| **Spades** | Aggression & Pressure | Direct damage, Blood Debt, Bleed DoT |
| **Hearts** | Sustain & Defense | Damage mitigation, Regen stacks, healing over time |
| **Diamonds** | Scaling & Sacrifice | Charges, Charge Power, self-damage for power |

---

## Support Ability (v2.0)

Each player has a Support character that can be activated after losing lanes.

### Unlocking

- Unlocked after losing **2 lanes**
- A lane loss = you had cards in the lane AND opponent won
- Support icon glows when ready
- Resets after use (must lose 2 more lanes to unlock again)

### Effects by Suit

| Suit | Type | Effect |
|------|------|--------|
| Clubs | Heal | Heal 5 HP |
| Spades | Damage | Deal 5 damage |
| Hearts | Heal | Heal 5 HP |
| Diamonds | Damage | Deal (5 + Charge Power) damage |

**Note:** Health can exceed the starting 100 HP cap when using healing abilities.

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

