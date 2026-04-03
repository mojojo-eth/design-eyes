import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { DOMMetrics } from "../utils/dom-extractor.js";

export interface ReferenceApp {
  name: string;
  url: string;
  category: string;
  style: string;
  scannedAt: string;
  metrics: ReferenceMetrics;
}

export interface ReferenceMetrics {
  spacing: {
    gridCompliance: number;
    totalValues: number;
    topOffGrid: { value: number; count: number }[];
  };
  colors: {
    uniqueHues: number;
    hueBuckets: { hue: number; count: number; sample: string }[];
    contrastFailures: number;
    totalPairs: number;
    hasGradients: boolean;
    gradientCount: number;
  };
  typography: {
    sizes: { value: number; count: number }[];
    families: { name: string; count: number }[];
    weights: { value: number; count: number }[];
    distinctTiers: number;
  };
  touchTargets: {
    total: number;
    undersized: number;
  };
  alignment: {
    score: number;
    columns: { x: number; count: number }[];
  };
  meta: {
    title: string;
    elementCount: number;
    framework: string;
    hasDarkBackground: boolean;
  };
}

export interface ComparisonResult {
  yourScore: number;
  benchmarkAvg: number;
  benchmarkBest: { name: string; score: number };
  dimensions: DimensionComparison[];
  summary: string;
  recommendations: string[];
}

export interface DimensionComparison {
  name: string;
  yours: number;
  benchmarkAvg: number;
  benchmarkBest: { name: string; value: number };
  verdict: "ahead" | "on-par" | "behind" | "far-behind";
}

let _references: ReferenceApp[] | null = null;

function loadReferences(): ReferenceApp[] {
  if (_references) return _references;
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const dataPath = join(__dirname, "../../data/references.json");
    _references = JSON.parse(readFileSync(dataPath, "utf-8"));
    return _references!;
  } catch {
    return [];
  }
}

export function getReferences(category?: string, style?: string): ReferenceApp[] {
  let refs = loadReferences();
  if (category) refs = refs.filter((r) => r.category === category);
  if (style) refs = refs.filter((r) => r.style === style);
  return refs;
}

