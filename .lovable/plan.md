## Problem

At ~1000px the header right-cluster overflows: the inline `GameClock` (clock icon → "📅 Aug 2025" → progress bar → "83s" → 4 speed pills `0.5× 1× 2× 4×`) is forced into a `max-w-[220px]` lane, so the speed pills and following pause/sound buttons + notification bell collide and visually overlap (you can see "2×/4×" running into duplicated-looking pause/speaker glyphs in the screenshot).

## Fix (UI only — `HeroHeader.tsx` + `GameClock.tsx`)

1. **Split the speed selector out of the inline clock.** Export `SpeedSelector` from `game-clock.tsx` and remove its render from the `inline` branch of `GameClock`. The inline clock keeps only: icon, date, progress bar, "Ns".

2. **Re-lay the header right cluster** in `HeroHeader.tsx` as three independent glass groups that can wrap on narrow widths:
   - **Clock pill**: `GameClock inline` — `min-w-[180px]` `flex-1` (so the progress bar absorbs slack).
   - **Speed pill**: standalone `<SpeedSelector />` wrapped in a `glass rounded-full` shell, matching the height of the buttons.
   - **Controls pill**: pause + sound + notification grouped together inside one `glass rounded-full` row so they read as a single unit.
   - Container: `flex items-center gap-2 flex-wrap justify-end` and remove the existing `max-w-md` cap. Allow it to drop to a second row below the title on narrow widths instead of crushing.

3. **Compact mode**: same three groups, smaller paddings (`h-7` buttons, `scale-90` speed pills) and `flex-nowrap` once `compact` is true so the sticky bar stays single-line on desktop.

4. **Paused badge**: keep absolute-positioned but move it slightly so it never sits on top of the controls when they wrap.

No store, engine, or behaviour changes — purely layout/markup in two files.

## Files touched

- `src/components/ui/game-clock.tsx` — export `SpeedSelector`; remove it from inline branch.
- `src/components/sections/HeroHeader.tsx` — restructure right-cluster into three wrapping glass groups.
