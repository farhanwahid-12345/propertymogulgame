

# Fix Selling Price Exploits and Improve Estate Agent UI

## Problem

The selling interface allows users to type any asking price (e.g. £1,590,000 for a £159,000 property) with no guardrails. While the offer generation code does anchor to market value, the UI makes it too easy to set absurd prices and doesn't clearly communicate consequences.

Additionally, the overall selling UI is basic -- a raw number input with small preset buttons.

## Changes

### 1. Cap the Asking Price (max 150% of market value)

Replace the free-text number input with a **slider** capped at 85%-150% of market value. This prevents the exploit entirely:

- Minimum asking price: 85% of market value
- Maximum asking price: 150% of market value
- Default: 100% of market value
- Preset buttons updated: 90%, 95%, 100%, 110%, 120%

The slider shows the current percentage of market value and the pound amount.

### 2. Add Pricing Guidance to Sell UI

Below the slider, show a dynamic tip based on the selected price:

| Range | Message |
|---|---|
| 85-94% | "Below market -- expect a bidding war with fast offers" |
| 95-100% | "At market value -- offers will come quickly" |
| 101-110% | "Slightly above market -- offers will be slower" |
| 111-130% | "Overpriced -- expect low offers well below asking" |
| 131-150% | "Significantly overpriced -- very rare, very low offers" |

### 3. Add Market Value Context to Active Listings

For each active listing, show:
- A clearer comparison between asking price and market value (as a percentage badge)
- Expected offer range based on current pricing tier
- A visual indicator (color-coded progress bar or badge) showing how realistic the asking price is

### 4. Improve Overall Sell Tab Layout

- Show property details (type, neighbourhood, current tenant, monthly income) when selected
- Use a card-based layout for the listing form instead of bare inputs
- Add an "Estimated offer range" preview before listing (e.g. "At this price, expect offers around £X-£Y")

---

## Technical Details

### File: `src/components/ui/estate-agent-window.tsx`

**Sell form (lines 796-857):**
- Replace the `<Input type="number">` for asking price with a `<Slider>` component
  - `min={Math.floor(selectedProperty.value * 0.85)}`
  - `max={Math.floor(selectedProperty.value * 1.5)}`
  - `step={1000}`
- Add a `listingPrice` state as `number[]` (for slider) instead of string
- Show percentage of market value and pound amount as labels
- Add pricing guidance text that updates dynamically based on selected percentage
- Update preset buttons to: 90%, 95%, 100%, 110%, 120%
- Add an "Expected offers" preview showing the offer range the player can expect

**Active listings section (lines 860-1240):**
- Add expected offer range display based on current asking price vs market value
- Improve the pricing strategy badge with more descriptive text and color coding
- Show the offer range buyers would typically offer at current price

**Validation:**
- Remove the free-text input entirely -- slider enforces the 85%-150% cap
- The `handleListProperty` function will use the slider value directly

