import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { captureWithPage } from "../utils/screenshot.js";
import { extractDOMMetrics } from "../utils/dom-extractor.js";
import { analyzeDesign, type DesignAnalysis } from "../rules/analyzer.js";

export function registerDesignReview(server: McpServer) {
  server.tool(
    "design_review",
    "Screenshot your running app, extract DOM metrics (spacing, colors, contrast, typography, touch targets, alignment), analyze design quality with real measurements, and return a score with concrete fixes. The design linter for AI-coded UIs.",
    {
      url: z
        .string()
        .url()
        .default("http://localhost:3000")
        .describe("URL of the page to review"),
      viewport: z
        .enum(["mobile", "desktop", "both"])
        .default("desktop")
        .describe("Viewport size to capture"),
      focus: z
        .string()
        .optional()
        .describe("CSS selector to focus analysis on a specific section"),
    },
    async ({ url, viewport, focus }) => {
      const { screenshot, page, browser } = await captureWithPage(url, viewport);

      try {
        const domMetrics = await extractDOMMetrics(page, focus);
        const analysis = await analyzeDesign(screenshot, domMetrics, { focus });
        const output = formatReview(analysis);

        return {
          content: [
            {
              type: "image" as const,
              data: screenshot.base64,
              mimeType: "image/png" as const,
            },
            {
              type: "text" as const,
              text: output,
            },
          ],
        };
      } finally {
        await browser.close();
      }
    }
  );
}

function formatReview(analysis: DesignAnalysis): string {
  const lines: string[] = [];
  const m = analysis.metrics;

  lines.push(`Screenshot captured (${analysis.viewport})`);
  lines.push(`Screen type: ${analysis.screenType} | Framework: ${analysis.detectedFramework}`);
  lines.push("");
  lines.push(`-- Score: ${analysis.score}/10 --`);
  lines.push("");
  lines.push("METRICS:");
  lines.push(`  Spacing grid compliance:  ${m.spacingGridCompliance}%`);
  lines.push(`  Contrast pass rate:       ${m.contrastPassRate}%`);
  lines.push(`  Touch target pass rate:   ${m.touchTargetPassRate}%`);
  lines.push(`  Alignment score:          ${m.alignmentScore}%`);
  lines.push(`  Typography tiers:         ${m.typographyTiers}`);
  lines.push(`  Unique hue groups:        ${m.uniqueHues}`);
  lines.push(`  Font families:            ${m.fontFamilies}`);
  lines.push("");

  // Critical issues
  const critical = analysis.issues.filter((i) => i.severity === "critical");
  if (critical.length > 0) {
    lines.push("🔴 CRITICAL");
    for (const issue of critical) {
      lines.push(`• ${issue.description}`);
      lines.push(`  → Fix: ${issue.fix}`);
    }
    lines.push("");
  }

  // Major issues
  const major = analysis.issues.filter((i) => i.severity === "major");
  if (major.length > 0) {
    lines.push("🟠 MAJOR");
    for (const issue of major) {
      lines.push(`• ${issue.description}`);
      lines.push(`  → Fix: ${issue.fix}`);
    }
    lines.push("");
  }

  // Minor issues
  const minor = analysis.issues.filter((i) => i.severity === "minor");
  if (minor.length > 0) {
    lines.push("🟡 MINOR");
    for (const issue of minor) {
      lines.push(`• ${issue.description}`);
      lines.push(`  → Fix: ${issue.fix}`);
    }
    lines.push("");
  }

  // AI Slop Score
  lines.push(`🎯 AI Slop Score: ${analysis.slopScore}/10`);
  if (analysis.slopScore >= 7) {
    lines.push('"Looks like every other vibe-coded app"');
  } else if (analysis.slopScore >= 4) {
    lines.push('"Some generic patterns detected"');
  } else {
    lines.push('"Distinctive design — nice work"');
  }

  lines.push("");
  lines.push('Say "fix all" to apply all fixes automatically');
  lines.push('Say "fix critical" for critical fixes only');

  return lines.join("\n");
}
