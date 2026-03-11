# OpenClaw Local Codex Setup

这个仓库的目标是把 OpenClaw 接到本机 Codex，并且支持你在 WebChat / 飞书里直接用自然语言触发一次性的本地代码开发任务。

当前仓库已经包含三条能力链路：

1. `codex-dispatch` 插件
   推荐主链路。适合 WebChat / 飞书。用户直接说“在 backend-common 里改代码”，OpenClaw 调度本机 `codex exec` 完成单次开发任务。
2. ACP / `@openclaw/acpx`
   适合终端或支持 ACP 绑定的场景，做持久 coding session。
3. `codex-cli` backend
   作为 OpenClaw 的 CLI fallback。

如果你的最终目标是“在飞书里一句自然语言让 OpenClaw 调 Codex 改代码”，优先用第 1 条。

## 仓库文件

- [`install.sh`](/Users/liuchunlin/Downloads/workSpace/develop/openclaw/openclaw-local-dev/install.sh)
  安装 `@openclaw/acpx`、安装本地插件 `codex-dispatch`、写入 OpenClaw 配置。
- [`config.env`](/Users/liuchunlin/Downloads/workSpace/develop/openclaw/openclaw-local-dev/config.env)
  安装脚本的变量入口。
- [`project-aliases.json`](/Users/liuchunlin/Downloads/workSpace/develop/openclaw/openclaw-local-dev/project-aliases.json)
  多个本地后端项目的别名映射。
- [`project-alias.sh`](/Users/liuchunlin/Downloads/workSpace/develop/openclaw/openclaw-local-dev/project-alias.sh)
  列出项目别名、解析路径、输出 `/acp cwd ...` 命令、或直接启动 ACP client。
- [`openclaw.plugin.json`](/Users/liuchunlin/Downloads/workSpace/develop/openclaw/openclaw-local-dev/openclaw.plugin.json)
  本地插件 manifest。
- [`index.js`](/Users/liuchunlin/Downloads/workSpace/develop/openclaw/openclaw-local-dev/index.js)
  `codex-dispatch` 插件实现。它注册了 `codex_dispatch` agent tool，并在工具内调用本机 `codex exec`。
- [`main-agent-system-prompt.md`](/Users/liuchunlin/Downloads/workSpace/develop/openclaw/openclaw-local-dev/main-agent-system-prompt.md)
  一份适合主 agent 的系统提示，目标是让主 agent 优先调用 `codex_dispatch`，不要继续追问项目路径。
- [`agent-template.json`](/Users/liuchunlin/Downloads/workSpace/develop/openclaw/openclaw-local-dev/agent-template.json)
  OpenClaw 配置模板参考。

## 当前设计

### 1. `codex-dispatch` 插件

这是当前最推荐的实现。

处理流程：

1. 用户在 WebChat / 飞书里发自然语言编码请求
2. 主 agent 根据系统提示优先调用 `codex_dispatch`
3. `codex_dispatch` 从 [`project-aliases.json`](/Users/liuchunlin/Downloads/workSpace/develop/openclaw/openclaw-local-dev/project-aliases.json) 解析项目别名
4. 插件在对应项目目录下执行本机 `codex exec`
5. 执行完成后返回：
   - Codex final message
   - changed files
   - git diff stat
   - 可选的 diff snippet
   - 可选的结果截图 PNG

它的优势是：

- 不依赖 ACP thread binding
- 更适合 WebChat / 飞书
- 用户只需要说“在 backend-common 里改代码”

### 2. ACP

仓库仍然保留了 ACP 配置：

- 安装 `@openclaw/acpx`
- 启用 `acp.enabled=true`
- 启用 `acp.dispatch.enabled=true`
- 设置 `acp.backend="acpx"`

这条链路更适合：

- 本地终端
- `openclaw acp client`
- 持久 coding session

### 3. `codex-cli` backend

OpenClaw 的 CLI fallback 配置里会固定：

- `agents.defaults.cliBackends["codex-cli"].command`

这主要是为了：

- 主 provider 出问题时保底
- 做最小可用 smoke test

