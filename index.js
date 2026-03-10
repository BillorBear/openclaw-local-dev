"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const TOOL_NAME = "codex_dispatch";
const DEFAULT_TIMEOUT_SECONDS = 900;
const DEFAULT_DIFF_MAX_BYTES = 12000;

function jsonSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      project: {
        type: "string",
        description:
          "Project alias from the configured aliases file, or an absolute project path. If omitted, the plugin will use the default alias or try to infer one from the task text.",
      },
      task: {
        type: "string",
        description:
          "The coding task for Codex. Describe the code change you want, expected output, and any validation you want run.",
      },
      filesHint: {
        type: "array",
        description: "Optional file or directory hints to prioritize while exploring the repository.",
        items: {
          type: "string",
        },
      },
      responseLanguage: {
        type: "string",
        description: "Optional language hint for the final Codex summary, such as zh-CN or en.",
      },
      includeDiff: {
        type: "boolean",
        description: "Whether to include a trimmed git diff snippet in the returned result.",
      },
    },
    required: ["task"],
  };
}

function loadAliases(filePath) {
  const resolved = path.resolve(filePath);
  const raw = fs.readFileSync(resolved, "utf8");
  const data = JSON.parse(raw);
  const projects = data && typeof data === "object" ? data.projects || {} : {};
  const aliases = Object.entries(projects)
    .filter(([, value]) => typeof value === "string" && value.trim())
    .map(([name, value]) => [name, path.resolve(String(value))]);
  return {
    filePath: resolved,
    defaultProject:
      data && typeof data.default === "string" && data.default.trim() ? data.default.trim() : undefined,
    projects: Object.fromEntries(aliases),
  };
}

function inferProject(task, aliases, configuredDefault, explicitProject) {
  if (typeof explicitProject === "string" && explicitProject.trim()) {
    return explicitProject.trim();
  }

  const text = String(task || "");
  for (const alias of Object.keys(aliases.projects)) {
    if (text.includes(alias)) {
      return alias;
    }
  }

  if (configuredDefault && aliases.projects[configuredDefault]) {
    return configuredDefault;
  }

  return "";
}

function resolveProject(projectValue, aliases) {
  if (!projectValue) {
    throw new Error("project is required or must be inferable from task/defaultProject");
  }

  if (path.isAbsolute(projectValue)) {
    return {
      project: projectValue,
      cwd: projectValue,
      source: "path",
    };
  }

  const cwd = aliases.projects[projectValue];
  if (!cwd) {
    throw new Error(
      `unknown project alias: ${projectValue}. Known aliases: ${Object.keys(aliases.projects).join(", ")}`,
    );
  }

  return {
    project: projectValue,
    cwd,
    source: "alias",
  };
}

function createPrompt(input) {
  const hints =
    Array.isArray(input.filesHint) && input.filesHint.length > 0
      ? input.filesHint.map((item) => `- ${item}`).join("\n")
      : "- none";
  const responseLanguage = input.responseLanguage ? String(input.responseLanguage) : "zh-CN";

  return [
    "You are running as a one-shot Codex coding task triggered from OpenClaw.",
    "",
    `Project root: ${input.cwd}`,
    `Project key: ${input.project}`,
    "",
    "Task:",
    String(input.task).trim(),
    "",
    "File hints:",
    hints,
    "",
    "Execution rules:",
    "1. Inspect the repository yourself. Do not ask the user for the project path; it is already provided.",
    "2. Make the requested code changes directly in this repository.",
    "3. Follow the existing code style and project conventions.",
    "4. Run focused validation when possible.",
    "5. If something is ambiguous, make the smallest reasonable assumption and continue.",
    "",
    `Respond in ${responseLanguage}.`,
    "Final response format:",
    "- Summary",
    "- Changed files",
    "- Validation",
    "- Risks / follow-ups",
  ].join("\n");
}

function runProcess(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, options.timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      if (timedOut) {
        reject(new Error(`command timed out after ${options.timeoutMs}ms`));
        return;
      }
      resolve({
        code: code == null ? -1 : code,
        signal: signal || "",
        stdout,
        stderr,
      });
    });
  });
}

