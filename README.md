# SkillNexus-MCP 🚀

**SkillNexus-MCP** 是一款专为 [Zed 编辑器](https://zed.dev) 打造的统一技能适配器（基于 [Model Context Protocol](https://modelcontextprotocol.io/)）。它能自动聚合、去重并实时同步来自不同 Coding Agent（如 Gemini CLI, Claude Code, OpenCode）的专家技能（Skills），让您的 Zed 内置 Agent 瞬间具备全维度的专家视野。

## 核心特性 ✨

-   **多源集成**：自动扫描并集成 `~/.gemini/skills`, `~/.agents/skills` 以及项目本地的 `.opencode/skills`。
-   **智能去重**：采用优先级策略（项目本地 > Gemini > Claude）处理同名技能，确保加载最高质量的定义。
-   **实时同步 (Hot-Reload)**：基于文件修改时间（mtime）的增量更新机制。无需重启，修改 `SKILL.md` 后 Agent 立即感知。
-   **智能描述提取**：自动从技能文档中提取最精准的工具描述，引导 LLM 进行更准确的工具调用。
-   **高性能缓存**：内置内存缓存与双重校验机制，确保极速响应的同时不丢失准确性。

## 快速开始 🛠️

### 1. 安装依赖
确保您已安装 Node.js 18+。在本项目目录下运行：
```bash
npm install
```

### 2. 在 Zed 中配置
打开您的 Zed `settings.json`，在 `context_graph.mcp.servers` 中添加：

```json
{
  "context_graph": {
    "mcp": {
      "servers": {
        "skill-nexus": {
          "command": "npx",
          "args": [
            "-y",
            "tsx",
            "/你的项目绝对路径/index.ts"
          ]
        }
      }
    }
  }
}
```

## 使用方法 💡

配置完成后，您可以在 Zed 的内置 Agent 面板中尝试：
-   **问询**：“显示你可以使用的技能”，Agent 会列出所有加载的专家工具。
-   **调用**：“我想用 shadcn 开发一个登录页面”，Agent 会自动通过 MCP 调用对应的技能并获取专家级指令。

## 贡献 🤝

欢迎提交 PR 或 Issue 来增加对更多 Coding Agent 路径的支持！

## 许可证 📄

[MIT](./LICENSE)
