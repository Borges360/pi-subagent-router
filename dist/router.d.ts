import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { ChildDispatcher, type AgentDefinition, type DelegationDecision, type ChildRequest, type ChildResult, type WorktreeAdapter } from "./common/children.js";
import type { Host, Service, CommandContext } from "./common/runtime.js";
export declare class GitWorktrees implements WorktreeAdapter {
    readonly cwd: string;
    readonly root: string;
    readonly store: import("./common/storage.js").StorageBase;
    private owned;
    constructor(cwd: string, root: string, store: import("./common/storage.js").StorageBase);
    create(request: ChildRequest): Promise<string>;
    finish(request: ChildRequest, path: string, result: ChildResult): Promise<void>;
    remove(path: string): Promise<void>;
}
export declare class SubagentRouter implements Service {
    readonly host: Host;
    modeDescriptions: {
        auto: string;
        observe: string;
        off: string;
    };
    menuGroups: {
        Children: string[];
        Decisions: string[];
        Settings: string[];
    };
    capabilities: string[];
    menu: string[];
    agents: AgentDefinition[];
    decision?: DelegationDecision;
    dispatcher: ChildDispatcher;
    private claims;
    private pending;
    constructor(host: Host);
    start(): Promise<void>;
    close(): Promise<void>;
    execute(objective: string, options?: {
        agentId?: string;
        taskId?: string;
        review?: boolean;
        independent?: boolean;
        depth?: number;
        write?: boolean;
        tightlyCoupled?: boolean;
    }, signal?: AbortSignal): Promise<{
        decision: DelegationDecision;
        results: ChildResult[];
    }>;
    prompt(text: string, ctx: ExtensionContext): Promise<{
        decision: DelegationDecision;
        results: ChildResult[];
    } | undefined>;
    command(action: string, args: string[], context: CommandContext): Promise<unknown>;
}
export declare const createService: (host: Host) => SubagentRouter;
