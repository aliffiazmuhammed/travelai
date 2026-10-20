/**
 * Health-check vocabulary shared by the route and its tests.
 *
 * A process can be up while its database is not. Render (and any external
 * monitor) must be able to tell those apart, so the HTTP status is derived from
 * the same value as the payload: only `connected` is a 200.
 */
export type DatabaseStatus =
  | 'disconnected'
  | 'connected'
  | 'connecting'
  | 'disconnecting'
  | 'unknown';

const DB_STATUS: Record<number, DatabaseStatus> = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

export interface HealthState {
  ok: boolean;
  status: 'healthy' | 'unhealthy';
  database: DatabaseStatus;
  httpStatus: 200 | 503;
}

/** Maps a Mongoose `readyState` onto the public health contract. */
export function healthState(readyState: number): HealthState {
  const database = DB_STATUS[readyState] || 'unknown';
  const ok = database === 'connected';
  return {
    ok,
    status: ok ? 'healthy' : 'unhealthy',
    database,
    httpStatus: ok ? 200 : 503,
  };
}
