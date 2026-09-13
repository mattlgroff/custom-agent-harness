"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isToolUIPart } from "ai";
import {
  ArrowDownLeft,
  ArrowRight,
  Check,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  Coffee,
  FileCheck2,
  Leaf,
  Loader2,
  LockKeyhole,
  MessageSquare,
  Package,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  Terminal,
  X,
} from "lucide-react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import { scenarios, MODEL, POLICY, type Order } from "@/lib/fixtures";
import type { SupportMessage } from "@/lib/agent";

type Summary = { id: string; scenario: string; created_at: string };
type CaseView = {
  id: string;
  scenario: string;
  order: Order;
  stock: number;
  messages: SupportMessage[];
  reviewer: boolean;
  running: boolean;
  proposal: {
    id: string;
    quantity: number;
    reason: string;
    status: "pending" | "approved" | "rejected";
  } | null;
  receipt: { id: string; quantity: number } | null;
  events: {
    id: string;
    kind: string;
    detail: Record<string, unknown>;
    created_at: string;
  }[];
};
async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(
    path,
    body === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error || "Request failed.");
  }
  return response.json();
}
const eventLabels: Record<string, string> = {
  case_opened: "Case opened",
  order_checked: "Order verified",
  policy_checked: "Policy checked",
  stock_checked: "Inventory checked",
  proposal_saved: "Proposal saved",
  proposal_blocked: "Policy enforced",
  human_approved: "Reviewer approved",
  human_rejected: "Reviewer declined",
  agent_step: "Agent step completed",
};
const toolLabels: Record<string, string> = {
  "tool-lookupOrder": "Look up order",
  "tool-readPolicy": "Read replacement policy",
  "tool-checkStock": "Check inventory",
  "tool-proposeReplacement": "Save replacement proposal",
  "tool-checkResolution": "Check resolution",
};

