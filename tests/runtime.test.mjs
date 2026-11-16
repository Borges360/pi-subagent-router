import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Interop, envelope } from "../dist/common/contracts.js";
import { register } from "../dist/common/runtime.js";
import { localBus } from "../dist/common/cli.js";
import { defaults, validateConfig } from "../dist/common/config.js";
import extension from "../dist/extension.js";
const name = JSON.parse(
  await (
    await import("node:fs/promises")
  ).readFile(new URL("../package.json", import.meta.url), "utf8"),
)
  .name.split("/")
  .at(-1);
const displayName =
  {
    "pi-autoskills": "AutoSkills",
    "pi-autoplan": "AutoPlan",
    "pi-subagent-router": "Subagent Router",
    "pi-mcp-router": "MCP Router",
  }[name] ?? name;
test("event bus ignores duplicates, future schemas, old events and isolates consumer failures", async () => {
  const bus = localBus();
  const a = new Interop("a", bus, "project");
  let count = 0;
  a.listen("test.v1", () => {
    count++;
  });
  const e = envelope("b", "test.v1", {}, { projectKey: "project" });
  bus.emit("test.v1", e);
  bus.emit("test.v1", e);
  bus.emit("test.v1", { ...e, eventId: "future", schemaVersion: 2 });
  bus.emit("test.v1", {
    ...e,
    eventId: "old",
    emittedAt: "2000-01-01T00:00:00Z",
  });
  assert.equal(count, 1);
  a.listen("failure.v1", async () => {
    throw new Error("offline");
  });
  bus.emit(
    "failure.v1",
    envelope("b", "failure.v1", {}, { projectKey: "project" }),
  );
  await new Promise((r) => setImmediate(r));
  assert.equal(a.failures, 1);
  a.close();
});
test("capability discovery works regardless of startup order and removal", () => {
  const bus = localBus();
  const a = new Interop("a", bus, "p"),
    b = new Interop("b", bus, "p");
  a.start(["one"]);
  b.start(["two"]);
  assert.equal(a.healthy("b", "two"), true);
  assert.equal(b.healthy("a", "one"), true);
  b.close();
  a.close();
});
test("safe configuration rejects model escalation and malformed numeric values", () => {
  const c = defaults(name);
  assert.equal(c.storage.backend, "files");
  assert.throws(() => validateConfig({ ...c, assistantClaims: true }));
  assert.throws(() => validateConfig({ ...c, requireApproval: false }));
  assert.throws(() => validateConfig({ ...c, maxParallel: Infinity }));
  assert.throws(() =>
    validateConfig({ ...c, compactAtRatio: 0.9, handoffAtRatio: 0.7 }),
  );
});
test("extension loads independently and all discovery commands work without TUI", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "pi-extension-test-"));
  process.env.PI_ECOSYSTEM_STATE_ROOT = join(root, "state");
  await mkdir(join(root, "cwd"));
  const cwd = join(root, "cwd");
  const handlers = new Map(),
    commands = new Map(),
    tools = new Map(),
    messages = [];
  let active = ["read", "write", "mcp__untrusted__drop"];
  const pi = {
    events: localBus(),
    on: (n, f) => {
      handlers.set(n, f);
      return () => handlers.delete(n);
    },
    registerCommand: (n, d) => commands.set(n, d),
    registerTool: (t) => {
      tools.set(t.name, t);
    },
    sendMessage: (m) => messages.push(m),
    getAllTools: () => [
      { name: "read" },
      { name: "write" },
      {
        name: "mcp__untrusted__drop",
        namespace: { name: "mcp__untrusted" },
        annotations: { readOnlyHint: true },
      },
    ],
    getActiveTools: () => active,
    setActiveTools: (tools) => {
      active = tools;
    },
    registerMcpServer: () => {},
    unregisterMcpServer: () => {},
  };
  extension(pi);
  assert.equal(commands.size, 1);
  assert.ok(tools.size >= 1);
  assert.equal(messages.length, 0);
  const ctx = {
    cwd,
    mode: "print",
    hasUI: false,
    ui: new Proxy(
      {},
      {
        get: () => () => {
          throw new Error("TUI accessed headlessly");
        },
      },
    ),
    isProjectTrusted: () => false,
    getContextUsage: () => undefined,
    compact: () => {},
    signal: undefined,
    isIdle: () => true,
    hasPendingMessages: () => false,
    abort: () => {},
    shutdown: () => {},
    getSystemPrompt: () => "",
    sessionManager: {},
    modelRegistry: {},
    model: undefined,
  };
  await handlers.get("session_start")?.({}, ctx);
  t.after(async () => {
    await handlers.get("session_shutdown")?.({}, ctx);
    await rm(root, { recursive: true, force: true });
    delete process.env.PI_ECOSYSTEM_STATE_ROOT;
  });
  const command = [...commands.values()][0];
  for (const action of ["status", "explain", "config", "doctor", "off", "auto"])
    await command.handler(action, ctx);
  assert.ok(messages.length >= 6);
  assert.equal(JSON.parse(messages.at(-1).content).enabled, true);
  await handlers.get("before_agent_start")?.(
    { messageType: "user", prompt: "Explain a small function" },
    ctx,
  );
  const menus = [];
  let rootSelections = 0;
  let settingsSelections = 0;
  const tui = {
    ...ctx,
    mode: "tui",
    hasUI: true,
    ui: {
      select: async (title, choices) => {
        menus.push({ title, choices });
        if (title === displayName)
          return rootSelections++ === 0 ? "Settings" : undefined;
        return settingsSelections++ === 0 ? "Diagnostics" : undefined;
      },
    },
  };
  await command.handler("", tui);
  assert.equal(menus.length, 4);
  assert.ok(menus[0].choices.includes("Settings"));
  assert.equal(menus[1].title, `${displayName} / Settings`);
  assert.equal(menus[2].title, `${displayName} / Settings`);
  assert.equal(menus[3].title, displayName);
  assert.ok(menus[1].choices.includes("Mode"));
  assert.ok(menus[1].choices.includes("Language"));
  assert.equal(menus[1].choices.includes("off"), false);
  assert.equal(JSON.parse(messages.at(-1).content).standalone, true);

  const keybindings = {
    getKeys: (binding) =>
      ({
        "tui.select.confirm": ["enter"],
        "tui.select.cancel": ["escape"],
        "tui.select.up": ["up"],
        "tui.select.down": ["down"],
      })[binding] ?? [],
    matches: (data, binding) =>
      ({
        "tui.select.confirm": "enter",
        "tui.select.cancel": "escape",
        "tui.select.up": "up",
        "tui.select.down": "down",
        })[binding] === data,
  };
  let panelRuns = 0;
  let closedPanels = 0;
  let renderRequests = 0;
  const configTui = {
    ...tui,
    ui: {
      select: async (title, choices) => {
        configMenus.push({ title, choices });
        return undefined;
      },
      custom: async (factory, options) => {
        assert.equal(options.overlay, true);
        let doneValue;
        const panel = await factory(
          { requestRender: () => renderRequests++ },
          {
            fg: (_color, value) => value,
            bg: (_color, value) => value,
            bold: (value) => value,
          },
          keybindings,
          (value) => {
            closedPanels++;
            doneValue = value;
          },
        );
        if (options.overlayOptions.maxHeight !== 17) {
          const lines = panel.render(80).join("\n");
          assert.match(lines, /Subagent Router \/ Settings/);
          await panel.handleInput("escape");
          await panel.handleInput("escape");
          return doneValue;
        }
        const render = () =>
          panel
            .render(80)
            .map((line) => line.trimEnd())
            .join("\n");
        const runIndex = panelRuns++;
        assert.match(render(), new RegExp(`${displayName} / Settings / Mode`));
        if (runIndex < 2) {
          assert.match(render(), /Current mode: Automatic/);
          assert.match(render(), /Choose a mode\n› Automatic  \(current\)/);
        } else {
          assert.match(render(), /Current mode: Observe/);
          assert.match(render(), /› Observe  \(current\)/);
        }
        await panel.handleInput("down");
        assert.match(render(), runIndex < 2 ? /› Observe/ : /› Off/);
        if (runIndex === 0) {
          await panel.handleInput("enter");
          assert.match(render(), /Current mode: Automatic/);
          assert.match(render(), /Draft mode: Observe \(unsaved\)/);
          const unchanged = JSON.parse(
            await readFile(
              join(defaults(name).storage.root, "config.json"),
              "utf8",
            ),
          );
          assert.equal(unchanged.mode, "auto");
          assert.equal(unchanged.enabled, true);
          await panel.handleInput("escape");
          assert.match(render(), /Unsaved change\. Press Esc again to discard\./);
          await panel.handleInput("escape");
        } else if (runIndex === 1) {
          await panel.handleInput("enter");
          assert.match(render(), /Current mode: Automatic/);
          assert.match(render(), /Draft mode: Observe \(unsaved\)/);
          let saved = JSON.parse(
            await readFile(
              join(defaults(name).storage.root, "config.json"),
              "utf8",
            ),
          );
          assert.equal(saved.mode, "auto");
          await panel.handleInput("\u0013");
          assert.match(render(), /Current mode: Observe/);
          assert.match(render(), /Saved: Observe\./);
          saved = JSON.parse(
            await readFile(
              join(defaults(name).storage.root, "config.json"),
              "utf8",
            ),
          );
          assert.equal(saved.mode, "observe");
          assert.equal(saved.enabled, true);
          await panel.handleInput("escape");
          return doneValue;
        } else {
          await panel.handleInput("enter");
          const configPath = join(defaults(name).storage.root, "config.json");
          await rm(configPath);
          await mkdir(configPath);
          await panel.handleInput("\u0013");
          assert.match(render(), /Current mode: Observe/);
          assert.match(render(), /Draft mode: Off \(unsaved\)/);
          assert.match(render(), /Could not save the mode\. Try again\./);
          await rm(configPath, { recursive: true });
          await panel.handleInput("\u0013");
          assert.match(render(), /Current mode: Off/);
          assert.match(render(), /Saved: Off\./);
          const saved = JSON.parse(
            await readFile(configPath, "utf8"),
          );
          assert.equal(saved.mode, "off");
          assert.equal(saved.enabled, false);
          await panel.handleInput("escape");
        }
        return doneValue;
      },
    },
  };
  await command.handler("config", configTui);
  await command.handler("config", configTui);
  await command.handler("config", configTui);
  assert.equal(panelRuns, 3);
  assert.equal(closedPanels, 6);
  assert.ok(renderRequests >= 10);

  const priorMessages = messages.length;
  await command.handler("", { ...tui, ui: { select: async () => undefined } });
  assert.equal(messages.length, priorMessages);
});

