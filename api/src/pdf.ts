// HTML -> PDF with the Chrome or Edge already installed on the machine (playwright-core downloads no browser).
// Order: CHROME_PATH from .env, then Chrome, then Edge. One browser is started on first use and reused.
import { HTTPException } from "hono/http-exception";
import { chromium, type Browser, type LaunchOptions } from "playwright-core";

let browser: Promise<Browser> | undefined;

async function launch(): Promise<Browser> {
  // Containers have a tiny /dev/shm and no GPU; these flags keep Chromium small and stable there.
  const args = ["--disable-dev-shm-usage", "--disable-gpu", "--no-zygote", "--renderer-process-limit=1"];
  const tries: LaunchOptions[] = process.env.CHROME_PATH
    ? [{ executablePath: process.env.CHROME_PATH, args }]
    : [{ channel: "chrome", args }, { channel: "msedge", args }];
  for (const opts of tries) {
    try {
      const b = await chromium.launch(opts);
      b.on("disconnected", () => (browser = undefined));
      return b;
    } catch (err) {
      console.error(`pdf: could not start browser ${JSON.stringify(opts)}:`, (err as Error).message.split("\n")[0]);
    }
  }
  throw new HTTPException(503, {
    message: "Fant ingen Chrome eller Edge for å lage PDF. Installer Chrome, eller sett CHROME_PATH i .env.",
  });
}

export interface PdfOptions {
  /** Small HTML shown at the top / bottom of every page. Chrome fills .pageNumber and .totalPages. */
  header: string;
  footer: string;
}

export async function htmlToPdf(html: string, { header, footer }: PdfOptions): Promise<Uint8Array> {
  browser ??= launch().catch((err) => {
    browser = undefined;
    throw err;
  });
  const page = await (await browser).newPage();
  try {
    // "load" waits for map tiles, logo and fonts. If a tile server is slow, print what we have.
    await page.setContent(html, { waitUntil: "load", timeout: 20_000 }).catch((err) => console.error("pdf: page load:", err.message));
    await page.evaluate(() => document.fonts.ready);
    return await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: header,
      footerTemplate: footer,
      margin: { top: "20mm", bottom: "18mm", left: "16mm", right: "16mm" },
    });
  } finally {
    await page.close();
  }
}
