import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { captureWithPage } from "../utils/screenshot.js";
import { extractDOMMetrics, type DOMMetrics } from "../utils/dom-extractor.js";
import { analyzeDesign, type DesignAnalysis } from "../rules/analyzer.js";

export function registerDesignCompare(server: McpServer) {
  server.tool(
    "design_compare",
    "Side-by-side comparison of two URLs. Screenshots both, extracts metrics, and shows exactly where each one wins or loses. Perfect for comparing your app against a competitor or before/after a redesign.",
    {
      url_a: z.string().url().describe("First URL (typically yours)"),
      url_b: z.string().url().describe("Second URL (competitor or reference)"),
      label_a: z.string().default("Yours").describe("Label for first URL"),
      label_b: z.string().default("Theirs").describe("Label for second URL"),
      viewport: z
        .enum(["mobile", "desktop"])
        .default("desktop")
        .describe("Viewport size"),
    },
    async ({ url_a, url_b, label_a, label_b, viewport }) => {
      // Scan both
      const resultA = await scanUrl(url_a, viewport);
      const resultB = await scanUrl(url_b, viewport);

      const output = formatComparison(resultA, resultB, label_a, label_b);

      return {
        content: [
          { type: "image" as const, data: resultA.screenshot, mimeType: "image/png" as const },
          { type: "image" as const, data: resultB.screenshot, mimeType: "image/png" as const },
          { type: "text" as const, text: output },
        ],
      };
    }
  );
}

interface ScanResult {
  screenshot: string;
  analysis: DesignAnalysis;
  metrics: DOMMetrics;
  url: string;
}

async function scanUrl(url: string, viewport: "mobile" | "desktop"): Promise<ScanResult> {
  const { screenshot, page, browser } = await captureWithPage(url, viewport);
  try {
    const metrics = await extractDOMMetrics(page);
    const analysis = await analyzeDesign(screenshot, metrics, {});
    return { screenshot: screenshot.base64, analysis, metrics, url };
  } finally {
    await browser.close();
  }
}

function formatComparison(a: ScanResult, b: ScanResult, labelA: string, labelB: string): string {
  const lines: string[] = [];

  lines.push(`HEAD-TO-HEAD COMPARISON`);
  lines.push(`${labelA}: ${a.url}`);
  lines.push(`${labelB}: ${b.url}`);
  lines.push("");

  // Score
  const scoreWinner = a.analysis.score > b.analysis.score ? labelA : a.analysis.score < b.analysis.score ? labelB : "TIE";
  lines.push(`OVERALL SCORE: ${a.analysis.score}/10 vs ${b.analysis.score}/10 -> ${scoreWinner} wins`);
  lines.push(`SLOP SCORE:    ${a.analysis.slopScore}/10 vs ${b.analysis.slopScore}/10 -> ${a.analysis.slopScore < b.analysis.slopScore ? labelA : labelB} more original`);
  lines.push("");

  // Dimension comparison
  const dims: { name: string; valA: number; valB: number; higherIsBetter: boolean }[] = [
    { name: "Spacing Grid", valA: a.analysis.metrics.spacingGridCompliance, valB: b.analysis.metrics.spacingGridCompliance, higherIsBetter: true },
    { name: "Contrast Pass", valA: a.analysis.metrics.contrastPassRate, valB: b.analysis.metrics.contrastPassRate, higherIsBetter: true },
    { name: "Touch Targets", valA: a.analysis.metrics.touchTargetPassRate, valB: b.analysis.metrics.touchTargetPassRate, higherIsBetter: true },
    { name: "Alignment", valA: a.analysis.metrics.alignmentScore, valB: b.analysis.metrics.alignmentScore, higherIsBetter: true },
    { name: "Type Tiers", valA: a.analysis.metrics.typographyTiers, valB: b.analysis.metrics.typographyTiers, higherIsBetter: true },
    { name: "Hue Groups", valA: a.analysis.metrics.uniqueHues, valB: b.analysis.metrics.uniqueHues, higherIsBetter: false },
    { name: "Font Families", valA: a.analysis.metrics.fontFamilies, valB: b.analysis.metrics.fontFamilies, higherIsBetter: false },
  ];

  lines.push("Dimension          | " + labelA.padEnd(8) + " | " + labelB.padEnd(8) + " | Winner");
  lines.push("-------------------|----------|----------|--------");

  let winsA = 0;
  let winsB = 0;

  for (const d of dims) {
    let winner: string;
    if (d.higherIsBetter) {
      winner = d.valA > d.valB ? labelA : d.valA < d.valB ? labelB : "TIE";
    } else {
      // Lower is better (fewer hues, fewer fonts = more disciplined)
      const idealA = Math.abs(d.valA - 3); // 3 is ideal for hues/fonts
      const idealB = Math.abs(d.valB - 3);
      winner = idealA < idealB ? labelA : idealA > idealB ? labelB : "TIE";
    }
    if (winner === labelA) winsA++;
    if (winner === labelB) winsB++;

    lines.push(
      `${d.name.padEnd(18)} | ${String(d.valA).padStart(6)}   | ${String(d.valB).padStart(6)}   | ${winner}`
    );
  }

  lines.push("-------------------|----------|----------|--------");
  lines.push(`WINS:              | ${String(winsA).padStart(6)}   | ${String(winsB).padStart(6)}   |`);

  // Typography details
  lines.push("");
  lines.push("TYPOGRAPHY DETAIL:");
  lines.push(`  ${labelA}: ${a.metrics.typography.families.map((f) => f.name).join(", ")} | Sizes: ${a.metrics.typography.sizes.map((s) => s.value + "px").join(", ")}`);
  lines.push(`  ${labelB}: ${b.metrics.typography.families.map((f) => f.name).join(", ")} | Sizes: ${b.metrics.typography.sizes.map((s) => s.value + "px").join(", ")}`);

  // Issues comparison
  lines.push("");
  lines.push("ISSUES:");
  const issuesA = a.analysis.issues;
  const issuesB = b.analysis.issues;
  const critA = issuesA.filter((i) => i.severity === "critical").length;
  const critB = issuesB.filter((i) => i.severity === "critical").length;
  const majA = issuesA.filter((i) => i.severity === "major").length;
  const majB = issuesB.filter((i) => i.severity === "major").length;
  lines.push(`  ${labelA}: ${critA} critical, ${majA} major, ${issuesA.length - critA - majA} minor`);
  lines.push(`  ${labelB}: ${critB} critical, ${majB} major, ${issuesB.length - critB - majB} minor`);

  // Verdict
  lines.push("");
  if (winsA > winsB) {
    lines.push(`VERDICT: ${labelA} wins ${winsA}-${winsB}. ${winsB > 0 ? `Study ${labelB} for ${dims.filter(d => {
      if (d.higherIsBetter) return d.valB > d.valA;
      return Math.abs(d.valB - 3) < Math.abs(d.valA - 3);
    }).map(d => d.name).join(", ")}.` : "Clean sweep."}`);
  } else if (winsB > winsA) {
    lines.push(`VERDICT: ${labelB} wins ${winsB}-${winsA}. Focus on: ${dims.filter(d => {
      if (d.higherIsBetter) return d.valB > d.valA;
      return Math.abs(d.valB - 3) < Math.abs(d.valA - 3);
    }).map(d => d.name).join(", ")}.`);
  } else {
    lines.push("VERDICT: Dead even. Differentiate through brand personality and micro-interactions.");
  }

  return lines.join("\n");
}
