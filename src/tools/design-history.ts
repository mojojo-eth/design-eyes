import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { captureWithPage } from "../utils/screenshot.js";
import { extractDOMMetrics } from "../utils/dom-extractor.js";
import { analyzeDesign } from "../rules/analyzer.js";
import { compareAgainstReferences } from "../references/comparator.js";

interface HistoryEntry {
  url: string;
  timestamp: string;
  viewport: string;
  score: number;
  slopScore: number;
  issueCount: { critical: number; major: number; minor: number };
  metrics: {
    spacingGridCompliance: number;
    contrastPassRate: number;
    touchTargetPassRate: number;
    alignmentScore: number;
    typographyTiers: number;
    uniqueHues: number;
    fontFamilies: number;
  };
  benchmarkDimensions?: {
    name: string;
    yours: number;
    verdict: string;
  }[];
}

function getHistoryDir(): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  return join(__dirname, "../../data/history");
}

function getHistoryPath(url: string): string {
  const slug = new URL(url).hostname.replace(/[^a-z0-9]/gi, "-");
  return join(getHistoryDir(), `${slug}.json`);
}

function loadHistory(url: string): HistoryEntry[] {
  try {
    const path = getHistoryPath(url);
    if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8"));
  } catch {}
  return [];
}

function saveHistory(url: string, entries: HistoryEntry[]): void {
  const dir = getHistoryDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(getHistoryPath(url), JSON.stringify(entries, null, 2));
}

export function registerDesignHistory(server: McpServer) {
  server.tool(
    "design_history",
    "Track your design quality over time. Each design_review automatically saves a snapshot. View progress, compare before/after, and see which dimensions improved or regressed.",
    {
      url: z
        .string()
        .url()
        .default("http://localhost:3000")
        .describe("URL to show history for"),
      action: z
        .enum(["show", "record", "clear"])
        .default("show")
        .describe("show: display history, record: take a new snapshot now, clear: reset history"),
      viewport: z
        .enum(["mobile", "desktop"])
        .default("desktop")
        .describe("Viewport for recording"),
    },
    async ({ url, action, viewport }) => {
      if (action === "clear") {
        saveHistory(url, []);
        return { content: [{ type: "text" as const, text: `History cleared for ${url}` }] };
      }

      if (action === "record") {
        const { screenshot, page, browser } = await captureWithPage(url, viewport);
        try {
          const domMetrics = await extractDOMMetrics(page, undefined);
          const analysis = await analyzeDesign(screenshot, domMetrics, {});
          const comparison = compareAgainstReferences(domMetrics, analysis.score, analysis.slopScore, "landing");

          const entry: HistoryEntry = {
            url,
            timestamp: new Date().toISOString(),
            viewport: screenshot.viewport,
            score: analysis.score,
            slopScore: analysis.slopScore,
            issueCount: {
              critical: analysis.issues.filter((i) => i.severity === "critical").length,
              major: analysis.issues.filter((i) => i.severity === "major").length,
              minor: analysis.issues.filter((i) => i.severity === "minor").length,
            },
            metrics: analysis.metrics,
            benchmarkDimensions: comparison.dimensions.map((d) => ({
              name: d.name,
              yours: d.yours,
              verdict: d.verdict,
            })),
          };

          const history = loadHistory(url);
          history.push(entry);
          saveHistory(url, history);

          const output = formatRecord(entry, history);
          return {
            content: [
              { type: "image" as const, data: screenshot.base64, mimeType: "image/png" as const },
              { type: "text" as const, text: output },
            ],
          };
        } finally {
          await browser.close();
        }
      }

      // show
      const history = loadHistory(url);
      if (history.length === 0) {
        return { content: [{ type: "text" as const, text: `No history for ${url}. Run with action="record" to start tracking.` }] };
      }

      return { content: [{ type: "text" as const, text: formatHistory(url, history) }] };
    }
  );
}

