import type { SelectionSpec } from '@sve/playmat';
import type { CardId, CardRef, Intent, MatchView, Seat } from '@sve/rules';
import { labelsFor } from './ActionMenu';

/**
 * What the chrome asks of the player, derived from the view alone.
 *
 * The rules only interrupt when they need an answer, and so does the interface. A decision that
 * is just "which of these" becomes buttons in the prompt bar; "which cards" is picked on the
 * mat itself and confirmed in the bar; the main phase has no bar at all, only the hourglass.
 */

export type PromptUi =
  | {
      readonly kind: 'choice';
      readonly promptId: number;
      readonly title: string;
      readonly options: readonly {
        readonly label: string;
        readonly intent: Intent;
        readonly primary?: boolean;
      }[];
    }
  | {
      readonly kind: 'pick';
      readonly promptId: number;
      readonly title: string;
      readonly spec: SelectionSpec;
      readonly confirmLabel: (picked: number) => string;
      readonly canConfirm: (picked: number) => boolean;
      readonly intent: (picked: readonly CardId[]) => Intent;
    }
  | {
      readonly kind: 'browser';
      readonly promptId: number;
      readonly title: string;
      readonly min: number;
      readonly max: number;
      readonly cards: readonly CardRef[];
      readonly intent: (picked: readonly CardId[]) => Intent;
    }
  | {
      readonly kind: 'allocate';
      readonly promptId: number;
      readonly title: string;
      readonly total: number;
      readonly targets: readonly CardId[];
    }
  | { readonly kind: 'pass'; readonly promptId: number };

