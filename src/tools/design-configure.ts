import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

interface DesignConfig {
  spacingGrid: number;
  minContrast: number;
  minTouchTarget: number;
  maxFontFamilies: number;
  minTypeTiers: number;
  maxHues: number;
  customColors?: { primary: string; accent: string; neutrals: string[] };
  customFonts?: { body: string; display?: string; mono?: string };
  customSpacingScale?: number[];
  severity: "strict" | "normal" | "relaxed";
  ignoredRules: string[];
}

const DEFAULT_CONFIG: DesignConfig = {
  spacingGrid: 4,
  minContrast: 4.5,
  minTouchTarget: 44,
  maxFontFamilies: 2,
  minTypeTiers: 4,
  maxHues: 5,
  severity: "normal",
  ignoredRules: [],
};

let activeConfig: DesignConfig = { ...DEFAULT_CONFIG };

function getConfigPath(): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  return join(__dirname, "../../data/config.json");
}

function loadConfig(): DesignConfig {
  try {
    const path = getConfigPath();
    if (existsSync(path)) {
      const saved = JSON.parse(readFileSync(path, "utf-8"));
      activeConfig = { ...DEFAULT_CONFIG, ...saved };
    }
  } catch {
    // Use defaults
  }
  return activeConfig;
}

function saveConfig(config: DesignConfig): void {
  const path = getConfigPath();
  writeFileSync(path, JSON.stringify(config, null, 2));
  activeConfig = config;
}

export function getActiveConfig(): DesignConfig {
  return activeConfig;
}

export function registerDesignConfigure(server: McpServer) {
  // Load config on startup
  loadConfig();

  server.tool(
    "design_configure",
    "Configure Design Eyes with your design system: set spacing grid, contrast minimum, font constraints, custom colors, custom type scale. Settings persist across sessions. Import from DESIGN_SYSTEM.md or set individual values.",
    {
      action: z
        .enum(["show", "set", "import", "reset"])
        .default("show")
        .describe("show: display current config, set: change values, import: load from file, reset: restore defaults"),
      spacing_grid: z
        .number()
        .optional()
        .describe("Spacing grid base (default: 4px)"),
      min_contrast: z
        .number()
        .optional()
        .describe("Minimum contrast ratio (default: 4.5 for WCAG AA)"),
      min_touch_target: z
        .number()
        .optional()
        .describe("Minimum touch target size in px (default: 44)"),
      max_font_families: z
        .number()
        .optional()
        .describe("Maximum allowed font families (default: 2)"),
      min_type_tiers: z
        .number()
        .optional()
        .describe("Minimum required typography tiers (default: 4)"),
      max_hues: z
        .number()
        .optional()
        .describe("Maximum unique hue groups (default: 5)"),
      severity: z
        .enum(["strict", "normal", "relaxed"])
        .optional()
        .describe("strict: lower thresholds, normal: defaults, relaxed: higher tolerance"),
      primary_color: z
        .string()
        .optional()
        .describe("Primary brand color (hex, e.g. #6366f1)"),
      accent_color: z
        .string()
        .optional()
        .describe("Accent brand color (hex)"),
      body_font: z
        .string()
        .optional()
        .describe("Expected body font family"),
      display_font: z
        .string()
        .optional()
        .describe("Expected display/heading font family"),
      ignore_rules: z
        .array(z.string())
        .optional()
        .describe("Rules to ignore: spacing, colors, typography, accessibility, layout, slop"),
      design_system_path: z
        .string()
        .optional()
        .describe("Path to DESIGN_SYSTEM.md or design-tokens.json to import"),
    },
    async ({ action, spacing_grid, min_contrast, min_touch_target, max_font_families, min_type_tiers, max_hues, severity, primary_color, accent_color, body_font, display_font, ignore_rules, design_system_path }) => {
      let config = loadConfig();

      if (action === "reset") {
        config = { ...DEFAULT_CONFIG };
        saveConfig(config);
        return { content: [{ type: "text" as const, text: "Config reset to defaults.\n\n" + formatConfig(config) }] };
      }

      if (action === "import" && design_system_path) {
        try {
          const content = readFileSync(design_system_path, "utf-8");
          const imported = parseDesignSystem(content, design_system_path);
          config = { ...config, ...imported };
          saveConfig(config);
          return { content: [{ type: "text" as const, text: `Imported design system from ${design_system_path}\n\n` + formatConfig(config) }] };
        } catch (e: any) {
          return { content: [{ type: "text" as const, text: `Failed to import: ${e.message}` }] };
        }
      }

      if (action === "set") {
        if (spacing_grid !== undefined) config.spacingGrid = spacing_grid;
        if (min_contrast !== undefined) config.minContrast = min_contrast;
        if (min_touch_target !== undefined) config.minTouchTarget = min_touch_target;
        if (max_font_families !== undefined) config.maxFontFamilies = max_font_families;
        if (min_type_tiers !== undefined) config.minTypeTiers = min_type_tiers;
        if (max_hues !== undefined) config.maxHues = max_hues;
        if (severity !== undefined) config.severity = severity;
        if (ignore_rules !== undefined) config.ignoredRules = ignore_rules;

        if (primary_color || accent_color) {
          config.customColors = config.customColors || { primary: "", accent: "", neutrals: [] };
          if (primary_color) config.customColors.primary = primary_color;
          if (accent_color) config.customColors.accent = accent_color;
        }

        if (body_font || display_font) {
          config.customFonts = config.customFonts || { body: "", display: "", mono: "" };
          if (body_font) config.customFonts.body = body_font;
          if (display_font) config.customFonts.display = display_font;
        }

        // Severity presets
        if (severity === "strict") {
          config.minContrast = Math.max(config.minContrast, 7.0); // WCAG AAA
          config.minTouchTarget = 48;
          config.maxFontFamilies = 2;
          config.maxHues = 4;
        } else if (severity === "relaxed") {
          config.minContrast = Math.min(config.minContrast, 3.0);
          config.minTouchTarget = 36;
          config.maxHues = 7;
        }

        saveConfig(config);
        return { content: [{ type: "text" as const, text: "Config updated.\n\n" + formatConfig(config) }] };
      }

      // show
      return { content: [{ type: "text" as const, text: formatConfig(config) }] };
    }
  );
}

