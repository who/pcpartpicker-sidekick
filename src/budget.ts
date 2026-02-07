import { PartCategory, type BudgetAllocation } from "./types.js";

type BuildPurpose = "gaming" | "workstation" | "general";

// Allocation percentages per category for each build purpose
const ALLOCATION_PROFILES: Record<BuildPurpose, Partial<Record<PartCategory, number>>> = {
  gaming: {
    [PartCategory.CPU]: 0.20,
    [PartCategory.CPUCooler]: 0.04,
    [PartCategory.Motherboard]: 0.10,
    [PartCategory.Memory]: 0.07,
    [PartCategory.Storage]: 0.07,
    [PartCategory.VideoCard]: 0.37,
    [PartCategory.Case]: 0.05,
    [PartCategory.PowerSupply]: 0.06,
    [PartCategory.OperatingSystem]: 0.04,
  },
  workstation: {
    [PartCategory.CPU]: 0.28,
    [PartCategory.CPUCooler]: 0.05,
    [PartCategory.Motherboard]: 0.12,
    [PartCategory.Memory]: 0.18,
    [PartCategory.Storage]: 0.12,
    [PartCategory.VideoCard]: 0.10,
    [PartCategory.Case]: 0.05,
    [PartCategory.PowerSupply]: 0.06,
    [PartCategory.OperatingSystem]: 0.04,
  },
  general: {
    [PartCategory.CPU]: 0.20,
    [PartCategory.CPUCooler]: 0.04,
    [PartCategory.Motherboard]: 0.12,
    [PartCategory.Memory]: 0.12,
    [PartCategory.Storage]: 0.12,
    [PartCategory.VideoCard]: 0.15,
    [PartCategory.Case]: 0.07,
    [PartCategory.PowerSupply]: 0.07,
    [PartCategory.OperatingSystem]: 0.04,
    [PartCategory.CaseFans]: 0.03,
    [PartCategory.Monitor]: 0.04,
  },
};

const BUDGET_FLEX = 0.15; // +/- 15% around target for min/max range

export function allocateBudget(
  totalBudget: number,
  buildPurpose: BuildPurpose,
  categories?: PartCategory[],
): BudgetAllocation[] {
  const profile = ALLOCATION_PROFILES[buildPurpose];
  const requestedCategories = categories ?? (Object.keys(profile) as PartCategory[]);

  // Filter profile to only requested categories
  const filtered: Partial<Record<PartCategory, number>> = {};
  for (const cat of requestedCategories) {
    if (profile[cat] !== undefined) {
      filtered[cat] = profile[cat];
    }
  }

  // Re-normalize percentages so they sum to 1.0
  const total = Object.values(filtered).reduce((sum, pct) => sum + pct, 0);
  const scale = total > 0 ? 1 / total : 0;

  return Object.entries(filtered).map(([cat, pct]) => {
    const normalized = pct * scale;
    const target = totalBudget * normalized;
    return {
      category: cat as PartCategory,
      min: Math.round(target * (1 - BUDGET_FLEX)),
      max: Math.round(target * (1 + BUDGET_FLEX)),
    };
  });
}

export interface OverBudgetResult {
  overBudget: boolean;
  amount: number;
  percentage: number;
}

export function checkOverBudget(budget: number, spent: number): OverBudgetResult {
  const amount = spent - budget;
  const percentage = budget > 0 ? (amount / budget) * 100 : 0;
  return {
    overBudget: percentage > 5,
    amount,
    percentage,
  };
}
