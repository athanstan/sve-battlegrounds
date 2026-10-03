import { useCallback, useState } from 'react';
import { ApiFailure } from '../api/client';
import { useServices } from '../app/Services';
import { useResource } from '../hooks/useResource';
import { describeJoinError } from '../net/rejections';
import { navigate } from '../route';
import { Button, Notice, Panel } from '../ui/primitives';
import { DeckPicker } from './DeckPicker';
import { OpenTables } from './OpenTables';

const describeFailure = (error: unknown): string =>
  error instanceof ApiFailure ? error.message : 'Something went wrong. Try again.';

export function Lobby() {
  const { user, api, matches: client, signOut } = useServices();
  const decks = useResource(useCallback(() => api.decks(), [api]));
  const tables = useResource(
    useCallback(() => api.matches(), [api]),
    { pollMs: 3000 },
  );

  const [chosen, setChosen] = useState<string | null>(null);
  const [handsOpen, setHandsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const deckList = decks.resource.status === 'ready' ? decks.resource.data.decks : [];
  // Choosing nothing means the first deck that could be played.
  const deckId = chosen ?? deckList.find((deck) => deck.legal)?.id ?? null;

  const enter = async (open: () => Promise<{ roomId: string }>) => {
    setBusy(true);
    setProblem(null);
    try {
      const session = await open();
      navigate({ name: 'match', roomId: session.roomId });
    } catch (error) {
      setProblem(describeJoinError(error));
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col gap-6 overflow-y-auto p-6">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-2xl tracking-widest text-gold-bright">
          SVE BATTLEGROUNDS
        </h1>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-mist">
            Signed in as <span className="text-parchment">{user.displayName}</span>
          </span>
          <Button onClick={signOut}>Sign out</Button>
        </div>
      </header>

      {problem ? <Notice tone="error">{problem}</Notice> : null}

      <div className="grid gap-6 md:grid-cols-[2fr_3fr]">
        <Panel title="Start a match">
          {decks.resource.status === 'loading' ? (
            <p className="text-sm text-mist">Loading your decks…</p>
          ) : null}

          {decks.resource.status === 'failed' ? (
            <Notice tone="error" action={<Button onClick={decks.reload}>Retry</Button>}>
              {describeFailure(decks.resource.error)}
            </Notice>
          ) : null}

          {decks.resource.status === 'ready' && deckList.length === 0 ? (
            <p className="text-sm text-mist">
              You have no decks yet. Build one on shadowshowdown.com and it will show up here.
            </p>
          ) : null}

          {deckList.length > 0 ? (
            <div className="space-y-4">
              <DeckPicker decks={deckList} selected={deckId} onSelect={setChosen} />
              <label className="flex items-start gap-2 text-sm text-mist">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={handsOpen}
                  onChange={(event) => setHandsOpen(event.target.checked)}
                />
                <span>
                  Show both hands to spectators (for casting). Otherwise they see only the board.
                </span>
              </label>
              <Button
                tone="primary"
                className="w-full"
                disabled={!deckId || busy}
                onClick={() =>
                  deckId && void enter(() => client.create(deckId, handsOpen ? 'hands' : 'closed'))
                }
              >
                {busy ? 'Opening…' : 'Create match'}
              </Button>
            </div>
          ) : null}
        </Panel>

        <Panel title="Open tables">
          {tables.resource.status === 'loading' ? (
            <p className="text-sm text-mist">Looking for tables…</p>
          ) : null}
          {tables.resource.status === 'failed' ? (
            <Notice tone="error" action={<Button onClick={tables.reload}>Retry</Button>}>
              {describeFailure(tables.resource.error)}
            </Notice>
          ) : null}
          {tables.resource.status === 'ready' ? (
            <OpenTables
              matches={tables.resource.data.matches}
              canSit={deckId !== null}
              busy={busy}
              isMine={(roomId) => client.holdsSeat(roomId)}
              onReturn={(roomId) => navigate({ name: 'match', roomId })}
              onSit={(roomId) => deckId && void enter(() => client.sit(roomId, deckId))}
              onWatch={(roomId) => void enter(() => client.watch(roomId))}
            />
          ) : null}
        </Panel>
      </div>
    </div>
  );
}
