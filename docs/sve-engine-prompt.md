Build a polished player-vs-player digital TCG for Shadowverse: Evolve (Comprehensive Rules Ver. 1.23.0, 16 Mar 2026). Not a tabletop simulator. The engine resolves cards. Players only send intents and answer prompts.

This is not Magic and not a physics sandbox. There is no spell stack and no "pass priority to resolve the top item." A card or ability is played into the single shared resolution zone, costs and targets are locked, then it resolves. Pending automatic abilities wait for Confirmation Timing. The only opponent windows are Quick windows.

The match plays itself. The client animates the event log. A seat is prompted only when the rules require an answer. Passing a Quick window or ending the phase is an answer. Dragging a card into a zone is not.

Look (Arena camera, clean playmat, SVE zones):

Style lock, not a wireframe. Match these frames: artifacts/imagine_images/XT1ID.jpg for the empty board, artifacts/imagine_images/97llC.jpg for a resolving spell. Same camera as the Arena shots: fixed, elevated, slight angle, local seat on the near edge, opponent on the far edge, far cards a little smaller, local hand the largest row. No orbit, no side view, no webcam.

Production bar is a shipped card game. Full card frames, art, cost badge, attack and defense badges, soft contact shadows, avatar portraits, shield, hourglass. Not boxes, not a slot grid, not captions under every orb, not a debug overlay.

The mat starts empty and super clean. Dark stone, one faint center circle, a thin midline. No flowers, pillars, candles, vines, statues, plane borders, or set dressing. No empty-slot ring grid. An empty zone is empty mat. Particles exist only while a spell or ability is resolving, in the center, and they must not hide the board.

Pixi owns this mat. React owns names, chat, menus, concede, and the pass button. Do not render cards in the DOM.

Avatars sit on the left rail, opponent above local. Defense is a shield. Not a life total printed on a card.

Opponent hand: face-down fan along the top edge, count visible, no card ids. Local hand: face-up fan along the bottom edge, overlapping, raised on hover. Hand limit 7.

Each field is one row of up to 5 cards between the center and that player's hand. Followers and amulets share the row. Reserved is upright. Engaged is turned 90 degrees. Attack and defense sit on the card. Keywords are icons.

EX is a face-up row of up to 5, smaller, just behind that field. No "EX" label on the mat. Both seats and a closed spectator see these faces. Do not hide EX. Do not use land piles.

Deck is a face-down pile beside the avatar, count on the pile. Cemetery is the face-up pile next to it. Evolve deck is a smaller pile by the leader, faces visible only to the owner. Banished is a third pile; facedown cards are backs.

Leader is the avatar, not a card on the field. An evolved follower stays in its slot and shows the linked evolve-zone face as a frame, not a second body. Super-evolve gets a distinct rim.

Play points, max play points, evolution points, and super-evolution points are orbs. No text labels under them. They are not cards.

Center is the resolution stage. A played spell or ability lifts into the middle, plays its impact, then the verbs land: damage numbers, destroy shatter, banish dissolve, evolve flash, draw arc. The log is a slim ticker, not the board.

Legal targets glow. Illegal cards do not. The only persistent control is the bottom-right hourglass: End phase in the main phase, Pass in a Quick window. A prompt bar appears above the hand only while an answer is required.

Automation (stop only for an answer):

The server advances every step that has no choice. Start phase, draw, refresh, play-point gain, rules handling, mandatory automatic abilities, damage, destruction, token elimination, and Last Words or Fanfare with no target all commit and emit events. The client plays those events in order. No "resolve" click, no stack pass, no manual move to cemetery.

Prompt the seat whose answer the rules need, and only then. Prompt types: mulligan; main-phase intent (play, activate, attack, evolve, end); target or mode or allocation; optional cost, including paying an evolution point and super-evolving; evolve-deck card to reveal; Quick window after an attack (8.4.7); end-phase Ward engage (7.4.3); end-phase Quick window (7.4.5); discard down to 7 if several cards could be chosen (7.4.7).

A Quick window is one prompt, not a stack. The defender may play one Quick card or Quick activated ability, or pass. If they play one, Confirmation Timing runs, then the same prompt returns (8.4.8, 7.4.6). Pass closes the window and the engine continues into damage or the turn end.

If a mandatory ability has several legal orders, prompt for which pending ability to play. If it has one legal order, play it. If a required target count cannot be met, the play is illegal and never starts.

The opponent watches the same animation. They are not asked to confirm the other seat's Fanfare. Spectators receive the same public events, filtered.