function formatConfig(config: DesignConfig): string {
  const lines: string[] = [];
  lines.push("DESIGN EYES CONFIGURATION");
  lines.push("========================");
  lines.push("");
  lines.push("Rules:");
  lines.push(`  Spacing grid:       ${config.spacingGrid}px`);
  lines.push(`  Min contrast:       ${config.minContrast}:1 ${config.minContrast >= 7 ? "(WCAG AAA)" : config.minContrast >= 4.5 ? "(WCAG AA)" : "(relaxed)"}`);
  lines.push(`  Min touch target:   ${config.minTouchTarget}px`);
  lines.push(`  Max font families:  ${config.maxFontFamilies}`);
  lines.push(`  Min type tiers:     ${config.minTypeTiers}`);
  lines.push(`  Max hue groups:     ${config.maxHues}`);
  lines.push(`  Severity:           ${config.severity}`);

  if (config.ignoredRules.length > 0) {
    lines.push(`  Ignored rules:      ${config.ignoredRules.join(", ")}`);
  }

  if (config.customColors) {
    lines.push("");
    lines.push("Brand Colors:");
    if (config.customColors.primary) lines.push(`  Primary:  ${config.customColors.primary}`);
    if (config.customColors.accent) lines.push(`  Accent:   ${config.customColors.accent}`);
  }

  if (config.customFonts) {
    lines.push("");
    lines.push("Brand Fonts:");
    if (config.customFonts.body) lines.push(`  Body:     ${config.customFonts.body}`);
    if (config.customFonts.display) lines.push(`  Display:  ${config.customFonts.display}`);
    if (config.customFonts.mono) lines.push(`  Mono:     ${config.customFonts.mono}`);
  }

  lines.push("");
  lines.push("Config file: data/config.json (persists across sessions)");

  return lines.join("\n");
}

function parseDesignSystem(content: string, path: string): Partial<DesignConfig> {
  const result: Partial<DesignConfig> = {};

  if (path.endsWith(".json")) {
    const json = JSON.parse(content);
    // Support common design token formats
    if (json.spacing?.base) result.spacingGrid = json.spacing.base;
    if (json.colors?.primary) result.customColors = { primary: json.colors.primary, accent: json.colors.accent || "", neutrals: json.colors.neutrals || [] };
    if (json.typography?.fontFamily?.body) result.customFonts = { body: json.typography.fontFamily.body, display: json.typography.fontFamily.display, mono: json.typography.fontFamily.mono };
    return result;
  }

  // Parse markdown design system
  const spacingMatch = content.match(/spacing.*?(\d+)\s*px/i);
  if (spacingMatch) result.spacingGrid = parseInt(spacingMatch[1]);

  const primaryMatch = content.match(/primary.*?(#[0-9a-fA-F]{6})/i);
  const accentMatch = content.match(/accent.*?(#[0-9a-fA-F]{6})/i);
  if (primaryMatch || accentMatch) {
    result.customColors = {
      primary: primaryMatch?.[1] || "",
      accent: accentMatch?.[1] || "",
      neutrals: [],
    };
  }

  const bodyFontMatch = content.match(/body.*?font.*?[:\s]+([A-Z][a-zA-Z\s]+)/i);
  const displayFontMatch = content.match(/(?:heading|display|title).*?font.*?[:\s]+([A-Z][a-zA-Z\s]+)/i);
  if (bodyFontMatch || displayFontMatch) {
    result.customFonts = {
      body: bodyFontMatch?.[1]?.trim() || "",
      display: displayFontMatch?.[1]?.trim() || "",
    };
  }

  return result;
}
