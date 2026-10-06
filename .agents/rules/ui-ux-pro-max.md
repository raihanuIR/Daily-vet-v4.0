# UI/UX Pro Max Design Intelligence Rule

When designing, building, modifying, or reviewing user interfaces and web applications, strictly follow the UI/UX Pro Max guidelines.

## Quick CLI Reference
Whenever designing a new component, page, or system, query the local database:
```bash
python .agents/skills/ui-ux-pro-max/scripts/search.py "<product_type> <industry> <keywords>" --design-system
```
Stack guideline query:
```bash
python .agents/skills/ui-ux-pro-max/scripts/search.py "<keyword>" --stack html-tailwind
```

## Core Professional UI Rules

### 1. Icons & Visual Elements
- **No emoji icons**: Always use clean SVGs (Heroicons, Lucide, FontAwesome) instead of raw emojis in UI buttons and badges.
- **Stable hover states**: Use color/opacity transitions (`transition-all duration-200`) rather than large transforms that cause layout shifts.
- **Consistent icon sizing**: Standardize on `w-4 h-4`, `w-5 h-5`, or `w-6 h-6`.

### 2. Interaction & Feedback
- **Cursor pointer**: Add `cursor-pointer` to all interactive buttons, cards, and toggles.
- **Clear focus & hover**: Provide visible visual feedback (shadow, border ring, color shift) within 150ms-300ms.
- **Accessibility**: Ensure 4.5:1 text contrast minimum for readable text.

### 3. Typography & Hierarchy
- Pick deliberate, harmonious font pairings (e.g. Inter, Outfit, Plus Jakarta Sans, Figtree).
- Maintain distinct scale hierarchy: `text-xs`, `text-sm`, `text-base`, `text-lg`, `text-xl`, `text-2xl`, `text-3xl`.
- Avoid wall-of-text: break down into digestible cards, stats, and badges.
