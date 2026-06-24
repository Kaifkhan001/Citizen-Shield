// Shared cross-cutting types between web and backend.
// Domain models will be added in future milestones.

export type ServiceName = 'Citizen Shield API' | 'Citizen Shield Web';

export type ServiceStatus = 'ok' | 'degraded' | 'down';

export type Environment = 'development' | 'production' | 'test';

export type UserId = string & { readonly __brand: 'UserId' };