function formatRecord(entry: HistoryEntry, history: HistoryEntry[]): string {
  const lines: string[] = [];
  lines.push(`SNAPSHOT RECORDED — #${history.length}`);
  lines.push(`Score: ${entry.score}/10 | Slop: ${entry.slopScore}/10`);
  lines.push(`Issues: ${entry.issueCount.critical} critical, ${entry.issueCount.major} major, ${entry.issueCount.minor} minor`);

  if (history.length >= 2) {
    const prev = history[history.length - 2];
    const scoreDelta = entry.score - prev.score;
    const slopDelta = entry.slopScore - prev.slopScore;
    lines.push("");
    lines.push("CHANGES since last snapshot:");
    lines.push(`  Score: ${prev.score} -> ${entry.score} (${scoreDelta >= 0 ? "+" : ""}${scoreDelta})`);
    lines.push(`  Slop:  ${prev.slopScore} -> ${entry.slopScore} (${slopDelta <= 0 ? "" : "+"}${slopDelta}${slopDelta < 0 ? " better" : slopDelta > 0 ? " worse" : ""})`);

    // Metric deltas
    const dims = [
      { name: "Grid", key: "spacingGridCompliance" as const },
      { name: "Contrast", key: "contrastPassRate" as const },
      { name: "Touch", key: "touchTargetPassRate" as const },
      { name: "Align", key: "alignmentScore" as const },
      { name: "Tiers", key: "typographyTiers" as const },
    ];
    for (const d of dims) {
      const prevVal = prev.metrics[d.key];
      const nowVal = entry.metrics[d.key];
      const delta = nowVal - prevVal;
      if (delta !== 0) {
        const arrow = delta > 0 ? "UP" : "DOWN";
        lines.push(`  ${d.name}: ${prevVal} -> ${nowVal} (${arrow})`);
      }
    }
  }

  return lines.join("\n");
}

function formatHistory(url: string, history: HistoryEntry[]): string {
  const lines: string[] = [];
  const host = new URL(url).hostname;

  lines.push(`DESIGN HISTORY — ${host} (${history.length} snapshots)`);
  lines.push("");

  // Score timeline
  lines.push("Score Timeline:");
  const maxWidth = 30;
  for (const entry of history.slice(-15)) {
    const date = entry.timestamp.slice(0, 16).replace("T", " ");
    const barLen = Math.round((entry.score / 10) * maxWidth);
    const bar = "█".repeat(barLen) + "░".repeat(maxWidth - barLen);
    lines.push(`  ${date} | ${bar} | ${entry.score}/10`);
  }

  // Latest vs first
  if (history.length >= 2) {
    const first = history[0];
    const latest = history[history.length - 1];
    lines.push("");
    lines.push("PROGRESS (first -> latest):");
    lines.push(`  Score:    ${first.score} -> ${latest.score} (${latest.score >= first.score ? "+" : ""}${(latest.score - first.score).toFixed(1)})`);
    lines.push(`  Slop:     ${first.slopScore} -> ${latest.slopScore} (${latest.slopScore <= first.slopScore ? "improved" : "regressed"})`);
    lines.push(`  Critical: ${first.issueCount.critical} -> ${latest.issueCount.critical}`);
    lines.push(`  Major:    ${first.issueCount.major} -> ${latest.issueCount.major}`);
    lines.push(`  Minor:    ${first.issueCount.minor} -> ${latest.issueCount.minor}`);

    lines.push("");
    lines.push("Metric Progress:");
    const dims = [
      { name: "Grid Compliance", key: "spacingGridCompliance" as const, unit: "%" },
      { name: "Contrast Pass", key: "contrastPassRate" as const, unit: "%" },
      { name: "Touch Targets", key: "touchTargetPassRate" as const, unit: "%" },
      { name: "Alignment", key: "alignmentScore" as const, unit: "%" },
      { name: "Type Tiers", key: "typographyTiers" as const, unit: "" },
      { name: "Hue Groups", key: "uniqueHues" as const, unit: "" },
    ];
    for (const d of dims) {
      const firstVal = first.metrics[d.key];
      const latestVal = latest.metrics[d.key];
      const delta = latestVal - firstVal;
      const indicator = delta > 0 ? "UP" : delta < 0 ? "DOWN" : "=";
      lines.push(`  ${d.name.padEnd(18)} ${String(firstVal).padStart(4)} -> ${String(latestVal).padStart(4)}${d.unit} (${indicator})`);
    }
  }

  // Benchmark trend
  const latest = history[history.length - 1];
  if (latest.benchmarkDimensions) {
    lines.push("");
    lines.push("Latest Benchmark Status:");
    for (const d of latest.benchmarkDimensions) {
      const status = d.verdict === "ahead" ? "AHEAD" : d.verdict === "on-par" ? "OK" : d.verdict === "behind" ? "BEHIND" : "FIX";
      lines.push(`  ${d.name.padEnd(22)} ${String(d.yours).padStart(4)} | ${status}`);
    }
  }

  return lines.join("\n");
}
