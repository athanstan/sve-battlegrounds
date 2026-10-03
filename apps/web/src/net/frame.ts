import type { ClientEvent, MatchView } from '@sve/rules';

/** What the table should show next. A snapshot replaces the picture; a delta animates into it. */
export interface Frame {
  readonly view: MatchView;
  readonly events: readonly ClientEvent[];
  readonly kind: 'snapshot' | 'delta';
}
