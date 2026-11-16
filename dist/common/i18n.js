import { lstat, mkdir, readFile } from "node:fs/promises";
import { atomicWrite, contained } from "./security.js";
export const LOCALES = ["en", "pt-BR"];
const localePath = ".pi/pi-subagent-router.locale.json";
const maxPreferenceBytes = 4096;
const catalogs = {
    en: {
        extensionName: "Subagent Router",
        groups: { Children: "Children", Decisions: "Decisions", Settings: "Settings" },
        actions: {
            status: "Status",
            show: "Results",
            explain: "Explain decision",
            config: "Mode",
            doctor: "Diagnostics",
            language: "Language",
        },
        modeLabels: { auto: "Automatic", observe: "Observe", off: "Off" },
        modeDescriptions: {
            auto: "Delegate eligible independent work to configured agents.",
            observe: "Show delegation decisions without starting child agents.",
            off: "Disable automatic delegation.",
        },
        mode: {
            title: "Mode",
            current: "Current mode",
            draft: "Draft mode",
            choose: "Choose a mode",
            unsaved: "(unsaved)",
            currentMark: "(current)",
            move: "Move",
            select: "Select",
            save: "Save",
            back: "Back",
            close: "Close",
            open: "Open",
            noChange: "No unsaved mode change.",
            selectedDraft: "Mode selected as a draft. Press Ctrl+S to save.",
            saved: "Saved: {mode}.",
            saveFailed: "Could not save the mode. Try again.",
            saveInProgress: "Save in progress. Wait before leaving.",
            unsavedWarning: "Unsaved change. Press Esc again to discard.",
        },
        language: {
            title: "Language",
            current: "Current language",
            draft: "Draft language",
            choose: "Choose a language",
            english: "English",
            portuguese: "Português (Brasil)",
            unsaved: "(unsaved)",
            currentMark: "(current)",
            move: "Move",
            select: "Select",
            save: "Save",
            back: "Back",
            noChange: "No unsaved language change.",
            selectedDraft: "Language preview updated. Press Ctrl+S to save.",
            saved: "Language saved for this project.",
            saveFailed: "Could not save the language. The draft is still available; try again.",
            saveInProgress: "Save in progress. Wait before leaving.",
            untrusted: "Trust this project before saving its language preference.",
            unavailable: "A custom TUI panel is required to preview and save language changes.",
            unsavedRootWarning: "Unsaved language change. Press Esc again to discard it.",
        },
    },
    "pt-BR": {
        extensionName: "Roteador de Subagentes",
        groups: { Children: "Filhos", Decisions: "Decisões", Settings: "Configurações" },
        actions: {
            status: "Status",
            show: "Resultados",
            explain: "Explicar decisão",
            config: "Modo",
            doctor: "Diagnóstico",
            language: "Idioma",
        },
        modeLabels: { auto: "Automático", observe: "Observar", off: "Desativado" },
        modeDescriptions: {
            auto: "Delegar trabalhos independentes elegíveis aos agentes configurados.",
            observe: "Exibir decisões de delegação sem iniciar agentes filhos.",
            off: "Desativar a delegação automática.",
        },
        mode: {
            title: "Modo",
            current: "Modo atual",
            draft: "Modo em rascunho",
            choose: "Escolha um modo",
            unsaved: "(não salvo)",
            currentMark: "(atual)",
            move: "Mover",
            select: "Selecionar",
            save: "Salvar",
            back: "Voltar",
            close: "Fechar",
            open: "Abrir",
            noChange: "Não há alteração de modo para salvar.",
            selectedDraft: "Modo escolhido como rascunho. Pressione Ctrl+S para salvar.",
            saved: "Modo salvo: {mode}.",
            saveFailed: "Não foi possível salvar o modo. Tente novamente.",
            saveInProgress: "Salvamento em andamento. Aguarde para sair.",
            unsavedWarning: "Há uma alteração não salva. Pressione Esc de novo para descartá-la.",
        },
        language: {
            title: "Idioma",
            current: "Idioma atual",
            draft: "Idioma em rascunho",
            choose: "Escolha um idioma",
            english: "Inglês",
            portuguese: "Português (Brasil)",
            unsaved: "(não salvo)",
            currentMark: "(atual)",
            move: "Mover",
            select: "Selecionar",
            save: "Salvar",
            back: "Voltar",
            noChange: "Não há alteração de idioma para salvar.",
            selectedDraft: "Prévia do idioma atualizada. Pressione Ctrl+S para salvar.",
            saved: "Idioma salvo para este projeto.",
            saveFailed: "Não foi possível salvar o idioma. O rascunho continua disponível; tente novamente.",
            saveInProgress: "Salvamento em andamento. Aguarde para sair.",
            untrusted: "Confie neste projeto antes de salvar a preferência de idioma.",
            unavailable: "Um painel TUI personalizado é necessário para pré-visualizar e salvar o idioma.",
            unsavedRootWarning: "Há uma alteração de idioma não salva. Pressione Esc de novo para descartá-la.",
        },
    },
};
export function isLocale(value) {
    return value === "en" || value === "pt-BR";
}
export function messagesFor(locale) {
    return catalogs[locale];
}
export function actionLabel(locale, action) {
    const actionId = action.trim().split(/\s+/)[0] ?? "";
    const label = catalogs[locale].actions[actionId];
    if (!label)
        return action;
    return action.slice(actionId.length).trim()
        ? `${label} ${action.slice(actionId.length).trim()}`
        : label;
}
export async function loadProjectLocale(projectRoot, trusted) {
    if (!trusted)
        return "en";
    try {
        const path = await contained(projectRoot, localePath, true);
        const info = await lstat(path);
        if (!info.isFile() || info.size > maxPreferenceBytes)
            return "en";
        const value = JSON.parse(await readFile(path, "utf8"));
        if (!value || typeof value !== "object" || Array.isArray(value))
            return "en";
        const record = value;
        if (record.schemaVersion !== 1 ||
            !isLocale(record.locale) ||
            Object.keys(record).sort().join(",") !== "locale,schemaVersion")
            return "en";
        return record.locale;
    }
    catch {
        return "en";
    }
}
export async function saveProjectLocale(projectRoot, trusted, locale) {
    if (!trusted)
        throw new Error("untrusted-project");
    if (!isLocale(locale))
        throw new Error("invalid-locale");
    const piDirectory = await contained(projectRoot, ".pi", true);
    await mkdir(piDirectory, { recursive: true, mode: 0o700 });
    await contained(projectRoot, ".pi");
    const path = await contained(projectRoot, localePath, true);
    const value = JSON.stringify({ schemaVersion: 1, locale }) + "\n";
    if (Buffer.byteLength(value, "utf8") > maxPreferenceBytes)
        throw new Error("locale-preference-too-large");
    await atomicWrite(path, value);
}
