import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getReferences, type ReferenceApp } from "../references/comparator.js";

export function registerDesignReferences(server: McpServer) {
  server.tool(
    "design_references",
    "Browse the best-in-class SaaS design reference database. See how Linear, Vercel, Stripe, Notion, Raycast, Supabase, etc. score on spacing, colors, typography, and more. Use to learn what top-tier design looks like in numbers.",
    {
      category: z
        .enum(["landing", "dashboard", "settings", "form", "all"])
        .default("landing")
        .describe("Screen category to browse"),
      style: z
        .enum(["minimal", "bold", "playful", "corporate", "all"])
        .default("all")
        .describe("Visual style filter"),
      sort_by: z
        .enum(["spacing", "contrast", "typography", "alignment", "name"])
        .default("name")
        .describe("Sort references by this metric"),
    },
    async ({ category, style, sort_by }) => {
      const cat = category === "all" ? undefined : category;
      const sty = style === "all" ? undefined : style;
      let refs = getReferences(cat, sty);

      if (refs.length === 0) {
        return {
          content: [{
            type: "text" as const,
            text: `No references found for category="${category}", style="${style}". Available categories: landing. Run design_scan_reference to add more.`,
          }],
        };
      }

      // Sort
      if (sort_by === "spacing") {
        refs = [...refs].sort((a, b) => b.metrics.spacing.gridCompliance - a.metrics.spacing.gridCompliance);
      } else if (sort_by === "typography") {
        refs = [...refs].sort((a, b) => b.metrics.typography.distinctTiers - a.metrics.typography.distinctTiers);
      } else if (sort_by === "alignment") {
        refs = [...refs].sort((a, b) => b.metrics.alignment.score - a.metrics.alignment.score);
      } else if (sort_by === "contrast") {
        refs = [...refs].sort((a, b) => {
          const rateA = a.metrics.colors.totalPairs > 0 ? (a.metrics.colors.totalPairs - a.metrics.colors.contrastFailures) / a.metrics.colors.totalPairs : 1;
          const rateB = b.metrics.colors.totalPairs > 0 ? (b.metrics.colors.totalPairs - b.metrics.colors.contrastFailures) / b.metrics.colors.totalPairs : 1;
          return rateB - rateA;
        });
      }

      const output = formatReferenceList(refs);

      return {
        content: [{
          type: "text" as const,
          text: output,
        }],
      };
    }
  );
}

function formatReferenceList(refs: ReferenceApp[]): string {
  const lines: string[] = [];

  lines.push(`DESIGN REFERENCE DATABASE — ${refs.length} best-in-class SaaS apps`);
  lines.push("");
  lines.push("App                | Grid  | Hues | Tiers | Fonts | Align | Gradients | Framework");
  lines.push("-------------------|-------|------|-------|-------|-------|-----------|----------");

  for (const r of refs) {
    const m = r.metrics;
    const fonts = m.typography.families.map((f) => f.name).join(", ").slice(0, 5);
    lines.push(
      `${r.name.padEnd(18)} | ${String(m.spacing.gridCompliance).padStart(3)}%  | ${String(m.colors.uniqueHues).padStart(3)}  | ${String(m.typography.distinctTiers).padStart(4)}  | ${fonts.padEnd(5)} | ${String(m.alignment.score).padStart(3)}%  | ${String(m.colors.gradientCount).padStart(9)} | ${m.meta.framework}`
    );
  }

  // Averages
  lines.push("-------------------|-------|------|-------|-------|-------|-----------|----------");
  const avgGrid = Math.round(refs.reduce((s, r) => s + r.metrics.spacing.gridCompliance, 0) / refs.length);
  const avgHues = Math.round(refs.reduce((s, r) => s + r.metrics.colors.uniqueHues, 0) / refs.length * 10) / 10;
  const avgTiers = Math.round(refs.reduce((s, r) => s + r.metrics.typography.distinctTiers, 0) / refs.length * 10) / 10;
  const avgAlign = Math.round(refs.reduce((s, r) => s + r.metrics.alignment.score, 0) / refs.length);
  lines.push(
    `${"AVERAGE".padEnd(18)} | ${String(avgGrid).padStart(3)}%  | ${String(avgHues).padStart(3)}  | ${String(avgTiers).padStart(4)}  |       | ${String(avgAlign).padStart(3)}%  |           |`
  );

  lines.push("");
  lines.push("KEY INSIGHTS:");

  // Best spacing
  const bestSpacing = refs.reduce((best, r) => r.metrics.spacing.gridCompliance > best.metrics.spacing.gridCompliance ? r : best);
  lines.push(`  Best spacing grid: ${bestSpacing.name} (${bestSpacing.metrics.spacing.gridCompliance}%)`);

  // Best hierarchy
  const bestTiers = refs.reduce((best, r) => r.metrics.typography.distinctTiers > best.metrics.typography.distinctTiers ? r : best);
  lines.push(`  Best type hierarchy: ${bestTiers.name} (${bestTiers.metrics.typography.distinctTiers} tiers)`);

  // Most fonts used
  const fontLeader = refs.reduce((best, r) => r.metrics.typography.families.length < best.metrics.typography.families.length ? r : best);
  lines.push(`  Most disciplined fonts: ${fontLeader.name} (${fontLeader.metrics.typography.families.length} families)`);

  lines.push("");
  lines.push("TAKEAWAYS FOR YOUR APP:");
  lines.push(`  -> Target ${avgGrid}%+ spacing grid compliance (best-in-class avg)`);
  lines.push(`  -> Aim for ${Math.round(avgTiers)}+ typography tiers for strong hierarchy`);
  lines.push(`  -> Keep hue count around ${Math.round(avgHues)} (palette discipline)`);
  lines.push(`  -> ${avgAlign}%+ alignment score is the standard`);

  return lines.join("\n");
}