async function fileExists(filePath) {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function collectGitSummary(cwd, includeDiff, diffMaxBytes) {
  const git = async (args) => {
    try {
      return await runProcess("git", args, {
        cwd,
        env: process.env,
        timeoutMs: 15000,
      });
    } catch {
      return null;
    }
  };

  const root = await git(["rev-parse", "--show-toplevel"]);
  if (!root || root.code !== 0) {
    return {
      inRepo: false,
    };
  }

  const status = await git(["status", "--short"]);
  const diffStat = await git(["diff", "--stat"]);
  const stagedStat = await git(["diff", "--cached", "--stat"]);
  const diff = includeDiff ? await git(["diff", "--no-ext-diff", "--unified=3"]) : null;
  const stagedDiff = includeDiff ? await git(["diff", "--cached", "--no-ext-diff", "--unified=3"]) : null;

  const changedFiles = [];
  const statusText = status && status.code === 0 ? status.stdout.trim() : "";
  if (statusText) {
    for (const line of statusText.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      const file = trimmed.slice(3).trim();
      if (file) {
        changedFiles.push(file);
      }
    }
  }

  let diffText = "";
  if (diff && diff.code === 0 && diff.stdout.trim()) {
    diffText += diff.stdout.trim();
  }
  if (stagedDiff && stagedDiff.code === 0 && stagedDiff.stdout.trim()) {
    if (diffText) {
      diffText += "\n\n";
    }
    diffText += stagedDiff.stdout.trim();
  }
  if (diffText.length > diffMaxBytes) {
    diffText = `${diffText.slice(0, diffMaxBytes)}\n\n[diff truncated]`;
  }

  return {
    inRepo: true,
    repoRoot: root.stdout.trim(),
    changedFiles,
    status: statusText,
    diffStat: [diffStat && diffStat.code === 0 ? diffStat.stdout.trim() : "", stagedStat && stagedStat.code === 0 ? stagedStat.stdout.trim() : ""]
      .filter(Boolean)
      .join("\n"),
    diff: diffText,
  };
}

function buildResultText(result) {
  const parts = [];
  parts.push(`Codex task completed for project: ${result.project}`);
  parts.push(`Working directory: ${result.cwd}`);
  parts.push("");
  parts.push("Codex final message:");
  parts.push(result.finalMessage || "(empty)");

  if (result.git && result.git.inRepo) {
    parts.push("");
    parts.push("Changed files:");
    parts.push(
      result.git.changedFiles.length > 0 ? result.git.changedFiles.map((file) => `- ${file}`).join("\n") : "- none detected",
    );

    if (result.git.diffStat) {
      parts.push("");
      parts.push("Git diff stat:");
      parts.push(result.git.diffStat);
    }

    if (result.git.diff) {
      parts.push("");
      parts.push("Git diff snippet:");
      parts.push(result.git.diff);
    }
  }

  if (result.stderr) {
    parts.push("");
    parts.push("Codex stderr:");
    parts.push(result.stderr);
  }

  return parts.join("\n");
}

function createGuidance(api) {
  let aliasList = "none";
  try {
    const cfg = api.pluginConfig || {};
    const aliasesFile = typeof cfg.aliasesFile === "string" && cfg.aliasesFile.trim() ? cfg.aliasesFile : null;
    if (aliasesFile) {
      const aliases = loadAliases(aliasesFile);
      aliasList = Object.keys(aliases.projects).join(", ") || "none";
    }
  } catch {
    // ignore guidance enrichment failures
  }

  return [
    "When a user asks to modify code, implement an API, fix a bug, or review a repository change, prefer the codex_dispatch tool instead of only describing the plan.",
    `Known project aliases: ${aliasList}.`,
    "If the user mentions one of these aliases, pass it as the project parameter.",
    "If the user does not mention a path, do not ask for the repository path when a default alias exists; call codex_dispatch directly.",
    "Ask follow-up questions only when the task is ambiguous in substance, not for filesystem path discovery.",
  ].join(" ");
}

function createPlugin() {
  return {
    id: "codex-dispatch",
    name: "Codex Dispatch",
    description: "Dispatch one-shot local Codex coding tasks from OpenClaw chat turns.",
    register(api) {
      api.registerTool({
        name: TOOL_NAME,
        label: "Codex Dispatch",
        description:
          "Run a one-shot local Codex coding task in a configured project alias or absolute repository path, then return the final summary plus changed files and git diff summary.",
        parameters: jsonSchema(),
        async execute(_toolCallId, params) {
          const pluginConfig = api.pluginConfig || {};
          const aliasesFile =
            typeof pluginConfig.aliasesFile === "string" && pluginConfig.aliasesFile.trim()
              ? pluginConfig.aliasesFile.trim()
              : "";
          if (!aliasesFile) {
            throw new Error("plugins.entries.codex-dispatch.config.aliasesFile is required");
          }

          const aliases = loadAliases(aliasesFile);
          const configuredDefault =
            typeof pluginConfig.defaultProject === "string" && pluginConfig.defaultProject.trim()
              ? pluginConfig.defaultProject.trim()
              : aliases.defaultProject;

          const projectValue = inferProject(
            params.task,
            aliases,
            configuredDefault,
            typeof params.project === "string" ? params.project : "",
          );
          const resolvedProject = resolveProject(projectValue, aliases);

          const stat = await fsp.stat(resolvedProject.cwd).catch(() => null);
          if (!stat || !stat.isDirectory()) {
            throw new Error(`project path does not exist or is not a directory: ${resolvedProject.cwd}`);
          }

          const codexCommand =
            typeof pluginConfig.codexCommand === "string" && pluginConfig.codexCommand.trim()
              ? pluginConfig.codexCommand.trim()
              : "codex";
          const timeoutSeconds =
            typeof pluginConfig.timeoutSeconds === "number" && pluginConfig.timeoutSeconds > 0
              ? pluginConfig.timeoutSeconds
              : DEFAULT_TIMEOUT_SECONDS;
          const model =
            typeof pluginConfig.model === "string" && pluginConfig.model.trim()
              ? pluginConfig.model.trim()
              : "";
          const fullAuto = pluginConfig.fullAuto !== false;
          const includeDiff =
            typeof params.includeDiff === "boolean"
              ? params.includeDiff
              : pluginConfig.includeDiff !== false;
          const diffMaxBytes =
            typeof pluginConfig.diffMaxBytes === "number" && pluginConfig.diffMaxBytes >= 512
              ? Math.floor(pluginConfig.diffMaxBytes)
              : DEFAULT_DIFF_MAX_BYTES;

          const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "openclaw-codex-dispatch-"));
          const outputFile = path.join(tmpDir, "last-message.txt");

          try {
            const args = ["exec", "--skip-git-repo-check", "-C", resolvedProject.cwd, "-o", outputFile];
            if (fullAuto) {
              args.push("--full-auto");
            }
            if (model) {
              args.push("--model", model);
            }
            args.push(
              createPrompt({
                cwd: resolvedProject.cwd,
                project: resolvedProject.project,
                task: params.task,
                filesHint: Array.isArray(params.filesHint) ? params.filesHint : [],
                responseLanguage:
                  typeof params.responseLanguage === "string" ? params.responseLanguage : "",
              }),
            );

            const proc = await runProcess(codexCommand, args, {
              cwd: resolvedProject.cwd,
              env: process.env,
              timeoutMs: timeoutSeconds * 1000,
            });

            const outputExists = await fileExists(outputFile);
            const finalMessage = outputExists ? await fsp.readFile(outputFile, "utf8") : proc.stdout;

            if (proc.code !== 0) {
              throw new Error(
                `codex exec failed (exit=${proc.code})\n${(proc.stderr || proc.stdout || "").trim()}`,
              );
            }

            const gitSummary = await collectGitSummary(resolvedProject.cwd, includeDiff, diffMaxBytes);
            const result = {
              project: resolvedProject.project,
              cwd: resolvedProject.cwd,
              finalMessage: finalMessage.trim(),
              stderr: proc.stderr.trim(),
              git: gitSummary,
            };

            return {
              content: [
                {
                  type: "text",
                  text: buildResultText(result),
                },
              ],
              details: result,
            };
          } finally {
            await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
          }
        },
      });

      api.on("before_prompt_build", async () => ({
        prependContext: createGuidance(api),
      }));
    },
  };
}

const plugin = createPlugin();

module.exports = plugin;
module.exports.default = plugin;