Hover and legal-target glow are the only optimistic visuals. Board state changes when the event log says so.

Client:

Pixi playmat as specified above. No 3D table.

React owns menus, chat, the prompt bar, and the pass button. Do not render the board in DOM.

Animate the event log. Impacts required on damage, destroy, banish, evolve, and super-evolve.

Readable cards at field size. Opponent hand is backs only.

Stack (do not substitute):

TypeScript end to end

React + Tailwind for lobby, deck builder, chat, match chrome

PixiJS for the playmat only (cards, board, impacts, particles)

Colyseus for rooms, presence, reconnect, delta state

One shared rules package imported by client and server

Postgres for accounts, decks, match records, event logs

Redis only if Colyseus in-memory rooms are not enough

Product:

1v1 matches only. The rules do not support more than two players (1.1.1). Spectators join the same room and receive a filtered projection. They are not players.

Chat is a side channel (match + lobby). Never mix chat into the rules log.

No bots. A seat is a human. Do not design an AI policy.

Concede is an intent. It loses immediately. Confirmation Timing does not occur. No card can force or replace a concession (1.2.3).

Authority:

Server owns the match. Clients send intents only: play, attack, activate, evolve, superEvolve, pass, choose, allocate, engageWards, concede.

Clients must not send board mutations (no "move card to cemetery", no "set defense").

Illegal intents are rejected before any mutation. The rules rewind to the point before the illegal play (10.6.2.3.3, 10.6.2.5.4). The server replies with the committed event log.

Card text overrides the comprehensive rules when they conflict (1.3.1). Impossible parts of an effect are skipped; the rest still happens (1.3.2). Zero or negative repetitions do not happen and do not invert. Dealing 0 damage is not damage.

Shared rules:

Pure reducer: (state, action) => { state, events }.

Client runs it locally to highlight legal intents and targets in the same frame.

Server runs the same function to commit. A wrong preview is corrected by the event log.

Deterministic. No Date.now, no Math.random in the reducer. The only randomness is a seeded stream owned by the server: first-player choice and shuffles. Seed is stored on the match. Shuffle results are private events; the opponent receives the new count, not the order.

Zones (4). Each player has one of each unless noted. Counts of every zone are public (4.1.2.1).

Leader area. Public. One leader. Defense starts at 20 (2.8.3.1, 6.2.1.12).

Field. Public. Followers and amulets. Reserved or engaged. Limit 5 at game start (4.4.4.1). Order not tracked.

Deck area. Non-public, ordered. Owner cannot look unless an effect says so. "Deck" means this zone.

Evolve deck area. Non-public to the opponent. Owner may look. Unordered. Faceup revealed cards are public and are not part of the evolve deck unless a rule says so (4.6.3).

Hand. Non-public. Owner only. Limit 7 at game start (4.7.3.1). Not 9.

EX area. Public, face-up. Limit 5 (4.8.3.1). Opponent and closed spectators see these card ids. Do not treat EX as a hidden hand.

Cemetery. Public, face-up, unordered.

Banished zone. Generally public. Faceup unless an effect says facedown. Facedown banished cards are hidden.

Resolution zone. One shared public zone. Cards and abilities sit here while being played (4.11).

Evolve zone. Public. Holds the evolved card linked to a field card (4.12, 5.16).

Drive zone, trigger zone, and race zone exist for universe cards. Do not build them in the first slice.

Overflow when putting or creating onto field or EX: the effect's controller keeps up to (limit - current) of the incoming cards and the rest are not moved or created (4.4.4.2, 4.8.3.2). End-of-turn hand over the limit is a discard down, then Confirmation Timing, repeat (7.4.7).

Card model (data, not scripts that patch zones):

A card definition is data: name, class or universe, type, traits, cost, attack, defense, text, abilities. Types in the first slice: leader, follower, spell, amulet. Special types: evolved card, token. Advanced cards and double-faced cards are later.

Classes: Neutral, Forestcraft, Swordcraft, Runecraft, Dragoncraft, Abysscraft, Havencraft. Portalcraft is not a class. Artifacts are the Supreme trait. Puppets are the Puppetry trait.

An evolved card is a separate definition. Evolving links the field card to that card in the evolve zone. It does not replace the object and does not count as entering the field (5.16.2).

Abilities are four kinds (10.1): activated ("[cost]: [effect]"), automatic ("when/whenever/at [event], [effect]"), passive, spell ability. Passive abilities are not played.

