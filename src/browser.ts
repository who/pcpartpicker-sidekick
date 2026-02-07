import { chromium, Browser, BrowserContext, Page } from "playwright";

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
