import type { AuthConfig } from '@sve/protocol';
import { Button, Notice, Panel } from '../ui/primitives';
import { useAuth } from './AuthProvider';
import { loginRedirectUrl } from './token';

/** Sign-in is shadowshowdown.com's job; locally, a few fixture accounts stand in for it. */
export function SignIn({ config, problem }: { config: AuthConfig | null; problem: string | null }) {
  const { signInAs, retry } = useAuth();

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4">
        <header className="text-center">
          <h1 className="font-display text-3xl tracking-widest text-gold-bright">
            SVE BATTLEGROUNDS
          </h1>
          <p className="mt-2 text-sm text-mist">Shadowverse: Evolve, one on one.</p>
        </header>

        {problem ? (
          <Notice tone="error" action={<Button onClick={retry}>Try again</Button>}>
            {problem}
          </Notice>
        ) : null}

        {config?.mode === 'shadowshowdown' ? (
          <Panel title="Sign in">
            <p className="mb-4 text-sm text-mist">
              Your account and decks live on shadowshowdown.com. Sign in there and you come straight
              back.
            </p>
            <Button
              tone="primary"
              className="w-full"
              onClick={() =>
                location.assign(
                  loginRedirectUrl(config.loginUrl, location.origin + location.pathname),
                )
              }
            >
              Continue with shadowshowdown.com
            </Button>
          </Panel>
        ) : null}

        {config?.mode === 'fixture' ? (
          <Panel title="Development sign-in">
            <p className="mb-4 text-sm text-mist">
              This server is not connected to shadowshowdown.com sign-in. Pick an account to play
              as; open a second tab to be someone else.
            </p>
            <div className="grid gap-2">
              {config.accounts.map((account) => (
                <Button key={account.id} onClick={() => void signInAs(account.id)}>
                  Play as {account.displayName}
                </Button>
              ))}
            </div>
          </Panel>
        ) : null}
      </div>
    </div>
  );
}
