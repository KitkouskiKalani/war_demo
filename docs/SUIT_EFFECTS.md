# Suit Effects Reference Guide (v2.1)

This document provides a complete reference for all suit abilities, status effects, and the support ability system in War-Lanes Poker.

---

## Table of Contents

1. [Overview](#overview)
2. [Trigger Timing](#trigger-timing)
3. [Clubs - Control & Disruption](#clubs---control--disruption)
4. [Spades - Aggression & Pressure](#spades---aggression--pressure)
5. [Hearts - Sustain & Defense](#hearts---sustain--defense)
6. [Diamonds - Scaling & Sacrifice](#diamonds---scaling--sacrifice)
7. [Status Effects Glossary](#status-effects-glossary)
8. [Support Ability](#support-ability)
9. [Jokers](#jokers)

---

## Overview

At the start of each game, each player chooses a suit. Cards of your chosen suit become **active** and trigger special abilities. Active cards are displayed in full color, while inactive cards appear in grayscale.

### Key Concepts

- **Active Cards**: Cards matching your chosen suit that trigger abilities
- **Inactive Cards**: Cards of other suits that provide no special effects
- **Jokers**: Never trigger suit abilities, even if their suit matches yours

---

## Trigger Timing

Card abilities trigger at different times based on their rank tier:

| Rank Tier | Cards | Trigger Timing | Notes |
|-----------|-------|----------------|-------|
| **Low** | 2, 3, 4, 5, 6 | Lane Resolution | Loss-oriented (stronger on loss) |
| **Mid** | 7, 8, 9, 10 | Lane Resolution | Win-oriented (stronger on win) |
| **High** | Jack, Queen, King | **ON PLAY** | Immediate when played to lane |
| **Ace** | Ace | **ON PLAY** | Immediate when played to lane |

---

## Clubs - Control & Disruption

Clubs focuses on board manipulation, card replacement, and denying opponent strategies. Clubs has a **feast-or-famine** design with no half-effects - abilities only trigger on the specified win/loss condition.

### Low Tier (2-6): Manipulation Through Failure

| Trigger | Effect |
|---------|--------|
| **LOSS** | Choose a card from your hand to replace with a Clubs Jack, Queen, or King |
| WIN | No effect |

**Details:**
- You select which hand card to discard
- You choose which face card (J/Q/K) to receive
- The replaced card goes to the discard pile
- Powerful for converting weak hands into strong face cards

### Mid Tier (7-10): Board Control

| Trigger | Effect |
|---------|--------|
| **WIN** | Choose: Move opponent's top card to another lane OR Neutralize a lane |
| LOSS | No effect |

**Move Card Option:**
- Select an opponent's top card from any lane
- Move it to a different lane (must be legal placement)
- Can disrupt opponent's poker hands

**Neutralize Lane Option:**
- Select any lane to neutralize
- Neutralized lanes ignore ALL suit effects when they resolve
- Useful against opponents with strong lane effects

### Jack (ON PLAY)

**Effect:** Double the poker bonus for your side of this lane

**Details:**
- Only affects YOUR poker bonus, not the opponent's
- Applied during lane resolution
- Examples:
  - Pair (+3) becomes +6
  - Straight (+10) becomes +20
  - Straight Flush (+20) becomes +40

### Queen (ON PLAY)

**Effect:** Delay another lane's resolution by 1 turn

**Details:**
- Select a different lane (not the one Queen is played to)
- If lane is pending: adds +1 to turns until resolution
- If lane is not pending: sets a delay flag for when it becomes pending
- Cannot target the same lane Queen is played to

### King (ON PLAY)

**Effect:** Block opponent's suit effects in this lane

**Details:**
- Only affects the lane King is played to
- Opponent's loss effects will not trigger
- Your effects still trigger normally
- Active during lane resolution

### Ace (ON PLAY)

**Effect:** Choose: Move any card OR Neutralize a lane

**Details:**
- Same options as 7-10 but available immediately on play
- Move Card: Can move any card (yours or opponent's) to another lane
- Neutralize: Selected lane ignores all suit effects when resolved

---

## Spades - Aggression & Pressure

Spades focuses on dealing damage and applying sustained pressure through damage-over-time effects. Spades has **half-effects** that trigger on the opposite outcome.

### Low Tier (2-6): Blood Debt

| Trigger | Effect |
|---------|--------|
| **LOSS** | Add +5 Blood Debt stacks |
| WIN | Add +2 Blood Debt stacks |

**Details:**
- Blood Debt stacks accumulate on YOU
- When you WIN a lane, all stacks are consumed for bonus damage
- Example: 10 Blood Debt stacks + lane win = +10 bonus damage to opponent

### Mid Tier (7-10): Bleed

| Trigger | Effect |
|---------|--------|
| **WIN** | Apply +2 Bleed stacks to opponent |
| LOSS | Apply +1 Bleed stack to opponent |

**Details:**
- Bleed stacks are applied to opponent
- Each stack deals 2 damage at the start of their turn
- Stacks last 2 turns before expiring
- Multiple applications create separate stack groups

### Jack (ON PLAY)

**Effect:** Deal 6 damage to opponent (+3 bonus if opponent HP < 30)

| Opponent HP | Damage |
|-------------|--------|
| ≥ 30 | 6 |
| < 30 | 9 |

### Queen (ON PLAY)

**Effect:** Deal 9 damage to opponent (+4 bonus if opponent HP < 30)

| Opponent HP | Damage |
|-------------|--------|
| ≥ 30 | 9 |
| < 30 | 13 |

### King (ON PLAY)

**Effect:** Deal 12 damage to opponent (+6 bonus if opponent HP < 30)

| Opponent HP | Damage |
|-------------|--------|
| ≥ 30 | 12 |
| < 30 | 18 |

### Ace (ON PLAY)

**Effect:** Deal 10 damage to opponent. If opponent HP < 40 after damage, apply 2 Bleed stacks.

**Details:**
- Damage is applied first
- HP check happens after damage
- Conditional Bleed adds pressure against low HP opponents

---

## Hearts - Sustain & Defense

Hearts focuses on damage mitigation and regeneration through a stack-based healing system. Hearts has a unique **mitigation** mechanic that reduces incoming lane damage.

### Resources

| Resource | Description |
|----------|-------------|
| **Regen Stacks** | Number of stacks that multiply healing per tick |
| **Regen Effect Bonus** | Added to base heal per tick (default 0) |
| **Duration** | 5 Hearts player turns, refreshed on any regen gain |

**Healing Formula:**
```
Healing per tick = Regen Stacks × (1 + Regen Effect Bonus)
```

**Example:** 4 Regen Stacks with +2 Regen Effect Bonus = 4 × 3 = 12 HP healed per tick

### Regen Tick Timing

- Regen **ONLY** ticks on the Hearts player's own turns
- Ticks at the start of each Hearts player turn
- Duration decrements by 1 each tick
- When duration reaches 0, Regen Stacks reset to 0

### Low Tier (2-6): Endurance

| Trigger | Effect |
|---------|--------|
| **LOSS** | 50% mitigation to lane-difference damage |
| WIN | +1 Regen stack (refresh duration to 5) |

### Mid Tier (7-10): Renewal

| Trigger | Effect |
|---------|--------|
| **WIN** | +2 Regen stacks (refresh duration to 5) |
| LOSS | 25% mitigation to lane-difference damage |

### Mitigation Rules

- **Only reduces base lane damage** (the difference between lane totals)
- **Does NOT reduce:**
  - Blood Debt bonus damage
  - Bleed tick damage
  - On-play damage (Spades J/Q/K/A, etc.)
  - Discard self-damage
- **Non-stacking:** If multiple cards qualify, use highest mitigation (50% max)
- Applied BEFORE damage is dealt

**Mitigation Example:**
- Lane totals: Opponent 30 vs You 20 = 10 base damage
- You have a Hearts 3 (low tier) in the losing lane
- 50% mitigation: 10 × 0.5 = 5 damage taken

### Jack (ON PLAY)

**Effect:** Regen Effect Bonus +1 (refresh duration to 5 turns)

**Details:**
- Increases the multiplier in healing formula
- Duration is refreshed independently
- Stacks with existing Regen Effect Bonus

### Queen (ON PLAY)

**Effect:** +2 Regen stacks (refresh duration to 5 turns)

**Details:**
- Adds stacks directly
- Refreshes duration to full 5 turns
- Can be used to jumpstart regen before lane resolutions

### King (ON PLAY)

**Effect:** Regen Effect Bonus +2 AND +2 Regen stacks

**Details:**
- Provides both bonus and stacks
- Both durations are refreshed to 5 turns
- Most powerful single regen card

### Ace (ON PLAY)

**Effect:** Heal 10 HP AND +2 Regen stacks (refresh duration)

**Details:**
- Immediate 10 HP heal
- Sets up sustained healing through regen
- Good for recovery and sustained pressure

---

## Diamonds - Scaling & Sacrifice

Diamonds focuses on building resources over time for powerful burst effects. Requires setup but offers high ceiling potential.

### Resources

| Resource | Description | Cap |
|----------|-------------|-----|
| **Charges** | Spent for effects via Queen or Support | None |
| **Charge Power** | Increases potency of charge-spending effects | +5 |

**Effect Value Formula:**
```
Effect Value = 5 + Charge Power
```

### Low Tier (2-6): Power Tithe

| Trigger | Effect |
|---------|--------|
| **LOSS** | +3 Charges (cap 5) |
| WIN | +1 Charge (cap 5) |

**Details:**
- Losing builds your scaling
- At max (+5), effect value becomes 10

### Mid Tier (7-10): Soul Charges

| Trigger | Effect |
|---------|--------|
| **WIN** | +3 Charges (cap 5) |
| LOSS | +1 Charge (cap 5) |

**Details:**
- Charges are your spendable resource (max 5)
- Build up for Queen or Support Ability

### Jack (ON PLAY)

**Effect:** Double your current Charges

**Details:**
- 0 charges → 0 charges (no effect)
- 3 charges → 6 charges
- 10 charges → 20 charges
- Best played with existing charge pool

### Queen (ON PLAY)

**Effect:** Spend all Charges, choose to deal damage OR heal, applied at (5 + Charge Power) × 2

**Details:**
- All charges are consumed
- You choose: damage opponent OR heal yourself
- Effect is applied TWICE at the calculated value
- Example with Charge Power +3: (5 + 3) × 2 = 16 total damage/heal

### King (ON PLAY)

**Effect:** Deal damage OR Heal (5 + Charge Power) based on your suit type

**Details:**
- Diamonds is a damage suit → deals damage to opponent
- Effect value = 5 + your current Charge Power
- Does not consume charges

### Ace (ON PLAY)

**Effect:** Choose: +4 Charges OR Charge Power +2, then take 8 self-damage

**Details:**
- Must choose one of the two options
- Self-damage is applied AFTER the choice
- Risk vs reward tradeoff
- Charge Power option respects the +5 cap

---

## Status Effects Glossary

### Blood Debt (Spades)

| Property | Value |
|----------|-------|
| Applied To | Self |
| Duration | Until consumed |
| Effect | Consumed on lane WIN, adds stacks as bonus damage |

**Mechanics:**
- Accumulates from Spades 2-6 effects
- All stacks consumed when you win ANY lane
- Bonus damage is added to lane damage (not mitigated by Hearts)

### Bleed (Spades)

| Property | Value |
|----------|-------|
| Applied To | Opponent |
| Duration | 2 turns |
| Damage | 2 per stack per tick |

**Mechanics:**
- Ticks at the start of affected player's turn
- Each stack deals 2 damage
- Multiple applications create separate stack groups
- Not reduced by Hearts mitigation

### Regen (Hearts)

| Property | Value |
|----------|-------|
| Applied To | Self |
| Duration | 5 Hearts player turns |
| Healing | Stacks × (1 + Effect Bonus) per tick |

**Mechanics:**
- Only ticks on Hearts player's own turns
- Duration refreshed on ANY regen gain
- Effect Bonus has separate duration tracking
- Expires at end of round regardless of remaining duration

### Lane Neutralization (Clubs)

| Property | Value |
|----------|-------|
| Applied To | Lane |
| Duration | Until lane resolves |
| Effect | ALL suit effects ignored in that lane |

**Mechanics:**
- Affects both players' effects
- Only affects the designated lane
- Cleared after lane resolution

---

## Support Ability

Each player has a Support character that provides a suit-based ability.

### Unlocking

- Unlocked after losing **2 lanes**
- A lane loss = you had cards in the lane AND opponent won
- Support icon glows when ready
- Resets after use (must lose 2 more lanes to unlock again)

### Using the Ability

**Player:** Click the glowing support icon during your turn
**AI:** Automatically activates after ~1.5 seconds when ready

### Effects by Suit

| Suit | Type | Base Effect | Scaling |
|------|------|-------------|---------|
| **Clubs** | Heal | Heal 5 HP | None |
| **Spades** | Damage | Deal 5 damage | None |
| **Hearts** | Heal | Heal 5 HP | None |
| **Diamonds** | Damage | Deal (5 + Charge Power) damage | Yes |

**Notes:**
- Healing can exceed 100 HP cap
- Diamond Support scales with Charge Power
- Support damage is NOT mitigated by Hearts

---

## Jokers

### Overview

- 4 Jokers in the deck (one of each suit)
- Joker matching your chosen suit displays in color (active appearance)
- Other Jokers display in grayscale (inactive appearance)

### Important Rules

- **Jokers NEVER trigger suit effects**, even if their suit matches yours
- Jokers are wild for poker bonuses (become optimal rank/suit)
- Base value: 15 (highest in the game)
- Value Cap Rule: Joker's resolved value capped by cards played after it

### Value Cap Examples

| Cards Played | Joker Becomes | Reason |
|--------------|---------------|--------|
| Joker → Q → K | Jack (11) | Forms J-Q-K straight flush |
| Joker → 2 | 2 | Capped by 2, forms pair |
| 5 → Joker → 7 | 6 | Becomes 6 for 5-6-7 straight |
| A → Joker (last) | 15 | No cap, max value |

---

## Quick Reference Tables

### Damage Effects

| Source | Affected By Mitigation? |
|--------|------------------------|
| Lane Difference | Yes |
| Blood Debt | No |
| Bleed Ticks | No |
| On-Play Damage | No |
| Discard Self-Damage | No |
| Support Damage | No |

### Effect Trigger Summary

| Suit | Low (2-6) | Mid (7-10) | Face Cards | Ace |
|------|-----------|------------|------------|-----|
| Clubs | LOSS only | WIN only | ON PLAY | ON PLAY |
| Spades | LOSS/WIN | WIN/LOSS | ON PLAY | ON PLAY |
| Hearts | LOSS/WIN | WIN/LOSS | ON PLAY | ON PLAY |
| Diamonds | LOSS only | WIN/LOSS | ON PLAY | ON PLAY |

### Resource Persistence

| Resource | Persists Across Rounds? |
|----------|------------------------|
| Blood Debt | Yes |
| Bleed Instances | Yes |
| Regen | Yes |
| Regen Effect Bonus | Yes |
| Charges | Yes |
| Charge Power | Yes |
| Lanes Lost (Support) | Yes |
