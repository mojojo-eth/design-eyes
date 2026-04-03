import type { Screenshot } from "../utils/screenshot.js";
import type { DOMMetrics } from "../utils/dom-extractor.js";

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
  metrics: MetricsSummary;
}

export interface MetricsSummary {
  spacingGridCompliance: number;
  contrastPassRate: number;
  touchTargetPassRate: number;
  alignmentScore: number;
  typographyTiers: number;
  uniqueHues: number;
  fontFamilies: number;
}

interface AnalyzeOptions {
  focus?: string;
}

export async function analyzeDesign(
  screenshot: Screenshot,
  domMetrics: DOMMetrics,
  _options: AnalyzeOptions
): Promise<DesignAnalysis> {
  const issues: DesignIssue[] = [
    ...checkSpacing(domMetrics),
    ...checkColors(domMetrics),
    ...checkTypography(domMetrics),
    ...checkTouchTargets(domMetrics),
    ...checkAlignment(domMetrics),
  ];

  const { score: slopScore, issues: slopIssues } = checkSlop(domMetrics);
  issues.push(...slopIssues);

  const score = computeScore(issues);

  const contrastPassing = domMetrics.colors.pairs.filter((p) => {
    const isLargeText = p.fontSize >= 18;
    return p.contrast >= (isLargeText ? 3.0 : 4.5);
  }).length;
  const contrastTotal = domMetrics.colors.pairs.length;

  const touchPassing = domMetrics.touchTargets.total - domMetrics.touchTargets.undersized;

  return {
    viewport: screenshot.viewport,
    screenType: detectScreenType(domMetrics),
    detectedFramework: domMetrics.meta.framework,
    score,
    slopScore,
    issues,
    metrics: {
      spacingGridCompliance: domMetrics.spacing.gridCompliance,
      contrastPassRate: contrastTotal > 0 ? Math.round((contrastPassing / contrastTotal) * 100) : 100,
      touchTargetPassRate: domMetrics.touchTargets.total > 0
        ? Math.round((touchPassing / domMetrics.touchTargets.total) * 100)
        : 100,
      alignmentScore: domMetrics.alignment.alignmentScore,
      typographyTiers: domMetrics.typography.distinctTiers,
      uniqueHues: domMetrics.colors.uniqueHues,
      fontFamilies: domMetrics.typography.families.length,
    },
  };
}

// --- Spacing ---

function checkSpacing(m: DOMMetrics): DesignIssue[] {
  const issues: DesignIssue[] = [];
  const { gridCompliance, offGridValues } = m.spacing;

  if (gridCompliance < 70) {
    const top3 = offGridValues.slice(0, 3).map((v) => `${v.value}px (x${v.count})`).join(", ");
    issues.push({
      severity: "major",
      category: "spacing",
      description: `Spacing grid compliance: ${gridCompliance}%. Frequent off-grid values: ${top3}`,
      fix: `Standardize to 4px grid. Replace ${offGridValues[0]?.value}px -> ${nearest4(offGridValues[0]?.value || 0)}px, etc.`,
    });
  } else if (gridCompliance < 90) {
    issues.push({
      severity: "minor",
      category: "spacing",
      description: `Spacing grid compliance: ${gridCompliance}%. ${offGridValues.length} off-grid values found.`,
      fix: "Minor spacing inconsistencies. Round to nearest 4px multiple.",
    });
  }

  return issues;
}

function nearest4(v: number): number {
  return Math.round(v / 4) * 4;
}

// --- Colors ---

function checkColors(m: DOMMetrics): DesignIssue[] {
  const issues: DesignIssue[] = [];

  const failures = m.colors.pairs.filter((p) => {
    const isLargeText = p.fontSize >= 18;
    return p.contrast < (isLargeText ? 3.0 : 4.5);
  });

  if (failures.length > 0) {
    const worst = failures.sort((a, b) => a.contrast - b.contrast).slice(0, 3);
    const desc = worst.map((f) => `${f.element}: ${f.contrast}:1`).join(", ");
    issues.push({
      severity: "critical",
      category: "colors",
      description: `${failures.length} text elements fail WCAG AA contrast. Worst: ${desc}`,
      fix: "Increase text contrast to 4.5:1 minimum (3:1 for large text). Darken text or lighten backgrounds.",
    });
  }

  if (m.colors.uniqueHues > 7) {
    issues.push({
      severity: "major",
      category: "colors",
      description: `${m.colors.uniqueHues} distinct hue groups detected. Palette feels inconsistent.`,
      fix: "Reduce to 1 primary + 1 accent + neutrals (3-4 grays).",
    });
  } else if (m.colors.uniqueHues > 5) {
    issues.push({
      severity: "minor",
      category: "colors",
      description: `${m.colors.uniqueHues} distinct hue groups. Consider tightening the palette.`,
      fix: "Aim for 3-4 intentional hue groups max.",
    });
  }

  return issues;
}

// --- Typography ---

