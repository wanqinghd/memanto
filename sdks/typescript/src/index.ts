import { ServerLifecycle, type ServerOptions } from "./lifecycle.js";

export { ServerLifecycle } from "./lifecycle.js";
export { doctor } from "./doctor.js";
export type { ServerOptions } from "./lifecycle.js";
export type { DoctorResult } from "./doctor.js";

export interface MemantoOptions extends ServerOptions {
  /** Agent id to bind this client to. Created if missing on first call. */
  agentId: string;
  /**
   * Auto-create the agent if it does not exist (default: true).
   * Set to false to require explicit creation.
   */
  autoCreate?: boolean;
}

export interface RememberInput {
  content: string;
  type?: string;
  title?: string;
  confidence?: number;
  tags?: string[];
  source?: string;
  provenance?: string;
}

export interface RecallInput {
  query: string;
  limit?: number;
  minSimilarity?: number;
  type?: string[];
}

export interface AnswerInput {
  question: string;
  limit?: number;
  threshold?: number;
  temperature?: number;
  aiModel?: string;
  kioskMode?: boolean;
}

interface SessionRecord {
  session_token: string;
  agent_id: string;
  session_id: string;
}

/**
 * Ergonomic Memanto client. Spawns a local memanto server via `uvx` on
 * first use, creates/activates the agent, and forwards calls to the
 * session-scoped REST endpoints.
 */
export class Memanto {
  private readonly lifecycle: ServerLifecycle;
  private readonly agentId: string;
  private readonly autoCreate: boolean;
  private sessionToken: string | null = null;
  private starting: Promise<void> | null = null;

  constructor(opts: MemantoOptions) {
    if (!opts.agentId) throw new Error("Memanto: agentId is required");
    this.agentId = opts.agentId;
    this.autoCreate = opts.autoCreate ?? true;
    this.lifecycle = new ServerLifecycle(opts);
  }

  async remember(input: RememberInput) {
    return this.request("POST", `/api/v2/agents/${this.agentId}/remember`, {
      content: input.content,
      type: input.type,
      title: input.title,
      confidence: input.confidence ?? 0.8,
      tags: input.tags,
      source: input.source ?? "agent",
      provenance: input.provenance ?? "explicit_statement",
    });
  }

  async recall(input: RecallInput) {
    return this.request("POST", `/api/v2/agents/${this.agentId}/recall`, {
      query: input.query,
      limit: input.limit,
      min_similarity: input.minSimilarity,
      type: input.type,
    });
  }

  async answer(input: AnswerInput) {
    return this.request("POST", `/api/v2/agents/${this.agentId}/answer`, {
      question: input.question,
      limit: input.limit,
      threshold: input.threshold,
      temperature: input.temperature,
      ai_model: input.aiModel,
      kiosk_mode: input.kioskMode ?? false,
    });
  }

  async close(): Promise<void> {
    this.sessionToken = null;
    await this.lifecycle.stop();
  }

  private async ensureReady(): Promise<void> {
    if (this.sessionToken) return;
    if (!this.starting) this.starting = this.bootstrap();
    await this.starting;
  }

  private async bootstrap(): Promise<void> {
    await this.lifecycle.start();
    if (this.autoCreate) await this.createAgentIfMissing();
    await this.activate();
  }

  private async createAgentIfMissing(): Promise<void> {
    const baseUrl = this.lifecycle.baseUrl;
    const res = await fetch(`${baseUrl}/api/v2/agents/${this.agentId}`);
    if (res.ok) return;
    if (res.status !== 404) {
      throw await asError(res, "Failed to look up agent");
    }
    const create = await fetch(`${baseUrl}/api/v2/agents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_id: this.agentId }),
    });
    if (!create.ok && create.status !== 409) {
      throw await asError(create, "Failed to create agent");
    }
  }

  private async activate(): Promise<void> {
    const baseUrl = this.lifecycle.baseUrl;
    const res = await fetch(`${baseUrl}/api/v2/agents/${this.agentId}/activate`, {
      method: "POST",
    });
    if (!res.ok) throw await asError(res, "Failed to activate agent");
    const session = (await res.json()) as SessionRecord;
    this.sessionToken = session.session_token;
  }

  private async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    await this.ensureReady();
    const baseUrl = this.lifecycle.baseUrl;
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Session-Token": this.sessionToken ?? "",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw await asError(res, `${method} ${path} failed`);
    return (await res.json()) as T;
  }
}

async function asError(res: Response, prefix: string): Promise<Error> {
  let detail = "";
  try {
    const body = (await res.json()) as { detail?: unknown; message?: unknown };
    detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body);
  } catch {
    try {
      detail = await res.text();
    } catch {
      detail = "";
    }
  }
  return new Error(`${prefix} (${res.status}): ${detail}`);
}

