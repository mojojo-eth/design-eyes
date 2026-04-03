# Design Eyes

**The design linter for AI-coded UIs.** Screenshot, critique, fix — automatically.

Claude Code generates ugly UIs. Design Eyes fixes them.

---

## The Problem

Every vibe-coded app looks the same: Inter font, purple gradients, inconsistent spacing, generic cards. Developers using AI coding agents produce "AI slop" because **the AI can't see what it builds**.

Design Eyes gives your AI coding agent **eyes**.

## How It Works

```
You: "review my design"

Design Eyes:
  1. Screenshots your running app (Playwright)
  2. Analyzes layout, spacing, colors, hierarchy, accessibility
  3. Compares against best-in-class references (Mobbin)
  4. Returns a design score + concrete fixes with exact code

You: "fix all"

Claude applies fixes → re-screenshots → re-scores
Score: 4/10 → 8/10 ✅
```

## Quick Start

```bash
# Install
npm install -g design-eyes

# Add to Claude Code
claude mcp add design-eyes -- npx design-eyes

# Use it
"review my design"
"fix all"
"show references for this screen"
"show design alternatives"
```

## MCP Tools

### `design_review` — The core loop

Screenshots your UI, scores it, returns prioritized fixes.

```
📸 Screenshot captured (1280x800)
Screen type: Dashboard
Framework: React + Tailwind

── Score: 5.2/10 ──

��� CRITICAL
• Heading and body same visual weight
  → Fix: text-2xl font-bold for h1, text-sm text-gray-600 for body

🟠 MAJOR  
• Inconsistent spacing (12px, 20px, 17px mixed)
  → Fix: Standardize to 8px grid (16/24/32)

🎯 AI Slop Score: 7.3/10 (high)
"Looks like every other vibe-coded app"
```

### `design_references` — Best-in-class inspiration

Finds similar screens from top apps (Linear, Vercel, Raycast, Notion...).

```
"What do the best dashboards look like?"

→ 5 references from Mobbin with design rationale
→ "apply style from Linear" → Claude refactors your code
```

### `design_variations` — Explore directions

Generates 3-5 distinct design alternatives for your current screen.

```
A. "Minimal" — Score: 8.1 — stripped, strong hierarchy, monochrome
B. "Bold" — Score: 7.8 — large metrics, color-coded sections  
C. "Editorial" — Score: 8.4 — magazine layout, serif headings

→ "apply variation C"
```

### `design_configure` — Team design system

Import your design tokens. Violations become errors, not suggestions.

```json
{
  "design_system": "./DESIGN.md",
  "rules": ["no-gradients", "8px-grid-only", "min-contrast-4.5"],
  "severity": "strict",
  "auto_review": true
}
```

## What It Checks

| Category | What | Why |
|----------|------|-----|
| **Spacing** | 4/8px grid consistency | Mixed spacing = amateur |
| **Hierarchy** | Title/body/caption distinction | If everything is bold, nothing is |
| **Colors** | Palette coherence, contrast | WCAG compliance + visual harmony |
| **Typography** | Size scale, weight usage | Generic Inter+purple = AI slop |
| **Layout** | Alignment, whitespace, density | Cramped or empty = unfinished |
| **AI Slop** | Gradient abuse, generic patterns | The "vibe-coded look" detector |

## AI Slop Detection

Design Eyes specifically detects patterns that scream "an AI made this":

- Linear gradients on everything
- Purple/blue default palette
- Cards in a grid with identical padding
- Inter font with no hierarchy
- Rounded corners everywhere (border-radius: 8px on all things)
- Stock illustrations with the same pastel style

**Score 0 = unique, distinctive design. Score 10 = maximum AI slop.**

## Pricing

| Feature | Free | Pro ($20/mo) |
|---------|------|-------------|
| `design_review` | ✅ | ✅ |
| Design rules (spacing, hierarchy, colors) | ✅ | ✅ |
| AI Slop detection | ✅ | ✅ |
| `design_references` (Mobbin) | 5/day | Unlimited |
| `design_variations` | 3/day | Unlimited |
| `design_configure` (design system) | — | ✅ |
| Auto-review on file changes | — | ✅ |
| Score history & tracking | — | ✅ |

## Works With

- **Claude Code** (primary)
- **Cursor**
- **Windsurf**
- **Any MCP-compatible client**

## Why Not Just Use...

| Tool | What it does | What it doesn't |
|------|-------------|----------------|
| Figma MCP | Push/pull designs to Figma | No design critique or scoring |
| 21st.dev | Beautiful component library | No feedback on YOUR design |
| Google Stitch | Generate UI from text | Doesn't critique existing UIs |
| Playwright MCP | Screenshot & test | No design intelligence |
| Mobbin | 600k reference screens | Not in your coding workflow |

**Design Eyes is the only tool that closes the loop: screenshot → critique → fix.**

## Contributing

PRs welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
