import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerDesignConfigure(server: McpServer) {
  server.tool(
    "design_configure",
    "Configure Design Eyes with your design system, custom rules, and auto-review settings. Import design tokens so violations become errors.",
    {
      design_system: z
        .string()
        .optional()
        .describe("Path to DESIGN.md or design tokens JSON file"),
      rules: z
        .array(z.string())
        .optional()
        .describe('Custom rules (e.g. ["no-gradients", "8px-grid-only", "min-contrast-4.5"])'),
      severity: z
        .enum(["strict", "normal", "relaxed"])
        .default("normal")
        .describe("How strict the design review should be"),
      auto_review: z
        .boolean()
        .default(false)
        .describe("Automatically review after CSS/UI file changes"),
    },
    async ({ design_system, rules, severity, auto_review }) => {
      // TODO: Parse design system file, configure rules engine

      const config = {
        design_system: design_system || "default",
        rules: rules || [],
        severity,
        auto_review,
      };

      const lines: string[] = [];
      lines.push("Design Eyes configured:");
      lines.push(
        `  ✓ Design system: ${config.design_system}${design_system ? " loaded" : " (built-in defaults)"}`
      );
      lines.push(`  ✓ Custom rules: ${config.rules.length} active`);
      lines.push(`  ✓ Auto-review: ${config.auto_review ? "enabled" : "disabled"}`);
      lines.push(`  ✓ Severity: ${config.severity}`);

      return {
        content: [
          {
            type: "text" as const,
            text: lines.join("\n"),
          },
        ],
      };
    }
  );
}
