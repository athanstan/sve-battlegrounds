import { DESIGN } from '@sve/playmat';
import { atMainPhase, catalog, populate, spectatorViewOf, viewOf } from '@sve/playmat/testing';
import { useMemo, useState, type ReactNode } from 'react';
import { PlaymatCanvas } from '../match/PlaymatCanvas';
import type { Frame } from '../net/frame';

/**
 * Development lab: the playmat on its own, fed real engine views. For tuning the table against
 * the reference frames without a server. Not part of the product; the router only loads it in dev.
 */

type Perspective = 'seat0' | 'seat1' | 'spectator';

export default function Lab() {
  const [perspective, setPerspective] = useState<Perspective>('seat0');
  const [dressed, setDressed] = useState(true);
  const [turn, setTurn] = useState(2);
  const [replays, setReplays] = useState(0);

  const state = useMemo(() => atMainPhase('lab', turn), [turn]);

  const frame: Frame = useMemo(() => {
    const raw =
      perspective === 'spectator'
        ? spectatorViewOf(state)
        : viewOf(state, perspective === 'seat0' ? 0 : 1);
    return {
      view: dressed ? populate(raw) : raw,
      events: [],
      kind: replays === 0 ? 'snapshot' : 'delta',
    };
  }, [perspective, dressed, state, replays]);

  return (
    <div className="flex h-full">
      <aside className="flex w-60 shrink-0 flex-col gap-4 border-r border-slab bg-basalt p-4 text-sm">
        <h1 className="font-display text-lg text-gold-bright">Playmat lab</h1>

        <Field label="Viewpoint">
          <select
            className="w-full rounded bg-slab p-1.5"
            value={perspective}
            onChange={(e) => setPerspective(e.target.value as Perspective)}
          >
            <option value="seat0">Seat 0</option>
            <option value="seat1">Seat 1</option>
            <option value="spectator">Spectator</option>
          </select>
        </Field>

        <Field label={`Turn ${turn}`}>
          <input
            type="range"
            min={1}
            max={8}
            value={turn}
            onChange={(e) => setTurn(Number(e.target.value))}
          />
        </Field>

        <label className="flex items-center gap-2">
          <input type="checkbox" checked={dressed} onChange={(e) => setDressed(e.target.checked)} />
          Dress the field, EX and piles
        </label>

        <button
          className="rounded bg-slab px-3 py-1.5 hover:bg-slab-raised"
          onClick={() => setReplays((n) => n + 1)}
        >
          Show again as an update
        </button>

        <p className="mt-auto text-xs text-mist">
          Design area {DESIGN.width}×{DESIGN.height}, fixture catalog.
        </p>
      </aside>

      <main className="min-w-0 flex-1">
        <PlaymatCanvas
          className="h-full w-full"
          frame={frame}
          catalog={catalog}
          selectable={null}
          onSelectionChange={() => undefined}
        />
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs uppercase tracking-wider text-mist">{label}</span>
      {children}
    </label>
  );
}
