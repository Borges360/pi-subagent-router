# Pi Subagent Router

**Package:** `@borges360/pi-subagent-router` · **version:** `0.1.2`

**Status:** development release. Git source is documented below. Registry availability and publication have not been verified; package metadata does not establish registry availability.

**Compatibility:** Node.js `>=22.19`. The declared development Pi coding-agent SDK is `1.2.0`. No standalone Pi `1.4.0` host smoke for this checkout is recorded, so this README makes no broader Pi host compatibility claim.

## English

### What it does

Pi Subagent Router delegates bounded investigations and reviews to independent child processes. Children use fresh sessions and explicitly scoped filesystem tools. Write access is disabled by default; write-enabled children require isolated worktrees and explicit user configuration.

The default storage backend is files. SQLite and Pi Durable are opt-in. The default path does not require a sibling extension, database driver, or remote classifier.

### Install and develop

The repository advertises this Pi Git installation path:

~~~sh
pi install git:github.com/Borges360/pi-subagent-router
~~~

This installs from Git; it is not an npm registry installation. Registry availability remains unverified until CT59.

For development, use the locked dependencies in `package-lock.json` and run the local checks:

~~~sh
npm ci
npm test
npm run build
npm run lint
npm run benchmark
npm pack --dry-run
~~~

The Pi extension entry point is `src/extension.ts`. The package provides the `pi-subagent-router` CLI at `dist/cli.js`.

### Use

Run `/subagents` to open the interactive menu, or `/subagents status` for structured headless status. Domain actions include `show`, `explain`, and `delegate <agent> <objective>`. Shared actions include `auto`, `off`, `observe`, `config`, `doctor`, `storage status`, and `storage migrate files|sqlite|durable`.

The `subagent_delegate` tool accepts up to eight optional acceptance criteria and evidence references, each bounded to 400 characters. The child receives these with the objective, configured file scope, and its selected model; absent criteria or evidence are reported as a limitation.

The CLI supports status and diagnostics:

~~~sh
node dist/cli.js status
node dist/cli.js doctor
~~~

The menu groups are **Children**, **Decisions**, and **Settings**. Escape from a group returns to the categories; Escape in the categories closes the menu. Settings **Mode** opens a mode panel; use the arrow keys to choose, Enter to select a draft, Ctrl+S to save, and Escape to return to Settings. Settings **Language** previews English or Brazilian Portuguese immediately. Ctrl+S saves the language only for the current trusted project; Escape returns to Settings with the draft intact. If a draft remains when leaving the root menu, Escape warns once and a second Escape discards it. Headless config returns validated settings.

### Configuration and state

User settings live at `~/.pi/agent/state/pi-subagent-router/config.json`; `PI_ECOSYSTEM_STATE_ROOT` changes the parent directory for tests or deployment. Trusted project settings use `.pi/pi-subagent-router.json`. Project settings are read only after Pi trusts the project and cannot raise user security limits.

Project state is stored under `~/.pi/agent/state/pi-subagent-router/projects/<sha256-of-canonical-repository-root>/`. The default is file storage; SQLite and Pi Durable are explicit alternatives. No project state is written implicitly.

### Language

The interactive `/subagents` menu defaults to English and offers Brazilian Portuguese under **Settings → Language**. The preference is stored only in the current trusted project's `.pi/pi-subagent-router.locale.json`; it does not affect user settings or sibling extensions. A missing, malformed, or unreadable preference falls back to English. Untrusted projects may preview a language but cannot save it. The CLI remains headless and command/action identifiers stay unchanged.

### Privacy and security

Pi extensions run with the operating-system privileges of the user; this package is not an OS sandbox. Children receive a fresh agent directory and do not inherit the parent transcript, extensions, MCP configuration, project context files, or shell. Filesystem tools are scoped, and environment variables are allowlisted. Credentials are not inherited unless explicitly configured.

Secret redaction is heuristic and cannot detect every arbitrary secret. Do not put secrets in objectives, agent definitions, or artifacts. Writes are disabled by default and require isolated worktrees. See [security](SECURITY.md) for the full boundary.

### Troubleshooting and limits

Start with `node dist/cli.js doctor` and `node dist/cli.js status`. See [architecture](ARCHITECTURE.md), [configuration](CONFIGURATION.md), [migration](MIGRATION.md), and [compatibility](COMPATIBILITY.md) for details. Local correctness and recovery tests do not establish model quality or cost savings. Review [acceptance evidence](ACCEPTANCE.md) and the [benchmark protocol](benchmarks/README.md).

### License

The software is MIT licensed; see [LICENSE](LICENSE). The bundled INTEIRO mark has separate attribution and licensing in [its asset notice](docs/assets/INTEIRO-MARK-LICENSE.txt).

## Português (Brasil)

### O que faz

O Pi Subagent Router delega investigações e revisões limitadas a processos filhos independentes. Os filhos usam sessões novas e ferramentas de sistema de arquivos explicitamente delimitadas. O acesso de escrita fica desativado por padrão; filhos com escrita exigem worktrees isolados e configuração explícita do usuário.

