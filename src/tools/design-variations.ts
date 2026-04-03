import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { captureWithPage } from "../utils/screenshot.js";
import { extractDOMMetrics } from "../utils/dom-extractor.js";
import { analyzeDesign } from "../rules/analyzer.js";

export function registerDesignVariations(server: McpServer) {
  server.tool(
    "design_fix",
    "Analyze your running app and generate concrete CSS fixes for every issue found. Returns copy-paste-ready code organized by severity. Use after design_review to auto-fix problems.",
    {
      url: z
        .string()
        .url()
        .default("http://localhost:3000")
        .describe("URL of the page to fix"),
      viewport: z
        .enum(["mobile", "desktop"])
        .default("desktop")
        .describe("Viewport size"),
      severity: z
        .enum(["all", "critical", "major"])
        .default("all")
        .describe("Only generate fixes for this severity level or above"),
      focus: z
        .string()
        .optional()
        .describe("CSS selector to focus on a specific section"),
    },
    async ({ url, viewport, severity, focus }) => {
      const { screenshot, page, browser } = await captureWithPage(url, viewport);

      try {
        const domMetrics = await extractDOMMetrics(page, focus);

        // Extract actual CSS from problematic elements
        const cssData = await page.evaluate((focusSelector: string | undefined) => {
          const root = focusSelector
            ? document.querySelector(focusSelector) || document.body
            : document.body;

          const results: {
            spacingFixes: { selector: string; property: string; current: string; suggested: string }[];
            contrastFixes: { selector: string; currentColor: string; currentBg: string; contrast: number; suggestedColor: string }[];
            touchFixes: { selector: string; width: number; height: number }[];
            typoFixes: { selector: string; currentSize: string; suggestedSize: string }[];
          } = {
            spacingFixes: [],
            contrastFixes: [],
            touchFixes: [],
            typoFixes: [],
          };

          const allElements = Array.from(root.querySelectorAll("*")).slice(0, 3000);
          const visible = allElements.filter((el) => {
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) return false;
            const style = getComputedStyle(el);
            return style.display !== "none" && style.visibility !== "hidden";
          });

          function getSelector(el: Element): string {
            if (el.id) return `#${el.id}`;
            const tag = el.tagName.toLowerCase();
            const cls = el.className && typeof el.className === "string"
              ? `.${el.className.split(" ").filter(Boolean).slice(0, 2).join(".")}`
              : "";
            return `${tag}${cls}`;
          }

          function nearest4(v: number): number {
            return Math.round(v / 4) * 4;
          }

          // Spacing fixes
          for (const el of visible.slice(0, 500)) {
            const s = getComputedStyle(el);
            for (const prop of ["marginTop", "marginBottom", "paddingTop", "paddingBottom", "paddingLeft", "paddingRight", "gap"] as const) {
              const v = parseFloat((s as unknown as Record<string, string>)[prop]);
              if (!isNaN(v) && v > 0 && v < 200 && v % 4 !== 0) {
                const cssProp = prop.replace(/([A-Z])/g, "-$1").toLowerCase();
                results.spacingFixes.push({
                  selector: getSelector(el),
                  property: cssProp,
                  current: `${Math.round(v)}px`,
                  suggested: `${nearest4(v)}px`,
                });
              }
            }
          }

          // Contrast fixes
          function getEffectiveBg(el: Element): string {
            let current: Element | null = el;
            while (current) {
              const bg = getComputedStyle(current).backgroundColor;
              if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") return bg;
              current = current.parentElement;
            }
            return "rgb(255, 255, 255)";
          }

          function parseRGB(str: string): { r: number; g: number; b: number } {
            const match = str.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
            return match ? { r: +match[1], g: +match[2], b: +match[3] } : { r: 0, g: 0, b: 0 };
          }

          function sRGBtoLinear(c: number): number {
            const s = c / 255;
            return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
          }

          function luminance(r: number, g: number, b: number): number {
            return 0.2126 * sRGBtoLinear(r) + 0.7152 * sRGBtoLinear(g) + 0.0722 * sRGBtoLinear(b);
          }

          function contrastRatio(fg: { r: number; g: number; b: number }, bg: { r: number; g: number; b: number }): number {
            const l1 = luminance(fg.r, fg.g, fg.b);
            const l2 = luminance(bg.r, bg.g, bg.b);
            return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
          }

          for (const el of visible) {
            const hasText = Array.from(el.childNodes).some(
              (n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim()
            );
            if (!hasText) continue;
            const s = getComputedStyle(el);
            const textRgb = parseRGB(s.color);
            const bgRgb = parseRGB(getEffectiveBg(el));
            const ratio = contrastRatio(textRgb, bgRgb);
            const isLarge = parseFloat(s.fontSize) >= 18;
            const threshold = isLarge ? 3.0 : 4.5;
            if (ratio < threshold) {
              // Suggest darkening text or lightening bg
              const bgLum = luminance(bgRgb.r, bgRgb.g, bgRgb.b);
              let suggested: string;
              if (bgLum > 0.5) {
                // Light bg: darken the text
                const factor = Math.max(0.1, 1 - (threshold - ratio) * 0.15);
                suggested = `rgb(${Math.round(textRgb.r * factor)}, ${Math.round(textRgb.g * factor)}, ${Math.round(textRgb.b * factor)})`;
              } else {
                // Dark bg: lighten the text
                const factor = Math.min(2.5, 1 + (threshold - ratio) * 0.2);
                suggested = `rgb(${Math.min(255, Math.round(textRgb.r * factor))}, ${Math.min(255, Math.round(textRgb.g * factor))}, ${Math.min(255, Math.round(textRgb.b * factor))})`;
              }
              results.contrastFixes.push({
                selector: getSelector(el),
                currentColor: s.color,
                currentBg: getEffectiveBg(el),
                contrast: Math.round(ratio * 100) / 100,
                suggestedColor: suggested,
              });
            }
          }

          // Touch target fixes
          const interactiveSelectors = "a, button, [role='button'], input, select, textarea, [onclick], [tabindex]";
          for (const el of Array.from(root.querySelectorAll(interactiveSelectors)).slice(0, 200)) {
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44)) {
              results.touchFixes.push({
                selector: getSelector(el),
                width: Math.round(r.width),
                height: Math.round(r.height),
              });
            }
          }

          // Typography fixes
          const standardScale = [10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72];
          for (const el of visible) {
            const hasText = Array.from(el.childNodes).some(
              (n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim()
            );
            if (!hasText) continue;
            const size = Math.round(parseFloat(getComputedStyle(el).fontSize));
            const onScale = standardScale.some((s) => Math.abs(s - size) <= 1);
            if (!onScale && size > 0) {
              const nearest = standardScale.reduce((a, b) => Math.abs(b - size) < Math.abs(a - size) ? b : a);
              results.typoFixes.push({
                selector: getSelector(el),
                currentSize: `${size}px`,
                suggestedSize: `${nearest}px`,
              });
            }
          }

          return results;
        }, focus);

        const analysis = await analyzeDesign(screenshot, domMetrics, { focus });
        const output = formatFixes(cssData, analysis.issues, severity);

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
      } finally {
        await browser.close();
      }
    }
  );
}

