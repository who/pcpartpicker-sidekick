import { chromium, Browser, BrowserContext, Page } from "playwright";
import {
  PartCategory,
  PartResult,
  PartSaveFailure,
  SaveListResult,
  SearchFilters,
} from "./types.js";
import config from "./config.js";

const PCPARTPICKER_BASE_URL = "https://pcpartpicker.com";
const PCPARTPICKER_LOGIN_URL = `${PCPARTPICKER_BASE_URL}/user/login/`;

const CATEGORY_SLUGS: Record<PartCategory, string> = {
  [PartCategory.CPU]: "cpu",
  [PartCategory.CPUCooler]: "cpu-cooler",
  [PartCategory.Motherboard]: "motherboard",
  [PartCategory.Memory]: "memory",
  [PartCategory.Storage]: "internal-hard-drive",
  [PartCategory.VideoCard]: "video-card",
  [PartCategory.Case]: "case",
  [PartCategory.PowerSupply]: "power-supply",
  [PartCategory.OperatingSystem]: "os",
  [PartCategory.CaseFans]: "case-fan",
  [PartCategory.Monitor]: "monitor",
  [PartCategory.Peripherals]: "keyboard",
};

const MIN_RESULTS = 10;

export interface LoginResult {
  success: boolean;
  error?: string;
}

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const DEFAULT_VIEWPORT = { width: 1920, height: 1080 };

// --- PCPartPicker Selector Configuration ---

interface LoginSelectors {
  form: string;
  usernameInput: string;
  passwordInput: string;
  submitButton: string;
}

interface CategorySearchSelectors {
  content: string;
  table: string;
}

interface FilterSelectors {
  container: string;
  priceSlider: string;
  specificationList: string;
  filterCheckbox: string;
  filterCount: string;
}

interface ResultSelectors {
  productRow: string;
  productName: string;
  productPrice: string;
  productImage: string;
  specCell: string;
  specLabel: string;
  selectCheckbox: string;
}

interface PaginationSelectors {
  container: string;
  lastPage: string;
  pageLink: string;
}

interface SaveListSelectors {
  addPartButton: string;
  partListTable: string;
  partListRow: string;
  saveButton: string;
  listNameInput: string;
  totalPrice: string;
}

export interface Selectors {
  login: LoginSelectors;
  categorySearch: CategorySearchSelectors;
  filters: FilterSelectors;
  results: ResultSelectors;
  pagination: PaginationSelectors;
  saveList: SaveListSelectors;
}

// URL patterns:
//   login:          /user/login/
//   categorySearch: /products/<category>/ (e.g. /products/cpu/, /products/video-card/)
//   filters:        sidebar on /products/<category>/ pages
//   results:        table on /products/<category>/ pages
//   pagination:     bottom of /products/<category>/ pages
//   saveList:       /list/ and /user/saved/
export const SELECTORS: Selectors = {
  login: {
    form: "form#login_form",
    usernameInput: 'input[type="text"][name*="username"]',
    passwordInput: 'input[type="password"]',
    submitButton: "#form_submit",
  },

  categorySearch: {
    content: "#category_content",
    table: "table.productList--detailed",
  },

  filters: {
    container: "#module-filters",
    priceSlider: ".price-slider",
    specificationList: ".specificationFilter",
    filterCheckbox: "input.filter-checkbox",
    filterCount: ".pp-filter-count",
  },

  results: {
    productRow: ".tr__product",
    productName: ".td__name .td__nameWrapper > p",
    productPrice: ".td__price",
    productImage: ".td__imageWrapper img",
    specCell: "td.td__spec",
    specLabel: ".specLabel",
    selectCheckbox: "input.px",
  },

  pagination: {
    container: ".pagination",
    lastPage: ".pagination li:last-child",
    pageLink: ".pagination a",
  },

  saveList: {
    addPartButton: ".actionBox__button--add",
    partListTable: ".partlist__table",
    partListRow: ".partlist__row",
    saveButton: ".button--save, .actionBox__button--save",
    listNameInput: 'input[name="listname"], .partlist__name input',
    totalPrice: ".partlist__total .td__price",
  },
};

export class BrowserController {
  private static instance: BrowserController | null = null;

  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private _page: Page | null = null;
  private _isLoggedIn = false;

