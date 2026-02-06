# Suit Effects Reference Guide (v2.2)

This document provides a complete reference for all suit abilities, status effects, and the support ability system in War-Lanes Poker v2.2.

---

## Table of Contents

1. [Overview](#overview)
2. [Trigger Timing](#trigger-timing)
3. [Clubs - Control & Disruption](#clubs---control--disruption)
4. [Spades - Aggression & Pressure](#spades---aggression--pressure)
5. [Hearts - Sustain & Defense](#hearts---sustain--defense)
6. [Diamonds - Scaling & Resources](#diamonds---scaling--resources)
7. [Status Effects Glossary](#status-effects-glossary)
8. [Support Ability](#support-ability)
9. [Jokers](#jokers)
10. [v2.2 Change Summary](#v22-change-summary)

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
| **Low** | 2, 3, 4, 5, 6 | Lane Resolution | Varies by suit |
| **Mid** | 7, 8, 9, 10 | Lane Resolution | Win-oriented |
| **High** | Jack, Queen, King | **ON PLAY** | Immediate when played |
| **Ace** | Ace | **ON PLAY** | Immediate when played |

---

## Clubs - Control & Disruption

Clubs focuses on card manipulation and board control. Key v2.2 changes simplify effects and add direct value.

### Low Tier (2-6): Manipulation Through Failure

| Trigger | Effect |
|---------|--------|
| **LOSS** | Choose a card from your hand to replace with a Clubs Jack, Queen, or King |
| WIN | No effect |

**Details:**
- You select which hand card to discard
- You choose which face card (J/Q/K) to receive
- Powerful for converting weak hands into strong face cards

### Mid Tier (7-10): Board Control

| Trigger | Effect |
|---------|--------|
| **WIN** | Choose a card from your hand to replace with a Clubs Ace |
| LOSS | No effect |

**v2.2 Change:** Previously allowed moving cards or neutralizing lanes. Now provides direct card upgrade.

### Jack (ON PLAY)

**Effect:** Double the poker bonus for your side of this lane

**Details:**
- Only affects YOUR poker bonus, not the opponent's
- Applied during lane resolution
- Examples:
  - Pair (+3) becomes +6
  - Straight (+10) becomes +20

### Queen (ON PLAY)

**Effect:** Move an opponent's top card from one lane to another

**v2.2 Change:** Previously delayed lane resolution. Now provides direct board manipulation.

**Details:**
- Select an opponent's top card from any lane
- Move it to a different lane
- Can disrupt opponent's poker hands

### King (ON PLAY)

**Effect:** Neutralize a lane (disable all suit effects until it resolves)

**v2.2 Change:** Previously blocked opponent effects only in the same lane. Now can neutralize any lane.

**Details:**
- Select any lane to neutralize
- Neutralized lanes ignore ALL suit effects when they resolve
- Affects both players' effects in that lane

### Ace (ON PLAY)

**Effect:** Heal 5 HP AND deal 5 damage to opponent

**v2.2 Change:** Previously offered a choice between move card or neutralize. Now provides guaranteed value.

**Details:**
- Both effects apply automatically (no choice)
- Simple, reliable value generation

---

## Spades - Aggression & Pressure

Spades focuses on building pressure through Blood Debt and Bleed. v2.2 completely reworks face cards away from direct damage.

### Resources

| Resource | Description | Duration |
|----------|-------------|----------|
| **Blood Debt** | Consumed during lane resolution to double poker bonus | Until consumed |
| **Bleed** | Separate instances deal damage per turn to opponent | 3 turns each (no refresh) |

### Blood Debt Mechanic (v2.2)

Blood Debt is consumed **DURING** lane resolution to boost your poker bonus:

1. Calculate your poker bonus (e.g., Pair = +3)
2. If Blood Debt >= poker bonus: Consume that amount to **double** the bonus
3. If Blood Debt < poker bonus but > 0: Add all Blood Debt to the bonus (partial boost)
4. This affects lane totals BEFORE winner determination

**Example:** You have +5 Blood Debt and a Pair (+3 bonus)
- Consume 3 Blood Debt
- Poker bonus becomes +6 (doubled)
- Remaining Blood Debt: 2

### Bleed Mechanic (v2.2)

- Duration: **3 turns** per instance
- New bleed does **NOT refresh** existing bleed instances
- Each instance deals its damage independently at the start of the affected player's turn
- Example: If you apply 4 bleed/turn, then later apply 8 bleed/turn:
  - Turns 1-3: Take 12 damage/turn (both active)
  - After first instance expires: Take 8 damage/turn (second instance only)

### Low Tier (2-6): Blood Debt

| Trigger | Effect |
|---------|--------|
| **LOSS** | +4 Blood Debt to self |
| WIN | +2 Blood Debt to self |

**v2.2 Change:** Reduced loss value from +5 to +4.

### Mid Tier (7-10): Bleed

| Trigger | Effect |
|---------|--------|
| **WIN** | Apply +4 Bleed/turn to opponent (3 turns) |
| LOSS | Apply +2 Bleed/turn to opponent (3 turns) |

**v2.2 Change:** Duration 3 turns. Each application is a separate instance (no refresh).

### Jack (ON PLAY)

**Effect:** +10 Blood Debt to self

**v2.2 Change:** Previously dealt 6 damage (+3 if opponent HP < 30). Now builds Blood Debt.

### Queen (ON PLAY)

**Effect:** +4 Bleed to opponent

**v2.2 Change:** Previously dealt 9 damage (+4 if opponent HP < 30). Now applies Bleed.

### King (ON PLAY)

**Effect:** +5 Blood Debt to self AND +2 Bleed to opponent

**v2.2 Change:** Previously dealt 12 damage (+6 if opponent HP < 30). Now combines both resources.

### Ace (ON PLAY)

**Effect:** +5 Blood Debt, +2 Bleed, THEN choose: +5 more Blood Debt OR +2 more Bleed

**v2.2 Change:** Previously dealt 10 damage with conditional Bleed. Now builds resources with choice.

---

## Hearts - Sustain & Defense

Hearts focuses on damage mitigation and regeneration through an instance-based healing system (similar to Bleed).

### Resources

| Resource | Description | Cap |
|----------|-------------|-----|
| **Regen Instances** | Separate healing sources (each with own duration) | None |
| **Regen Effect Bonus** | Multiplier applied to all regen healing | None |
| **Duration per Instance** | 5 Hearts player turns (does NOT refresh) | 5 Turns |

**Healing Formula:**
```
Base Healing = Sum of all active regen instance healing values
Total Healing = Base Healing × (1 + Regen Effect Bonus)
```

### Regen Mechanic (v2.2)

- Regen works like Bleed - each application is a **separate instance**
- New regen does **NOT refresh** existing regen durations
- Each instance deals its healing independently at the start of the Hearts player's turn
- Example: If you gain +2 regen/turn, then later gain +1 regen/turn:
  - Turns 1-5: Heal 3/turn (both active)
  - After first instance expires: Heal 1/turn (second instance only)

### Regen Tick Timing

- Regen **ONLY** ticks on the Hearts player's own turns
- Ticks at the start of each Hearts player turn
- Each instance's duration decrements by 1 each tick
- Instances are removed when their duration reaches 0

### Low Tier (2-6): Endurance

| Trigger | Effect |
|---------|--------|
| **LOSS** | 50% mitigation to lane-difference damage |
| WIN | +1 Regen/turn (new instance, 5 turns) |

### Mid Tier (7-10): Renewal

| Trigger | Effect |
|---------|--------|
| **WIN** | +2 Regen/turn (new instance, 5 turns) |
| LOSS | 25% mitigation to lane-difference damage |

### Mitigation Rules

- **Only reduces base lane damage** (the difference between lane totals)
- **Does NOT reduce:**
  - Blood Debt bonus damage
  - Bleed tick damage
  - On-play damage
  - Discard self-damage
- **Non-stacking:** Use highest mitigation only (50% max)

### Jack (ON PLAY)

**Effect:** Regen Effect Bonus +2 (5 turns)

**v2.2 Change:** Increased from +1 to +2 effect bonus.

### Queen (ON PLAY)

**Effect:** +2 Regen/turn (new instance, 5 turns)

*Unchanged from v2.1*

### King (ON PLAY)

**Effect:** +1 Regen Effect Bonus AND +1 Regen/turn (new instance)

**v2.2 Change:** Reduced from +2/+2 to +1/+1 for balance.

### Ace (ON PLAY)

**Effect:** +1 Regen/turn, +1 Regen Effect, THEN choose: +1 more Regen/turn OR +1 more Regen Effect

**v2.2 Change:** Complete rework. Previously healed 10 and added +2 regen. Now provides base value plus choice.

---

## Diamonds - Scaling & Resources

Diamonds focuses on building Charges and Charge Power for scaling effects.

### Resources

| Resource | Description | Cap |
|----------|-------------|-----|
| **Charges** | Spendable resource for effects | 5 |
| **Charge Power** | Increases potency of effects (effect value = 5 + Charge Power) | +5 |

### Low Tier (2-6): Power Tithe

| Trigger | Effect |
|---------|--------|
| **LOSS** | +3 Charges (cap 5) |
| WIN | +1 Charge (cap 5) |

**v2.2 Change:** Complete rework. Now grants Charges (not Charge Power). Loss-oriented: +3 on loss, +1 on win. Maximum 5 charges.

### Mid Tier (7-10): Soul Charges

| Trigger | Effect |
|---------|--------|
| **WIN** | +3 Charges (cap 5) |
| LOSS | +1 Charge (cap 5) |

**v2.2 Change:** Increased win bonus from +2 to +3 charges. Maximum 5 charges.

### Jack (ON PLAY)

**Effect:** Gain 2 Charges

**v2.2 Change:** Previously doubled charges. Now provides flat +2 for reliability.

### Queen (ON PLAY)

**Effect:** Charge Power +2 (cap +5)

**v2.2 Change:** Previously spent all charges for damage/heal choice. Now builds Charge Power.

### King (ON PLAY)

**Effect:** +1 Charge AND +1 Charge Power

**v2.2 Change:** Previously triggered support ability. Now builds both resources.

### Ace (ON PLAY)

**Effect:** +1 Charge, +1 Charge Power, THEN choose: +2 Charges OR +2 Charge Power

**v2.2 Change:** NO SELF-DAMAGE. Previously required 8 self-damage after choice.

---

## Status Effects Glossary

### Blood Debt (Spades)

| Property | Value |
|----------|-------|
| Applied To | Self |
| Duration | Until consumed |
| Effect | Consumed during lane resolution to boost poker bonus |

**v2.2 Mechanic:**
- Consumed DURING resolution (affects winner determination)
- If Blood Debt >= poker bonus: Double the bonus
- If Blood Debt < poker bonus: Add all Blood Debt to bonus

### Bleed (Spades)

| Property | Value |
|----------|-------|
| Applied To | Opponent |
| Duration | 3 turns per instance |
| Damage | Instance healing per tick |

**v2.2 Change:**
- Duration: 3 turns per instance
- New bleed does **NOT refresh** existing instances (each tracked separately)

### Regen (Hearts)

| Property | Value |
|----------|-------|
| Applied To | Self |
| Duration | 5 Hearts player turns per instance |
| Healing | Sum of all instances × (1 + Effect Bonus) per tick |

**v2.2 Change:**
- Now instance-based like Bleed (no refresh)
- Each application creates a new healing instance with its own 5-turn duration

### Lane Neutralization (Clubs)

| Property | Value |
|----------|-------|
| Applied To | Lane |
| Duration | Until lane resolves |
| Effect | ALL suit effects ignored in that lane |

*Unchanged from v2.1*

---

## Support Ability

Each player has a Support character that provides a suit-based ability.

### Unlocking

- Unlocked after losing **2 lanes**
- A lane loss = you had cards in the lane AND opponent won
- Support icon glows when ready
- Resets after use (must lose 2 more lanes to unlock again)

### Effects by Suit

| Suit | Type | Effect |
|------|------|--------|
| **Clubs** | Heal | Heal 5 HP |
| **Spades** | Damage | Deal 5 damage |
| **Hearts** | Heal | Heal 5 HP |
| **Diamonds** | Damage | Deal (5 + Charge Power) damage |

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

---

## v2.2 Change Summary

### Clubs
| Card | v2.1 | v2.2 |
|------|------|------|
| 7-10 | Move card OR Neutralize | Replace hand card with Clubs Ace |
| Queen | Delay lane 1 turn | Move opponent card |
| King | Block opponent effects in lane | Neutralize any lane |
| Ace | Move card OR Neutralize (choice) | Heal 5, Deal 5 (both, no choice) |

### Spades
| Card | v2.1 | v2.2 |
|------|------|------|
| 2-6 LOSS | +5 Blood Debt | +4 Blood Debt |
| 7-10 | 2-turn Bleed | 3-turn Bleed (refreshes) |
| Jack | Deal 6 damage (+3 if HP<30) | +10 Blood Debt |
| Queen | Deal 9 damage (+4 if HP<30) | +4 Bleed |
| King | Deal 12 damage (+6 if HP<30) | +5 Blood Debt, +2 Bleed |
| Ace | Deal 10, conditional Bleed | +5 Debt, +2 Bleed, then choose |
| Blood Debt | Consumed on win for bonus damage | Consumed DURING resolution to double poker bonus |

### Hearts
| Card | v2.1 | v2.2 |
|------|------|------|
| Jack | +1 Regen Effect | +2 Regen Effect |
| King | +2 Effect, +2 Stacks | +1 Effect, +1 Stacks |
| Ace | Heal 10, +2 Stacks | +1/+1, then choose +1 more |

### Diamonds
| Card | v2.1 | v2.2 |
|------|------|------|
| 2-6 LOSS | +1 Charge Power | +3 Charges (cap 5) |
| 2-6 WIN | No effect | +1 Charge (cap 5) |
| 7-10 WIN | +2 Charges | +3 Charges (cap 5) |
| 7-10 LOSS | +1 Charge | +1 Charge (cap 5) |
| Jack | Double Charges | Gain 2 Charges |
| Queen | Spend all charges for damage/heal | +2 Charge Power |
| King | Trigger support ability | +1 Charge, +1 Power |
| Ace | Choice + 8 self-damage | Choice, NO self-damage |

---

## Quick Reference Tables

### Damage Effects

| Source | Affected By Mitigation? |
|--------|------------------------|
| Lane Difference | Yes |
| Blood Debt Poker Boost | No (affects total, not damage) |
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
| Diamonds | WIN/LOSS | WIN/LOSS | ON PLAY | ON PLAY |

### Resource Persistence

| Resource | Persists Across Rounds? |
|----------|------------------------|
| Blood Debt | Yes |
| Bleed Instances | Yes |
| Regen Instances | Yes |
| Regen Effect Bonus | Yes |
| Charges | Yes |
| Charge Power | Yes |
| Lanes Lost (Support) | Yes |