function formatFixes(
  cssData: {
    spacingFixes: { selector: string; property: string; current: string; suggested: string }[];
    contrastFixes: { selector: string; currentColor: string; currentBg: string; contrast: number; suggestedColor: string }[];
    touchFixes: { selector: string; width: number; height: number }[];
    typoFixes: { selector: string; currentSize: string; suggestedSize: string }[];
  },
  issues: { severity: string; category: string; description: string }[],
  severityFilter: string,
): string {
  const lines: string[] = [];
  const includeMajor = severityFilter === "all" || severityFilter === "major";
  const includeMinor = severityFilter === "all";

  lines.push("DESIGN FIXES — Copy-paste CSS");
  lines.push("============================");

  // Critical: Contrast
  if (cssData.contrastFixes.length > 0) {
    lines.push("");
    lines.push("[CRITICAL] CONTRAST FIXES");
    const deduped = dedup(cssData.contrastFixes, (f) => f.selector);
    for (const fix of deduped.slice(0, 20)) {
      lines.push(`/* ${fix.selector}: ${fix.contrast}:1 -> needs 4.5:1 */`);
      lines.push(`${fix.selector} { color: ${fix.suggestedColor}; }`);
    }
  }

  // Critical/Major: Touch targets
  if (cssData.touchFixes.length > 0) {
    lines.push("");
    lines.push("[CRITICAL] TOUCH TARGET FIXES");
    const deduped = dedup(cssData.touchFixes, (f) => f.selector);
    for (const fix of deduped.slice(0, 15)) {
      lines.push(`/* ${fix.selector}: ${fix.width}x${fix.height} -> needs 44x44 min */`);
      lines.push(`${fix.selector} { min-height: 44px; min-width: 44px; padding: ${fix.height < 44 ? Math.ceil((44 - fix.height) / 2) : 0}px ${fix.width < 44 ? Math.ceil((44 - fix.width) / 2) : 0}px; }`);
    }
  }

  // Major: Spacing
  if (includeMajor && cssData.spacingFixes.length > 0) {
    lines.push("");
    lines.push("[MAJOR] SPACING GRID FIXES");
    // Group by suggested value
    const grouped = new Map<string, { selector: string; property: string; current: string; suggested: string }[]>();
    for (const fix of cssData.spacingFixes) {
      const key = `${fix.current}->${fix.suggested}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(fix);
    }
    for (const [change, fixes] of Array.from(grouped.entries()).slice(0, 10)) {
      const selectors = [...new Set(fixes.map((f) => f.selector))].slice(0, 5);
      const props = [...new Set(fixes.map((f) => f.property))];
      lines.push(`/* ${change} — affects ${fixes.length} elements */`);
      for (const prop of props) {
        lines.push(`${selectors.join(", ")} { ${prop}: ${fixes[0].suggested}; }`);
      }
    }
  }

  // Minor: Typography
  if (includeMinor && cssData.typoFixes.length > 0) {
    lines.push("");
    lines.push("[MINOR] TYPOGRAPHY SCALE FIXES");
    const deduped = dedup(cssData.typoFixes, (f) => `${f.selector}:${f.currentSize}`);
    for (const fix of deduped.slice(0, 10)) {
      lines.push(`/* ${fix.selector}: ${fix.currentSize} -> ${fix.suggestedSize} */`);
      lines.push(`${fix.selector} { font-size: ${fix.suggestedSize}; }`);
    }
  }

  // Summary
  lines.push("");
  lines.push("---");
  const total = cssData.contrastFixes.length + cssData.touchFixes.length +
    cssData.spacingFixes.length + cssData.typoFixes.length;
  lines.push(`Total: ${total} fixes across ${issues.length} issues`);
  lines.push("Apply these CSS rules to your stylesheet, then run design_review again to verify.");

  return lines.join("\n");
}

function dedup<T>(arr: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return arr.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
