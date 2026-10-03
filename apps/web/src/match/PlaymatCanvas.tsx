import { Playmat, type PileKind, type SelectionSpec } from '@sve/playmat';
import type { CardCatalog, CardDefId, CardId, CardRef, Seat } from '@sve/rules';
import { useEffect, useEffectEvent, useRef } from 'react';
import type { Frame } from '../net/frame';

interface Props {
  readonly frame: Frame | null;
  readonly catalog: CardCatalog;
  readonly selectable: SelectionSpec | null;
  readonly highlight?: readonly CardId[];
  readonly leaderTargets?: readonly Seat[];
  readonly onSelectionChange: (picked: readonly CardId[]) => void;
  readonly onCardPress?: (id: CardId, at: { x: number; y: number }) => void;
  readonly onAvatarPress?: (seat: Seat) => void;
  readonly onPilePress?: (seat: Seat, kind: PileKind) => void;
  readonly onCardHover?: (ref: CardRef | null, at: { x: number; y: number }) => void;
  readonly clearToken?: number;
  readonly className?: string;
}

export function PlaymatCanvas({
  frame,
  catalog,
  selectable,
  highlight = [],
  leaderTargets = [],
  onSelectionChange,
  onCardPress,
  onAvatarPress,
  onPilePress,
  onCardHover,
  clearToken,
  className,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const matRef = useRef<Playmat | null>(null);

  const lookUp = useEffectEvent((id: CardDefId) => catalog(id));
  const reportPicks = useEffectEvent((picked: readonly CardId[]) => {
    onSelectionChange(picked);
  });
  const reportCard = useEffectEvent((id: CardId, at: { x: number; y: number }) => {
    onCardPress?.(id, at);
  });
  const reportAvatar = useEffectEvent((seat: Seat) => {
    onAvatarPress?.(seat);
  });
  const reportPile = useEffectEvent((seat: Seat, kind: PileKind) => {
    onPilePress?.(seat, kind);
  });
  const reportHover = useEffectEvent((ref: CardRef | null, at: { x: number; y: number }) => {
    onCardHover?.(ref, at);
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const mat = Playmat.mount(host, {
      catalog: (id) => lookUp(id),
      onSelectionChange: (picked) => {
        reportPicks(picked);
      },
      onCardPress: (id, at) => reportCard(id, at),
      onAvatarPress: (seat) => reportAvatar(seat),
      onPilePress: (seat, kind) => reportPile(seat, kind),
      onCardHover: (ref, at) => reportHover(ref, at),
    });
    matRef.current = mat;
    return () => {
      matRef.current = null;
      mat.destroy();
    };
  }, []);

  useEffect(() => {
    matRef.current?.setCatalog(catalog);
  }, [catalog]);

  useEffect(() => {
    matRef.current?.setSelectable(selectable);
  }, [selectable]);

  useEffect(() => {
    matRef.current?.setHighlight(highlight, leaderTargets);
  }, [highlight, leaderTargets]);

  useEffect(() => {
    if (clearToken !== undefined) matRef.current?.clearSelection();
  }, [clearToken]);

  useEffect(() => {
    const mat = matRef.current;
    if (!mat || !frame) return;
    if (frame.kind === 'snapshot') mat.reset(frame.view);
    else mat.update(frame.view, frame.events);
  }, [frame]);

  return <div ref={hostRef} className={className} role="img" aria-label="Game table" />;
}