O backend de armazenamento padrão usa arquivos. SQLite e Pi Durable são opcionais. O caminho padrão não exige extensão irmã, driver de banco de dados ou classificador remoto.

### Instalação e desenvolvimento

O repositório informa este caminho de instalação Git no Pi:

~~~sh
pi install git:github.com/Borges360/pi-subagent-router
~~~

Esse comando instala a partir do Git; não é uma instalação pela registry npm. A disponibilidade na registry permanece sem verificação até CT59.

Para desenvolvimento, use as dependências travadas em `package-lock.json` e execute as verificações locais:

~~~sh
npm ci
npm test
npm run build
npm run lint
npm run benchmark
npm pack --dry-run
~~~

A entrada da extensão Pi é `src/extension.ts`. O pacote oferece a CLI `pi-subagent-router` em `dist/cli.js`.

### Uso

Execute `/subagents` para abrir o menu interativo ou `/subagents status` para obter o estado estruturado em modo headless. As ações de domínio incluem `show`, `explain` e `delegate <agent> <objective>`. Ações compartilhadas incluem `auto`, `off`, `observe`, `config`, `doctor`, `storage status` e `storage migrate files|sqlite|durable`.

A ferramenta `subagent_delegate` aceita até oito critérios de aceite e referências de evidência opcionais, limitados a 400 caracteres cada. O filho recebe esses dados com o objetivo, o escopo configurado de arquivos e o modelo selecionado; critérios ou evidências ausentes são indicados como uma limitação.

A CLI oferece status e diagnóstico:

~~~sh
node dist/cli.js status
node dist/cli.js doctor
~~~

Os grupos do menu são **Children**, **Decisions** e **Settings**. Esc em um grupo volta às categorias; Esc nas categorias fecha o menu. **Mode** em Settings abre um painel de modos; use as setas para escolher, Enter para selecionar o rascunho, Ctrl+S para salvar e Esc para voltar a Settings. **Language** em Settings pré-visualiza imediatamente inglês ou português brasileiro. Ctrl+S salva o idioma apenas no projeto confiável atual; Esc volta a Settings mantendo o rascunho. Se houver rascunho ao sair do menu principal, Esc avisa e um segundo Esc o descarta. A configuração headless retorna opções validadas.

### Configuração e estado

As preferências do usuário ficam em `~/.pi/agent/state/pi-subagent-router/config.json`; `PI_ECOSYSTEM_STATE_ROOT` altera o diretório pai em testes ou implantação. Configurações confiáveis do projeto usam `.pi/pi-subagent-router.json`. Elas só são lidas depois que o Pi confia no projeto e não podem elevar os limites de segurança do usuário.

O estado do projeto fica em `~/.pi/agent/state/pi-subagent-router/projects/<sha256-of-canonical-repository-root>/`. O padrão usa arquivos; SQLite e Pi Durable são alternativas explícitas. Nenhum estado do projeto é gravado implicitamente.

### Idioma

O menu interativo de `/subagents` inicia em inglês e oferece português brasileiro em **Settings → Language**. A preferência fica somente em `.pi/pi-subagent-router.locale.json` do projeto confiável atual; ela não altera as preferências do usuário nem de extensões irmãs. Preferência ausente, inválida ou ilegível retorna ao inglês. Projetos não confiáveis permitem pré-visualização, mas não permitem salvar. A CLI continua headless e os identificadores de comandos e ações permanecem iguais.

### Privacidade e segurança

Extensões Pi executam com os privilégios do sistema operacional do usuário; este pacote não é um sandbox do sistema. Os filhos recebem um diretório de agente novo e não herdam a transcrição principal, extensões, configuração MCP, arquivos de contexto do projeto ou shell. As ferramentas de sistema de arquivos têm escopo delimitado e as variáveis de ambiente são permitidas por lista. Credenciais não são herdadas sem configuração explícita.

A redação de segredos é heurística e não detecta todos os segredos arbitrários. Não coloque segredos em objetivos, definições de agentes ou artefatos. A escrita fica desativada por padrão e exige worktrees isolados. Consulte [segurança](SECURITY.md) para conhecer a fronteira completa.

### Diagnóstico e limites

Comece com `node dist/cli.js doctor` e `node dist/cli.js status`. Consulte [arquitetura](ARCHITECTURE.md), [configuração](CONFIGURATION.md), [migração](MIGRATION.md) e [compatibilidade](COMPATIBILITY.md) para detalhes. Testes locais de correção e recuperação não demonstram qualidade do modelo nem redução de custo. Veja as [evidências de aceite](ACCEPTANCE.md) e o [protocolo de benchmark](benchmarks/README.md).

### Licença

O software usa a licença MIT; consulte [LICENSE](LICENSE). A marca INTEIRO incluída tem atribuição e licença próprias em [seu aviso](docs/assets/INTEIRO-MARK-LICENSE.txt).