  private constructor() {}

  get isLoggedIn(): boolean {
    return this._isLoggedIn;
  }

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
    this._isLoggedIn = false;
  }

  get page(): Page {
    if (!this._page) {
      throw new Error("Browser not launched. Call launch() first.");
    }
    return this._page;
  }

  async login(): Promise<LoginResult> {
    const pg = this.page;

    try {
      await pg.goto(PCPARTPICKER_LOGIN_URL, { waitUntil: "domcontentloaded" });

      // Wait for the login form to appear
      await pg.waitForSelector(SELECTORS.login.form, { timeout: 10_000 });

      await pg.fill(SELECTORS.login.usernameInput, config.username);
      await pg.fill(SELECTORS.login.passwordInput, config.password);

      await Promise.all([
        pg.waitForNavigation({ timeout: 15_000 }),
        pg.click(SELECTORS.login.submitButton),
      ]);

      // Check if we're still on the login page (indicates failure)
      const currentUrl = pg.url();
      if (currentUrl.includes("/user/login")) {
        // Look for error messages on the page
        const errorText = await pg
          .locator(".alert, .error, .form-error")
          .first()
          .textContent({ timeout: 2_000 })
          .catch(() => null);

        this._isLoggedIn = false;
        return {
          success: false,
          error: errorText?.trim() || "Login failed: invalid credentials",
        };
      }

      this._isLoggedIn = true;
      return { success: true };
    } catch (err: unknown) {
      this._isLoggedIn = false;
      if (err instanceof Error && err.name === "TimeoutError") {
        return {
          success: false,
          error: "Login timed out waiting for page response",
        };
      }
      return {
        success: false,
        error:
          err instanceof Error
            ? `Login failed: ${err.message}`
            : "Login failed: unknown error",
      };
    }
  }

  async searchCategory(
    category: PartCategory,
    filters: SearchFilters,
  ): Promise<PartResult[]> {
    const pg = this.page;
    const slug = CATEGORY_SLUGS[category];
    const url = this.buildCategoryUrl(slug, filters);

    await pg.goto(url, { waitUntil: "domcontentloaded" });
    await this.delay(1000, 2000);

    const results: PartResult[] = [];
    let hasNextPage = true;

    while (hasNextPage && results.length < MIN_RESULTS) {
      await pg
        .waitForSelector(SELECTORS.results.productRow, { timeout: 10_000 })
        .catch(() => null);

      const pageResults = await this.scrapeResults(pg);
      results.push(...pageResults);

      if (results.length >= MIN_RESULTS) {
        break;
      }

      hasNextPage = await this.goToNextPage(pg);
      if (hasNextPage) {
        await this.delay(1000, 3000);
      }
    }

    return results;
  }

  private buildCategoryUrl(slug: string, filters: SearchFilters): string {
    const url = new URL(`${PCPARTPICKER_BASE_URL}/products/${slug}/`);
    const params: string[] = [];

    if (filters.priceMin !== null) {
      params.push(`N=${filters.priceMin}`);
    }
    if (filters.priceMax !== null) {
      params.push(`X=${filters.priceMax}`);
    }

    if (params.length > 0) {
      url.hash = params.join(",");
    }

    return url.toString();
  }

  private async scrapeResults(pg: Page): Promise<PartResult[]> {
    const rows = await pg.$$(SELECTORS.results.productRow);
    const results: PartResult[] = [];

    for (const row of rows) {
      const nameEl = await row.$(SELECTORS.results.productName);
      const name = nameEl ? ((await nameEl.textContent()) ?? "").trim() : "";
      if (!name) continue;

      const priceEl = await row.$(SELECTORS.results.productPrice);
      const priceText = priceEl
        ? ((await priceEl.textContent()) ?? "").trim()
        : "";
      const price = parseFloat(priceText.replace(/[^0-9.]/g, "")) || 0;

      const ratingText = await row
        .$eval(".td__rating", (el) => el.textContent?.trim() ?? "")
        .catch(() => "");
      const ratingMatch = ratingText.match(/([\d.]+)/);
      const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;

      const specs: Record<string, string> = {};
      const specCells = await row.$$(SELECTORS.results.specCell);
      for (const cell of specCells) {
        const label = await cell
          .$(SELECTORS.results.specLabel)
          .then(async (el) => (el ? ((await el.textContent()) ?? "").trim() : ""))
          .catch(() => "");
        const value = (await cell.textContent())?.trim() ?? "";
        const cleanValue = label ? value.replace(label, "").trim() : value;
        if (label && cleanValue) {
          specs[label] = cleanValue;
        } else if (cleanValue) {
          specs[`spec_${Object.keys(specs).length}`] = cleanValue;
        }
      }

      const linkEl = await row.$(".td__name a");
      const href = linkEl ? await linkEl.getAttribute("href") : null;
      const partUrl = href
        ? href.startsWith("http")
          ? href
          : `${PCPARTPICKER_BASE_URL}${href}`
        : "";

      results.push({ name, price, rating, specs, url: partUrl });
    }

    return results;
  }

  private async goToNextPage(pg: Page): Promise<boolean> {
    const nextLink = await pg.$(
      `${SELECTORS.pagination.container} .pagination-next a`,
    );
    if (!nextLink) {
      // Fallback: look for active page + 1
      const activePageEl = await pg.$(
        `${SELECTORS.pagination.container} .active`,
      );
      if (!activePageEl) return false;

      const activeText = (await activePageEl.textContent())?.trim() ?? "";
      const activePage = parseInt(activeText, 10);
      if (isNaN(activePage)) return false;

      const nextPageLink = await pg.$(
        `${SELECTORS.pagination.container} a[href*="page=${activePage + 1}"]`,
      );
      if (!nextPageLink) return false;

      await Promise.all([
        pg.waitForNavigation({ timeout: 15_000 }),
        nextPageLink.click(),
      ]);
      return true;
    }

    await Promise.all([
      pg.waitForNavigation({ timeout: 15_000 }),
      nextLink.click(),
    ]);
    return true;
  }

  async saveList(
    parts: { url: string }[],
    listName?: string,
  ): Promise<SaveListResult> {
    if (!this._isLoggedIn) {
      throw new Error(
        "Must be logged in to save a parts list. Call login() first.",
      );
    }

    const pg = this.page;
    const name =
      listName ??
      `Build ${new Date().toISOString().slice(0, 10)}`;
    const failures: PartSaveFailure[] = [];
    let partsAdded = 0;

    // Start a new list by navigating to the list builder
    await pg.goto(`${PCPARTPICKER_BASE_URL}/list/`, {
      waitUntil: "domcontentloaded",
    });
    await this.delay(1000, 2000);

    // Add each part by navigating to its page and clicking Add
    for (const part of parts) {
      try {
        await pg.goto(part.url, { waitUntil: "domcontentloaded" });
        await this.delay(1000, 2000);

        const addButton = await pg.$(SELECTORS.saveList.addPartButton);
        if (!addButton) {
          failures.push({
            url: part.url,
            error: "Add to list button not found on page",
          });
          continue;
        }

        await addButton.click();
        await this.delay(500, 1500);
        partsAdded++;
      } catch (err: unknown) {
        failures.push({
          url: part.url,
          error:
            err instanceof Error
              ? err.message
              : "Unknown error adding part",
        });
      }
    }

    // Navigate to the list page to name and save
    await pg.goto(`${PCPARTPICKER_BASE_URL}/list/`, {
      waitUntil: "domcontentloaded",
    });
    await this.delay(1000, 2000);

    // Set the list name
    const nameInput = await pg.$(SELECTORS.saveList.listNameInput);
    if (nameInput) {
      await nameInput.fill(name);
      await this.delay(500, 1000);
    }

    // Save the list
    const saveButton = await pg.$(SELECTORS.saveList.saveButton);
    if (saveButton) {
      await Promise.all([
        pg.waitForNavigation({ timeout: 15_000 }).catch(() => null),
        saveButton.click(),
      ]);
      await this.delay(1000, 2000);
    }

    const savedUrl = pg.url();

    return {
      url: savedUrl,
      listName: name,
      partsAdded,
      partsFailed: failures,
    };
  }

  async delay(min: number, max: number): Promise<void> {
    const ms = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
