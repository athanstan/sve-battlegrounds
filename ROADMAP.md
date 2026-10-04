# Roadmap

What is left after the first playable slice (play, attack, evolve, abilities, search, Quick,
Serve/Race). Items are ordered by how much they block a believable match, not by effort. Checked
boxes are done; the rest is open.

## Now: make the two reference decks real

The playable decks in `packages/cards/fixtures/decks.json` (printing ids and counts only; every
card fact lives in the deck-independent `cards.json` catalog) are decks **909** (_On Curve All Day_,
Forestcraft, leader Arisa), **940** (_daiwa vodka 2026_, Umamusume, leader Special Week), and
**956** (_Wasteland Sword_, Swordcraft, leader Aurelia, Blooming Blade). Scripts
are keyed by `CardDefinition.key` (slug + `@evolved`/`@token` + `#a`/`#b` for double-faced faces).
Printed names stay as they are: a corresponding evolve card is still the one that shares a name
(5.16.1.1.1). Double-faced a/b faces stay two separate cards; there is no face picking yet.

- [x] **Run `pnpm dump:decks` against the shadowrates database** and replace the hand-built fixture
      with the real card list and printed text.
- [x] **Script every card in the live decks.** `coverage.test.ts` fails for any unique key whose
      printed-text hash has no matching script.
- [x] Add a per-card test for each new script (`behaviors.test.ts` is the pattern).
- [x] Make the "text not automated" badge disappear for exactly the cards that have a matching
      script, and nothing else.

- [x] **Deck-independent card catalog** (`pnpm dump:cards` -> `fixtures/cards.json`), scripts filed
      as `<craft>/<card>.ts`, scaffolded by `pnpm new:card`, indexed by `pnpm gen:scripts`.
- [x] Leaders are keyed `name@leader`, so a leader never shares a key with the follower it is drawn from.
- [ ] Script the rest of the catalog (`pnpm cards:status`), craft by craft.
- [ ] Review the 87 cards whose reprints are worded differently beyond markup (they stay unscripted
      for that printing until a script says `allPrintings: true`).
- [x] Model Advanced, Equipment and Crest printings (Evolution Point cards stay physical-only).

## Rules gaps and known approximations

- [x] **Stable card key** for scripts and logs, next to the printed name.
- [x] Double-faced faces keyed `#a` / `#b` and treated as two cards.
- [x] `copyLimit` from `deck_restriction`, with script overrides for the 10-copy evolved Carrot spells.
- [x] `alsoNamed` for evolve correspondence (Carrot and "this follower's name is also …").
- [x] Play-time optional extra cost (Pious Flame).
- [x] Opponent `buryTop`, same-base-cost, look-top rest on top, choose-one option costs, self to EX.
- [x] Conditional statics (`activeIf`) and granted Strike (Air Shakur).
- [x] _Cheval Grand_: last-known `damagedThisTurnBy` lives on the card instance across zone changes.
- [x] "Whenever a Pixie token is put onto your field" buffs only the token that entered.
- [x] **Boxed** (Nahtnaught): lose abilities, skip refresh, expire at the end of the controller's next turn.
- [x] Reserved-only static grants, evolve-cost statics, mixed leader/follower targeting, `chooseUpTo`.
- [ ] **Quick windows** list only cards that carry the Quick keyword. Anything else that can be
      used at Quick timing is not offered yet.
- [ ] The Quick window opens only when the non-active player has something to play. That leaks a
      little information (standard in digital card games), but it should be a deliberate, documented
      choice with a per-match setting.
- [ ] "Put the rest on the bottom in any order" keeps the current order and asks nothing.
- [x] Printings the catalog models: equipment, crests, Advanced followers. Evolution-point cards stay physical-only.
- [ ] Other universes (Vanguard) are rejected until their setup rules exist.
- [ ] Tokens in the main deck are rejected; check that this matches the rules for every universe.
- [ ] Walk the Comprehensive Rules once more for sections the slice does not touch, and list what is
      missing here.
- [ ] Track Comprehensive Rules revisions (currently 1.23.0) and re-run the audit when it changes.

## Table and interface

