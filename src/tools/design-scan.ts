import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { captureWithPage } from "../utils/screenshot.js";
import { extractDOMMetrics } from "../utils/dom-extractor.js";
import type { ReferenceApp } from "../references/comparator.js";

function getRefsPath(): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  return join(__dirname, "../../data/references.json");
}

function loadRefs(): ReferenceApp[] {
  try {
    return JSON.parse(readFileSync(getRefsPath(), "utf-8"));
  } catch {
    return [];
  }
}

function saveRefs(refs: ReferenceApp[]): void {
  writeFileSync(getRefsPath(), JSON.stringify(refs, null, 2));
}

export function registerDesignScan(server: McpServer) {
  server.tool(
    "design_scan",
    "Scan any URL and add it to your design reference database. Build your own benchmark library of apps you admire. Also supports bulk scanning multiple URLs at once.",
    {
      urls: z
        .array(z.string().url())
        .describe("URLs to scan and add as references"),
      category: z
        .enum(["landing", "dashboard", "settings", "form", "auth", "pricing", "docs"])
        .default("landing")
        .describe("Screen category for these references"),
      style: z
        .enum(["minimal", "bold", "playful", "corporate", "editorial"])
        .default("minimal")
        .describe("Visual style classification"),
      names: z
        .array(z.string())
        .optional()
        .describe("Names for each URL (defaults to page title)"),
    },
    async ({ urls, category, style, names }) => {
      const refs = loadRefs();
      const results: string[] = [];
      let added = 0;

      for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        const name = names?.[i];

        try {
          const { screenshot, page, browser } = await captureWithPage(url, "desktop");
          const metrics = await extractDOMMetrics(page);
          await browser.close();

          const appName = name || metrics.meta.title || new URL(url).hostname;

          // Remove existing entry for same URL
          const existingIdx = refs.findIndex((r) => r.url === url);
          if (existingIdx >= 0) refs.splice(existingIdx, 1);

          const ref: ReferenceApp = {
            name: appName,
            url,
            category,
            style,
            scannedAt: new Date().toISOString().slice(0, 10),
            metrics: {
              spacing: {
                gridCompliance: metrics.spacing.gridCompliance,
                totalValues: metrics.spacing.values.length,
                topOffGrid: metrics.spacing.offGridValues.slice(0, 5),
              },
              colors: {
                uniqueHues: metrics.colors.uniqueHues,
                hueBuckets: metrics.colors.hueBuckets.slice(0, 5),
                contrastFailures: metrics.colors.pairs.filter((p) => p.contrast < 4.5).length,
                totalPairs: metrics.colors.pairs.length,
                hasGradients: metrics.colors.hasGradients,
                gradientCount: metrics.colors.gradientCount,
              },
              typography: {
                sizes: metrics.typography.sizes,
                families: metrics.typography.families,
                weights: metrics.typography.weights,
                distinctTiers: metrics.typography.distinctTiers,
              },
              touchTargets: {
                total: metrics.touchTargets.total,
                undersized: metrics.touchTargets.undersized,
              },
              alignment: {
                score: metrics.alignment.alignmentScore,
                columns: metrics.alignment.columns.slice(0, 5),
              },
              meta: metrics.meta,
            },
          };

          refs.push(ref);
          added++;
          results.push(`OK: ${appName} — grid ${metrics.spacing.gridCompliance}%, ${metrics.typography.distinctTiers} type tiers, ${metrics.colors.uniqueHues} hues`);
        } catch (e: any) {
          results.push(`FAIL: ${url} — ${e.message.slice(0, 60)}`);
        }
      }

      saveRefs(refs);

      const lines = [
        `SCAN COMPLETE — ${added}/${urls.length} added to reference database`,
        `Total references: ${refs.length}`,
        "",
        ...results,
        "",
        "Run design_references to browse, or design_review to benchmark against these.",
      ];

      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    }
  );
}