export function compareAgainstReferences(
  domMetrics: DOMMetrics,
  designScore: number,
  slopScore: number,
  category?: string
): ComparisonResult {
  const refs = getReferences(category);
  if (refs.length === 0) {
    return {
      yourScore: designScore,
      benchmarkAvg: 0,
      benchmarkBest: { name: "N/A", score: 0 },
      dimensions: [],
      summary: "No reference data available for comparison.",
      recommendations: [],
    };
  }

  const dimensions: DimensionComparison[] = [];

  // 1. Spacing grid compliance
  const spacingValues = refs.map((r) => r.metrics.spacing.gridCompliance);
  dimensions.push(compareDimension(
    "Spacing Grid",
    domMetrics.spacing.gridCompliance,
    spacingValues,
    refs.map((r) => r.name),
    "%"
  ));

  // 2. Contrast pass rate
  const yourContrastFails = domMetrics.colors.pairs.filter((p) => {
    const isLarge = p.fontSize >= 18;
    return p.contrast < (isLarge ? 3.0 : 4.5);
  }).length;
  const yourContrastRate = domMetrics.colors.pairs.length > 0
    ? Math.round(((domMetrics.colors.pairs.length - yourContrastFails) / domMetrics.colors.pairs.length) * 100)
    : 100;
  const refContrastRates = refs.map((r) => {
    const total = r.metrics.colors.totalPairs;
    const fails = r.metrics.colors.contrastFailures;
    return total > 0 ? Math.round(((total - fails) / total) * 100) : 100;
  });
  dimensions.push(compareDimension(
    "Contrast (WCAG)",
    yourContrastRate,
    refContrastRates,
    refs.map((r) => r.name),
    "%"
  ));

  // 3. Typography tiers
  const tierValues = refs.map((r) => r.metrics.typography.distinctTiers);
  dimensions.push(compareDimension(
    "Type Hierarchy",
    domMetrics.typography.distinctTiers,
    tierValues,
    refs.map((r) => r.name),
    " tiers"
  ));

  // 4. Font families count (lower is better — invert for comparison)
  const familyValues = refs.map((r) => r.metrics.typography.families.length);
  const yourFamilies = domMetrics.typography.families.length;
  const avgFamilies = avg(familyValues);
  const bestFamilyIdx = familyValues.indexOf(Math.min(...familyValues));
  dimensions.push({
    name: "Font Discipline",
    yours: yourFamilies,
    benchmarkAvg: Math.round(avgFamilies * 10) / 10,
    benchmarkBest: { name: refs[bestFamilyIdx]?.name || "N/A", value: familyValues[bestFamilyIdx] || 0 },
    verdict: yourFamilies <= avgFamilies ? (yourFamilies <= 2 ? "ahead" : "on-par") : "behind",
  });

  // 5. Touch target compliance
  const yourTouchRate = domMetrics.touchTargets.total > 0
    ? Math.round(((domMetrics.touchTargets.total - domMetrics.touchTargets.undersized) / domMetrics.touchTargets.total) * 100)
    : 100;
  const refTouchRates = refs.map((r) => {
    const total = r.metrics.touchTargets.total;
    const under = r.metrics.touchTargets.undersized;
    return total > 0 ? Math.round(((total - under) / total) * 100) : 100;
  });
  dimensions.push(compareDimension(
    "Touch Targets",
    yourTouchRate,
    refTouchRates,
    refs.map((r) => r.name),
    "%"
  ));

  // 6. Alignment
  const alignValues = refs.map((r) => r.metrics.alignment.score);
  dimensions.push(compareDimension(
    "Alignment",
    domMetrics.alignment.alignmentScore,
    alignValues,
    refs.map((r) => r.name),
    "%"
  ));

  // 7. Color palette (hue count — moderate is best, 3-5 is ideal)
  const hueValues = refs.map((r) => r.metrics.colors.uniqueHues);
  const yourHues = domMetrics.colors.uniqueHues;
  const avgHues = avg(hueValues);
  dimensions.push({
    name: "Palette Control",
    yours: yourHues,
    benchmarkAvg: Math.round(avgHues * 10) / 10,
    benchmarkBest: { name: refs[hueValues.indexOf(Math.min(...hueValues.filter(h => h >= 2)))]?.name || "N/A", value: Math.min(...hueValues.filter(h => h >= 2)) || 0 },
    verdict: yourHues >= 2 && yourHues <= 5 ? "ahead" : yourHues <= avgHues + 2 ? "on-par" : "behind",
  });

  // 8. AI Slop (lower is better)
  dimensions.push({
    name: "Originality (anti-slop)",
    yours: 10 - slopScore,
    benchmarkAvg: 8, // Best-in-class apps typically score 1-3 slop
    benchmarkBest: { name: "Linear", value: 9 },
    verdict: slopScore <= 3 ? "ahead" : slopScore <= 5 ? "on-par" : slopScore <= 7 ? "behind" : "far-behind",
  });

  // Overall
  const aheadCount = dimensions.filter((d) => d.verdict === "ahead").length;
  const behindCount = dimensions.filter((d) => d.verdict === "behind" || d.verdict === "far-behind").length;

  const recommendations: string[] = [];
  for (const dim of dimensions) {
    if (dim.verdict === "far-behind") {
      recommendations.push(`${dim.name}: you're at ${dim.yours} vs benchmark avg ${dim.benchmarkAvg}. Study ${dim.benchmarkBest.name} (${dim.benchmarkBest.value}).`);
    } else if (dim.verdict === "behind") {
      recommendations.push(`${dim.name}: room to improve. Yours: ${dim.yours}, best: ${dim.benchmarkBest.name} (${dim.benchmarkBest.value}).`);
    }
  }

  let summary: string;
  if (behindCount === 0) {
    summary = `Your design matches or exceeds best-in-class SaaS standards across all ${dimensions.length} dimensions. Ship it.`;
  } else if (aheadCount > behindCount) {
    summary = `Strong design. Ahead on ${aheadCount}/${dimensions.length} dimensions, ${behindCount} need work.`;
  } else {
    summary = `${behindCount}/${dimensions.length} dimensions behind best-in-class. Focus on the recommendations below.`;
  }

  return {
    yourScore: designScore,
    benchmarkAvg: Math.round(avg(spacingValues) + avg(refContrastRates) + avg(tierValues) * 10) / 30 * 10, // rough composite
    benchmarkBest: { name: refs[0]?.name || "N/A", score: 0 },
    dimensions,
    summary,
    recommendations,
  };
}

function compareDimension(
  name: string,
  yours: number,
  refValues: number[],
  refNames: string[],
  _unit: string
): DimensionComparison {
  const avgVal = avg(refValues);
  const maxVal = Math.max(...refValues);
  const bestIdx = refValues.indexOf(maxVal);
  const threshold = avgVal * 0.1; // 10% tolerance

  let verdict: DimensionComparison["verdict"];
  if (yours >= maxVal) verdict = "ahead";
  else if (yours >= avgVal - threshold) verdict = "on-par";
  else if (yours >= avgVal * 0.6) verdict = "behind";
  else verdict = "far-behind";

  return {
    name,
    yours,
    benchmarkAvg: Math.round(avgVal * 10) / 10,
    benchmarkBest: { name: refNames[bestIdx] || "N/A", value: maxVal },
    verdict,
  };
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function formatComparison(result: ComparisonResult): string {
  const lines: string[] = [];

  lines.push("-- BENCHMARK vs BEST-IN-CLASS SaaS --");
  lines.push("");
  lines.push(result.summary);
  lines.push("");

  // Dimension table
  lines.push("Dimension            | Yours | Avg  | Best              | Status");
  lines.push("---------------------|-------|------|-------------------|--------");
  for (const d of result.dimensions) {
    const status = d.verdict === "ahead" ? "AHEAD" :
      d.verdict === "on-par" ? "OK" :
      d.verdict === "behind" ? "BEHIND" : "FIX";
    const name = d.name.padEnd(20);
    const yours = String(d.yours).padStart(5);
    const avgS = String(d.benchmarkAvg).padStart(4);
    const best = `${d.benchmarkBest.name} (${d.benchmarkBest.value})`.padEnd(17);
    lines.push(`${name} |${yours} |${avgS} | ${best} | ${status}`);
  }

  if (result.recommendations.length > 0) {
    lines.push("");
    lines.push("RECOMMENDATIONS:");
    for (const r of result.recommendations) {
      lines.push(`  -> ${r}`);
    }
  }

  return lines.join("\n");
}
