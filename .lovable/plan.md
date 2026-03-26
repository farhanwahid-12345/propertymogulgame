

# Fix Contrast and Brightness Issues

## Problem
The dark theme combined with glass-morphism cards (only 8% white opacity) creates insufficient contrast. The `muted-foreground` color (65% lightness) is too dim against the dark background, and glass panels are nearly invisible. Text disappears in several areas.

## Changes

### 1. Brighten Base Colors (`src/index.css`)
- Lighten `--background` from `230 25% 12%` to `230 25% 15%`
- Lighten `--card` from `230 20% 16%` to `230 20% 20%`
- Brighten `--muted-foreground` from `215 20% 65%` to `215 20% 75%` (major readability boost)
- Lighten `--border` from `230 15% 25%` to `230 15% 30%`
- Lighten `--muted` from `230 15% 22%` to `230 15% 28%`

### 2. Increase Glass Card Opacity (`src/index.css`)
- Change `.glass` from `bg-white/[0.08]` to `bg-white/[0.12]`
- Change border from `border-white/[0.12]` to `border-white/[0.18]`
- Update `.glass-hover` accordingly

### 3. Fix Specific Text Contrast Issues
- **`src/components/ui/property-card.tsx`**: The "Annual Yield" uses `text-accent` which resolves to the same dark muted color -- change to `text-[hsl(var(--stat-credit))]` (amber) for visibility
- **`src/components/ui/game-stats.tsx`**: Ensure all label text uses `text-muted-foreground` which will be brighter after the CSS fix
- **`src/pages/Index.tsx`**: The hero subtitle `text-muted-foreground` will benefit from the global fix; tab text in inactive state needs `text-foreground/70` instead of inheriting the dim default

### 4. Dialog Readability (`src/components/ui/dialog.tsx`)
- Add explicit `text-foreground` to DialogContent to ensure all dialog text inherits proper light color on dark background

## Files Modified

| File | Changes |
|---|---|
| `src/index.css` | Brighten muted-foreground, lighten background/card/border, increase glass opacity |
| `src/components/ui/property-card.tsx` | Fix yield text color |
| `src/components/ui/dialog.tsx` | Add explicit text-foreground |

