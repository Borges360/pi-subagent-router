import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  lstat,
  rm,
} from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileStorage } from "../dist/common/storage.js";
import { defaults } from "../dist/common/config.js";
import { ChildDispatcher } from "../dist/common/children.js";
import { GitWorktrees } from "../dist/router.js";
test("real Git worktrees archive reported files and retain blocked or unreported writes", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "real-child-worktree-"));
  const cwd = join(root, "repo");
  await mkdir(cwd);
  await writeFile(join(cwd, "existing.txt"), "original");
  for (const args of [
    ["init"],
    ["add", "."],
    [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.invalid",
      "commit",
      "-m",
      "fixture",
    ],
  ])
    execFileSync("git", args, { cwd, stdio: "ignore" });
  const store = new FileStorage({
    root: join(root, "state"),
    extension: "test",
  });
  await store.open();
  t.after(async () => {
    await store.close();
    await rm(root, { recursive: true, force: true });
  });
  const worktrees = new GitWorktrees(cwd, join(root, "worktrees"), store);
  const config = { ...defaults("test"), writeAccess: true };
  const request = (id) => ({
    schemaVersion: 1,
    id,
    taskId: id,
    objective: "Write in isolation",
    agent: {
      schemaVersion: 1,
      id: "writer",
      description: "Writer",
      instructions: "Write",
      readOnly: false,
      paths: [],
      trusted: true,
    },
    depth: 1,
    ancestors: ["writer"],
    readOnly: false,
    independent: true,
    cwd,
  });
  const result = (r, status, filesChanged) => ({
    schemaVersion: 1,
    id: r.id,
    status,
    summary: status,
    verifiedFacts: [],
    evidenceRefs: [],
    filesRead: [],
    filesChanged,
    openQuestions: [],
  });
  const completed = new ChildDispatcher(
    store,
    config,
    async (r) => {
      await writeFile(join(r.cwd, "existing.txt"), "changed");
      await writeFile(join(r.cwd, "new.txt"), "new artifact");
      return result(r, "completed", ["existing.txt", "new.txt"]);
    },
    worktrees,
  );
  const good = await completed.dispatch(request("good"));
  assert.equal(await readFile(join(cwd, "existing.txt"), "utf8"), "original");
  assert.equal(good.evidenceRefs.length, 3);
  assert.ok(
    (
      await Promise.all(good.evidenceRefs.map((ref) => store.readBlob(ref)))
    ).some((bytes) => Buffer.from(bytes).toString() === "new artifact"),
  );
  await assert.rejects(lstat(join(root, "worktrees", "good")), {
    code: "ENOENT",
  });
  const blocked = new ChildDispatcher(
    store,
    config,
    async (r) => {
      await writeFile(join(r.cwd, "unfinished.txt"), "partial work");
      return result(r, "blocked", []);
    },
    worktrees,
  );
  await blocked.dispatch(request("blocked"));
  const retained = await store.getRecord("children", "blocked");
  assert.equal(retained.needsReview, true);
  assert.equal(
    await readFile(join(retained.worktree, "unfinished.txt"), "utf8"),
    "partial work",
  );
  const unreported = new ChildDispatcher(
    store,
    config,
    async (r) => {
      await writeFile(join(r.cwd, "unreported.txt"), "preserve me");
      return result(r, "completed", []);
    },
    worktrees,
  );
  await assert.rejects(
    unreported.dispatch(request("unreported")),
    /unreported-worktree-changes/,
  );
  const uncertain = await store.getRecord("children", "unreported");
  assert.equal(
    await readFile(join(uncertain.worktree, "unreported.txt"), "utf8"),
    "preserve me",
  );
});
