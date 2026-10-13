import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { join } from "node:path";
import { mkdir, readFile, realpath } from "node:fs/promises";
import {
  ChildDispatcher,
  delegation,
  type AgentDefinition,
  type DelegationDecision,
  type ChildRequest,
  type ChildResult,
  type WorktreeAdapter,
} from "./common/children.js";
import { discoverAgents } from "./common/catalog.js";
import type { Host, Service, CommandContext } from "./common/runtime.js";
import { runCommand } from "./common/gates.js";
import { contained, digest, id, now, redactText } from "./common/security.js";
export class GitWorktrees implements WorktreeAdapter {
  private owned = new Set<string>();
  constructor(
    readonly cwd: string,
    readonly root: string,
    readonly store: import("./common/storage.js").StorageBase,
  ) {}
  async create(request: ChildRequest) {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const path = await contained(this.root, request.id, true);
    const result = await runCommand(
      "git",
      ["worktree", "add", "--detach", path, "HEAD"],
      { cwd: this.cwd, timeoutMs: 30000 },
    );
    if (result.exitCode !== 0) throw new Error("worktree-create-failed");
    this.owned.add(path);
    return path;
  }
  async finish(request: ChildRequest, path: string, result: ChildResult) {
    if (!this.owned.has(path)) throw new Error("unknown-worktree");
    const status = await runCommand(
      "git",
      [
        "status",
        "--porcelain=v1",
        "-z",
        "--no-renames",
        "--untracked-files=all",
      ],
      { cwd: path, timeoutMs: 30000, maxOutputBytes: 1048576 },
    );
    if (status.exitCode !== 0 || status.truncated || status.timedOut)
      throw new Error("worktree-status-incomplete");
    const changed = status.stdout
      .split("\0")
      .filter(Boolean)
      .map((line) => line.slice(3));
    if (changed.some((file) => !result.filesChanged.includes(file)))
      throw new Error("unreported-worktree-changes-review-required");
    const diff = await runCommand("git", ["diff", "--binary", "HEAD"], {
      cwd: path,
      timeoutMs: 30000,
      maxOutputBytes: 1048576,
    });
    if (diff.exitCode !== 0 || diff.truncated || diff.timedOut)
      throw new Error("worktree-diff-failed");
    result.openQuestions.push(
      "Isolated changes require parent review and explicit application.",
    );
    const patch = await this.store.writeBlob(
      "patch-" + request.id,
      Buffer.from(redactText(diff.stdout)),
    );
    result.evidenceRefs.push(patch.id);
    for (const file of result.filesChanged) {
      const content = await readFile(await contained(path, file));
      const text = content.toString("utf8");
      if (!Buffer.from(text).equals(content) || redactText(text) !== text)
        throw new Error("worktree-content-needs-local-review");
      const ref = await this.store.writeBlob(
        digest(request.id + ":" + file),
        Buffer.from(redactText(content.toString("utf8"))),
      );
      result.evidenceRefs.push(ref.id);
    }
  }
  async remove(path: string) {
    const checked = await contained(this.root, path);
    if (!this.owned.has(checked)) throw new Error("worktree-not-owned");
    const result = await runCommand(
      "git",
      ["worktree", "remove", "--force", checked],
      { cwd: this.cwd, timeoutMs: 30000 },
    );
    if (result.exitCode !== 0) throw new Error("worktree-cleanup-failed");
    this.owned.delete(checked);
  }
}
export class SubagentRouter implements Service {
  capabilities = ["subagent.dispatch.v1", "subagent.advanced.v1"];
  menu = ["status", "show", "explain", "auto"];
  agents: AgentDefinition[] = [];
  decision?: DelegationDecision;
  dispatcher!: ChildDispatcher;
  private claims = new Map<string, { leaseId: string; expiresAt: number }>();
  private pending = new Set<Promise<unknown>>();
  constructor(readonly host: Host) {}
  async start() {
    const roots = this.host.config.agentRoots.map((path) => ({
      path,
      trusted: true,
    }));
    if (this.host.trusted)
      roots.push({ path: join(this.host.cwd, ".pi", "agents"), trusted: true });
    this.agents = await discoverAgents(roots);
    this.dispatcher = new ChildDispatcher(
      this.host.store,
      this.host.config,
      undefined,
      this.host.config.writeAccess
        ? new GitWorktrees(
            this.host.cwd,
            join(this.host.config.storage.root, "worktrees"),
            this.host.store,
          )
        : undefined,
    );
    for (const child of await this.host.store.listRecords<
      ChildRequest & { status: string }
    >("children"))
      if (child.status === "running")
        await this.host.store.putRecord("children", child.id, {
          ...child,
          status: "blocked",
          blocker: child.readOnly
            ? "child-interrupted-safe-to-retry-explicitly"
            : "child-write-interrupted-review-required",
        });
    this.host.interop.listen("pi.subagent.request.v1", (e) => {
      const p = e.payload as {
        taskId: string;
        objective: string;
        agentId: string;
        cwd: string;
        readOnly: boolean;
        expiresAt: number;
      };
      if (
        !this.host.config.enabled ||
        this.host.config.mode !== "auto" ||
        p.expiresAt < Date.now() ||
        p.cwd !== this.host.cwd ||
        !p.readOnly ||
        !this.agents.some((a) => a.id === p.agentId && a.trusted)
      )
        return;
      const claim = this.claims.get(p.taskId) ?? {
        leaseId: id(),
        expiresAt: Date.now() + this.host.config.childTimeoutMs + 5000,
      };
      this.claims.set(p.taskId, claim);
      this.host.interop.emit(
        "pi.subagent.claim.v1",
        { taskId: p.taskId, owner: "pi-subagent-router", ...claim },
        { taskId: p.taskId, correlationId: e.correlationId },
      );
      // Claim is synchronous. Persistence/dispatch is serialized and always follows the claim.
      const work = this.host.serial(() =>
        this.execute(p.objective, {
          agentId: p.agentId,
          taskId: p.taskId,
          review: true,
        }),
      );
      this.pending.add(work);
      void work
        .catch(() => {
          this.host.interop.failures++;
        })
        .finally(() => this.pending.delete(work));
    });
  }
  async close() {
    this.dispatcher.close();
    await Promise.allSettled([...this.pending]);
  }
  async execute(
    objective: string,
    options: {
      agentId?: string;
      taskId?: string;
      review?: boolean;
      independent?: boolean;
      depth?: number;
      write?: boolean;
      tightlyCoupled?: boolean;
    } = {},
    signal?: AbortSignal,
  ) {
    const taskId = options.taskId ?? digest(objective);
    const agents = options.agentId
      ? this.agents.filter((a) => a.id === options.agentId)
      : this.agents;
    const decision = delegation(
      "pi-subagent-router",
      objective,
      agents,
      this.host.config,
      taskId,
      { ...options, cwd: this.host.cwd },
    );
    for (const child of decision.children)
      child.id = digest(taskId + ":" + child.agent.id);
    this.decision = decision;
    await this.host.store.putRecord("decisions", id(), {
      ...decision,
      createdAt: now(),
    });
    this.host.interop.emit("pi.subagent.decision.v1", decision, {
      taskId,
      correlationId: taskId,
    });
    const results = await Promise.all(
      decision.children.map(async (child) => {
        const existing = await this.host.store.getRecord<ChildResult>(
          "child-results",
          child.id,
        );
        if (existing) return existing;
        const result = await this.dispatcher.dispatch(child, signal);
        this.host.interop.emit("pi.subagent.result.v1", result, {
          taskId,
          correlationId: taskId,
        });
        return result;
      }),
    );
    return { decision, results };
  }
  async prompt(text: string, ctx: ExtensionContext) {
    const independent =
      /\b(?:independent|independente|parallel|paralel)\b/i.test(text);
    const review = /\b(?:independent review|revisão independente)\b/i.test(
      text,
    );
    if (!independent && !review) return undefined;
    return this.execute(text, { independent, review }, ctx.signal);
  }
  async command(
    action: string,
    args: string[],
    context: CommandContext,
  ): Promise<unknown> {
    if (action === "status")
      return {
        decision: this.decision,
        agents: this.agents.map(({ instructions, ...a }) => a),
        children: await this.host.store.listRecords("children"),
      };
    if (action === "show") return this.host.store.listRecords("child-results");
    if (action === "explain")
      return this.decision ?? { mode: "none", reason: "no-delegation-needed" };
    if (action === "delegate") {
      if (args.length < 2)
        throw new Error("usage: delegate <agent> <objective>");
      return this.execute(
        args.slice(1).join(" "),
        { agentId: args[0], review: true },
        context.signal,
      );
    }
    throw new Error("unknown-command:" + action);
  }
}
export const createService = (host: Host) => new SubagentRouter(host);