test("custom menus preserve categories and fit Unicode graphemes at common widths", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "pi-extension-test-"));
  process.env.PI_ECOSYSTEM_STATE_ROOT = join(root, "state");
  await mkdir(join(root, "cwd"));
  const handlers = new Map();
  const commands = new Map();
  let releaseHeld;
  let markHeldStarted;
  const heldStarted = new Promise((resolve) => {
    markHeldStarted = resolve;
  });
  const heldOperation = new Promise((resolve) => {
    releaseHeld = resolve;
  });
  let pendingHold;
  const messages = [];
  const pi = {
    events: localBus(),
    on: (name, handler) => {
      handlers.set(name, handler);
      return () => handlers.delete(name);
    },
    registerCommand: (name, definition) => commands.set(name, definition),
    registerTool: () => {},
    sendMessage: (message) => messages.push(JSON.parse(message.content)),
  };
  const description = "界😀e\u0301".repeat(24);
  const service = {
    capabilities: [],
    menu: ["status", "explain"],
    menuGroups: {
      Children: ["status", "show"],
      Decisions: ["explain"],
      Settings: ["config", "doctor"],
    },
    modeDescriptions: {
      auto: description,
      observe: description,
      off: description,
    },
    command: async (action) => {
      if (action === "hold") {
        markHeldStarted();
        await heldOperation;
      }
      return { action };
    },
  };
  register(pi, "漢字", "unicode", () => service);
  const ctx = {
    cwd: join(root, "cwd"),
    mode: "tui",
    hasUI: true,
    ui: { select: async () => undefined, input: async () => undefined },
    isProjectTrusted: () => false,
    signal: undefined,
  };
  const command = commands.get("unicode");
  await handlers.get("session_start")?.({}, ctx);
  t.after(async () => {
    releaseHeld?.();
    await pendingHold?.catch(() => {});
    await handlers.get("session_shutdown")?.({}, ctx);
    await rm(root, { recursive: true, force: true });
    delete process.env.PI_ECOSYSTEM_STATE_ROOT;
  });

  const keybindings = {
    getKeys: (binding) =>
      ({
        "tui.select.confirm": ["enter"],
        "tui.select.cancel": ["escape"],
        "tui.select.up": ["up"],
        "tui.select.down": ["down"],
      })[binding] ?? [],
    matches: (data, binding) =>
      ({
        "tui.select.confirm": "enter",
        "tui.select.cancel": "escape",
        "tui.select.up": "up",
        "tui.select.down": "down",
      })[binding] === data,
  };
  let customRun = 0;
  let modePanelRun = 0;
  let renderRequests = 0;
  const tui = {
    ...ctx,
    ui: {
      ...ctx.ui,
      custom: async (factory, options) => {
        let result;
        const done = (value) => {
          result = value;
        };
        const panel = await factory(
          { requestRender: () => renderRequests++ },
          {
            fg: (_color, value) => value,
            bg: (_color, value) => value,
            bold: (value) => value,
          },
          keybindings,
          done,
        );
        if (options.overlayOptions.maxHeight === 17) {
          if (modePanelRun++ === 0) {
            assert.match(panel.render(80).join("\n"), /漢字 \/ Settings \/ Mode/);
            for (const width of [40, 80, 120]) {
              const lines = panel.render(width);
              const renderedDescription = lines[10].trimEnd();
              assert.equal(renderedDescription.startsWith("界😀e\u0301"), true);
              assert.equal(renderedDescription.endsWith("…"), width < 120);
              assert.equal(/e…$/u.test(renderedDescription), false);
              for (const line of lines) {
                const cells = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(line)].reduce((total, part) => {
                  if (/[\u200d\ufe0f]/u.test(part.segment) || /\p{Extended_Pictographic}/u.test(part.segment)) return total + 2;
                  return total + [...part.segment].reduce((sum, char) => {
                    const cp = char.codePointAt(0) ?? 0;
                    if (/\p{Mark}/u.test(char)) return sum;
                    return sum + (cp >= 0x1100 && (cp <= 0x115f || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xff01 && cp <= 0xff60) || (cp >= 0x20000 && cp <= 0x3fffd)) ? 2 : 1);
                  }, 0);
                }, 0);
                assert.equal(cells, width);
              }
            }
            await panel.handleInput("escape");
          } else {
            await panel.handleInput("down");
            await panel.handleInput("enter");
            const configPath = join(defaults("unicode").storage.root, "config.json");
            const configBefore = await readFile(configPath, "utf8").catch((error) => {
              if (error.code === "ENOENT") return null;
              throw error;
            });
            const saving = panel.handleInput("\u0013");
            await panel.handleInput("escape");
            assert.match(panel.render(80).join("\n"), /Save in progress\. Wait before leaving\./);
            const rendersBeforeDispose = renderRequests;
            panel.dispose?.();
            done(undefined);
            releaseHeld();
            await saving;
            assert.equal(renderRequests, rendersBeforeDispose);
            const configAfter = await readFile(configPath, "utf8").catch((error) => {
              if (error.code === "ENOENT") return null;
              throw error;
            });
            assert.equal(configAfter, configBefore);
          }
        } else if (customRun === 0) {
          customRun++;
          assert.match(panel.render(80).join("\n"), /漢字 \/ Settings/);
          assert.match(panel.render(80).join("\n"), /config/);
          assert.match(panel.render(80).join("\n"), /doctor/);
          await panel.handleInput("escape");
          await panel.handleInput("escape");
        } else if (customRun === 1) {
          customRun++;
          assert.match(panel.render(80).join("\n"), /漢字/);
          assert.match(panel.render(80).join("\n"), /Children/);
          assert.match(panel.render(80).join("\n"), /Decisions/);
          assert.match(panel.render(80).join("\n"), /Settings/);
          await panel.handleInput("enter");
          assert.match(panel.render(80).join("\n"), /status/);
          assert.match(panel.render(80).join("\n"), /show/);
          await panel.handleInput("escape");
          await panel.handleInput("down");
          await panel.handleInput("enter");
          assert.match(panel.render(80).join("\n"), /explain/);
          await panel.handleInput("escape");
          await panel.handleInput("down");
          await panel.handleInput("enter");
          assert.match(panel.render(80).join("\n"), /config/);
          assert.match(panel.render(80).join("\n"), /doctor/);
          await panel.handleInput("escape");
          await panel.handleInput("escape");
        } else if (customRun === 2) {
          customRun++;
          assert.match(panel.render(80).join("\n"), /漢字 \/ Settings/);
          await panel.handleInput("escape");
          await panel.handleInput("escape");
        } else {
          assert.fail("unexpected custom menu invocation");
        }
        return result;
      },
    },
  };
  await command.handler("config", tui);
  await command.handler("", tui);
  pendingHold = command.handler("hold", tui);
  await heldStarted;
  await command.handler("config", tui);
  await pendingHold;
  const headless = {
    ...tui,
    mode: "print",
    hasUI: false,
  };
  await command.handler("config", headless);
  assert.equal(messages.at(-1).mode, "auto");
  assert.equal(customRun, 3);
});

