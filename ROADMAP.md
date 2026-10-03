# Roadmap

What is left after the first playable slice (play, attack, evolve, abilities, search, Quick,
Serve/Race). Items are ordered by how much they block a believable match, not by effort. Checked
boxes are done; the rest is open.

## Now: make the two reference decks real

The pinned fixtures for decks 940 (_On Curve All Day_, Forestcraft) and 909 (_daiwa vodka 2026_,
Umamusume) in `packages/cards` were built by hand, not dumped from the database. Playing against the
live decks shows where they drift.

- [ ] **Run `pnpm dump:decks` against the shadowrates database** and replace the hand-built fixture
      with the real card list and printed text. The live 940 contains cards the fixture does not
      (for example _Blessed Fairy Dancer_), and the live 909 is 43 + 10 cards where the fixture is
      40 + 10.
- [ ] **Script every card in both live decks.** `coverage.test.ts` already fails for any card whose
      name and text hash has no script, so the test list is the to-do list.
- [ ] Add a per-card test for each new script (`behaviors.test.ts` is the pattern).
- [ ] Make the "text not automated" badge disappear for exactly the cards that have a matching
      script, and nothing else. Verify it in a real match for both decks.

## Rules gaps and known approximations

- [ ] **Quick windows** list only cards that carry the Quick keyword. Anything else that can be
      used at Quick timing is not offered yet.
- [ ] The Quick window opens only when the non-active player has something to play. That leaks a
      little information (standard in digital card games), but it should be a deliberate, documented
      choice with a per-match setting.
- [ ] _Cheval Grand_: "an enemy follower damaged by you leaves the field" cannot read
      `damagedThisTurnBy` after the zone change, so it never fires.
- [ ] _Titania_ buffs every Pixie token on the field, not only the one that entered.
- [ ] "Put the rest on the bottom in any order" keeps the current order and asks nothing.
- [ ] Printings the catalog does not model yet: **equipment, crests, evolution-point cards and
      Advanced followers**. Decks that use them are listed as illegal.
- [ ] Other universes (Vanguard) are rejected until their setup rules exist.
- [ ] Tokens in the main deck are rejected; check that this matches the rules for every universe.
- [ ] Walk the Comprehensive Rules once more for sections the slice does not touch, and list what is
      missing here.
- [ ] Track Comprehensive Rules revisions (currently 1.23.0) and re-run the audit when it changes.

## Table and interface

- [x] Hover a card to read its full text in a scrollable, closable panel.
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
