# Tutorial: always show a Next button

## What I found

- The screenshot shows **"3 / 13"** and the footer *"Waiting for you to complete the highlighted action..."* with only a **Back** button. That is the **old build** — the currently published site (propertymogulgame.lovable.app) hasn't been republished since the tutorial was updated.
- The current code (verified by running the preview) already renders **14 steps** and a **"Skip ahead →"** button on every wait-for-action step, with the footer *"— or skip ahead."*
- So two things need to happen: make the button unmistakably a **Next** button, and **publish** so the live game picks it up.

## Changes

### 1. Rename "Skip ahead" to "Next" and make it prominent
In the tutorial tooltip (`TutorialEngine.tsx`):
- Wait-for-action steps show a solid primary **Next →** button (same style as explanatory steps) instead of the muted outline "Skip ahead".
- Footer hint becomes: *"Complete the highlighted action, or press Next to move on."*
- Last step keeps **Got it ✓**; Back stays on the left.
- Result: every step 1–13 has a visible Next button; step 14 has Got it.

### 2. Guard against a hidden button on small screens
- Tooltip height estimate is fixed at 220px; on the 1002×735 viewport the tooltip can be clamped so the button row is pushed below the visible area. Add `maxHeight: calc(100vh - 24px)` with `overflow-y: auto` on the tooltip card so the action row is always reachable.

### 3. Publish
- After the change is verified in preview, publish so propertymogulgame.lovable.app serves the 14-step tutorial with the Next button.

## Side issue noticed (optional, tell me if you want it fixed)
On a brand-new game the **"EPC & MEES — what to watch for"** dialog pops up on top of the Welcome screen before any property has been viewed. It shouldn't fire until the player actually opens an F/G-rated listing.

## Technical details
- File: `src/components/game/tutorial/TutorialEngine.tsx` — button label/variant branch (`isWait`), footer copy, tooltip card `maxHeight`/overflow.
- No changes to `scenarioSteps.ts` or `tutorialStore.ts`; `next()` already advances from wait steps.
- Verify with Playwright: fresh game → entity picker → Step 1 shows **Next**; click Next through to step 14 → **Got it**.
