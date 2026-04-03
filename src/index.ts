import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerDesignReview } from "./tools/design-review.js";
import { registerDesignReferences } from "./tools/design-references.js";
import { registerDesignVariations } from "./tools/design-variations.js";
import { registerDesignConfigure } from "./tools/design-configure.js";
import { registerDesignScan } from "./tools/design-scan.js";
import { registerDesignHistory } from "./tools/design-history.js";
import { registerDesignCompare } from "./tools/design-compare.js";

const server = new McpServer({
  name: "design-eyes",
  version: "0.2.0",
});

// Core
registerDesignReview(server);     // Screenshot + analyze + benchmark
registerDesignVariations(server); // Generate CSS fixes (design_fix)
registerDesignConfigure(server);  // Configure rules + design system

// References
registerDesignReferences(server); // Browse reference DB
registerDesignScan(server);       // Add new references

// Comparison & tracking
registerDesignCompare(server);    // Head-to-head URL comparison
registerDesignHistory(server);    // Track quality over time

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Design Eyes MCP v0.2.0 — 7 tools ready");
}

main().catch(console.error);
