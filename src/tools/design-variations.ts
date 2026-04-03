import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { captureScreenshot } from "../utils/screenshot.js";

export function registerDesignVariations(server: McpServer) {
  server.tool(
    "design_variations",
    "Generate 3-5 distinct design alternatives for your current screen. Each variation has a different visual direction with estimated design score.",
    {
      url: z
        .string()
        .url()
        .default("http://localhost:3000")
        .describe("URL of the page to generate variations for"),
      count: z
        .number()
        .min(2)
        .max(5)
        .default(3)
        .describe("Number of variations to generate"),
      constraints: z
        .string()
        .optional()
        .describe("Design constraints (e.g. 'keep dark mode', 'must use brand blue')"),
    },
    async ({ url, count, constraints }) => {
      const screenshot = await captureScreenshot(url, "desktop");

      // TODO: Analyze current design and generate variation descriptions
      // Each variation describes specific CSS/component changes

      return {
        content: [
          {
            type: "text" as const,
            text: `Design variations for ${url} — coming soon.\n\n→ Say "apply variation [A/B/C]" to apply a direction.`,
          },
        ],
      };
    }
  );
}
