import type { Page } from "playwright";

export interface SpacingData {
  values: number[];
  gridCompliance: number; // 0-100%
  offGridValues: { value: number; count: number }[];
}

export interface ColorPair {
  text: string;
  bg: string;
  contrast: number;
  element: string;
  fontSize: number;
}

export interface ColorData {
  uniqueHues: number;
  hueBuckets: { hue: number; count: number; sample: string }[];
  pairs: ColorPair[];
  hasGradients: boolean;
  gradientCount: number;
}

export interface TypographyData {
  sizes: { value: number; count: number }[];
  families: { name: string; count: number }[];
  weights: { value: number; count: number }[];
  distinctTiers: number;
}

export interface TouchTargetData {
  targets: { tag: string; width: number; height: number; selector: string }[];
  undersized: number;
  total: number;
}

export interface AlignmentData {
  columns: { x: number; count: number }[];
  orphanedElements: number;
  totalBlocks: number;
  alignmentScore: number; // 0-100%
}

export interface PageMeta {
  title: string;
  elementCount: number;
  framework: string;
  hasDarkBackground: boolean;
}

export interface DOMMetrics {
  spacing: SpacingData;
  colors: ColorData;
  typography: TypographyData;
  touchTargets: TouchTargetData;
  alignment: AlignmentData;
  meta: PageMeta;
}

interface RawExtraction {
  spacingValues: number[];
  colorPairs: { text: string; bg: string; element: string; fontSize: number }[];
  backgroundValues: string[];
  typography: { size: number; weight: number; family: string }[];
  touchTargets: { tag: string; width: number; height: number; selector: string }[];
  blockPositions: { tag: string; x: number; y: number; width: number }[];
  meta: { title: string; elementCount: number; framework: string; bodyBg: string };
}

