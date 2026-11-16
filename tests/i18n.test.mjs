import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  LOCALES,
  actionLabel,
  isLocale,
  loadProjectLocale,
  messagesFor,
  saveProjectLocale,
} from "../dist/common/i18n.js";

function keys(value, prefix = "") {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return child && typeof child === "object" ? keys(child, path) : [path];
  }).sort();
}

function placeholders(value, prefix = "") {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === "object") return placeholders(child, path);
    return [[path, [...String(child).matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]).sort()]];
  }).sort(([left], [right]) => left.localeCompare(right));
}

test("locale catalogs have matching keys and supported action labels keep stable IDs", () => {
  assert.deepEqual(LOCALES, ["en", "pt-BR"]);
  assert.deepEqual(keys(messagesFor("en")), keys(messagesFor("pt-BR")));
  assert.deepEqual(placeholders(messagesFor("en")), placeholders(messagesFor("pt-BR")));
  assert.equal(isLocale("pt-BR"), true);
  assert.equal(isLocale("pt"), false);
  assert.equal(actionLabel("en", "status"), "Status");
  assert.equal(actionLabel("pt-BR", "explain"), "Explicar decisão");
  assert.equal(actionLabel("pt-BR", "delegate <agent>"), "delegate <agent>");
});

test("trusted project locale is isolated to its own bounded .pi preference", async (t) => {
  const first = await mkdtemp(join(tmpdir(), "subagents-locale-a-"));
  const second = await mkdtemp(join(tmpdir(), "subagents-locale-b-"));
  t.after(async () => {
    await rm(first, { recursive: true, force: true });
    await rm(second, { recursive: true, force: true });
  });

  assert.equal(await loadProjectLocale(first, true), "en");
  await saveProjectLocale(first, true, "pt-BR");
  assert.equal(
    await readFile(join(first, ".pi", "pi-subagent-router.locale.json"), "utf8"),
    '{"schemaVersion":1,"locale":"pt-BR"}\n',
  );
  assert.equal(await loadProjectLocale(first, true), "pt-BR");
  assert.equal(await loadProjectLocale(second, true), "en");
  assert.equal(await loadProjectLocale(first, false), "en");
  assert.equal(await loadProjectLocale(second, false), "en");
  await assert.rejects(saveProjectLocale(second, false, "pt-BR"), /untrusted-project/);
  await assert.rejects(saveProjectLocale(second, true, "pt"), /invalid-locale/);
  await assert.rejects(readFile(join(second, ".pi")), { code: "ENOENT" });
});

test("missing, malformed, unsupported, oversized and unreadable preferences fall back to English", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "subagents-locale-invalid-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const pi = join(root, ".pi");
  const file = join(pi, "pi-subagent-router.locale.json");
  await mkdir(pi);

  for (const content of [
    "not-json",
    '{"schemaVersion":2,"locale":"pt-BR"}',
    '{"schemaVersion":1,"locale":"pt"}',
    '{"schemaVersion":1,"locale":"pt-BR","extra":true}',
  ]) {
    await writeFile(file, content);
    assert.equal(await loadProjectLocale(root, true), "en");
  }

  await writeFile(file, " ".repeat(4097));
  assert.equal(await loadProjectLocale(root, true), "en");
  await rm(file);
  await mkdir(file);
  assert.equal(await loadProjectLocale(root, true), "en");
});

test("an invalid .pi parent makes locale persistence fail without replacing it", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "subagents-locale-write-fail-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const pi = join(root, ".pi");
  await writeFile(pi, "existing project file");
  await assert.rejects(saveProjectLocale(root, true, "pt-BR"));
  assert.equal(await readFile(pi, "utf8"), "existing project file");
});
