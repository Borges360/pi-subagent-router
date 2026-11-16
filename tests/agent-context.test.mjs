import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("product context stays local, mirrored, and aligned to source contracts", async () => {
  const [agents, readme, architecture, security, piSkill, piMetadata, cursorSkill, cursorMetadata] = await Promise.all([
    read("AGENTS.md"),
    read("README.md"),
    read("ARCHITECTURE.md"),
    read("SECURITY.md"),
    read(".agents/skills/pi-subagent-router/SKILL.md"),
    read(".agents/skills/pi-subagent-router/metadata.yaml"),
    read(".cursor/skills/pi-subagent-router/SKILL.md"),
    read(".cursor/skills/pi-subagent-router/metadata.yaml")
  ]);
  const managed = agents.indexOf("<!-- harness:start -->");
  const context = agents.indexOf("## Product context: Pi Subagent Router");
  assert.ok(context >= 0 && managed > context, "product context must precede managed Harness block");
  assert.ok(agents.slice(context, managed).includes(".agents/skills/pi-subagent-router/SKILL.md"));
  assert.equal(piSkill, cursorSkill);
  assert.equal(piMetadata, cursorMetadata);
  assert.match(piMetadata, /id: pi-subagent-router/);
  for (const source of [readme, architecture, security]) assert.ok(source.length > 0);
  for (const expected of [
    /fresh sessions/i,
    /write-enabled children require isolated worktrees/i,
    /File storage is the default backend/i,
    /not an OS sandbox/i,
    /No INTEIRO design-system role is selected/i,
    /Live Pi state, model\/provider\/network calls/i
  ]) assert.match(piSkill, expected);
});