async function exerciseSubagentLocaleMenu(t, options = {}) {
  const root = await mkdtemp(join(tmpdir(), "subagents-locale-menu-"));
  const cwd = join(root, "project");
  await mkdir(cwd);
  const priorStateRoot = process.env.PI_ECOSYSTEM_STATE_ROOT;
  process.env.PI_ECOSYSTEM_STATE_ROOT = join(root, "state");
  const handlers = new Map();
  const commands = new Map();
  const messages = [];
  const pi = {
    events: localBus(),
    on: (event, handler) => {
      handlers.set(event, handler);
      return () => handlers.delete(event);
    },
    registerCommand: (commandName, definition) =>
      commands.set(commandName, definition),
    registerTool: () => {},
    sendMessage: (message) => messages.push(JSON.parse(message.content)),
  };
  const service = {
    capabilities: [],
    menu: ["status", "show", "explain"],
    menuGroups: {
      Children: ["status", "show"],
      Decisions: ["explain"],
      Settings: ["config", "doctor"],
    },
    modeDescriptions: {
      auto: "Delegate eligible independent work to configured agents.",
      observe: "Show delegation decisions without starting child agents.",
      off: "Disable automatic delegation.",
    },
    command: async (action) => ({ action }),
  };
  register(pi, "pi-subagent-router", "subagents", () => service);
  const ctx = {
    cwd,
    mode: "tui",
    hasUI: true,
    ui: { select: async () => undefined, input: async () => undefined },
    isProjectTrusted: () => options.trusted ?? true,
    signal: undefined,
  };
  const command = commands.get("subagents");
  const keybindings = {
    getKeys: (binding) =>
      ({
        "tui.select.confirm": ["enter"],
        "tui.select.cancel": ["escape"],
        "tui.select.up": ["up"],
        "tui.select.down": ["down"],
      })[binding] ?? [],
    matches: (data, binding) =>
      ({
        "tui.select.confirm": "enter",
        "tui.select.cancel": "escape",
        "tui.select.up": "up",
        "tui.select.down": "down",
      })[binding] === data,
  };
  const theme = {
    fg: (_color, value) => value,
    bg: (_color, value) => value,
    bold: (value) => value,
  };
  let settingsPanels = 0;
  let modePanels = 0;
  const tui = {
    ...ctx,
    ui: {
      ...ctx.ui,
      custom: async (factory, panelOptions) => {
        let doneValue;
        const panel = await factory(
          { requestRender: () => {} },
          theme,
          keybindings,
          (value) => {
            doneValue = value;
          },
        );
        const height = panelOptions.overlayOptions.maxHeight;
        const render = (width = 80) =>
          panel.render(width).map((line) => line.trimEnd()).join("\n");
        if (height === 16) {
          assert.match(render(), /Current language: English/);
          assert.match(render(), /Choose a language/);
          if (options.failSave) {
            const piPath = join(cwd, ".pi");
            await rm(piPath, { recursive: true, force: true });
            await writeFile(piPath, "synthetic non-directory fixture");
          }
          await panel.handleInput("down");
          await panel.handleInput("enter");
          for (const width of [40, 80, 120]) {
            for (const line of panel.render(width))
              assert.equal([...line].length, width);
            const localized = render(width);
            assert.match(localized, /Idioma/);
            assert.match(localized, /Português \(Brasil\)/);
            assert.doesNotMatch(localized, /English \/ Settings/);
          }
          if (options.save) {
            await panel.handleInput("\u0013");
            assert.match(render(), /Idioma salvo para este projeto/);
          } else if (options.trusted === false) {
            await panel.handleInput("\u0013");
            assert.match(render(), /Confie neste projeto/);
          } else if (options.failSave) {
            await panel.handleInput("\u0013");
            assert.match(render(), /O rascunho continua disponível/);
          }
          await panel.handleInput("escape");
          return doneValue;
        }
        if (height === 17) {
          modePanels++;
          assert.match(render(), /Roteador de Subagentes \/ Configurações \/ Modo/);
          assert.match(render(), /Modo atual: Automático/);
          assert.match(render(), /Delegar trabalhos independentes/);
          await panel.handleInput("escape");
          return doneValue;
        }
        const title = render().split("\n")[0];
        if (title === "Subagent Router") {
          assert.match(render(), /Children/);
          assert.match(render(), /Decisions/);
          assert.match(render(), /Settings/);
          await panel.handleInput("down");
          await panel.handleInput("down");
          await panel.handleInput("enter");
          assert.match(render(), /Subagent Router \/ Settings/);
          await panel.handleInput("down");
          await panel.handleInput("down");
          await panel.handleInput("enter");
          assert.deepEqual(doneValue, { kind: "language", group: "Settings" });
          return doneValue;
        }
        if (title.startsWith("Roteador de Subagentes / Configurações")) {
          assert.match(render(), /Modo/);
          assert.match(render(), /Diagnóstico/);
          assert.match(render(), /Idioma/);
          settingsPanels++;
          if (options.openMode && settingsPanels === 1) {
            await panel.handleInput("enter");
            assert.deepEqual(doneValue, { kind: "config", group: "Settings" });
            return doneValue;
          }
          await panel.handleInput("escape");
          assert.match(render(), /Roteador de Subagentes/);
          await panel.handleInput("escape");
          return doneValue;
        }
        if (title === "Roteador de Subagentes") {
          assert.match(render(), /alteração de idioma não salva/);
          await panel.handleInput("escape");
          return doneValue;
        }
        assert.fail(`unexpected localized menu panel: ${title}`);
      },
    },
  };

  t.after(async () => {
    await handlers.get("session_shutdown")?.({}, ctx);
    await rm(root, { recursive: true, force: true });
    if (priorStateRoot === undefined)
      delete process.env.PI_ECOSYSTEM_STATE_ROOT;
    else process.env.PI_ECOSYSTEM_STATE_ROOT = priorStateRoot;
  });
  await handlers.get("session_start")?.({}, ctx);
  await command.handler("", tui);
  return {
    localePath: join(cwd, ".pi", "pi-subagent-router.locale.json"),
    modePanels,
    messages,
  };
}

