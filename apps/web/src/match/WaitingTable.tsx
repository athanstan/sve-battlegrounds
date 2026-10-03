import { useState } from 'react';
import type { Presence } from '../net/presence';
import { Button, Panel } from '../ui/primitives';
import { orElse } from '../ui/text';

interface Props {
  readonly presence: Presence | null;
  /** The viewer holds a seat here, so the table is theirs to send around and to cancel. */
  readonly seated: boolean;
  readonly onLeave: () => void;
}

/**
 * Before the second player sits there is no match yet, so there is nothing to draw. The host sees
 * who is at the table and the address to send to an opponent.
 */
export function WaitingTable({ presence, seated, onLeave }: Props) {
  const [copied, setCopied] = useState(false);
  const address = location.href;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
    } catch {
      return; // Clipboard access can be refused; the address stays selectable in its field.
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mx-auto flex h-full max-w-lg flex-col justify-center p-6">
      <Panel title={orElse(presence?.title ?? '', 'Your table')}>
        {seated ? (
          <>
            <p className="text-sm text-mist">
              Waiting for an opponent to sit down. Send them this address, or they can find the
              table in the lobby.
            </p>
            <div className="mt-4 flex gap-2">
              <input
                readOnly
                value={address}
                aria-label="Table address"
                onFocus={(event) => event.target.select()}
                className="min-w-0 flex-1 rounded-md bg-slab px-3 py-2 text-sm text-parchment"
              />
              <Button onClick={() => void copy()}>{copied ? 'Copied' : 'Copy'}</Button>
            </div>
          </>
        ) : (
          <p className="text-sm text-mist">
            Waiting for the second player to sit down. The match appears here as soon as it starts.
          </p>
        )}
        <Button className="mt-6 w-full" onClick={onLeave}>
          {seated ? 'Cancel the table' : 'Back to the lobby'}
        </Button>
      </Panel>
    </div>
  );
}
