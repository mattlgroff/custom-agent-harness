import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import {
  beginRun,
  caseView,
  createCase,
  decide,
  finishRun,
  propose,
} from "../src/lib/store";

const owner = `test-${randomUUID()}`;
afterAll(async () => {
  await db().query(
    "DELETE FROM replacements WHERE case_id IN (SELECT id FROM cases WHERE owner=$1)",
    [owner],
  );
  await db().query("DELETE FROM cases WHERE owner=$1", [owner]);
  await db().end();
});
describe("replacement transactions", () => {
  it("saves pending without fulfillment and executes simultaneous approvals once", async () => {
    const id = await createCase(owner, "damaged");
    const proposal = await propose(id, owner, 1, "One mug arrived broken");
    expect((await caseView(id, owner)).receipt).toBeNull();
    expect((await caseView(id, owner)).stock).toBe(12);
    const [a, b] = await Promise.all([
      decide(id, owner, proposal.id, true),
      decide(id, owner, proposal.id, true),
    ]);
    expect(a?.id).toBe(b?.id);
    expect((await caseView(id, owner)).stock).toBe(11);
    expect((await caseView(id, owner)).proposal?.status).toBe("approved");
    await expect(decide(id, owner, proposal.id, false)).rejects.toThrow(
      "cannot be rejected",
    );
  });
  it("rechecks stock at approval and rolls back without a receipt", async () => {
    const id = await createCase(owner, "damaged");
    const proposal = await propose(id, owner, 1, "Broken mug");
    await db().query("UPDATE cases SET stock=0 WHERE id=$1", [id]);
    await expect(decide(id, owner, proposal.id, true)).rejects.toThrow(
      "Insufficient",
    );
    const view = await caseView(id, owner);
    expect(view.receipt).toBeNull();
    expect(view.proposal?.status).toBe("pending");
  });
  it("rejects outside-window, out-of-stock and excessive quantities", async () => {
    await expect(
      propose(await createCase(owner, "expired"), owner, 1, "Broken"),
    ).rejects.toThrow("30-day");
    await expect(
      propose(await createCase(owner, "stock"), owner, 1, "Broken"),
    ).rejects.toThrow("Insufficient");
    await expect(
      propose(await createCase(owner, "damaged"), owner, 3, "Broken"),
    ).rejects.toThrow("quantity");
  });
  it("persists rejection and never permits later approval", async () => {
    const id = await createCase(owner, "damaged");
    const p = await propose(id, owner, 1, "Broken");
    expect(await decide(id, owner, p.id, false)).toBeNull();
    expect(await decide(id, owner, p.id, false)).toBeNull();
    await expect(decide(id, owner, p.id, true)).rejects.toThrow(
      "rejected proposal",
    );
    expect((await caseView(id, owner)).stock).toBe(12);
  });
  it("rejects decisions for another owner or proposal", async () => {
    const id = await createCase(owner, "damaged");
    const p = await propose(id, owner, 1, "Broken");
    await expect(decide(id, "another-owner", p.id, true)).rejects.toThrow(
      "not found",
    );
    await expect(decide(id, owner, randomUUID(), true)).rejects.toThrow(
      "not found",
    );
  });
  it("deduplicates proposals and rejects changing their quantity", async () => {
    const id = await createCase(owner, "damaged");
    const p = await propose(id, owner, 1, "Broken");
    expect((await propose(id, owner, 1, "Retry")).id).toBe(p.id);
    await expect(propose(id, owner, 2, "Changed")).rejects.toThrow(
      "different saved proposal",
    );
  });
  it("serializes messages, deduplicates retries and rejects expired-run writes", async () => {
    const id = await createCase(owner, "damaged");
    const message = {
      id: randomUUID(),
      role: "user" as const,
      parts: [{ type: "text" as const, text: "Help" }],
    };
    const run = await beginRun(id, owner, message);
    await expect(
      beginRun(id, owner, { ...message, id: randomUUID() }),
    ).rejects.toThrow("busy");
    await finishRun(id, run.token);
    await expect(beginRun(id, owner, message)).rejects.toThrow(
      "already accepted",
    );
    await expect(propose(id, owner, 1, "Broken", run.token)).rejects.toThrow(
      "no longer active",
    );
    const next = await beginRun(id, owner, { ...message, id: randomUUID() });
    await finishRun(id, run.token, []);
    expect((await caseView(id, owner)).running).toBe(true);
    await finishRun(id, next.token);
  });
});