export async function extractDOMMetrics(
  page: Page,
  focus?: string
): Promise<DOMMetrics> {
  const raw: RawExtraction = await page.evaluate((focusSelector: string | undefined) => {
    const MAX_ELEMENTS = 5000;

    const root = focusSelector
      ? document.querySelector(focusSelector) || document.body
      : document.body;

    const allElements = Array.from(root.querySelectorAll("*")).slice(0, MAX_ELEMENTS);
    const visible = allElements.filter((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      const style = getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden";
    });

    // --- Spacing ---
    const spacingValues: number[] = [];
    for (const el of visible) {
      const s = getComputedStyle(el);
      for (const prop of [
        "marginTop", "marginBottom", "marginLeft", "marginRight",
        "paddingTop", "paddingBottom", "paddingLeft", "paddingRight", "gap",
      ] as const) {
        const v = parseFloat((s as unknown as Record<string, string>)[prop]);
        if (!isNaN(v) && v > 0 && v < 200) spacingValues.push(Math.round(v));
      }
    }

    // --- Colors ---
    function getEffectiveBg(el: Element): string {
      let current: Element | null = el;
      while (current) {
        const bg = getComputedStyle(current).backgroundColor;
        if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") return bg;
        current = current.parentElement;
      }
      return "rgb(255, 255, 255)";
    }

    const colorPairs: { text: string; bg: string; element: string; fontSize: number }[] = [];
    const backgroundValues: string[] = [];

    for (const el of visible) {
      const s = getComputedStyle(el);

      // Collect background/gradient values
      const bgImage = s.backgroundImage;
      if (bgImage && bgImage !== "none") backgroundValues.push(bgImage);

      // Only check elements with direct text
      if (!el.childNodes.length) continue;
      const hasText = Array.from(el.childNodes).some(
        (n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim()
      );
      if (!hasText) continue;

      colorPairs.push({
        text: s.color,
        bg: getEffectiveBg(el),
        element: el.tagName.toLowerCase(),
        fontSize: parseFloat(s.fontSize),
      });
    }

    // --- Typography ---
    const typography: { size: number; weight: number; family: string }[] = [];
    for (const el of visible) {
      const hasText = Array.from(el.childNodes).some(
        (n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim()
      );
      if (!hasText) continue;
      const s = getComputedStyle(el);
      typography.push({
        size: Math.round(parseFloat(s.fontSize)),
        weight: parseInt(s.fontWeight) || 400,
        family: s.fontFamily.split(",")[0].trim().replace(/['"]/g, ""),
      });
    }

    // --- Touch targets ---
    const interactiveSelectors = "a, button, [role='button'], input, select, textarea, [onclick], [tabindex]";
    const interactive = Array.from(root.querySelectorAll(interactiveSelectors)).slice(0, 500);
    const touchTargets = interactive
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      })
      .map((el) => {
        const r = el.getBoundingClientRect();
        const tag = el.tagName.toLowerCase();
        const id = el.id ? `#${el.id}` : "";
        const cls = el.className && typeof el.className === "string"
          ? `.${el.className.split(" ")[0]}`
          : "";
        return {
          tag,
          width: Math.round(r.width),
          height: Math.round(r.height),
          selector: `${tag}${id}${cls}`,
        };
      });

    // --- Alignment ---
    const blockSelectors = "div, section, article, main, header, footer, nav, aside, li, h1, h2, h3, h4, h5, h6, p";
    const blocks = Array.from(root.querySelectorAll(blockSelectors))
      .slice(0, 1000)
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 50 && r.height > 10;
      });
    const blockPositions = blocks.map((el) => {
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName.toLowerCase(),
        x: Math.round(r.x),
        y: Math.round(r.y),
        width: Math.round(r.width),
      };
    });

    // --- Meta ---
    let framework = "unknown";
    if ((window as any).__NEXT_DATA__) framework = "Next.js";
    else if ((window as any).__nuxt || (window as any).__NUXT__) framework = "Nuxt";
    else if ((window as any).__remixContext) framework = "Remix";
    else if (document.querySelector("[ng-version]")) framework = "Angular";
    else if (document.querySelector("[data-reactroot]")) framework = "React";
    else if (document.querySelector("[data-v-]") || document.querySelector("[data-vue]")) framework = "Vue";
    else if (document.querySelector("[data-svelte]") || document.querySelector(".svelte-")) framework = "Svelte";

    return {
      spacingValues,
      colorPairs,
      backgroundValues,
      typography,
      touchTargets,
      blockPositions,
      meta: {
        title: document.title,
        elementCount: visible.length,
        framework,
        bodyBg: getComputedStyle(document.body).backgroundColor || "rgb(255, 255, 255)",
      },
    };
  }, focus);

  return processRawExtraction(raw);
}

