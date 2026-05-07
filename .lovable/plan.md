## Mobile Responsiveness Pass

Make the dashboard usable on phones (≤768px) by collapsing dense sections, replacing the top tabs with a thumb-reachable bottom nav, and converting wide dialogs to bottom sheets.

### 1. Collapsible sections on mobile (`src/pages/Index.tsx`)

Wrap the heavy stacked panels in shadcn `Collapsible` (already in repo) so they default-collapsed on mobile and default-open on desktop. Use existing `useIsMobile()` hook.

Sections to wrap with sticky header + chevron toggle:
- Activity Ticker
- Eviction Timeline Feed
- Deposit Disputes Feed
- Operations Center
- Listed Properties
- Your Empire (Portfolio) — keep summary tiles visible, collapse the property grid

Each header shows title + count badge so users see urgency without expanding.

### 2. Bottom navigation bar (mobile only)

New component `src/components/ui/mobile-bottom-nav.tsx`. Fixed `bottom-0`, glass background, safe-area padding, hidden on `md+`.

Five tabs that scroll-to or expand the matching section:
- 🏪 Market → opens Estate Agent sheet
- 🔨 Ops → scrolls to Operations Center + expands
- 🏰 Empire → scrolls to portfolio + expands
- 🏦 Bank → switches Tabs to bank
- ⚠️ Alerts → scrolls to evictions/disputes (badge with combined count)

Add `pb-20 md:pb-6` to the main container so content isn't hidden behind the nav.

### 3. Touch-friendly dialogs

Create thin wrapper `src/components/ui/responsive-dialog.tsx`: renders shadcn `Dialog` on desktop and `Drawer` (vaul, already installed) on mobile via `useIsMobile()`. Same `{Trigger, Content, Header, Title, Description, Footer}` API so swap is mechanical.

Migrate the highest-traffic property-action dialogs:
- `eviction-dialog.tsx`
- `eviction-appeal-dialog.tsx`
- `rent-negotiation-dialog.tsx`
- `renovation-dialog.tsx`
- `auction-dialog.tsx`
- `mortgage-refinance.tsx`, `mortgage-settlement.tsx`

Also bump in-dialog tap targets to `min-h-11` buttons on mobile and switch tight `grid-cols-3` summary rows to `grid-cols-1 sm:grid-cols-3`.

### 4. Property card mobile tweaks (`src/components/ui/property-card.tsx`)

- Action buttons: stack vertically on `<sm`, use `h-11` for thumb taps.
- Reduce internal padding from `p-5` to `p-4` on mobile.

### Out of scope
- Redesigning the top hero, game clock, or stats tiles (already responsive).
- Re-theming dialogs that are rarely opened (credit guide, portfolio mortgage info).
- Persisting collapse state across reloads.

### Files
- **New**: `src/components/ui/mobile-bottom-nav.tsx`, `src/components/ui/responsive-dialog.tsx`
- **Modified**: `src/pages/Index.tsx`, `src/components/ui/property-card.tsx`, the six dialog files listed above