An ability is { kind, trigger | null, cost, target filter, verb list }. Scripts pick the verb, the filter, and the trigger. They do not write zones themselves.

Keywords expand into those kinds. First keyword set: Fanfare, Last Words, On Evolve, On Super-Evolve, Strike, Ward, Storm, Rush, Assail, Intimidate, Drain, Bane, Aura, Quick. Class conditions: Combo, Spellchain, Stack, Earth Rite, Overflow, Necrocharge, Sanguine.

Fanfare: when this card is put onto the field from a zone other than the field (12.4).

Last Words: when this card is put into the cemetery from the field (12.5). Bury puts a field card into its owner's cemetery and is not destroy (5.34), but it is still a cemetery-from-field move.

Evolve ability: activated. Cost includes revealing a corresponding card from the evolve deck (12.2.2). If the printed cost includes play points, 1 evolution point may replace 1 play point (12.2.3). Once per turn unless an effect says otherwise (8.3.2).

Super-evolve: while paying an evolve ability, if turns passed is at least 7 (went first) or 6 (went second), the player may also pay 1 super-evolution point. Then +1/+1 and the card has both super-evolved and evolved (12.2.4).

Engine-owned verbs. First set, named as the rules name them:

draw, putTopIntoCemetery, discard, addToHand, search, shuffle

put, summon (put a token), createToken, eliminateToken

destroy, banish, bury

dealDamage (tag it attack, combat, or ability; they are different, 5.14.3)

increaseDefense, decreaseDefense (there is no separate "heal" verb)

engage, refresh

recoverPlayPoints, addMaxPlayPoints

evolve, superEvolve

giveKeyword, modifyAttackDefense, addCountdown

choose, selectTarget, allocate, declareName

Do not add a generic buff/debuff/heal/bounce/mill verb and map the rules onto it later. Bounce is "put into hand". Mill is "put the top card of the deck into the cemetery".

Tokens (9.1):

Treated as cards for counts and effects. Owner is the player whose zone they were created in.

Follower and amulet tokens may exist only in EX, field, or resolution zone. Spell tokens only in EX or resolution zone.

If a token would be anywhere else, eliminate it immediately after the move, before the rest of the effect. No Confirmation Timing. Eliminated tokens do not enter the cemetery.

Puppet token: Neutral, Puppetry, 1 cost, 1/1, Rush.

Match loop (this replaces any stack):

Setup (6.2), in order: present leader, 40-50 main deck, 0-10 evolve deck. Class deck: leader class plus Neutral. Copy limit: 3 of a name in a deck; the same name may also have 3 in the evolve deck. Shuffle both decks with the seed. Random seat, that player chooses who goes first. Each draws 4. First may bottom all 4 in any order and redraw 4; then second may. PP and max PP 0. First gets 0 evolution points, second gets 3. Each gets 1 super-evolution point. Leader defense 20. First player becomes active.

Start phase (7.2): max PP +1 up to 10, PP set to max PP, refresh field, draw 1 (first player skips the draw on turn 1), Confirmation Timing.

Main phase (7.3): start-of-main-phase triggers, Confirmation Timing, then the active player picks one intent: play a card from hand or EX, play an activated ability, attack, or end the phase. After any intent except end, Confirmation Timing, then offer the choice again.

End phase (7.4): start-of-end-phase triggers, Confirmation Timing, active player may engage any number of Ward followers, Confirmation Timing, non-active Quick window, discard down to hand limit, clear "until end of turn" / "during this turn" / "during your turn", pass the turn.

Playing a card or ability (10.6), and only if the whole sequence is legal:

Specify it. A card is revealed and moved to the resolution zone. An ability on a hidden card reveals that card until resolution.

Prerequisite choices: optional extra costs, X, choose-modes.

Targets. "Up to N" may be fewer. A required number must be filled or the play is illegal and rewinds. Hidden-zone cards are not targets.

Determine and pay the full cost. Partial payment is impossible. Cost modifiers change what is paid, not the printed cost (10.4.4.1).

Field check for a follower or amulet: if the field is already at the limit, the play is illegal.

The card or ability is now "played". Resolve in written order. A follower or amulet moves from the resolution zone to the field if under the limit. A spell or ability performs its verbs, then the card goes to its owner's cemetery and the ability leaves the resolution zone (10.6.2.8.2.3).

Effects applied in EX still apply in the resolution zone and, if it moves EX to field directly, on the field (4.8.3.3, 10.6.2.1.3).

