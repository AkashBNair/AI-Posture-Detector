# Fix Timer & Remove Components - TODO

## Timer Fixes
- [x] Fix `frontend/public/sw.js` - Add KEEPALIVE handler
- [x] Fix `frontend/src/utils/notifications.ts` - Add keepalive mechanism
- [x] Fix `frontend/src/components/PomodoroTimer.tsx` - Add local fallback + completion guard
- [x] Fix `frontend/src/components/HydrationTimer.tsx` - Add local fallback + completion guard

## Component Removals
- [x] Remove `HealthTipsPanel` from `frontend/src/App.tsx`
- [x] Remove `AI Insight` and `Hydration Insight` from `frontend/src/components/AnalyticsDashboard.tsx`

## Testing
- [ ] Build frontend to verify no TS errors
- [ ] Test timers run past 30 seconds

## Features
- [x] Implement Local Interactive AI Insights (Rule-based, offline, button-driven)
