/**
 * Cude.new - reading service connections from React.
 *
 * Thin: the domain holds the state and does the work, these just subscribe. The
 * value of having them is that no component reaches into two nanostores and
 * recombines them by hand, which is how the inherited tabs drifted apart.
 */

import { useCallback } from 'react';
import { useStore } from '@nanostores/react';
import { serviceConnections, type ConnectionState, type ServiceConnection, type ServiceId } from './serviceConnections';
import { serviceResources, type ResourceSet } from './serviceResources';

export interface ServiceConnectionView {
  connection?: ServiceConnection;
  state: ConnectionState;
  isConnected: boolean;
  isBusy: boolean;
  connect(token: string, baseUrl?: string): Promise<boolean>;
  disconnect(): void;
}

export function useServiceConnection(service: ServiceId): ServiceConnectionView {
  const connections = useStore(serviceConnections.connections);
  const statuses = useStore(serviceConnections.statuses);

  const state = statuses[service] ?? { status: 'disconnected' as const };

  const connect = useCallback(
    (token: string, baseUrl?: string) => serviceConnections.connect(service, token, baseUrl),
    [service],
  );

  const disconnect = useCallback(() => {
    serviceConnections.disconnect(service);
    serviceResources.forget(service);
  }, [service]);

  return {
    connection: connections[service],
    state,
    isConnected: state.status === 'connected',
    isBusy: state.status === 'connecting',
    connect,
    disconnect,
  };
}

export interface ServiceResourceView extends ResourceSet {
  refresh(): Promise<void>;
}

export function useServiceResources(service: ServiceId): ServiceResourceView {
  const sets = useStore(serviceResources.sets);

  const refresh = useCallback(async () => {
    await serviceResources.load(service);
  }, [service]);

  return { ...(sets[service] ?? { items: [], fetchedAt: '', loading: false }), refresh };
}