Confirmation Timing (10.5), not a stack pass:

Rules handling until none remain (11).

Active player must play one pending automatic ability, which resolves, then return to rules handling.

Then the non-active player does the same.

Pending abilities are mandatory. The controller chooses which pending ability to play if several are waiting. A trigger that met N times is pending N times. "N times per turn" caps how many become pending.

Zone-shift triggers use the information from the public zone the rule specifies (10.7.4). A card that changes controller does not "enter" the new field (10.7.4.3).

State triggers become pending once when the state is achieved, and again only if the state is met again after resolution.

Rules handling (11), only inside Confirmation Timing:

Leader defense 0 or less is a loss. Draw from an empty deck is a loss. Both at once is a draw. A win or loss effect ends the game immediately, no Confirmation Timing.

Follower defense 0 or less is destroyed. A follower that fought a Bane follower is destroyed.

Field over limit, EX over limit, illegal evolve links, Stack at 0, PP over limit.

Attack (8.4), in order:

Select a reserved follower that has been on your field since the start of the turn, or that evolved this turn. Storm and Rush modify this (12.9, 12.10). Rush may attack only an engaged follower.

Select a target: an engaged enemy follower, or the enemy leader if this follower has been on the field since the start of the turn. Ward forces the attacker to pick an engaged Ward follower if one exists (12.8). Intimidate cannot be chosen as an attack target (12.12). Assail may pick reserved followers (12.11). Aura is not an attack restriction (12.15).

If no legal target, the attack rewinds.

Engage the attacker. It has attacked. If the target is a follower, they are in combat.

Confirmation Timing.

Non-active Quick window: Quick card from hand or EX, Quick activated ability, or nothing. Repeat while they keep playing one (8.4.7-8.4.8).

If the attacker is still on the field, it deals attack damage equal to its attack. A follower target simultaneously deals combat damage back. If both are still in combat, they fought (8.4.9). Drain triggers only on attack damage dealt by the attacker (12.13). Bane is rules handling after a fight (12.14).

Confirmation Timing. Then they leave combat.

Resources:

Play points: floor 0, ceiling is current max PP. Max PP floor 0, ceiling 10 (3.2.4).

Evolution points: floor 0. They are not a third mana pool. They replace 1 PP on an evolve ability.

Super-evolution points: floor 0. Spent only on the super-evolve add-on.

Turns passed increments when that player begins their start phase as the active player for the first time that turn (3.3).

Views (filter on the server, not in CSS):

Seat: own hand face-up, own deck count and not order, own evolve deck face-up, opponent hand size only, opponent evolve-deck count plus any faceup revealed evolve cards, public board, public EX, public cemetery, public evolve zone.

Closed spectator: public board, both hand sizes, both deck counts, both evolve-deck counts, no hand ids, no deck order, no evolve-deck ids. EX ids are visible because EX is public.

Hands-visible spectator: one or both hands face-up, still no deck order.

Ranked forces closed. A spectator payload must not contain a card id that role cannot see. Reconnect restores the seat and reapplies that filter.

Replay is the event log, re-projected per role on playback. Private shuffle and draw events are stored, then stripped per role.

Rooms:

Lobby lists live matches and spectator slots.

Host sets view mode before start: closed, open, or hands-visible.

Reconnect restores seat and reapplies the filtered projection.

Out of scope for the first slice:

Bots, AI, ranked ladder economy, marketplace, 3D camera, Unity, Elixir, Rust rules engine.

Manual drag-to-zone resolution. Drag is only an intent to play or attack.

Universe rules (drive, ride, race), advanced cards, double-faced cards, Boxed, Maneuver.

More than two players.

Done when:

Two browsers can play a match through the server, including the turn-1 no-draw, the 7-card end-step discard, and a Quick window after an attack.

A third browser can spectate closed and cannot see either hand's card ids, but can see both EX areas.

A spell with a target and a Fanfare draw both resolve by the engine. Neither player moves a card by hand.

A follower evolve reveals an evolve-deck card, links it in the evolve zone, and does not re-trigger Fanfare.

A token put into the cemetery is eliminated and does not remain there.

Reconnect mid-match restores the filtered board.

A Fanfare with no target plays through with no prompt. A Quick window after an attack stops only the defender, with Pass on the hourglass. The end-phase Quick window does the same.

The board matches the look section: bottom seat, top opponent, face-down opposing hand, face-up EX rows, defense shields, center impact. No 3D table.
