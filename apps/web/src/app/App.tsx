import { lazy, Suspense } from 'react';
import { SignIn } from '../auth/SignIn';
import { useAuth } from '../auth/AuthProvider';
import { Lobby } from '../lobby/Lobby';
import { useRoute } from '../route';
import { Splash } from '../ui/primitives';
import { ServicesProvider } from './Services';

// The table pulls in the whole rendering engine; the lobby and sign-in should not wait for it.
const MatchScreen = lazy(() =>
  import('../match/MatchScreen').then((module) => ({ default: module.MatchScreen })),
);

// Dev only: the import sits behind a compile-time constant, so production builds drop the lab.
const Lab = import.meta.env.DEV ? lazy(() => import('../lab/Lab')) : null;

/** Signed out → sign-in; signed in → the lobby or the match the address names. */
export function App() {
  const { state, api, signOut } = useAuth();
  const route = useRoute();

  if (route.name === 'lab' && Lab) {
    return (
      <Suspense fallback={null}>
        <Lab />
      </Suspense>
    );
  }

  switch (state.status) {
    case 'loading':
      return <Splash>Signing you in…</Splash>;
    case 'signedOut':
      return <SignIn config={state.config} problem={state.problem} />;
    case 'signedIn':
      return (
        <ServicesProvider token={state.token} user={state.user} api={api} signOut={signOut}>
          {route.name === 'match' ? (
            <Suspense fallback={<Splash>Setting the table…</Splash>}>
              <MatchScreen key={route.roomId} roomId={route.roomId} />
            </Suspense>
          ) : (
            <Lobby />
          )}
        </ServicesProvider>
      );
  }
}