## 依赖与前提

你当前环境至少要满足：

- `openclaw`
- `codex`
- `git`
- `python3`
- Java 项目如果要验证，还要有 `mvn`

你本机当前已确认的绝对路径是：

```bash
OPENCLAW_CLI_PATH=/Users/liuchunlin/.nvm/versions/node/v22.19.0/bin/openclaw
CODEX_CLI_PATH=/opt/homebrew/bin/codex
MAVEN_BIN=/usr/local/maven/apache-maven-3.8.2/bin
```

如果这些命令在你的 shell 里能跑，但 OpenClaw 运行时找不到，通常是 PATH 没传给 gateway 进程。当前仓库已经默认按绝对路径配置 `openclaw` 和 `codex`；`mvn` 建议加进你的 `~/.zshrc`。

## 安装

### 1. 编辑 `config.env`

先确认 [`config.env`](/Users/liuchunlin/Downloads/workSpace/develop/openclaw/openclaw-local-dev/config.env)：

```bash
OPENCLAW_PROFILE=default
OPENCLAW_ACP_PLUGIN=@openclaw/acpx
OPENCLAW_DEFAULT_AGENT=codex
OPENCLAW_CLI_PATH=/Users/liuchunlin/.nvm/versions/node/v22.19.0/bin/openclaw
CODEX_CLI_PATH=/opt/homebrew/bin/codex
ACP_ALLOWED_AGENTS='["pi","claude","codex","opencode","gemini","kimi"]'
PROJECT_ALIASES_FILE=/Users/liuchunlin/Downloads/workSpace/develop/openclaw/openclaw-local-dev/project-aliases.json
CODEX_DISPATCH_TIMEOUT_SECONDS=900
CODEX_DISPATCH_MODEL=
CODEX_DISPATCH_RESULT_IMAGE=true
CODEX_DISPATCH_RESULT_IMAGE_WIDTH=1400
```

说明：

- `OPENCLAW_CLI_PATH`
  必填。当前推荐一直用绝对路径，避免 PATH 问题。
- `CODEX_CLI_PATH`
  必填。`codex-dispatch` 会直接用它调用 Codex。
- `PROJECT_ALIASES_FILE`
  必填。插件靠它把 `backend-common` 这类别名映射到真实目录。
- `CODEX_DISPATCH_TIMEOUT_SECONDS`
  单次 Codex 任务最大执行时间。
- `CODEX_DISPATCH_MODEL`
  可选。如果不填，就用 Codex 自己的默认模型。
- `CODEX_DISPATCH_RESULT_IMAGE`
  是否默认生成结果截图 PNG。
- `CODEX_DISPATCH_RESULT_IMAGE_WIDTH`
  结果截图宽度，默认 `1400`。

### 2. 配置项目别名

编辑 [`project-aliases.json`](/Users/liuchunlin/Downloads/workSpace/develop/openclaw/openclaw-local-dev/project-aliases.json)：

```json
{
  "default": "backend-common",
  "projects": {
    "backend-common": "/Users/liuchunlin/Downloads/workSpace/develop/iflytek/xingchen_pro_webservice",
    "backend-github": "/Users/liuchunlin/Downloads/workSpace/open/astra-agent",
    "backend-nanda": "/Users/liuchunlin/Downloads/workSpace/commercialization/astron-agent-enterprise",
    "backend-x": "/Users/liuchunlin/Downloads/workSpace/develop/iflytek/astron-agent-x"
  }
}
```

规则：

- `default`
  用户不写别名时使用的默认项目。
- `projects`
  别名到绝对路径的映射。

### 3. 给脚本执行权限

```bash
chmod +x install.sh project-alias.sh
```

### 4. 执行安装

```bash
./install.sh
```

`install.sh` 会做这些事：

1. 安装并启用 `@openclaw/acpx`
2. 安装并启用当前目录这个本地插件 `codex-dispatch`
3. 给 `codex-dispatch` 写入：
   - `aliasesFile`
   - `codexCommand`
   - `timeoutSeconds`
   - `resultImage`
   - `resultImageWidth`
