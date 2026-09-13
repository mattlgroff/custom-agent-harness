import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { UIMessage } from "ai";
import { db } from "./db";
import { fixture, POLICY, type Order } from "./fixtures";

export class DomainError extends Error {
  constructor(
    message: string,
    public status = 409,
  ) {
    super(message);
  }
}
export type CaseRecord = {
  id: string;
  owner: string;
  scenario: string;
  order_data: Order;
  stock: number;
  messages: UIMessage[];
  run_token: string | null;
  run_until: Date | null;
  created_at: Date;
};
export type Proposal = {
  id: string;
  case_id: string;
  quantity: number;
  reason: string;
  policy_version: string;
  status: "pending" | "approved" | "rejected";
  created_at: Date;
  decided_at: Date | null;
};
export type Receipt = { id: string; quantity: number; created_at: Date };

export async function addEvent(
  caseId: string,
  kind: string,
  detail: unknown,
  client = db(),
) {
  await client.query(
    "INSERT INTO events(case_id,kind,detail) VALUES($1,$2,$3)",
    [caseId, kind, JSON.stringify(detail)],
  );
}
export async function createCase(owner: string, scenario: string) {
  const { order, stock } = fixture(scenario);
  const id = randomUUID();
  await db().query(
    "INSERT INTO cases(id,owner,scenario,order_data,stock) VALUES($1,$2,$3,$4,$5)",
    [id, owner, scenario, JSON.stringify(order), stock],
  );
  await addEvent(id, "case_opened", { scenario });
  return id;
}
export async function getCase(id: string, owner: string) {
  const { rows } = await db().query<CaseRecord>(
    "SELECT * FROM cases WHERE id=$1 AND owner=$2",
    [id, owner],
  );
  if (!rows[0]) throw new DomainError("Case not found.", 404);
  return rows[0];
}
export async function caseView(id: string, owner: string) {
  const record = await getCase(id, owner);
  const [proposals, receipts, events] = await Promise.all([
    db().query<Proposal>("SELECT * FROM proposals WHERE case_id=$1", [id]),
    db().query<Receipt>(
      "SELECT id,quantity,created_at FROM replacements WHERE case_id=$1",
      [id],
    ),
    db().query(
      "SELECT id,kind,detail,created_at FROM events WHERE case_id=$1 ORDER BY id",
      [id],
    ),
  ]);
  return {
    id: record.id,
    scenario: record.scenario,
    order: record.order_data,
    stock: record.stock,
    messages: record.messages,
    running:
      !!record.run_token && !!record.run_until && record.run_until > new Date(),
    proposal: proposals.rows[0] ?? null,
    receipt: receipts.rows[0] ?? null,
    events: events.rows,
  };
}
function checkEligibility(record: CaseRecord, quantity: number) {
  if (
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > record.order_data.purchased
  )
    throw new DomainError("Quantity exceeds the eligible purchased quantity.");
  const age =
    (Date.parse(POLICY.referenceDate) -
      Date.parse(record.order_data.delivered)) /
    86_400_000;
  if (age < 0 || age > POLICY.windowDays)
    throw new DomainError(
      "This order is outside the 30-day damage replacement window.",
    );
  if (record.stock < quantity)
    throw new DomainError(
      "Insufficient replacement stock. No replacement has been created.",
    );
}
async function transaction<T>(work: (client: PoolClient) => Promise<T>) {
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export async function propose(
  caseId: string,
  owner: string,
  quantity: number,
  reason: string,
  runToken?: string,
) {
  if (!reason.trim() || reason.length > 500)
    throw new DomainError("A short damage description is required.", 400);
  return transaction(async (client) => {
    const { rows } = await client.query<CaseRecord>(
      "SELECT * FROM cases WHERE id=$1 AND owner=$2 FOR UPDATE",
      [caseId, owner],
    );
    const record = rows[0];
    if (!record) throw new DomainError("Case not found.", 404);
    if (
      runToken &&
      (record.run_token !== runToken ||
        !record.run_until ||
        record.run_until <= new Date())
    )
      throw new DomainError("This agent run is no longer active.");
    const existing = await client.query<Proposal>(
      "SELECT * FROM proposals WHERE case_id=$1",
      [caseId],
    );
    if (existing.rows[0]) {
      if (existing.rows[0].quantity !== quantity)
        throw new DomainError(
          "This case already has a different saved proposal. Start a new demo case to change it.",
        );
      return existing.rows[0];
    }
    checkEligibility(record, quantity);
    const result = await client.query<Proposal>(
      "INSERT INTO proposals(id,case_id,quantity,reason,policy_version) VALUES($1,$2,$3,$4,$5) RETURNING *",
      [randomUUID(), caseId, quantity, reason, POLICY.version],
    );
    await client.query(
      "INSERT INTO events(case_id,kind,detail) VALUES($1,$2,$3)",
      [
        caseId,
        "proposal_saved",
        JSON.stringify({
          proposalId: result.rows[0].id,
          quantity,
          status: "pending",
        }),
      ],
    );
    return result.rows[0];
  });
}
export async function decide(
  caseId: string,
  owner: string,
  proposalId: string,
  approved: boolean,
) {
  return transaction(async (client) => {
    const record = (
      await client.query<CaseRecord>(
        "SELECT * FROM cases WHERE id=$1 AND owner=$2 FOR UPDATE",
        [caseId, owner],
      )
    ).rows[0];
    if (!record) throw new DomainError("Case not found.", 404);
    const proposal = (
      await client.query<Proposal>(
        "SELECT * FROM proposals WHERE id=$1 AND case_id=$2 FOR UPDATE",
        [proposalId, caseId],
      )
    ).rows[0];
    if (!proposal) throw new DomainError("Proposal not found.", 404);
    if (proposal.status === "approved") {
      if (!approved)
        throw new DomainError("An approved replacement cannot be rejected.");
      return (
        await client.query<Receipt>(
          "SELECT id,quantity,created_at FROM replacements WHERE proposal_id=$1",
          [proposalId],
        )
      ).rows[0];
    }
    if (proposal.status === "rejected") {
      if (approved)
        throw new DomainError(
          "A rejected proposal cannot be approved. Start a new demo case.",
        );
      return null;
    }
    let receipt: Receipt | null = null;
    if (approved) {
      if (proposal.policy_version !== POLICY.version)
        throw new DomainError(
          "The policy changed. This proposal needs review.",
        );
      checkEligibility(record, proposal.quantity);
      await client.query("UPDATE cases SET stock=stock-$2 WHERE id=$1", [
        caseId,
        proposal.quantity,
      ]);
      receipt = (
        await client.query<Receipt>(
          "INSERT INTO replacements(id,proposal_id,case_id,quantity) VALUES($1,$2,$3,$4) RETURNING id,quantity,created_at",
          [randomUUID(), proposalId, caseId, proposal.quantity],
        )
      ).rows[0];
    }
    await client.query(
      "UPDATE proposals SET status=$2,decided_at=now() WHERE id=$1",
      [proposalId, approved ? "approved" : "rejected"],
    );
    await client.query(
      "INSERT INTO events(case_id,kind,detail) VALUES($1,$2,$3)",
      [
        caseId,
        approved ? "human_approved" : "human_rejected",
        JSON.stringify({ proposalId, receipt }),
      ],
    );
    return receipt;
  });
}
export async function beginRun(id: string, owner: string, message: UIMessage) {
  const token = randomUUID();
  const { rows } = await db().query<CaseRecord>(
    `UPDATE cases SET run_token=$3,run_until=now()+interval '2 minutes',messages=messages || $4::jsonb
    WHERE id=$1 AND owner=$2 AND (run_token IS NULL OR run_until<now()) AND NOT messages @> $5::jsonb RETURNING *`,
    [
      id,
      owner,
      token,
      JSON.stringify([message]),
      JSON.stringify([{ id: message.id }]),
    ],
  );
  if (!rows[0])
    throw new DomainError(
      "This message was already accepted or the case is busy. Reload the case before retrying.",
    );
  return { token, record: rows[0] };
}
export async function finishRun(
  id: string,
  token: string,
  messages?: UIMessage[],
) {
  if (messages)
    await db().query(
      "UPDATE cases SET messages=$3,run_token=NULL,run_until=NULL WHERE id=$1 AND run_token=$2",
      [id, token, JSON.stringify(messages)],
    );
  else
    await db().query(
      "UPDATE cases SET run_token=NULL,run_until=NULL WHERE id=$1 AND run_token=$2",
      [id, token],
    );
}
