import type { CardCatalog, CardId, CardRef } from '@sve/rules';
import { useMemo, useState } from 'react';
import { Button } from '../ui/primitives';

interface Props {
  readonly title: string;
  readonly cards: readonly CardRef[];
  readonly catalog: CardCatalog;
  readonly min?: number;
  readonly max?: number;
  readonly confirmLabel?: string;
  /** Read-only browsing has no confirm. */
  readonly onConfirm?: (picked: readonly CardId[]) => void;
  readonly onClose: () => void;
}

/** Art grid for searching a pile or looking at the top of the deck. */
export function CardBrowser({
  title,
  cards,
  catalog,
  min = 0,
  max = 0,
  confirmLabel = 'Confirm',
  onConfirm,
  onClose,
}: Props) {
  const [picked, setPicked] = useState<readonly CardId[]>([]);
  const selectable = onConfirm !== undefined;
  const enough = picked.length >= min && picked.length <= max;

  const faces = useMemo(
    () =>
      cards.map((ref) => {
        const def = catalog(ref.def);
        return { ref, def };
      }),
    [cards, catalog],
  );

  const toggle = (id: CardId) => {
    if (!selectable) return;
    setPicked((current) => {
      if (current.includes(id)) return current.filter((card) => card !== id);
      if (current.length < max) return [...current, id];
      return max === 1 ? [id] : current;
    });
  };

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-ink/70 p-6"
      role="dialog"
    >
      <div className="flex max-h-[80vh] w-full max-w-4xl flex-col rounded-lg border border-gold/40 bg-basalt/95 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slab px-5 py-3">
          <h2 className="font-display text-lg text-gold-bright">{title}</h2>
          <Button onClick={onClose}>Close</Button>
        </div>
        <div className="grid grid-cols-2 gap-3 overflow-y-auto p-5 sm:grid-cols-4 md:grid-cols-5">
          {faces.map(({ ref, def }) => {
            const selected = picked.includes(ref.id);
            return (
              <button
                type="button"
                key={ref.id}
                onClick={() => toggle(ref.id)}
                className={`relative overflow-hidden rounded-md border ${
                  selected ? 'border-gold' : 'border-slab'
                } bg-ink text-left`}
              >
                {def?.artUrl ? (
                  <img
                    src={def.artUrl}
                    alt={def.name}
                    className="aspect-[5/7] w-full object-cover"
                  />
                ) : (
                  <div className="flex aspect-[5/7] items-center justify-center p-2 text-sm text-parchment">
                    {def?.name ?? 'Card'}
                  </div>
                )}
                {def ? (
                  <div className="truncate px-2 py-1 text-xs text-mist">
                    {def.cost} · {def.name}
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
        {selectable ? (
          <div className="flex justify-end gap-2 border-t border-slab px-5 py-3">
            <Button tone="primary" disabled={!enough} onClick={() => onConfirm?.(picked)}>
              {enough ? confirmLabel : `Pick ${Math.max(0, min - picked.length)} more`}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