4. 写入 ACP baseline
5. 写入 `codex-cli` backend 的绝对命令路径

## 主 agent 配置

当前推荐让 OpenClaw 的 `main` agent 直接使用 Codex。

在你这台机器上，已经确认过：

- `agents.defaults.model.primary = openai-codex/gpt-5.3-codex`
- `agents.list[0].model = openai-codex/gpt-5.3-codex`

这一步非常重要。否则飞书消息虽然能进来，但主 agent 可能会先落到别的 provider，比如你之前的 `qwen-portal/coder-model`。

如果需要再手工改一次：

```bash
openclaw --profile default config set 'agents.list[0].model' '"openai-codex/gpt-5.3-codex"' --strict-json
```

## 推荐使用方式

### 方式 A：WebChat / 飞书里一句自然语言直接触发 Codex

这是当前最推荐的方式。

先重启网关：

```bash
/Users/liuchunlin/.nvm/versions/node/v22.19.0/bin/openclaw --profile default gateway restart
```

然后直接在 WebChat / 飞书里发：

```text
在 backend-common 里给 WorkflowController 增加复制 flow 协议的 API，直接改代码，完成后回我 changed files、diff 和验证结果。
```

或者：

```text
用 codex 在 backend-x 里修复登录接口 500，按现有风格修改，最后给我 diff。
```

如果你希望顺带返回一张结构化结果截图，可以直接这样说：

```text
在 backend-common 里修复登录接口 500，直接改代码，完成后回我 changed files、diff、验证结果，并附一张结果截图。
```

只要消息里带了你在 `project-aliases.json` 里配置的项目别名，主 agent 就应该优先调用 `codex_dispatch`，而不是继续追问项目路径。

### 方式 B：本地 ACP client

如果你要做持续 coding session，用 ACP。

先查看别名：

```bash
./project-alias.sh list
```

查看某个别名对应的路径：

```bash
./project-alias.sh doctor backend-common
```

直接按指定项目启动 ACP client：

```bash
./project-alias.sh client backend-common
```

### 方式 C：CLI fallback

```bash
/Users/liuchunlin/.nvm/versions/node/v22.19.0/bin/openclaw --profile default agent --message "review this change" --model codex-cli/gpt-5.3-codex
```

## 安装后验证清单

### 1. 看插件是否存在

```bash
/Users/liuchunlin/.nvm/versions/node/v22.19.0/bin/openclaw --profile default plugins list
```

要能看到 `codex-dispatch`。

### 2. 看插件详情

```bash
/Users/liuchunlin/.nvm/versions/node/v22.19.0/bin/openclaw --profile default plugins info codex-dispatch
```

### 3. 跑插件健康检查

```bash
/Users/liuchunlin/.nvm/versions/node/v22.19.0/bin/openclaw --profile default plugins doctor
```

### 4. 看插件配置是否写进 OpenClaw

```bash
/Users/liuchunlin/.nvm/versions/node/v22.19.0/bin/openclaw --profile default config get 'plugins.entries["codex-dispatch"].enabled'
```

```bash
/Users/liuchunlin/.nvm/versions/node/v22.19.0/bin/openclaw --profile default config get 'plugins.entries["codex-dispatch"].config.aliasesFile'
```

```bash
/Users/liuchunlin/.nvm/versions/node/v22.19.0/bin/openclaw --profile default config get 'plugins.entries["codex-dispatch"].config.codexCommand'
```

### 5. 看主 agent 是否用 Codex

```bash
/Users/liuchunlin/.nvm/versions/node/v22.19.0/bin/openclaw --profile default config get 'agents.list[0].model' --json
```

预期：

```json
"openai-codex/gpt-5.3-codex"
```

### 6. 重启网关

```bash
/Users/liuchunlin/.nvm/versions/node/v22.19.0/bin/openclaw --profile default gateway restart
```

### 7. 看日志

```bash
/Users/liuchunlin/.nvm/versions/node/v22.19.0/bin/openclaw --profile default logs --follow --plain --max-bytes 1000000
```

