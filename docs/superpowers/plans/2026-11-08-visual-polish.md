# Navigation Visual Polish Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. Execute inline under the user's instruction to optimize directly.

**Goal:** Unify the existing navigation page without changing bookmark behavior.
**Architecture:** Keep the original DOM IDs, event handlers, data model and layout measurements. Add a scoped visual stylesheet and a self-contained SVG icon subset; include both in the static build.
**Tech Stack:** Native HTML/CSS/JavaScript; Node test; existing Playwright.
**Spec:** docs/superpowers/specs/2026-11-08-visual-polish-design.md

## Global Constraints
- Development branch only; never merge or deploy main.
- Desktop 4–10 column preference, fixed 94px cards, viewport pagination and initial focus unchanged.
- Do not bundle font files or introduce runtime dependencies.
- External sites' favicons remain external; local UI glyphs must not require them.
- Report browser checks as pending until actually executed.

## Review Focus
- All icons including dynamic category, toast and day/night icons have masks.
- Offline UI still has recognizable management controls.
- No added toolbar height invalidates the 1366×768 four-row layout.
- Mobile color panel and data menu stay reachable without horizontal page overflow.
- Dark theme and focus states remain legible; reduced motion removes ornamental animation.

## Task 1 — Static contract and visual assets
- [x] Add tests/visual-polish.test.cjs; observe missing local assets and remote stylesheet dependency failures.
- [x] Add icons.css and polish.css; update index.html while retaining event-bound IDs.
- [x] Rerun static tests and parse every CSS rule and SVG mask.

## Task 2 — Distribution and browser regression
- [x] Update scripts/build.cjs to package new assets and third-party notices.
- [x] Add tests/browser/visual-polish.spec.cjs for desktop, mobile, dark, offline and dialog states.
- [x] Preserve original app.js SHA256; produce a directly openable preview ZIP.

## Task 3 — Evidence and delivery
- [x] Document actual checks, limitations and remaining CI/visual gate.
- [ ] Create one atomic Git tree/commit preserving the remote parent and untouched files.
- [ ] Create the isolated feat/bookmarks-ui-polish branch, then report CI separately without long polling.
- [ ] Record change and verification status in Notion.
