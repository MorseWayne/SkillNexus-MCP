# SkillNexus-MCP 🚀

**SkillNexus-MCP** is a unified skill adapter designed for the [Zed Editor](https://zed.dev), built on the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/). It automatically aggregates, deduplicates, and hot-syncs expert skills from various coding agents (e.g., Gemini CLI, Claude Code, OpenCode), empowering your Zed built-in agent with a multi-dimensional expert perspective.

[中文说明](./README_ZH.md)

## Core Features ✨

-   **Multi-Source Integration**: Automatically scans and integrates skills from `~/.gemini/skills`, `~/.agents/skills`, and project-local `.opencode/skills`.
-   **Intelligent Deduplication**: Implements a priority-based strategy (Project Local > Gemini > Claude) to handle duplicate skills, ensuring the highest quality definitions are loaded.
-   **Real-Time Sync (Hot-Reload)**: Incremental update mechanism based on file modification time (mtime). No restart required—the agent perceives changes to `SKILL.md` immediately.
-   **Smart Description Extraction**: Automatically extracts the most accurate tool descriptions from skill documentation to guide LLM for more precise tool calls.
-   **High-Performance Caching**: Built-in memory cache and dual-verification mechanism for blazing-fast responses without sacrificing accuracy.

## Quick Start 🛠️

### 1. Configure in Zed
You don't even need to clone this repository. Just open your Zed `settings.json` and add the following under `context_servers`:

```json
{
  "context_servers": {
    "skill-nexus": {
      "command": "npx",
      "args": [
        "-y",
        "skill-nexus-mcp"
      ]
    }
  }
}
```

Reference: [Zed MCP docs](https://zed.dev/docs/ai/mcp#installing-mcp-servers)

### 2. Manual Installation (Optional)
If you prefer to install it globally:
```bash
npm install -g skill-nexus-mcp
```

## Usage 💡

Once configured, you can try the following in the Zed Agent panel:
-   **Inquiry**: "Show me the skills you can use." The agent will list all loaded expert tools.
-   **Activation**: "I want to develop a login page with shadcn." The agent will automatically invoke the corresponding skill via MCP and retrieve expert-level instructions.

## Contributing 🤝

Contributions are welcome! Feel free to submit a PR or Issue to add support for more coding agent paths.

## License 📄

[MIT](./LICENSE)
