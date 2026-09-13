export const MODEL = "gpt-5.6-sol";
export const POLICY = {
  version: "damaged-items-v1",
  referenceDate: "2026-09-13",
  windowDays: 30,
  rules: [
    "Damage must be reported within 30 days of delivery.",
    "Replace only purchased quantities that have not already been replaced.",
    "Stock must be available at execution time.",
    "A human reviewer must approve the exact saved proposal.",
  ],
};
export const scenarios = [
  {
    id: "damaged",
    title: "A mug arrived broken",
    label: "Eligible replacement",
    description: "A recent order, one damaged mug, stock available.",
    prompt:
      "One of the mugs in order PP-1001 arrived broken. Can you arrange a replacement?",
  },
  {
    id: "missing",
    title: "Something arrived damaged",
    label: "Clarification needed",
    description:
      "The order is linked, but the damaged item and quantity are unknown.",
    prompt: "Something in my delivery was damaged. Can you help?",
  },
  {
    id: "expired",
    title: "Outside the policy window",
    label: "Policy boundary",
    description: "The order was delivered more than 30 days ago.",
    prompt: "The mug from order PP-1003 arrived broken. Can you replace it?",
  },
  {
    id: "stock",
    title: "The last mug on the shelf",
    label: "Inventory boundary",
    description: "An eligible order with no replacement stock.",
    prompt: "My mug in order PP-1004 arrived broken. I need a replacement.",
  },
] as const;
export type Scenario = (typeof scenarios)[number]["id"];
export type Order = {
  number: string;
  customer: string;
  item: string;
  sku: string;
  purchased: number;
  delivered: string;
};
export function fixture(scenario: string): { order: Order; stock: number } {
  const index = scenarios.findIndex((s) => s.id === scenario);
  if (index < 0) throw new Error("Unknown scenario");
  return {
    order: {
      number: `PP-${1001 + index}`,
      customer: "Alex Morgan",
      item: "Everyday ceramic mug",
      sku: "MUG-SAGE",
      purchased: 2,
      delivered: scenario === "expired" ? "2026-07-20" : "2026-09-08",
    },
    stock: scenario === "stock" ? 0 : 12,
  };
}

// Seeded customer reports are shared by the workbench and server-side agent context.
export function caseReport(scenario: string) {
  return scenario === "missing"
    ? {
        description: "Something in my delivery was damaged.",
        item: null,
        quantity: null,
      }
    : {
        description: "One ceramic mug arrived broken.",
        item: "Everyday ceramic mug",
        quantity: 1,
      };
}