/** The question put to this viewer, if there is one. Spectators and the waiting seat get none. */
export function promptUi(view: MatchView): PromptUi | null {
  const prompt = view.prompt;
  if (!prompt) return null;

  switch (prompt.kind) {
    case 'turnOrder':
      return {
        kind: 'choice',
        promptId: prompt.id,
        title: 'You choose who goes first',
        options: [
          {
            label: 'Go first',
            primary: true,
            intent: choose(prompt.id, { kind: 'turnOrder', goFirst: true }),
          },
          { label: 'Go second', intent: choose(prompt.id, { kind: 'turnOrder', goFirst: false }) },
        ],
      };
    case 'mulligan':
      return {
        kind: 'choice',
        promptId: prompt.id,
        title: 'Keep this opening hand?',
        options: [
          {
            label: 'Keep',
            primary: true,
            intent: choose(prompt.id, { kind: 'mulligan', redraw: false }),
          },
          { label: 'Redraw', intent: choose(prompt.id, { kind: 'mulligan', redraw: true }) },
        ],
      };
    case 'main':
      return { kind: 'pass', promptId: prompt.id };
    case 'quickWindow':
      return {
        kind: 'choice',
        promptId: prompt.id,
        title: 'Respond?',
        options: [
          ...prompt.options.flatMap((option) => {
            const item = labelsFor(option, prompt.id);
            return item ? [{ label: item.label, intent: item.intent }] : [];
          }),
          {
            label: 'Pass',
            primary: true,
            intent: { type: 'pass', promptId: prompt.id },
          },
        ],
      };
    case 'engageWards':
      return {
        kind: 'pick',
        promptId: prompt.id,
        title: 'Engage Wards? Pick the followers, or skip',
        spec: { candidates: prompt.candidates, min: 0, max: prompt.candidates.length },
        confirmLabel: (picked) => (picked === 0 ? 'Skip' : `Engage ${picked}`),
        canConfirm: () => true,
        intent: (cards) => ({ type: 'engageWards', promptId: prompt.id, cards }),
      };
    case 'discard':
      return {
        kind: 'pick',
        promptId: prompt.id,
        title: `Discard ${prompt.count} ${prompt.count === 1 ? 'card' : 'cards'} to get down to the hand limit`,
        spec: { candidates: prompt.candidates, min: prompt.count, max: prompt.count },
        confirmLabel: (picked) =>
          picked === prompt.count ? 'Discard' : `Pick ${prompt.count - picked} more`,
        canConfirm: (picked) => picked === prompt.count,
        intent: (cards) => ({
          type: 'choose',
          promptId: prompt.id,
          choice: { kind: 'discard', cards },
        }),
      };
    case 'selectCards':
      if (prompt.where === 'browser') {
        return {
          kind: 'browser',
          promptId: prompt.id,
          title: prompt.label,
          min: prompt.min,
          max: prompt.max,
          cards: prompt.previews,
          intent: (cards) => ({
            type: 'choose',
            promptId: prompt.id,
            choice: { kind: 'selectCards', cards },
          }),
        };
      }
      return {
        kind: 'pick',
        promptId: prompt.id,
        title: prompt.label,
        spec: { candidates: prompt.candidates, min: prompt.min, max: prompt.max },
        confirmLabel: (picked) =>
          picked >= prompt.min ? 'Confirm' : `Pick ${prompt.min - picked} more`,
        canConfirm: (picked) => picked >= prompt.min && picked <= prompt.max,
        intent: (cards) => ({
          type: 'choose',
          promptId: prompt.id,
          choice: { kind: 'selectCards', cards },
        }),
      };
    case 'keepOnField':
    case 'keepInEx':
      return {
        kind: 'pick',
        promptId: prompt.id,
        title: `Keep ${prompt.keep} ${prompt.kind === 'keepInEx' ? 'in EX' : 'on the field'}`,
        spec: { candidates: prompt.candidates, min: prompt.keep, max: prompt.keep },
        confirmLabel: (picked) =>
          picked === prompt.keep ? 'Keep' : `Pick ${prompt.keep - picked} more`,
        canConfirm: (picked) => picked === prompt.keep,
        intent: (cards) => ({
          type: 'choose',
          promptId: prompt.id,
          choice: { kind: 'selectCards', cards },
        }),
      };
    case 'chooseMode':
      return {
        kind: 'choice',
        promptId: prompt.id,
        title: prompt.label,
        options: prompt.modes.map((mode, index) => ({
          label: mode.label,
          primary: index === 0,
          intent: choose(prompt.id, { kind: 'mode', id: mode.id }),
        })),
      };
    case 'confirmOptional':
      return {
        kind: 'choice',
        promptId: prompt.id,
        title: prompt.label,
        options: [
          {
            label: 'Yes',
            primary: true,
            intent: choose(prompt.id, { kind: 'confirm', yes: true }),
          },
          { label: 'No', intent: choose(prompt.id, { kind: 'confirm', yes: false }) },
        ],
      };
    case 'allocate':
      return {
        kind: 'allocate',
        promptId: prompt.id,
        title: prompt.label,
        total: prompt.total,
        targets: prompt.targets,
      };
    case 'orderPending':
      return {
        kind: 'choice',
        promptId: prompt.id,
        title: 'Choose which ability to resolve',
        options: prompt.pending.map((entry, index) => ({
          label: entry.label,
          primary: index === 0,
          intent: choose(prompt.id, { kind: 'orderPending', id: entry.id }),
        })),
      };
  }
}

const choose = (
  promptId: number,
  choice: Extract<Intent, { type: 'choose' }>['choice'],
): Intent => ({
  type: 'choose',
  promptId,
  choice,
});

/**
 * What the match is waiting for, in words, for everyone who is not being asked. Null when there
 * is nothing to say: the main phase is simply a turn, which the leader's ring already shows.
 */
export function waitingLabel(
  view: MatchView,
  names: Readonly<Record<Seat, string>>,
): string | null {
  const waiting = view.waitingOn;
  if (!waiting || view.prompt) return null;
  const who = names[waiting.seat];
  switch (waiting.kind) {
    case 'turnOrder':
      return `${who} is choosing who goes first`;
    case 'mulligan':
      return `${who} is deciding on their opening hand`;
    case 'main':
      return null;
    case 'engageWards':
      return `${who} is choosing which Wards to engage`;
    case 'discard':
      return `${who} is discarding down to the hand limit`;
    case 'quickWindow':
      return `${who} may play a Quick card`;
    case 'selectCards':
    case 'keepOnField':
    case 'keepInEx':
    case 'chooseMode':
    case 'confirmOptional':
    case 'allocate':
    case 'orderPending':
      return `${who} is choosing`;
  }
}
