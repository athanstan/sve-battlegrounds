import type { UserDto } from '@sve/protocol';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { ApiClient } from '../api/client';
import { CatalogStore } from '../catalog/catalog-store';
import { SERVER_URL } from '../config';
import { MatchClient } from '../net/match-client';

/** Everything a signed-in screen needs, created once per sign-in and dropped on sign-out. */
interface Services {
  readonly user: UserDto;
  readonly api: ApiClient;
  readonly matches: MatchClient;
  readonly catalog: CatalogStore;
  readonly signOut: () => void;
}

const ServicesContext = createContext<Services | null>(null);

interface Props {
  readonly token: string;
  readonly user: UserDto;
  readonly api: ApiClient;
  readonly signOut: () => void;
  readonly children: ReactNode;
}

export function ServicesProvider({ token, user, api, signOut, children }: Props) {
  const services = useMemo<Services>(
    () => ({
      user,
      api,
      matches: new MatchClient(SERVER_URL, token),
      catalog: new CatalogStore((ids) => api.cards(ids)),
      signOut,
    }),
    [token, user, api, signOut],
  );
  return <ServicesContext value={services}>{children}</ServicesContext>;
}

export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) throw new Error('useServices needs a signed-in ServicesProvider above it');
  return services;
}