function processRawExtraction(raw: RawExtraction): DOMMetrics {
  // --- Spacing ---
  const spacingCounts = new Map<number, number>();
  for (const v of raw.spacingValues) {
    spacingCounts.set(v, (spacingCounts.get(v) || 0) + 1);
  }
  const onGrid = raw.spacingValues.filter((v) => v % 4 === 0).length;
  const gridCompliance = raw.spacingValues.length > 0
    ? Math.round((onGrid / raw.spacingValues.length) * 100)
    : 100;
  const offGridValues = Array.from(spacingCounts.entries())
    .filter(([v]) => v % 4 !== 0)
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // --- Colors ---
  const pairsWithContrast: ColorPair[] = raw.colorPairs.map((p) => ({
    ...p,
    contrast: contrastRatio(parseRGB(p.text), parseRGB(p.bg)),
  }));

  const allColors = [
    ...raw.colorPairs.map((p) => p.text),
    ...raw.colorPairs.map((p) => p.bg),
  ];
  const hueBucketMap = new Map<number, { count: number; sample: string }>();
  for (const c of allColors) {
    const rgb = parseRGB(c);
    const hsl = rgbToHSL(rgb.r, rgb.g, rgb.b);
    if (hsl.s < 10) continue; // skip grays
    const bucket = Math.floor(hsl.h / 30) * 30;
    const existing = hueBucketMap.get(bucket);
    if (existing) {
      existing.count++;
    } else {
      hueBucketMap.set(bucket, { count: 1, sample: c });
    }
  }
  const hueBuckets = Array.from(hueBucketMap.entries())
    .map(([hue, data]) => ({ hue, ...data }))
    .sort((a, b) => b.count - a.count);

  const gradientCount = raw.backgroundValues.filter((v) =>
    v.includes("gradient")
  ).length;

  // --- Typography ---
  const sizeCounts = new Map<number, number>();
  const familyCounts = new Map<string, number>();
  const weightCounts = new Map<number, number>();
  for (const t of raw.typography) {
    sizeCounts.set(t.size, (sizeCounts.get(t.size) || 0) + 1);
    familyCounts.set(t.family, (familyCounts.get(t.family) || 0) + 1);
    weightCounts.set(t.weight, (weightCounts.get(t.weight) || 0) + 1);
  }
  const sizes = Array.from(sizeCounts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.value - a.value);
  const families = Array.from(familyCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
  const weights = Array.from(weightCounts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.value - a.value);

  // Distinct tiers: sizes that differ by at least 2px
  const sortedSizes = sizes.map((s) => s.value).sort((a, b) => b - a);
  let distinctTiers = 0;
  let lastSize = -999;
  for (const s of sortedSizes) {
    if (Math.abs(s - lastSize) >= 2) {
      distinctTiers++;
      lastSize = s;
    }
  }

  // --- Touch targets ---
  const undersized = raw.touchTargets.filter(
    (t) => t.width < 44 || t.height < 44
  ).length;

  // --- Alignment ---
  const xCounts = new Map<number, number>();
  for (const b of raw.blockPositions) {
    // Round to nearest 2px for clustering
    const rounded = Math.round(b.x / 2) * 2;
    xCounts.set(rounded, (xCounts.get(rounded) || 0) + 1);
  }
  const columns = Array.from(xCounts.entries())
    .map(([x, count]) => ({ x, count }))
    .sort((a, b) => b.count - a.count);
  const orphaned = columns.filter((c) => c.count === 1).length;
  const totalBlocks = raw.blockPositions.length;
  const alignmentScore = totalBlocks > 0
    ? Math.round(((totalBlocks - orphaned) / totalBlocks) * 100)
    : 100;

  // --- Meta ---
  const bodyRgb = parseRGB(raw.meta.bodyBg);
  const bodyLum = relativeLuminance(bodyRgb.r, bodyRgb.g, bodyRgb.b);

  return {
    spacing: {
      values: raw.spacingValues,
      gridCompliance,
      offGridValues,
    },
    colors: {
      uniqueHues: hueBuckets.length,
      hueBuckets,
      pairs: pairsWithContrast,
      hasGradients: gradientCount > 0,
      gradientCount,
    },
    typography: { sizes, families, weights, distinctTiers },
    touchTargets: {
      targets: raw.touchTargets,
      undersized,
      total: raw.touchTargets.length,
    },
    alignment: { columns, orphanedElements: orphaned, totalBlocks, alignmentScore },
    meta: {
      title: raw.meta.title,
      elementCount: raw.meta.elementCount,
      framework: raw.meta.framework,
      hasDarkBackground: bodyLum < 0.2,
    },
  };
}

// --- Color math (WCAG 2.1) ---

interface RGB {
  r: number;
  g: number;
  b: number;
}

function parseRGB(str: string): RGB {
  const match = str.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (match) return { r: +match[1], g: +match[2], b: +match[3] };
  return { r: 0, g: 0, b: 0 };
}

function sRGBtoLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * sRGBtoLinear(r) + 0.7152 * sRGBtoLinear(g) + 0.0722 * sRGBtoLinear(b);
}

function contrastRatio(fg: RGB, bg: RGB): number {
  const l1 = relativeLuminance(fg.r, fg.g, fg.b);
  const l2 = relativeLuminance(bg.r, bg.g, bg.b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100;
}

function rgbToHSL(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}
