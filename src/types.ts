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

export interface SaveListResult {
  url: string;
  listName: string;
  partsAdded: number;
  partsFailed: PartSaveFailure[];
}

export interface PartSaveFailure {
  url: string;
  error: string;
}

// Error classification
export enum ErrorType {
  LOGIN_FAILED = "LOGIN_FAILED",
  SEARCH_FAILED = "SEARCH_FAILED",
  NETWORK_ERROR = "NETWORK_ERROR",
  API_ERROR = "API_ERROR",
  BROWSER_CRASH = "BROWSER_CRASH",
}

export const ERROR_MESSAGES: Record<ErrorType, string> = {
  [ErrorType.LOGIN_FAILED]: "Could not log into PCPartPicker",
  [ErrorType.SEARCH_FAILED]: "Could not find parts. Please try again.",
  [ErrorType.NETWORK_ERROR]:
    "Connection issue encountered. Please check your internet.",
  [ErrorType.API_ERROR]:
    "AI service temporarily unavailable. Please try again.",
  [ErrorType.BROWSER_CRASH]:
    "Browser encountered an issue. Attempting to recover...",
};

// WebSocket message types
export interface WsMessageIn {
  type: "message" | "approve" | "change";
  content: string;
}

export interface WsTextResponse {
  type: "response";
  content: string;
  done: boolean;
}

export interface WsQuestionMessage {
  type: "question";
  content: string;
}

export interface WsProposalPart {
  category: string;
  name: string;
  price: number;
  reasoning: string;
  url?: string;
}

export interface WsProposalMessage {
  type: "proposal";
  parts: WsProposalPart[];
  total: number;
  budget: number;
  overBudget: boolean;
  overBudgetAmount: number;
  overBudgetPercentage: number;
}

export interface WsErrorMessage {
  type: "error";
  content: string;
}

export type WsMessageOut =
  | WsTextResponse
  | WsQuestionMessage
  | WsProposalMessage
  | WsErrorMessage;
