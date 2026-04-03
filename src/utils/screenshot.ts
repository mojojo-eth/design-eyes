import { chromium, type Browser, type Page } from "playwright";

export interface Screenshot {
  base64: string;
  width: number;
  height: number;
  viewport: string;
}

export interface CaptureResult {
  screenshot: Screenshot;
  page: Page;
  browser: Browser;
}

const VIEWPORTS = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
};

export async function captureWithPage(
  url: string,
  viewport: "mobile" | "desktop" | "both"
): Promise<CaptureResult> {
  const vp = VIEWPORTS[viewport === "both" ? "desktop" : viewport];

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: vp.width, height: vp.height },
  });

  await page.goto(url, { waitUntil: "networkidle", timeout: 10000 });
  await page.waitForTimeout(1000);

  const buffer = await page.screenshot({ fullPage: true });
  const base64 = buffer.toString("base64");

  return {
    screenshot: {
      base64,
      width: vp.width,
      height: vp.height,
      viewport: `${vp.width}x${vp.height}`,
    },
    page,
    browser,
  };
}

export async function captureScreenshot(
  url: string,
  viewport: "mobile" | "desktop" | "both"
): Promise<Screenshot> {
  const result = await captureWithPage(url, viewport);
  await result.browser.close();
  return result.screenshot;
}
