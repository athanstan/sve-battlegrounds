import { useCallback, useState } from 'react';
import { useServices } from '../app/Services';
import { useResource } from '../hooks/useResource';
import { DeckPicker } from '../lobby/DeckPicker';
import type { MatchSession } from '../net/match-session';
import { describeJoinError } from '../net/rejections';
import { navigate } from '../route';
import { Button, Notice, Panel } from '../ui/primitives';

/**
 * What a visitor sees at a match address they hold no seat for: a link someone sent them, or a
 * reload after the seat's hold ran out. They can sit down if there is room, or watch.
 */
export function JoinPanel({
  roomId,
  onJoined,
}: {
  roomId: string;
  onJoined: (session: MatchSession) => void;
}) {
  const { api, matches } = useServices();
  const tables = useResource(useCallback(() => api.matches(), [api]));
  const decks = useResource(useCallback(() => api.decks(), [api]));

  const [chosen, setChosen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const table =
    tables.resource.status === 'ready'
      ? tables.resource.data.matches.find((m) => m.roomId === roomId)
      : undefined;
  const deckList = decks.resource.status === 'ready' ? decks.resource.data.decks : [];
  const deckId = chosen ?? deckList.find((deck) => deck.legal)?.id ?? null;

  const join = async (open: () => Promise<MatchSession>) => {
    setBusy(true);
    setProblem(null);
    try {
      onJoined(await open());
    } catch (error) {
      setProblem(describeJoinError(error));
      setBusy(false);
    }
  };

  const gone = tables.resource.status === 'ready' && !table;

  return (
    <div className="mx-auto flex h-full max-w-lg flex-col justify-center gap-4 p-6">
      <Panel title={table?.title ?? 'Join a match'}>
        {gone ? (
          <p className="text-sm text-mist">This match is no longer open.</p>
        ) : (
          <div className="space-y-4">
            {table ? (
              <p className="text-sm text-mist">
                {table.status === 'waiting'
                  ? 'Waiting for an opponent.'
                  : 'The match is in progress.'}
                {table.players.length > 0 ? ` ${table.players.join(' vs ')}.` : ''}
              </p>
            ) : null}

            {problem ? <Notice tone="error">{problem}</Notice> : null}

            {table?.status === 'waiting' && deckList.length > 0 ? (
              <>
                <DeckPicker decks={deckList} selected={deckId} onSelect={setChosen} />
                <Button
                  tone="primary"
                  className="w-full"
                  disabled={!deckId || busy}
                  onClick={() => deckId && void join(() => matches.sit(roomId, deckId))}
                >
                  Sit down
                </Button>
              </>
            ) : null}

            {table && table.status !== 'finished' ? (
              <Button
                className="w-full"
                disabled={busy}
                onClick={() => void join(() => matches.watch(roomId))}
              >
                Watch
              </Button>
            ) : null}
          </div>
        )}
        <Button className="mt-4 w-full" onClick={() => navigate({ name: 'lobby' })}>
          Back to the lobby
        </Button>
      </Panel>
    </div>
  );
}
