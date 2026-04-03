import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { captureScreenshot } from "../utils/screenshot.js";
import { analyzeDesign } from "../rules/analyzer.js";

export function registerDesignReview(server: McpServer) {
  server.tool(
    "design_review",
    "Screenshot your running app, analyze its design quality, and return a score with concrete fixes. The design linter for AI-coded UIs.",
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
      // 1. Screenshot
      const screenshot = await captureScreenshot(url, viewport);

      // 2. Analyze
      const analysis = await analyzeDesign(screenshot, { focus });

      // 3. Format output
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
    }
  );
}

function formatReview(analysis: DesignAnalysis): string {
  const lines: string[] = [];

  lines.push(`📸 Screenshot captured (${analysis.viewport})`);
  lines.push(`Screen type: ${analysis.screenType}`);
  lines.push(`Framework: ${analysis.detectedFramework}`);
  lines.push("");
  lines.push(`── Score: ${analysis.score}/10 ──`);
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
  lines.push('→ Say "fix all" to apply all fixes automatically');
  lines.push('→ Say "fix critical" for critical fixes only');
  lines.push('→ Say "show references" for best-in-class examples');
  lines.push('→ Say "show alternatives" for design variations');

  return lines.join("\n");
}

interface DesignIssue {
  severity: "critical" | "major" | "minor";
  category: "spacing" | "hierarchy" | "colors" | "typography" | "layout" | "accessibility" | "slop";
  description: string;
  fix: string;
}

interface DesignAnalysis {
  viewport: string;
  screenType: string;
  detectedFramework: string;
  score: number;
  slopScore: number;
  issues: DesignIssue[];
}
