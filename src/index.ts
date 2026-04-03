import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerDesignReview } from "./tools/design-review.js";
import { registerDesignReferences } from "./tools/design-references.js";
import { registerDesignVariations } from "./tools/design-variations.js";
import { registerDesignConfigure } from "./tools/design-configure.js";

const server = new McpServer({
  name: "design-eyes",
  version: "0.1.0",
});

// Register all tools
registerDesignReview(server);
registerDesignReferences(server);
registerDesignVariations(server);
registerDesignConfigure(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Design Eyes MCP server running");
}

main().catch(console.error);
