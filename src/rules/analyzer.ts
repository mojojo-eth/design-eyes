import type { Screenshot } from "../utils/screenshot.js";

export interface DesignIssue {
  severity: "critical" | "major" | "minor";
  category:
    | "spacing"
    | "hierarchy"
    | "colors"
    | "typography"
    | "layout"
    | "accessibility"
    | "slop";
  description: string;
  fix: string;
}

export interface DesignAnalysis {
  viewport: string;
  screenType: string;
  detectedFramework: string;
  score: number;
  slopScore: number;
  issues: DesignIssue[];
}

interface AnalyzeOptions {
  focus?: string;
}

/**
 * Analyze a screenshot for design quality issues.
 *
 * The analysis works by returning the screenshot to the LLM (via MCP image content)
 * along with structured design rules. The LLM acts as the "design brain" —
 * Design Eyes provides the eyes (screenshot) and the framework (rules),
 * the LLM provides the judgment.
 *
 * Built-in rules cover:
 * - Spacing consistency (4/8px grid)
 * - Visual hierarchy (title > subtitle > body > caption)
 * - Color coherence and WCAG contrast
 * - Typography scale and weight usage
 * - Layout alignment and density
 * - AI Slop patterns (generic gradients, Inter+purple, uniform cards)
 */
export async function analyzeDesign(
  screenshot: Screenshot,
  options: AnalyzeOptions
): Promise<DesignAnalysis> {
  // The actual analysis happens in the LLM when it receives the screenshot
  // alongside the design rules prompt. This function prepares the metadata
  // and rule context that gets returned with the image.

  // TODO: Implement CSS extraction via Playwright for structural analysis
  // TODO: Implement color palette extraction from screenshot pixels
  // TODO: Implement spacing measurement from DOM computed styles

  return {
    viewport: screenshot.viewport,
    screenType: "unknown",
    detectedFramework: "unknown",
    score: 0,
    slopScore: 0,
    issues: [],
  };
}

/**
 * Design rules that get passed as context to the LLM alongside the screenshot.
 * These rules define what "good design" means for the scoring system.
 */
export const DESIGN_RULES = {
  spacing: {
    name: "Spacing Consistency",
    description: "All spacing should follow a 4px or 8px grid",
    check: "Look for mixed spacing values (e.g. 12px, 17px, 23px). Flag any value not divisible by 4.",
    fix_pattern: "Standardize to nearest 8px grid value: 8, 16, 24, 32, 48, 64",
    severity: "major" as const,
  },
  hierarchy: {
    name: "Visual Hierarchy",
    description: "Clear distinction between heading, subheading, body, and caption text",
    check: "If heading and body text appear the same size/weight, hierarchy is broken.",
    fix_pattern: "Use size + weight to create 4 distinct levels: title (24-32px bold), subtitle (18-20px semibold), body (14-16px regular), caption (12px regular muted)",
    severity: "critical" as const,
  },
  colors: {
    name: "Color Coherence",
    description: "Palette should be intentional with adequate contrast",
    check: "Count distinct colors. >7 unique hues = inconsistent. Check WCAG AA (4.5:1 for text).",
    fix_pattern: "Reduce to 1 primary + 1 accent + neutrals (3-4 grays). Ensure all text meets 4.5:1 contrast ratio.",
    severity: "major" as const,
  },
  typography: {
    name: "Typography Scale",
    description: "Font sizes should follow a consistent scale",
    check: "Look for arbitrary font sizes (13px, 15px, 17px). Should use a modular scale.",
    fix_pattern: "Use a type scale: 12, 14, 16, 20, 24, 32, 48. Max 2 font families.",
    severity: "minor" as const,
  },
  layout: {
    name: "Layout & Alignment",
    description: "Elements should be aligned to a consistent grid with intentional whitespace",
    check: "Look for misaligned elements, inconsistent padding, cramped or overly sparse sections.",
    fix_pattern: "Align to content grid. Use consistent padding (16-24px for cards, 48-64px for sections).",
    severity: "major" as const,
  },
  accessibility: {
    name: "Accessibility Basics",
    description: "Touch targets, contrast, and semantic structure",
    check: "Touch targets < 44px, text contrast < 4.5:1, missing alt text, no focus indicators.",
    fix_pattern: "Min 44px touch targets, 4.5:1 contrast ratio, semantic HTML, visible focus states.",
    severity: "critical" as const,
  },
  slop: {
    name: "AI Slop Detection",
    description: "Patterns that indicate generic AI-generated UI",
    check: "Linear gradients on backgrounds, Inter font with no customization, purple/blue default palette, uniform border-radius everywhere, cards in identical grids, stock illustrations.",
    fix_pattern: "Replace gradients with solid colors, use distinctive typography, create visual rhythm with varied spacing and sizes, add one unique design element.",
    severity: "minor" as const,
  },
};
