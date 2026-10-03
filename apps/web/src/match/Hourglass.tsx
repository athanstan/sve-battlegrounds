interface Props {
  /** The player may end their main phase. */
  readonly ready: boolean;
  /** An answer is on its way to the server. */
  readonly sending: boolean;
  readonly onPress: () => void;
}

/**
 * The one control for ending a turn: bottom right, a gold hourglass in a metal octagon. It glows
 * when pressing it would do something and sits dark otherwise, so it never has to say "wait".
 */
export function Hourglass({ ready, sending, onPress }: Props) {
  const live = ready && !sending;
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={!live}
      aria-label={live ? 'End turn' : sending ? 'Ending turn' : 'Not your turn'}
      title={live ? 'End turn' : undefined}
      className={`group absolute bottom-6 right-6 grid size-[76px] place-items-center transition-[filter,transform] duration-200 ${
        live ? 'cursor-pointer hover:scale-105 active:scale-95' : 'cursor-default'
      }`}
      style={{
        clipPath: 'polygon(30% 0, 70% 0, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0 70%, 0 30%)',
        background: live
          ? 'linear-gradient(160deg, #f0d58c, #7a5f2b)'
          : 'linear-gradient(160deg, #3a3e47, #1d1f24)',
        filter: live ? 'drop-shadow(0 0 14px rgba(240, 213, 140, 0.55))' : 'none',
      }}
    >
      <span
        className="grid size-[68px] place-items-center"
        style={{
          clipPath: 'polygon(30% 0, 70% 0, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0 70%, 0 30%)',
          background: 'radial-gradient(circle at 35% 30%, #2d323d, #12141a)',
        }}
      >
        <svg
          viewBox="0 0 24 24"
          className={`size-9 ${sending ? 'animate-spin [animation-duration:2.4s]' : ''} ${live ? 'text-gold-bright' : 'text-mist/40'}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 3h12M6 21h12M7 3c0 5 3.5 6 5 9-1.5 3-5 4-5 9M17 3c0 5-3.5 6-5 9 1.5 3 5 4 5 9" />
          <path d="M9.5 19h5l-2.5-3z" fill="currentColor" stroke="none" />
        </svg>
      </span>
    </button>
  );
}
