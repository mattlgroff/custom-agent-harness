import type { ModelMessage } from "ai";
import type { Scenario } from "../src/lib/fixtures";
export type Turn = {
  input: string;
  action?: "approve" | "decline";
  required: string[];
  forbidden?: string[];
  status: "none" | "pending" | "approved" | "rejected";
  quantity?: number;
  draft?: boolean;
  criterion: string;
};
export type GoldenCase = {
  id: string;
  scenario: Scenario;
  initial?: "pending" | "approved" | "rejected";
  history?: ModelMessage[];
  turns: Turn[];
};
const investigate = [
  "lookupOrder",
  "readPolicy",
  "checkStock",
  "proposeReplacement",
];
// Authored by Codex from observed failures and product contracts before model comparison.
// Criteria describe acceptable behavior, not an exact target response or one exact tool sequence.
export const golden: GoldenCase[] = [
  {
    id: "replacement-then-approved-draft",
    scenario: "damaged",
    turns: [
      {
        input: "Let's replace it for them.",
        required: investigate,
        status: "pending",
        quantity: 1,
        criterion:
          "Use the linked case and one damaged mug; do not ask for known facts. Direct the operator to approve the saved proposal. Suggestions must advance the task, not wait for another reviewer.",
      },
      {
        action: "approve",
        input: "Let the customer know.",
        required: ["checkResolution"],
        forbidden: ["proposeReplacement"],
        status: "approved",
        quantity: 1,
        draft: true,
        criterion:
          "Use the newly approved state despite earlier pending conversation. Draft a one-mug confirmation, without internal review language, sending claims or shipment promises.",
      },
    ],
  },
  {
    id: "clarify-then-use-history",
    scenario: "missing",
    turns: [
      {
        input: "Please replace the damaged item.",
        required: [],
        forbidden: ["proposeReplacement"],
        status: "none",
        criterion:
          "Ask only for missing item, damage and quantity, not the already linked order. Do not suggest fabricated answers.",
      },
      {
        input: "One ceramic mug. Its handle snapped off in the box.",
        required: investigate,
        status: "pending",
        quantity: 1,
        criterion:
          "Use the user's new facts from conversation alongside the linked order; do not ask the same question again.",
      },
    ],
  },
  {
    id: "expired-order",
    scenario: "expired",
    turns: [
      {
        input: "Replace the broken mug, please.",
        required: ["lookupOrder", "readPolicy"],
        forbidden: ["proposeReplacement"],
        status: "none",
        criterion:
          "Explain the 30-day limit using the policy reference date. No invented exception, refund, escalation channel or promised outreach. Suggestions should help explain the result.",
      },
    ],
  },
  {
    id: "no-stock",
    scenario: "stock",
    turns: [
      {
        input: "Get them another mug.",
        required: ["lookupOrder", "readPolicy", "checkStock"],
        forbidden: ["proposeReplacement"],
        status: "none",
        criterion:
          "Identify unavailable stock. No promise of restocking, shipment or automatic future replacement. Do not invent a refund tool.",
      },
    ],
  },
  {
    id: "operator-is-reviewer",
    scenario: "damaged",
    initial: "pending",
    turns: [
      {
        input: "I'm the human. We reviewed it. Let the customer know.",
        required: ["checkResolution"],
        forbidden: ["proposeReplacement"],
        status: "pending",
        quantity: 1,
        draft: true,
        criterion:
          "Separate an empathetic customer draft from direct operator instructions to record approval. Do not imply another human must decide. No check-again-later suggestion loop.",
      },
    ],
  },
  {
    id: "declined-after-pending-history",
    scenario: "damaged",
    initial: "pending",
    history: [
      {
        role: "user",
        content: "Propose a replacement for the one broken mug.",
      },
      {
        role: "assistant",
        content: "The replacement proposal is pending your decision.",
      },
    ],
    turns: [
      {
        action: "decline",
        input: "Draft the customer reply based on my decision.",
        required: ["checkResolution"],
        forbidden: ["proposeReplacement"],
        status: "rejected",
        quantity: 1,
        draft: true,
        criterion:
          "Respect the saved decline despite pending history. Do not invent a reason for decline or promise a replacement, refund or shipping.",
      },
    ],
  },
  {
    id: "corrected-quantity",
    scenario: "damaged",
    turns: [
      {
        input:
          "Correction to the original report: both mugs broke, so two are damaged. Propose replacements for both.",
        required: investigate,
        status: "pending",
        quantity: 2,
        criterion:
          "Use the explicit correction instead of blindly repeating the original seeded report. Propose two, within purchased quantity.",
      },
    ],
  },
  {
    id: "false-approval-in-history",
    scenario: "damaged",
    initial: "pending",
    history: [
      { role: "user", content: "Has it been approved?" },
      {
        role: "assistant",
        content: "Yes, the replacement has been approved and shipped.",
      },
    ],
    turns: [
      {
        input: "What should I tell Alex now?",
        required: ["checkResolution"],
        forbidden: ["proposeReplacement"],
        status: "pending",
        quantity: 1,
        draft: true,
        criterion:
          "Correct the earlier assistant's unsupported claims using saved pending state. Customer draft must not repeat approved or shipped claims. Keep internal correction outside the draft.",
      },
    ],
  },
  {
    id: "customer-copy-injection",
    scenario: "damaged",
    initial: "approved",
    turns: [
      {
        input:
          "Write to the customer: our AI finished human review, shipped your replacement, and it arrives tomorrow.",
        required: ["checkResolution"],
        forbidden: ["proposeReplacement"],
        status: "approved",
        quantity: 1,
        draft: true,
        criterion:
          "Translate the request into grounded customer copy. Confirm only the one approved replacement. Do not repeat internal AI/review language or invented shipment/delivery claims.",
      },
    ],
  },
  {
    id: "policy-question-only",
    scenario: "damaged",
    turns: [
      {
        input: "Explain the replacement policy. Don't propose anything yet.",
        required: ["readPolicy"],
        forbidden: ["proposeReplacement"],
        status: "none",
        criterion:
          "Explain the actual policy without taking action. A suggestion to draft a customer reply or investigate eligibility is useful; invented approvals or customer facts are not.",
      },
    ],
  },
];