export function SupportDesk() {
  const [cases, setCases] = useState<Summary[]>([]);
  const [current, setCurrent] = useState<CaseView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(
    async (id: string) =>
      setCurrent(await request<CaseView>(`/api/cases/${id}`)),
    [],
  );
  useEffect(() => {
    let cancelled = false;
    request<Summary[]>("/api/cases")
      .then(async (list) => {
        if (cancelled) return;
        setCases(list);
        if (list[0]) {
          const selected = await request<CaseView>(`/api/cases/${list[0].id}`);
          if (!cancelled) setCurrent(selected);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  async function start(scenario: string) {
    setBusy(true);
    setError("");
    try {
      const { id } = await request<{ id: string }>("/api/cases", { scenario });
      await load(id);
      setCases(await request<Summary[]>("/api/cases"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start case.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="desk">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="Parcel and Pine home">
          <span className="brand-icon">
            <Leaf size={23} />
          </span>
          <span>
            parcel<span className="brand-amp">&</span>pine
            <small>THE SUPPORT WORKBENCH</small>
          </span>
        </Link>
        <div className="workspace-name">
          <span className="workspace-avatar">P</span>
          <span>
            Parcel & Pine<small>Demo workspace</small>
          </span>
          <ChevronRight size={15} />
        </div>
        <div className="nav-active">
          <MessageSquare size={17} />
          Support cases<span>{cases.length}</span>
        </div>
        <div className="sidebar-heading">
          YOUR CASES{" "}
          <button aria-label="New case" onClick={() => setCurrent(null)}>
            <Plus size={16} />
          </button>
        </div>
        <nav className="case-list">
          {cases.map((c) => (
            <button
              key={c.id}
              className={current?.id === c.id ? "selected" : ""}
              onClick={() => load(c.id).catch((e) => setError(e.message))}
            >
              <span className="case-dot" />
              <span>
                {scenarios.find((s) => s.id === c.scenario)?.title}
                <small>CASE {c.id.slice(0, 6).toUpperCase()}</small>
              </span>
            </button>
          ))}
          {cases.length === 0 && (
            <p className="sidebar-empty">
              Your cases will appear here.
              <br />
              Start with a scenario.
            </p>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div>
            <Terminal size={15} />
            <span>Local development</span>
            <span className="live-dot" />
          </div>
          <p>
            Fictional orders. Real agent calls.
            <br />
            No payments or shipments.
          </p>
          <a
            href="https://github.com/mattlgroff/custom-agent-harness"
            target="_blank"
            rel="noreferrer"
          >
            View the source <ArrowRight size={13} />
          </a>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div>
            Workspace <ChevronRight size={13} />
            <strong>Support cases</strong>
            {current && (
              <>
                <ChevronRight size={13} />
                <span className="mono">{current.order.number}</span>
              </>
            )}
          </div>
          <span className="local-badge">
            <span className="live-dot" />
            LOCAL DEMO
          </span>
        </header>
        {error && (
          <div className="error-banner" role="alert">
            {error}
            <button onClick={() => setError("")} aria-label="Dismiss error">
              <X size={15} />
            </button>
          </div>
        )}
        {current ? (
          <CaseWorkspace
            key={current.id}
            current={current}
            refresh={() => load(current.id)}
          />
        ) : (
          <section className="welcome">
            <div className="eyebrow">
              <span />A LITTLE HELP, THOUGHTFULLY HANDLED
            </div>
            <h1>
              Good support starts
              <br />
              with the right context.
            </h1>
            <p className="intro">
              Meet your damaged-order assistant. It checks the facts,
              <br className="desktop-break" /> proposes a resolution, and leaves
              the final decision to you.
            </p>
            <div className="welcome-art" aria-hidden="true">
              <div className="art-label">
                PARCEL & PINE
                <br />
                <span>EVERYDAY GOODS, CONSIDERED.</span>
              </div>
              <div className="cup">
                <div className="cup-rim" />
                <div className="cup-leaf">
                  <Leaf size={34} />
                </div>
                <div className="cup-handle" />
              </div>
              <div className="art-tag">
                <ShieldCheck size={15} /> Human judgment included
              </div>
            </div>
            <div className="scenario-header">
              <h2>Pick a case to explore</h2>
              <span>4 scenarios · isolated demo data</span>
            </div>
            <div className="scenario-grid">
              {scenarios.map((s, index) => (
                <button
                  className="scenario-card"
                  disabled={busy}
                  key={s.id}
                  onClick={() => start(s.id)}
                >
                  <span className="scenario-number">0{index + 1}</span>
                  <span className="scenario-label">{s.label}</span>
                  <h3>{s.title}</h3>
                  <p>{s.description}</p>
                  <span className="scenario-link">
                    Open case <ArrowRight size={16} />
                  </span>
                </button>
              ))}
            </div>
            <div className="welcome-foot">
              <ShieldCheck size={16} />
              <span>
                The agent proposes. You approve. PostgreSQL records what
                actually happened.
              </span>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function CaseWorkspace({
  current,
  refresh,
}: {
  current: CaseView;
  refresh: () => Promise<void>;
}) {
  const [input, setInput] = useState("");
  const [tab, setTab] = useState<"case" | "activity">("case");
  const [token, setToken] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [actionError, setActionError] = useState("");
  const [acting, setActing] = useState(false);
  const [transport] = useState(
    () => new DefaultChatTransport({ api: "/api/chat" }),
  );
  const { messages, sendMessage, status, error } = useChat<SupportMessage>({
    id: current.id,
    messages: current.messages,
    transport,
    onFinish: () => {
      void refresh();
    },
  });
  const streaming = status === "submitted" || status === "streaming";
  useEffect(() => {
    if (!streaming && !current.running) return;
    const timer = setInterval(() => {
      void refresh();
    }, 2000);
    return () => clearInterval(timer);
  }, [streaming, current.running, refresh]);
  async function action(task: () => Promise<unknown>) {
    setActing(true);
    setActionError("");
    try {
      await task();
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setActing(false);
    }
  }
  const scenario = scenarios.find((s) => s.id === current.scenario)!;
  return (
    <>
      <section className="case-heading">
        <div>
          <div className="eyebrow">CUSTOMER CARE / {current.order.number}</div>
          <h1>{scenario.title}</h1>
          <p>
            Alex Morgan <span>·</span> Damaged item <span>·</span> Opened in
            your local workspace
          </p>
        </div>
        <span
          className={`status-pill ${current.proposal?.status === "approved" ? "complete" : ""}`}
        >
          <span />
          {current.proposal?.status === "approved"
            ? "Resolved"
            : current.proposal?.status === "pending"
              ? "Awaiting review"
              : current.proposal?.status === "rejected"
                ? "Proposal declined"
                : "In progress"}
        </span>
      </section>
      <div className="case-grid">
        <section className="chat-panel" aria-label="Support conversation">
          <div className="panel-heading">
            <div>
              <span className="assistant-avatar">
                <Sparkles size={17} />
              </span>
              <span>
                <strong>Support assistant</strong>
                <small>Investigates and proposes. You make the call.</small>
              </span>
            </div>
            <span className="model-label">{MODEL} · medium</span>
          </div>
          <Conversation className="chat-scroll">
            <ConversationContent className="conversation-content">
              <div className="conversation-date">
                DEMO REFERENCE DATE · SEPTEMBER 13, 2026
              </div>
              {messages.length === 0 && (
                <div className="chat-intro">
                  <span className="assistant-avatar large">
                    <Leaf size={24} />
                  </span>
                  <h2>Let’s take care of this.</h2>
                  <p>
                    Describe the issue below. I’ll check the order,
                    <br />
                    policy, and stock before suggesting a resolution.
                  </p>
                  <button
                    className="suggestion"
                    onClick={() => sendMessage({ text: scenario.prompt })}
                  >
                    {scenario.prompt}
                    <ArrowDownLeft size={17} />
                  </button>
                </div>
              )}
              {messages.map((message) => (
                <Message key={message.id} from={message.role}>
                  <MessageContent className="message-content">
                    <div className="message-author">
                      {message.role === "user"
                        ? "You"
                        : "Parcel & Pine assistant"}
                    </div>
                    {message.parts.map((part, i) => {
                      if (part.type === "text")
                        return (
                          <MessageResponse key={i}>{part.text}</MessageResponse>
                        );
                      if (isToolUIPart(part))
                        return (
                          <Tool key={part.toolCallId} className="tool-card">
                            {part.type === "dynamic-tool" ? (
                              <ToolHeader
                                type="dynamic-tool"
                                toolName={part.toolName}
                                state={part.state}
                              />
                            ) : (
                              <ToolHeader
                                type={part.type}
                                state={part.state}
                                title={toolLabels[part.type]}
                              />
                            )}
                            <ToolContent>
                              <ToolInput input={part.input} />
                              <ToolOutput
                                output={part.output}
                                errorText={part.errorText}
                              />
                            </ToolContent>
                          </Tool>
                        );
                      return null;
                    })}
                  </MessageContent>
                </Message>
              ))}
              {streaming && (
                <div className="working" role="status">
                  <Loader2 size={14} className="animate-spin" /> Checking the
                  details…
                </div>
              )}
              {error && (
                <div role="alert" className="inline-error">
                  {error.message}
                  <button onClick={() => window.location.reload()}>
                    Reload saved case
                  </button>
                </div>
              )}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>
          <div className="composer-area">
            <form
              className="composer"
              onSubmit={(event) => {
                event.preventDefault();
                if (!input.trim() || streaming) return;
                void sendMessage({ text: input.trim() });
                setInput("");
              }}
            >
              <textarea
                aria-label="Message the support assistant"
                placeholder="Describe the issue or ask a follow-up…"
                value={input}
                maxLength={2000}
                rows={2}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
              />
              <div>
                <span>
                  <LockKeyhole size={12} /> Human approval required for
                  replacements
                </span>
                <button
                  type="submit"
                  aria-label="Send message"
                  disabled={streaming || current.running || !input.trim()}
                >
                  <Send size={17} />
                </button>
              </div>
            </form>
            <p>
              AI can make mistakes. Policy and approval are enforced by the
              application.
            </p>
          </div>
        </section>
        <aside className="context-panel">
          <div className="context-tabs">
            <button
              className={tab === "case" ? "active" : ""}
              onClick={() => setTab("case")}
            >
              Case details
            </button>
            <button
              className={tab === "activity" ? "active" : ""}
              onClick={() => setTab("activity")}
            >
              Activity <span>{current.events.length}</span>
            </button>
          </div>
          {tab === "case" ? (
            <div className="context-body">
              <div className="section-label">
                <Package size={14} /> ORDER SUMMARY
              </div>
              <div className="product">
                <div className="product-image">
                  <Coffee size={39} strokeWidth={1.2} />
                </div>
                <div>
                  <strong>{current.order.item}</strong>
                  <p>Sage / 12 oz</p>
                  <small>{current.order.sku}</small>
                </div>
              </div>
              <dl className="order-details">
                <div>
                  <dt>Order</dt>
                  <dd>{current.order.number}</dd>
                </div>
                <div>
                  <dt>Customer</dt>
                  <dd>{current.order.customer}</dd>
                </div>
                <div>
                  <dt>Delivered</dt>
                  <dd>{current.order.delivered}</dd>
                </div>
                <div>
                  <dt>Quantity purchased</dt>
                  <dd>{current.order.purchased}</dd>
                </div>
                <div>
                  <dt>Replacement stock</dt>
                  <dd className={current.stock ? "green" : "red"}>
                    {current.stock
                      ? `${current.stock} available`
                      : "Out of stock"}
                  </dd>
                </div>
              </dl>
              <div className="policy-card">
                <div>
                  <ShieldCheck size={17} />
                  <strong>Damaged-item policy</strong>
                </div>
                <p>
                  Report within 30 days of delivery. Replacement depends on
                  purchased quantity, available stock, and human approval.
                </p>
                <small>{POLICY.version} · fictional store policy</small>
              </div>
              <div className="proposal-card">
                <div className="section-label">
                  <FileCheck2 size={15} /> RESOLUTION
                </div>
                {!current.proposal ? (
                  <div className="empty-proposal">
                    <CircleHelp size={25} />
                    <h3>No proposal yet</h3>
                    <p>
                      The assistant will save a proposal here when it has enough
                      information.
                    </p>
                  </div>
                ) : (
                  <>
                    <h3>
                      {current.proposal.status === "approved"
                        ? "Replacement recorded"
                        : current.proposal.status === "rejected"
                          ? "Proposal declined"
                          : "Replacement proposed"}
                    </h3>
                    <p>
                      {current.proposal.quantity} × {current.order.item}
                    </p>
                    <div className="proposal-reason">
                      {current.proposal.reason}
                    </div>
                    {current.proposal.status === "pending" && (
                      <>
                        <div className="approval-note">
                          <LockKeyhole size={14} /> Waiting for a human decision
                        </div>
                        {current.reviewer ? (
                          <div className="decision-buttons">
                            <button
                              disabled={acting}
                              onClick={() =>
                                action(() =>
                                  request("/api/decisions", {
                                    caseId: current.id,
                                    proposalId: current.proposal!.id,
                                    approved: false,
                                  }),
                                )
                              }
                            >
                              <X size={15} />
                              Decline
                            </button>
                            <button
                              className="primary"
                              disabled={acting}
                              onClick={() =>
                                action(() =>
                                  request("/api/decisions", {
                                    caseId: current.id,
                                    proposalId: current.proposal!.id,
                                    approved: true,
                                  }),
                                )
                              }
                            >
                              <Check size={15} />
                              Approve
                            </button>
                          </div>
                        ) : (
                          <button
                            className="unlock"
                            onClick={() => setReviewOpen(!reviewOpen)}
                          >
                            <LockKeyhole size={14} /> Unlock reviewer controls
                          </button>
                        )}
                      </>
                    )}
                    {current.receipt && (
                      <div className="receipt">
                        <CheckCheck size={19} />
                        <div>
                          <strong>
                            Receipt{" "}
                            {current.receipt.id.slice(0, 8).toUpperCase()}
                          </strong>
                          <small>Saved in PostgreSQL. No real shipment.</small>
                        </div>
                      </div>
                    )}
                    {current.proposal.status === "rejected" && (
                      <div className="approval-note">
                        No replacement was created.
                      </div>
                    )}
                  </>
                )}
                {reviewOpen && !current.reviewer && (
                  <form
                    className="reviewer-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void action(async () => {
                        await request("/api/reviewer", { token });
                        setToken("");
                        setReviewOpen(false);
                      });
                    }}
                  >
                    <label htmlFor="reviewer-token">Local reviewer token</label>
                    <input
                      id="reviewer-token"
                      type="password"
                      autoComplete="off"
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                    />
                    <small>
                      Use OPERATOR_TOKEN from your .env.local file. Never paste
                      it into the chat.
                    </small>
                    <button className="primary" disabled={acting || !token}>
                      Unlock
                    </button>
                  </form>
                )}
                {actionError && (
                  <p role="alert" className="inline-error">
                    {actionError}
                  </p>
                )}
              </div>
              <div className="context-footer">
                <ShieldCheck size={15} />
                <p>
                  Business records are the source of truth.
                  <br />A chat message is not an approval.
                </p>
              </div>
            </div>
          ) : (
            <div className="activity-list">
              <p className="activity-intro">
                Persisted application events. Model reasoning is not displayed.
              </p>
              {current.events.map((event) => (
                <div className="activity-event" key={event.id}>
                  <span
                    className={
                      event.kind.startsWith("human_") ? "human-event" : ""
                    }
                  >
                    <Check size={12} />
                  </span>
                  <div>
                    <strong>{eventLabels[event.kind] || event.kind}</strong>
                    <small>
                      {new Date(event.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </small>
                    <details>
                      <summary>Details</summary>
                      <pre>{JSON.stringify(event.detail, null, 2)}</pre>
                    </details>
                  </div>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
