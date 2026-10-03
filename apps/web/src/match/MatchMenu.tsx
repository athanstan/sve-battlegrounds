import { useState } from 'react';
import { Button } from '../ui/primitives';

interface Props {
  /** A player in a match still being played: leaving means conceding. */
  readonly playing: boolean;
  readonly onConcede: () => void;
  readonly onLeave: () => void;
}

/** Concede and leave live behind one small menu, with a second press to confirm the one that hurts. */
export function MatchMenu({ playing, onConcede, onLeave }: Props) {
  const [open, setOpen] = useState(false);
  const [sure, setSure] = useState(false);

  const close = () => {
    setOpen(false);
    setSure(false);
  };

  return (
    <div className="relative">
      <Button
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        Menu
      </Button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-2 grid w-52 gap-2 rounded-lg border border-slab bg-basalt p-2 shadow-xl shadow-black/60"
        >
          {playing ? (
            sure ? (
              <Button
                tone="danger"
                role="menuitem"
                onClick={() => {
                  close();
                  onConcede();
                }}
              >
                Really concede?
              </Button>
            ) : (
              <Button role="menuitem" onClick={() => setSure(true)}>
                Concede
              </Button>
            )
          ) : null}
          <Button
            role="menuitem"
            onClick={() => {
              close();
              onLeave();
            }}
          >
            {playing ? 'Leave (concedes)' : 'Back to the lobby'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