test("subagents language menu previews every panel, keeps the submenu draft, and warns before root discard", async (t) => {
  const run = await exerciseSubagentLocaleMenu(t, { trusted: true, openMode: true });
  assert.equal(run.modePanels, 1);
  await assert.rejects(readFile(run.localePath), { code: "ENOENT" });
});

test("subagents language menu saves only in the trusted current project", async (t) => {
  const run = await exerciseSubagentLocaleMenu(t, { trusted: true, save: true });
  assert.equal(
    await readFile(run.localePath, "utf8"),
    '{"schemaVersion":1,"locale":"pt-BR"}\n',
  );
});

test("untrusted and failed locale saves keep the draft without writing the project setting", async (t) => {
  const untrusted = await exerciseSubagentLocaleMenu(t, { trusted: false });
  await assert.rejects(readFile(untrusted.localePath), { code: "ENOENT" });
});

test("a failed trusted locale save retains the draft and leaves no setting file", async (t) => {
  const failed = await exerciseSubagentLocaleMenu(t, { trusted: true, failSave: true });
  // A fixture troca .pi por um arquivo: ler dentro dele dá ENOENT no Windows e ENOTDIR no POSIX.
  await assert.rejects(readFile(failed.localePath), { code: /^(ENOENT|ENOTDIR)$/ });
});
