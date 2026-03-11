# OpenClaw Common Commands

默认你已经把 `openclaw` 加进了 PATH，下面命令直接执行即可。

```bash
PROFILE=default
```

## 服务管理

安装后台服务：

```bash
openclaw --profile default gateway install
```

启动后台服务：

```bash
openclaw --profile default gateway start
```

停止后台服务：

```bash
openclaw --profile default gateway stop
```

重启后台服务：

```bash
openclaw --profile default gateway restart
```

查看服务状态：

```bash
openclaw --profile default gateway status
```

卸载后台服务：

```bash
openclaw --profile default gateway uninstall
```

## 日志与排查

实时看日志：

```bash
openclaw --profile default logs --follow --plain --max-bytes 1000000
```

看最近 200 行日志：

```bash
openclaw --profile default logs --plain --limit 200 --max-bytes 1000000
```

查看 gateway 健康状态：

```bash
openclaw --profile default gateway health
```

做一次环境诊断：

```bash
openclaw doctor
```

## 插件管理

列出插件：

```bash
openclaw --profile default plugins list
```

查看插件详情：

```bash
openclaw --profile default plugins info codex-dispatch
```

做插件健康检查：

```bash
openclaw --profile default plugins doctor
```

启用插件：

```bash
openclaw --profile default plugins enable codex-dispatch
```

禁用插件：

```bash
openclaw --profile default plugins disable codex-dispatch
```

安装当前目录这个本地插件：

```bash
openclaw --profile default plugins install -l /Users/liuchunlin/Downloads/workSpace/develop/openclaw/openclaw-local-dev
```

## 配置查看与修改

查看当前配置文件路径：

```bash
openclaw --profile default config file
```

查看主 agent 模型：

```bash
openclaw --profile default config get 'agents.list[0].model' --json
```

查看默认模型：

```bash
openclaw --profile default config get 'agents.defaults.model' --json
```

把 main agent 切到 Codex：

```bash
openclaw --profile default config set 'agents.list[0].model' '"openai-codex/gpt-5.3-codex"' --strict-json
```

查看 `codex-dispatch` 是否启用：

```bash
openclaw --profile default config get 'plugins.entries["codex-dispatch"].enabled'
```

查看 `codex-dispatch` 的项目别名文件：

```bash
openclaw --profile default config get 'plugins.entries["codex-dispatch"].config.aliasesFile'
```

查看 `codex-dispatch` 的 Codex 命令路径：

```bash
openclaw --profile default config get 'plugins.entries["codex-dispatch"].config.codexCommand'
```

## 模型与鉴权

查看模型状态：

```bash
openclaw --profile default models status --plain
```

查看已配置模型：

```bash
openclaw --profile default models list
```

给某个 provider 重新登录：

```bash
openclaw models auth login --provider qwen-portal
```

把默认模型设置成 Codex：

```bash
openclaw --profile default models set openai-codex/gpt-5.3-codex
```

## ACP 相关

查看 ACP 帮助：

```bash
openclaw acp --help
```

直接在指定项目目录启动 ACP client：

```bash
openclaw acp client --cwd /absolute/path/to/project
```

通过别名脚本启动 ACP client：

```bash
./project-alias.sh client backend-common
```

## Agent 直接调用

直接跑一条 agent 消息：

```bash
openclaw --profile default agent --message "review this change"
```

用 Codex CLI backend 跑一条消息：

```bash
openclaw --profile default agent --message "review this change" --model codex-cli/gpt-5.3-codex
```

## 项目别名辅助脚本

列出项目别名：

```bash
./project-alias.sh list
```

查看某个别名的真实路径：

```bash
./project-alias.sh path backend-common
```

输出 `/acp cwd ...` 命令：

```bash
./project-alias.sh cwd-command backend-common
```

输出推荐操作：

```bash
./project-alias.sh doctor backend-common
```

## 当前项目最常用的组合命令

重启服务并看日志：

```bash
openclaw --profile default gateway restart
openclaw --profile default logs --follow --plain --max-bytes 1000000
```

确认 `codex-dispatch` 已安装并启用：

```bash
openclaw --profile default plugins info codex-dispatch
openclaw --profile default config get 'plugins.entries["codex-dispatch"].enabled'
```

确认主 agent 确实走 Codex：

```bash
openclaw --profile default config get 'agents.list[0].model' --json
```

## 飞书 / WebChat 测试话术

最小可用编码请求：

```text
在 backend-common 里修复登录接口 500，直接改代码，完成后回我 changed files、diff 和验证结果。
```

带结果截图的请求：

```text
在 backend-common 里修复登录接口 500，直接改代码，完成后回我 changed files、diff、验证结果，并附一张结果截图。
```

## 常见问题定位

看不到回复时，先查：

1. 飞书消息是否收到
2. 是否 `dispatching to agent`
3. 是否出现模型鉴权错误
4. 是否出现 `exec failed`
5. 是否出现 `command not found: mvn`

最常用排查命令：

```bash
openclaw --profile default logs --follow --plain --max-bytes 1000000
```
