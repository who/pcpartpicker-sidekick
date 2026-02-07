export enum PartCategory {
  CPU = "CPU",
  CPUCooler = "CPU Cooler",
  Motherboard = "Motherboard",
  Memory = "Memory",
  Storage = "Storage",
  VideoCard = "Video Card",
  Case = "Case",
  PowerSupply = "Power Supply",
  OperatingSystem = "Operating System",
  CaseFans = "Case Fans",
  Monitor = "Monitor",
  Peripherals = "Peripherals",
}

export interface PartResult {
  name: string;
  price: number;
  rating: number | null;
  specs: Record<string, string>;
  url: string;
}

export interface PartSelection {
  category: PartCategory;
  part: PartResult;
  reasoning: string;
}

export interface BuildProposal {
  parts: PartSelection[];
  total: number;
  budget: number;
  overBudget: boolean;
}

export interface SearchFilters {
  priceMin: number | null;
  priceMax: number | null;
  brand: string | null;
  specs: Record<string, string>;
  minRating: number | null;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  type: "text" | "proposal" | "status";
}

export interface UserPreferences {
  budget: number;
  purpose: string;
  brandPreferences: string[];
  exclusions: PartCategory[];
}

export interface BudgetAllocation {
  category: PartCategory;
  min: number;
  max: number;
}
