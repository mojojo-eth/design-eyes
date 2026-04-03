import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerDesignReferences(server: McpServer) {
  server.tool(
    "design_references",
    "Find best-in-class design references for a screen type. Shows how top apps (Linear, Vercel, Raycast, Notion...) design similar screens.",
    {
      screen_type: z
        .enum([
          "onboarding",
          "dashboard",
          "settings",
          "form",
          "list",
          "detail",
          "profile",
          "pricing",
          "landing",
          "auth",
          "empty-state",
          "error",
        ])
        .describe("Type of screen to find references for"),
      style: z
        .enum(["minimal", "bold", "playful", "corporate", "editorial"])
        .optional()
        .describe("Visual style preference"),
      count: z
        .number()
        .min(1)
        .max(10)
        .default(5)
        .describe("Number of references to return"),
    },
    async ({ screen_type, style, count }) => {
      // TODO: Integrate Mobbin API or curated reference library
      const references = await fetchReferences(screen_type, style, count);

      return {
        content: [
          {
            type: "text" as const,
            text: formatReferences(screen_type, references),
          },
        ],
      };
    }
  );
}

async function fetchReferences(
  screenType: string,
  style: string | undefined,
  count: number
): Promise<Reference[]> {
  // TODO: Implement Mobbin API integration
  // Fallback to curated built-in references
  return [];
}

function formatReferences(screenType: string, references: Reference[]): string {
  if (references.length === 0) {
    return `No references found for "${screenType}". Reference library coming soon.`;
  }

  const lines: string[] = [];
  lines.push(`📚 Design References: ${screenType}`);
  lines.push("");

  for (let i = 0; i < references.length; i++) {
    const ref = references[i];
    lines.push(`${i + 1}. ${ref.app} — ${ref.description}`);
    lines.push(`   ✓ ${ref.strengths.join("\n   ✓ ")}`);
    lines.push(`   📐 Grid: ${ref.grid}, Typo: ${ref.typography}`);
    lines.push("");
  }

  lines.push('→ Say "apply style from [app name]" to refactor your code');

  return lines.join("\n");
}

interface Reference {
  app: string;
  description: string;
  strengths: string[];
  grid: string;
  typography: string;
  screenshot_url?: string;
}
