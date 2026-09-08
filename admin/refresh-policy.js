// Shared by every present/future Admin composition. No independent domain timers.
export const ADMIN_REFRESH = Object.freeze({operationalMs:60_000,heavyListMs:120_000,analyticsMs:300_000,maxBackoffMs:300_000,searchDebounceMs:400,searchCacheMs:30_000,maxPeriodicRequests:3});
export function resourceDue(entry,context,interval,reason,now=Date.now()) {
  if(!entry||entry.context!==context||entry.state!=='fresh')return true;
  if(['mutation','manual'].includes(reason))return true;
  // Preserve Stage 1 focus/reconnect verification of the visible operational editor,
  // without broadly reloading fresh five-minute analytical projections.
  if(interval<=ADMIN_REFRESH.heavyListMs&&['focus','online','pageshow','visible'].includes(reason))return true;
  return now-entry.lastSuccess>=interval;
}
