---
name: no-animations
description: Use when writing or editing any web UI (pages, sheets, popups, buttons) in apps/web. The app must have no animations or transitions.
---

# No animations in the web app

The owner wants every popup, sheet and page to appear instantly. Animations feel slow on their phones.

Rules when building or changing UI in `apps/web`:

1. Do not add `transition`, `transition-*`, `duration-*`, `animate-*` (except `animate-spin` on a loading spinner), `@keyframes`, `framer-motion`, or slide-in/fade effects.
2. `apps/web/src/app/globals.css` ends with a global rule that sets animation and transition durations to 0s. Do not remove it or override it with a longer duration.
3. Popups use the shared `components/ui/AppSheet.tsx`. Keep it animation-free.
4. Detail views: Loan and Subscription use `router.push`. The Transactions list keeps its iframe slide-in panel (do not replace it): Back must return to the list at the same scroll position, and the user confirmed router.push does not achieve that on their phone.
5. Exception: the pull-to-refresh badge (`PullToRefreshIndicator`, marked `data-motion`) keeps its motion. Mark an element `data-motion` only when the user asks for animation on it.
6. Skeletons are static blocks, not pulsing.
7. After a change, deploy with `./build_web.sh && ./restart_web.sh` from the project root. Do not run lint unless asked.
