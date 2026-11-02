# Joint planning: conversions sized with proposed extensions

## What changes for the player
- In the Renovations window, when you pick an HMO or flats conversion together with one or more extensions (loft, rear, side etc.), they go in as one joint planning application.
- The rooms/flats slider for the conversion now counts the floor space the selected extensions would add, so you can apply for the maximum number of rooms or flats the enlarged building allows. A line shows e.g. "Up to 7 rooms with extensions (5 without)".
- One combined fee (existing 10% bundle discount kept) and one decision date (the longest wait of the items).
- Linked outcome: if an extension is refused, the conversion isn't thrown out. It is approved for the most rooms/flats the building can hold without that extension, and you're told the count was reduced. If the conversion itself is refused, the whole bundle follows the existing refusal and cooldown rules.
- Building: a conversion sized against a planned extension can only start once that extension is built or running alongside it (same rule already used for approved-but-unbuilt extensions).

## Technical details
- `src/lib/engine/planning.ts`: add pure `maxConversionUnits(subtype, sqft)` (HMO: 3–8, sqft/180; flats: 2–5, sqft/550) — moved out of `renovation-dialog.tsx` so dialog and store share it.
- `renovation-dialog.tsx` multi-select panel: when a conversion is in the batch, show a units slider bounded by `maxConversionUnits(effectiveSqft + batchExtensionSqft)`; apply the same unit-based name, fee and approval-probability adjustment the single-item path uses; pass `subtypeUnits` on the conversion item.
- `renovationActions.ts` batch submit: tag all items with a shared `bundleId`; conversion keeps `subtypeUnits` and stores `unitsWithoutExtensions`. Decisions resolve together; when an extension in the bundle is refused and the conversion approved, reduce the conversion's `subtypeUnits` to `unitsWithoutExtensions` and rescale its cost.
- `PlanningApplication` type: optional `bundleId?`, `subtypeUnits?`, `unitsWithoutExtensions?` (optional, so old saves work; no migration needed).
- Month-end planning decision handling and notifications: report the reduced unit count.
- Tests: units cap rises with added extension sqft; refused extension downgrades the conversion's units; approved bundle keeps the full count.
