import type { CardId } from '@sve/rules';

/**
 * Picking cards on the mat for a prompt that asks for some: discard down to the hand limit,
 * choose which Wards to engage. The mat only collects the choice; the chrome owns the button
 * that turns it into an answer.
 */

export interface SelectionSpec {
  /** Cards that may be picked. Anything else on the mat stays inert. */
  readonly candidates: readonly CardId[];
  readonly min: number;
  readonly max: number;
}

/** Click on a card: add it, take it back, or (for a pick-one prompt) move the pick. */
export function toggle(
  selected: readonly CardId[],
  id: CardId,
  spec: SelectionSpec,
): readonly CardId[] {
  if (!spec.candidates.includes(id)) return selected;
  if (selected.includes(id)) return selected.filter((picked) => picked !== id);
  if (selected.length < spec.max) return [...selected, id];
  return spec.max === 1 ? [id] : selected;
}

export const isComplete = (selected: readonly CardId[], spec: SelectionSpec): boolean =>
  selected.length >= spec.min && selected.length <= spec.max;

/** The same spec, ignoring order and identity of the arrays, so a re-sent prompt keeps the picks. */
export function sameSpec(a: SelectionSpec | null, b: SelectionSpec | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.min === b.min &&
    a.max === b.max &&
    a.candidates.length === b.candidates.length &&
    a.candidates.every((id) => b.candidates.includes(id))
  );
}
