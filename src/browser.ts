import { chromium, Browser, BrowserContext, Page } from "playwright";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const DEFAULT_VIEWPORT = { width: 1920, height: 1080 };

export class BrowserController {
  private static instance: BrowserController | null = null;

  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private _page: Page | null = null;

  private constructor() {}

  static getInstance(): BrowserController {
    if (!BrowserController.instance) {
      BrowserController.instance = new BrowserController();
    }
    return BrowserController.instance;
  }

  async launch(): Promise<void> {
    if (this.browser?.isConnected()) {
      return;
    }

    this.browser = await chromium.launch({ headless: true });
    this.context = await this.browser.newContext({
      userAgent: DEFAULT_USER_AGENT,
      viewport: DEFAULT_VIEWPORT,
    });
    this._page = await this.context.newPage();
  }

  async close(): Promise<void> {
    if (this._page) {
      await this._page.close();
      this._page = null;
    }
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  get page(): Page {
    if (!this._page) {
      throw new Error("Browser not launched. Call launch() first.");
    }
    return this._page;
  }

  async delay(min: number, max: number): Promise<void> {
    const ms = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
