

# Visual Overhaul -- Fun, Clean, Kid-Friendly Interface

## Design Direction
Bright, playful but not childish. Rounded corners, emoji accents, vibrant color-coded cards, animated progress bars, and a compact layout that feels like a modern mobile game dashboard. Appealing to kids while keeping all functionality for adults.

## Changes

### 1. Color System + Glass Cards (`index.css`, `tailwind.config.ts`)
- Replace the dark slate gradient background with a friendlier deep blue-to-purple gradient
- Add `.glass` utility class: `bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl`
- Add `pulse-glow` keyframe for the clock progress bar
- Increase default border-radius to `0.75rem` for softer feel
- Add fun color accents: emerald for money, sky-blue for cash flow, amber for credit, violet for level

### 2. Compact Hero with Integrated Clock (`Index.tsx`, `game-clock.tsx`)
- Shrink hero from 300px to 160px
- Add emoji to the title: "Property Tycoon 🏘️"
- Move game clock into the hero as an overlay bar at the bottom
- Add playful subtitle: "Build your empire, one house at a time!"
- Animated gradient text for the title

### 3. Stats Bar Redesign (`game-stats.tsx`)
- Replace 4 plain white cards with a single glass card containing 4 color-coded stat cells
- Each cell: colored left-border accent + emoji icon + large bold value + small label
  - 💰 Net Worth (emerald border)
  - 📈 Cash Flow (blue/red border based on positive/negative)
  - 🏠 Portfolio + Credit (amber border)
  - ⭐ Level (violet border) with animated XP bar
- Collapse Market Conditions and Tenant Events into expandable sections below the main stats
- More compact -- one row instead of a 2x4 grid

### 4. Action Buttons as Tiles (`Index.tsx`)
- Replace cramped button row with icon tiles in a horizontal strip
- Estate Agent: 🏪 green-tinted glass tile
- Auction House: 🔨 amber-tinted glass tile
- Reset: 🔄 subtle ghost tile
- Each tile: icon + label, rounded-2xl, hover scale effect

### 5. Property Cards Refresh (`property-card.tsx`)
- Add colored top-border by type: blue (residential), purple (commercial), gold (luxury)
- Add type emoji badges: 🏠 🏢 👑
- Style monthly income as a bright green pill badge
- Add subtle hover glow matching property type color
- Tighter spacing, rounded-2xl corners

### 6. Portfolio Section (`Index.tsx`)
- Glass card wrapper with property count badge in header
- Add summary row: total value | total monthly income | avg yield
- Fun header: "Your Empire 🏰" with count badge

### 7. Tabs with Icons (`Index.tsx`)
- Market tab: "🏪 Market"
- Bank tab: "🏦 Bank"
- Active tab gets a colored bottom-border glow

## Files Modified

| File | Changes |
|---|---|
| `src/index.css` | Glass utility, new gradient, pulse-glow keyframe, larger radius |
| `tailwind.config.ts` | Pulse-glow animation, updated gradient-city |
| `src/pages/Index.tsx` | Compact hero, integrated clock, action tiles, glass portfolio, summary row, tab icons |
| `src/components/ui/game-stats.tsx` | Single-bar layout, colored accents, emoji icons, collapsible sections |
| `src/components/ui/game-clock.tsx` | Inline variant for hero overlay, animated progress |
| `src/components/ui/property-card.tsx` | Type borders, emoji badges, income pill, hover glow, rounded corners |