- [x] Hover a card to read its full text in a scrollable, closable panel.
- [x] Leader is the printed leader card on the left rail (art when it loads), not a class silhouette.
- [ ] Open the card text panel from piles (cemetery, banished, evolve deck) and from the card browser.
- [ ] **Touch and keyboard**: long-press to inspect, a way to focus cards without a mouse, and
      screen-reader names for cards and prompts.
- [ ] **Attack feedback**: an attack arrow while choosing a target, damage numbers, impact particles
      and a hit-stop on big hits.
- [ ] Drag a card from hand to the field to play it, as an alternative to the action menu.
- [ ] Show keyword icons on the field, and Rush/Storm readiness more clearly.
- [ ] A turn timer with a visible clock, and a "slow play" warning.
- [ ] A log of what happened this turn, so a missed trigger can be understood after the fact.
- [ ] Sound: card plays, draws, attacks, the turn banner (a bus-based mixer with ducking).
- [ ] Layout for narrow and mobile screens.
- [ ] Rematch, and a clean result screen with a summary.

## Server and platform

- [ ] **Persistence**: store matches in Postgres (events, pinned scripts, seeds) instead of memory.
- [ ] **Replays**: the match log already pins scripts and the seed, so replaying is a client feature
      plus an endpoint.
- [ ] Spectator mode where everyone sees everything, for post-match review.
- [ ] Matchmaking / a queue, instead of only open tables.
- [ ] Reconnect hardening: server restarts currently lose all rooms.
- [ ] Rate limits and size limits on chat and intents.
- [ ] Switch from the shadowrates database to the real shadowshowdown.com API when it ships (only
      `contract.ts` and `http.ts` should change), and move to a dedicated read-only database role.
- [ ] **Sync with shadowshowdown.com.** Two independent seams, deliberately not tied together:
  - _Cards_ are public and shared: `pnpm dump:cards` reads a `CatalogSource` (Postgres today).
    The same rows from `GET /api/v1/cards?game=sve` become a second source; the committed
    `cards.json` stays the offline cache scripts are written against.
  - _Decks_ belong to a player: Google sign-in on the Colyseus server (`@colyseus/auth`), the
    shadowshowdown account linked to it, and `gateway.listDecks(token)` (already
    `GET /api/v1/decks`) returning the player's decks. `fixtures/decks.json` then only feeds
    tests and the sparring partner. No script or rule reads a deck.
- [ ] Make the fixture gateway and database gateway a single, explicit configuration choice instead
      of environment guessing.

## Quality and tooling

- [ ] **Browser end-to-end tests** (Playwright) for the two-tab scenario: create, sit, mulligan,
      play, attack, evolve, finish. Today that checklist is covered by server room tests, the
      scenario tests in `packages/cards`, and random-playout property tests, but not by a real
      browser.
- [ ] **CI** (GitHub Actions): `pnpm install --frozen-lockfile`, `pnpm check`, build.
- [ ] More property tests: random playouts across many seeds and many deck pairs, not just the two
      reference decks.
- [ ] A visual regression check for the playmat layouts.
- [ ] Performance pass on the playmat with a full board and long matches (see the PixiJS
      performance notes).
- [ ] Document how to add a card script, with a worked example, in `packages/cards`.

## Done in the first slice

- [x] Pure rules engine with event log, seeded RNG and per-viewer projection
- [x] Setup, turn order, mulligan, start phase to end phase, hand-limit discard
- [x] Play pipeline (10.6), play from EX
- [x] Attack (8.4) with Storm, Rush, Ward, Assail, Intimidate, Drain, Bane, Aura
- [x] Rules handling (11.3 to 11.6) and token elimination
- [x] Evolve and super-evolve from printed text, EP substitution, once per turn
- [x] Ability DSL, interpreter, triggers, pending-ability ordering, statics, durations
- [x] Deck search, look at the top _X_, cemetery selection, bury the top card
- [x] Quick windows after an attack and at the end phase
- [x] Umamusume Serve / Race, race zone, Carrot as an alternate name, carrot badge
- [x] Pinned scripts and tokens in the first match event
- [x] Card text panel on hover
