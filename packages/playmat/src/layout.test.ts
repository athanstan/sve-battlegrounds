import { describe, expect, it } from 'vitest';
import { createCamera, DEFAULT_CAMERA } from './camera';
import { cornersOf } from './scene/quad';
import { backKey, cardKey, computeLayout, pileKey, viewpointOf } from './layout';
import { CARD, DESIGN, LEADER_CARD } from './theme';
import { atMainPhase, newState, populate, spectatorViewOf, viewOf } from './testing/views';

const camera = createCamera({ ...DEFAULT_CAMERA, viewport: DESIGN });
const state = atMainPhase('layout', 2);

describe('computeLayout', () => {
  it('puts the viewing player at the near edge, whichever seat that is', () => {
    expect(viewpointOf(viewOf(state, 0))).toBe(0);
    expect(viewpointOf(viewOf(state, 1))).toBe(1);
    expect(viewpointOf(spectatorViewOf(state))).toBe(0);

    const asSeat1 = computeLayout(viewOf(state, 1), camera);
    const near = asSeat1.avatars.find((avatar) => avatar.seat === 1);
    const far = asSeat1.avatars.find((avatar) => avatar.seat === 0);
    expect(near?.position.y).toBeGreaterThan(DESIGN.height / 2);
    expect(far?.position.y).toBeLessThan(DESIGN.height / 2);
  });

  it('is a pure function of the view', () => {
    const view = viewOf(state, 0);
    expect(computeLayout(view, camera)).toEqual(computeLayout(view, camera));
  });

  it('shows the local hand face up and the opponent hand as anonymous backs', () => {
    const layout = computeLayout(viewOf(state, 0), camera);
    const mine = layout.cards.filter((card) => card.zone === 'hand' && card.seat === 0);
    const theirs = layout.cards.filter((card) => card.zone === 'hand' && card.seat === 1);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((card) => card.ref !== null && card.key === cardKey(card.ref.id))).toBe(true);
    expect(theirs.length).toBeGreaterThan(0);
    expect(
      theirs.every((card, index) => card.ref === null && card.key === backKey(1, 'hand', index)),
    ).toBe(true);
  });

  it('draws the local hand largest, and the far rows a little smaller', () => {
    const layout = computeLayout(populate(viewOf(state, 0)), camera);
    const scaleOf = (zone: string, seat: number) =>
      layout.cards.find((card) => card.zone === zone && card.seat === seat)?.pose.scale ?? 0;
    expect(scaleOf('hand', 0)).toBeGreaterThan(scaleOf('hand', 1));
    expect(scaleOf('field', 0)).toBeGreaterThan(scaleOf('field', 1));
    // EX sits just behind the field and smaller than it.
    expect(scaleOf('ex', 0)).toBeLessThan(scaleOf('field', 0));
  });

  it('keeps every row in its place: far above near, EX behind the field, hands at the edges', () => {
    const layout = computeLayout(populate(viewOf(state, 0)), camera);
    const y = (zone: string, seat: number) =>
      layout.cards.find((card) => card.zone === zone && card.seat === seat)?.pose.y ?? NaN;
    expect(y('hand', 1)).toBeLessThan(y('ex', 1));
    expect(y('ex', 1)).toBeLessThan(y('field', 1));
    expect(y('field', 1)).toBeLessThan(y('field', 0));
    expect(y('field', 0)).toBeLessThan(y('ex', 0));
    expect(y('ex', 0)).toBeLessThan(y('hand', 0));
  });

  it('keeps every table card inside the design area', () => {
    for (const seat of [0, 1] as const) {
      const layout = computeLayout(populate(viewOf(state, seat)), camera);
      for (const card of layout.cards) {
        expect(card.pose.x, card.key).toBeGreaterThan(0);
        expect(card.pose.x, card.key).toBeLessThan(DESIGN.width);
        // Hands are held at the screen edge, so part of a card may be past it.
        if (card.zone === 'hand') continue;
        expect(card.pose.y, card.key).toBeGreaterThan(0);
        expect(card.pose.y, card.key).toBeLessThan(DESIGN.height);
      }
    }
  });

  it('holds the local hand on the bottom edge of the screen and the far hand on the top edge', () => {
    for (const seat of [0, 1] as const) {
      const layout = computeLayout(populate(viewOf(state, seat)), camera);
      const hands = (mine: boolean) =>
        layout.cards.filter((card) => card.zone === 'hand' && (card.seat === seat) === mine);
      const near = hands(true);
      const far = hands(false);
      expect(near.length).toBeGreaterThan(0);
      expect(far.length).toBeGreaterThan(0);

      for (const card of near) {
        const half = (CARD.height * card.pose.scale) / 2;
        // The rim of the card is cut by the edge, with most of the card on screen.
        expect(card.pose.y + half, card.key).toBeGreaterThan(DESIGN.height);
        expect(card.pose.y - half, card.key).toBeGreaterThan(DESIGN.height * 0.78);
      }
      for (const card of far) {
        const half = (CARD.height * card.pose.scale) / 2;
        expect(card.pose.y - half, card.key).toBeLessThan(0);
        expect(card.pose.y + half, card.key).toBeLessThan(DESIGN.height * 0.2);
      }
    }
  });

  it('keeps the fields clear of the hands, so a hand never hides the board', () => {
    const layout = computeLayout(populate(viewOf(state, 0)), camera);
    const handTop = Math.min(
      ...layout.cards
        .filter((c) => c.zone === 'hand' && c.seat === 0)
        .map((c) => c.pose.y - (CARD.height * c.pose.scale) / 2),
    );
    for (const card of layout.cards.filter(
      (c) => c.seat === 0 && (c.zone === 'field' || c.zone === 'ex'),
    )) {
      expect(card.pose.y + (CARD.height * card.pose.scale * 0.72) / 2, card.key).toBeLessThan(
        handTop,
      );
    }
  });

  it('keeps the rows of the table from covering one another', () => {
    for (const seat of [0, 1] as const) {
      const layout = computeLayout(populate(viewOf(state, seat)), camera);
      const band = (zone: string, mine: boolean) => {
        const ys = layout.cards
          .filter((card) => card.zone === zone && (card.seat === seat) === mine)
          .flatMap((card) => {
            const q = cornersOf(
              camera,
              { ...card.pose, flat: card.flat, width: 1 },
              CARD.width / 2,
              CARD.height / 2,
            );
            return [q[1], q[3], q[5], q[7]];
          });
        return { top: Math.min(...ys), bottom: Math.max(...ys) };
      };
      // From the far edge to the near one: hand, EX, field | field, EX, hand.
      const order = [
        band('hand', false),
        band('ex', false),
        band('field', false),
        band('field', true),
        band('ex', true),
        band('hand', true),
      ];
      order.slice(1).forEach((next, i) => {
        const above = order[i];
        expect(next.top, `row ${i + 1}`).toBeGreaterThanOrEqual((above?.bottom ?? 0) - 4);
      });
    }
  });

  it('lays field, EX and resolution cards on the table and holds the hand up to the player', () => {
    const layout = computeLayout(populate(viewOf(state, 0)), camera);
    const flatOf = (zone: string) =>
      layout.cards.filter((card) => card.zone === zone).map((c) => c.flat);
    for (const zone of ['field', 'ex']) {
      expect(flatOf(zone).length, zone).toBeGreaterThan(0);
      expect(
        flatOf(zone).every((flat) => flat === 1),
        zone,
      ).toBe(true);
    }
    for (const flat of flatOf('hand')) {
      expect(flat).toBeGreaterThan(0);
      expect(flat).toBeLessThan(0.5);
    }
    expect(flatOf('cemetery').every((flat) => flat === 0)).toBe(true);
  });

  it('turns engaged followers sideways and links an evolved form to the follower it stands on', () => {
    const layout = computeLayout(populate(viewOf(state, 0)), camera);
    const field = layout.cards.filter((card) => card.zone === 'field' && card.seat === 0);
    expect(
      field.some((card) => card.engaged && Math.abs(card.pose.rotation - Math.PI / 2) < 1e-9),
    ).toBe(true);
    expect(field.filter((card) => card.evolved)).toHaveLength(1);
    expect(field.find((card) => card.evolved)?.evolved?.superEvolved).toBe(true);
  });

  it('draws no pile for an empty cemetery or banished zone: an empty zone is empty mat', () => {
    const empty = computeLayout(viewOf(state, 0), camera);
    expect(empty.piles.map((pile) => pile.kind).sort()).toEqual([
      'deck',
      'deck',
      'evolve',
      'evolve',
    ]);

    const full = computeLayout(populate(viewOf(state, 0)), camera);
    expect(full.piles.filter((pile) => pile.kind === 'cemetery')).toHaveLength(2);
    expect(full.cards.filter((card) => card.zone === 'cemetery' && card.seat === 0)).toHaveLength(
      3,
    );
  });

  it('puts the deck count on the pile and tracks the view as cards are drawn', () => {
    const early = computeLayout(viewOf(newState('counts'), 0), camera);
    const later = computeLayout(viewOf(state, 0), camera);
    const deck = (layout: typeof early) =>
      layout.piles.find((pile) => pile.key === pileKey(0, 'deck'));
    expect(deck(early)?.count).toBeGreaterThan(deck(later)?.count ?? Infinity);
  });

  it('lays the leaders and orb trays on the left rail, opponent above the local seat', () => {
    const layout = computeLayout(viewOf(state, 0), camera);
    for (const avatar of layout.avatars) expect(avatar.position.x).toBeLessThan(DESIGN.width * 0.2);
    for (const tray of layout.trays) expect(tray.origin.x).toBeLessThan(DESIGN.width * 0.2);
    const [far, near] = [
      layout.avatars.find((a) => a.seat === 1),
      layout.avatars.find((a) => a.seat === 0),
    ];
    expect(far?.position.y).toBeLessThan(near?.position.y ?? 0);
    expect(far?.size).toEqual({ width: LEADER_CARD.width, height: LEADER_CARD.height });
    expect(near?.size).toEqual({ width: LEADER_CARD.width, height: LEADER_CARD.height });
  });

  it('keeps the evolve deck alone on the left, and the deck on the right with the cemetery and banished above it', () => {
    const full = computeLayout(populate(viewOf(state, 0)), camera);
    const pose = (seat: number, kind: string) =>
      full.piles.find((pile) => pile.seat === seat && pile.kind === kind)?.pose;
    const middle = DESIGN.width / 2;
    for (const seat of [0, 1]) {
      expect(pose(seat, 'evolve')?.x).toBeLessThan(middle);
      for (const kind of ['deck', 'cemetery', 'banished'])
        expect(pose(seat, kind)?.x).toBeGreaterThan(middle);
    }
    // Local seat (0) is at the bottom: the stack climbs toward the middle. The opponent mirrors it.
    const y = (seat: number, kind: string): number => pose(seat, kind)?.y ?? Number.NaN;
    expect(y(0, 'cemetery')).toBeLessThan(y(0, 'deck'));
    expect(y(0, 'banished')).toBeLessThan(y(0, 'cemetery'));
    expect(y(1, 'cemetery')).toBeGreaterThan(y(1, 'deck'));
    expect(y(1, 'banished')).toBeGreaterThan(y(1, 'cemetery'));
  });

  it('does not reveal a hidden hand to a closed spectator', () => {
    const layout = computeLayout(spectatorViewOf(state), camera);
    expect(
      layout.cards.filter((card) => card.zone === 'hand').every((card) => card.ref === null),
    ).toBe(true);
    const open = computeLayout(spectatorViewOf(state, [0]), camera);
    expect(
      open.cards.some((card) => card.zone === 'hand' && card.seat === 0 && card.ref !== null),
    ).toBe(true);
    expect(
      open.cards
        .filter((card) => card.zone === 'hand' && card.seat === 1)
        .every((card) => card.ref === null),
    ).toBe(true);
  });

  it('marks whose turn it is, and who the match is waiting on', () => {
    const layout = computeLayout(viewOf(state, 0), camera);
    expect(layout.avatars.filter((avatar) => avatar.active)).toHaveLength(1);
    expect(layout.avatars.filter((avatar) => avatar.waiting)).toHaveLength(1);
    expect(layout.over).toBe(false);
  });
});