function checkTypography(m: DOMMetrics): DesignIssue[] {
  const issues: DesignIssue[] = [];

  if (m.typography.distinctTiers < 3) {
    issues.push({
      severity: "critical",
      category: "hierarchy",
      description: `Only ${m.typography.distinctTiers} distinct text size tiers. Weak visual hierarchy.`,
      fix: "Use at least 4 tiers: title (24-32px bold), subtitle (18-20px semi), body (14-16px regular), caption (12px muted).",
    });
  }

  const STANDARD_SCALE = [10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72];
  const arbitrary = m.typography.sizes.filter(
    (s) => !STANDARD_SCALE.some((std) => Math.abs(s.value - std) <= 1)
  );
  if (arbitrary.length > 2) {
    const examples = arbitrary.slice(0, 3).map((s) => `${s.value}px`).join(", ");
    issues.push({
      severity: "minor",
      category: "typography",
      description: `${arbitrary.length} non-standard font sizes: ${examples}. Use a consistent type scale.`,
      fix: "Adopt a modular scale: 12, 14, 16, 20, 24, 32, 48px.",
    });
  }

  if (m.typography.families.length > 3) {
    issues.push({
      severity: "major",
      category: "typography",
      description: `${m.typography.families.length} font families: ${m.typography.families.map((f) => f.name).join(", ")}`,
      fix: "Use max 2 font families (1 body + 1 display/mono).",
    });
  }

  return issues;
}

// --- Touch targets ---

function checkTouchTargets(m: DOMMetrics): DesignIssue[] {
  const issues: DesignIssue[] = [];

  if (m.touchTargets.undersized > 0) {
    const worst = m.touchTargets.targets
      .filter((t) => t.width < 44 || t.height < 44)
      .sort((a, b) => Math.min(a.width, a.height) - Math.min(b.width, b.height))
      .slice(0, 3);
    const desc = worst.map((t) => `${t.selector} (${t.width}x${t.height})`).join(", ");
    issues.push({
      severity: m.touchTargets.undersized > 3 ? "critical" : "major",
      category: "accessibility",
      description: `${m.touchTargets.undersized}/${m.touchTargets.total} interactive elements below 44px min. Worst: ${desc}`,
      fix: "Set min-height: 44px and min-width: 44px on all clickable elements.",
    });
  }

  return issues;
}

// --- Alignment ---

function checkAlignment(m: DOMMetrics): DesignIssue[] {
  const issues: DesignIssue[] = [];

  if (m.alignment.alignmentScore < 70 && m.alignment.totalBlocks > 10) {
    issues.push({
      severity: "major",
      category: "layout",
      description: `Alignment score: ${m.alignment.alignmentScore}%. ${m.alignment.orphanedElements} elements not aligned to any column.`,
      fix: "Align content to a consistent grid. Use CSS Grid or Flexbox with consistent padding.",
    });
  } else if (m.alignment.alignmentScore < 85 && m.alignment.totalBlocks > 10) {
    issues.push({
      severity: "minor",
      category: "layout",
      description: `Alignment score: ${m.alignment.alignmentScore}%. Minor misalignments detected.`,
      fix: "Check for inconsistent padding or margin overrides breaking the grid.",
    });
  }

  return issues;
}

// --- AI Slop detection ---

function checkSlop(m: DOMMetrics): { score: number; issues: DesignIssue[] } {
  let score = 0;
  const signals: string[] = [];

  if (
    m.typography.families.length === 1 &&
    /^(inter|system-ui|-apple-system|segoe ui|roboto)$/i.test(m.typography.families[0]?.name || "")
  ) {
    score += 2;
    signals.push("Default system font only");
  }

  const primaryHue = m.colors.hueBuckets[0]?.hue;
  if (primaryHue !== undefined && primaryHue >= 210 && primaryHue <= 280) {
    score += 2;
    signals.push("Purple/blue dominant palette");
  }

  if (m.colors.hasGradients && m.colors.gradientCount >= 2) {
    score += 1;
    signals.push(`${m.colors.gradientCount} gradient backgrounds`);
  }

  const uniqueSpacing = new Set(m.spacing.values).size;
  if (uniqueSpacing <= 3 && m.spacing.values.length > 20) {
    score += 2;
    signals.push("Very low spacing variety (uniform card syndrome)");
  }

  if (m.typography.distinctTiers <= 2) {
    score += 2;
    signals.push("Flat text hierarchy");
  }

  if (!m.meta.hasDarkBackground && m.colors.uniqueHues <= 2) {
    score += 1;
    signals.push("Default light theme with minimal color effort");
  }

  score = Math.min(score, 10);

  const issues: DesignIssue[] = [];
  if (score >= 5) {
    issues.push({
      severity: "minor",
      category: "slop",
      description: `AI Slop Score: ${score}/10. Signals: ${signals.join("; ")}`,
      fix: "Add distinctive elements: custom typography, unique color accent, or varied spacing rhythm.",
    });
  }

  return { score, issues };
}

// --- Score computation ---

function computeScore(issues: DesignIssue[]): number {
  let score = 10;
  for (const issue of issues) {
    if (issue.severity === "critical") score -= 2;
    else if (issue.severity === "major") score -= 1;
    else score -= 0.5;
  }
  return Math.max(0, Math.min(10, Math.round(score * 10) / 10));
}

// --- Screen type detection ---

function detectScreenType(m: DOMMetrics): string {
  const title = m.meta.title.toLowerCase();
  if (title.includes("login") || title.includes("sign in")) return "auth";
  if (title.includes("dashboard")) return "dashboard";
  if (title.includes("settings")) return "settings";
  if (title.includes("pricing")) return "pricing";
  return "page";
}
