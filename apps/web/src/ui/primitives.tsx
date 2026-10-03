import type { ButtonHTMLAttributes, ReactNode } from 'react';

/** The few building blocks the chrome is made of, so screens read as content rather than classes. */

type Tone = 'primary' | 'plain' | 'danger';

const TONES: Record<Tone, string> = {
  primary:
    'bg-gold text-ink hover:bg-gold-bright disabled:bg-slab-raised disabled:text-mist font-semibold',
  plain: 'bg-slab text-parchment hover:bg-slab-raised disabled:text-mist/60',
  danger: 'bg-danger/90 text-parchment hover:bg-danger disabled:bg-slab-raised disabled:text-mist',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly tone?: Tone;
}

export function Button({ tone = 'plain', className = '', type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={`rounded-md px-4 py-2 text-sm transition-colors disabled:cursor-not-allowed ${TONES[tone]} ${className}`}
      {...rest}
    />
  );
}

export function Panel({
  title,
  children,
  className = '',
}: {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-lg border border-slab bg-basalt/90 p-5 shadow-lg shadow-black/30 ${className}`}
    >
      {title ? (
        <h2 className="mb-4 font-display text-lg tracking-wide text-gold-bright">{title}</h2>
      ) : null}
      {children}
    </section>
  );
}

/** A message that explains what went wrong and, when there is one, offers a way forward. */
export function Notice({
  tone = 'info',
  children,
  action,
}: {
  tone?: 'info' | 'error';
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex items-center justify-between gap-4 rounded-md border px-4 py-3 text-sm ${
        tone === 'error'
          ? 'border-danger/50 bg-danger/10 text-parchment'
          : 'border-slab-raised bg-slab/60 text-mist'
      }`}
    >
      <span>{children}</span>
      {action}
    </div>
  );
}

export function Splash({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-mist">
      <div className="font-display text-2xl tracking-widest text-gold-bright">
        SVE BATTLEGROUNDS
      </div>
      <div className="text-sm">{children}</div>
    </div>
  );
}