### 8. 发送一条明确触发工具的消息

```text
在 backend-common 里修复登录接口 500，直接改代码，完成后回我 changed files、diff 和验证结果。
```

### 9. 期望看到的结果

- 不再出现 `qwen-portal` 认证报错
- 能看到进入工具执行后的日志
- 如果是 Java 项目，可能会看到 `mvn` 相关执行
- 最终返回 changed files、diff、验证结果
- 如果开启了结果截图，还会返回 `Result image:` 和 PNG 文件路径

## 如何看执行进度

WebChat / 飞书里当前看不到细粒度的 Codex 内部进度，这是当前方案的特点：

- `codex-dispatch` 是同步调用一次 `codex exec`
- 工具会在任务完成后一次性把结果返回聊天
- 所以聊天里通常只有“已收到”和“最终结果”

当前的“结果截图”不是系统桌面截图，而是一张插件生成的结构化 PNG，内容包括：

- 项目名
- Codex 最终摘要
- changed files
- git diff stat
- diff snippet

真正的执行进度建议看日志：

```bash
/Users/liuchunlin/.nvm/versions/node/v22.19.0/bin/openclaw --profile default logs --follow --plain --max-bytes 1000000
```

重点看这些关键字：

- `dispatching to agent`
- `codex-dispatch`
- `codex_dispatch`
- `codex exec`
- `exec failed`
- `changed files`

如果你感觉慢，先看日志再判断是：

- 真在执行
- 还是卡在环境问题

## 常见问题

### 1. `zsh: command not found: openclaw`

说明 `openclaw` 不在当前 shell 的 PATH 里。

当前推荐直接用绝对路径：

```bash
/Users/liuchunlin/.nvm/versions/node/v22.19.0/bin/openclaw --profile default gateway restart
```

另外你已经把下面这条写进了 `~/.zshrc`：

```bash
export PATH="$HOME/.nvm/versions/node/v22.19.0/bin:$PATH"
```

生效方式：

```bash
source ~/.zshrc
```

### 2. `zsh: command not found: mvn`

这说明当前执行环境找不到 Maven。

你本机当前 Maven 路径是：

```bash
/usr/local/maven/apache-maven-3.8.2/bin/mvn
```

你已经把下面这条写进了 `~/.zshrc`：

```bash
export PATH="/usr/local/maven/apache-maven-3.8.2/bin:$PATH"
```

同样要执行：

```bash
source ~/.zshrc
```

然后重启 gateway：

```bash
openclaw --profile default gateway restart
```

### 3. 飞书消息能收到，但主 agent 不真正执行

先查主 agent 模型：

```bash
openclaw --profile default config get 'agents.list[0].model' --json
```

如果不是 Codex，就改成：

```bash
openclaw --profile default config set 'agents.list[0].model' '"openai-codex/gpt-5.3-codex"' --strict-json
```

### 4. 飞书里还是只会聊天，不调 `codex_dispatch`

这通常是主 agent 的系统提示不够强。

把 [`main-agent-system-prompt.md`](/Users/liuchunlin/Downloads/workSpace/develop/openclaw/openclaw-local-dev/main-agent-system-prompt.md) 里的规则加到主 agent 配置里，核心目标是：

- coding request 优先调用 `codex_dispatch`
- 已知 alias 时不要问路径
- 不要只回复计划

### 5. Telegram 日志里一直有 404

如果你当前主用飞书，可以先忽略这类 Telegram 日志：

```text
telegram deleteWebhook failed
telegram setMyCommands failed
```

它们和飞书 -> OpenClaw -> Codex 这条主链路不是一回事。

## 参考

- [Plugins](https://docs.openclaw.ai/plugins)
- [Plugin Manifest](https://docs.openclaw.ai/plugins/manifest)
- [Plugin Agent Tools](https://docs.openclaw.ai/plugins/agent-tools)
- [ACP Agents](https://docs.openclaw.ai/tools/acp-agents)
- [CLI Backends](https://docs.openclaw.ai/gateway/cli-backends)
