import { Type } from "typebox";
import { register, toolResult } from "./common/runtime.js";
import { createService } from "./router.js";
export default function (pi) {
    const runtime = register(pi, "pi-subagent-router", "subagents", createService);
    pi.registerTool({
        name: "subagent_delegate",
        label: "Delegate isolated investigation",
        description: "Run bounded isolated specialists with an explicit objective. Defaults to read-only and fresh context.",
        parameters: Type.Object({
            objective: Type.String(),
            agentId: Type.Optional(Type.String()),
            independent: Type.Boolean(),
        }),
        execute: async (_id, input, signal, _update, ctx) => {
            const h = await runtime.get(ctx);
            return h.serial(async () => toolResult(await h.service.execute(input.objective, {
                agentId: input.agentId,
                independent: input.independent,
                review: true,
            }, signal)));
        },
    });
}
