#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

interface Skill {
  name: string;
  source: string;
  path: string;
  description: string;
  mtime: number;
  content?: string;
}

interface SkillSource {
  name: string;
  path: string;
}

const DEFAULT_SERVER_VERSION = "1.0.4";
const SKILL_TOOL_PREFIX = "activate_skill_";

function resolveServerVersion(): string {
  const candidates = [
    path.join(__dirname, "package.json"),
    path.join(__dirname, "..", "package.json"),
    path.join(process.cwd(), "package.json"),
  ];

  for (const packagePath of candidates) {
    try {
      if (!fs.existsSync(packagePath)) continue;
      const parsed = JSON.parse(fs.readFileSync(packagePath, "utf-8")) as { version?: unknown };
      if (typeof parsed.version === "string" && parsed.version.trim()) {
        return parsed.version;
      }
    } catch {
      continue;
    }
  }

  return DEFAULT_SERVER_VERSION;
}

const SERVER_VERSION = resolveServerVersion();

function getDefaultScanPaths(): SkillSource[] {
  return [
    { name: "Gemini", path: path.join(os.homedir(), ".gemini/skills") },
    { name: "Claude", path: path.join(os.homedir(), ".agents/skills") },
    { name: "OpenCode", path: path.join(process.cwd(), ".opencode/skills") },
  ];
}

function getSourcePriority(source: string): number {
  const priority: Record<string, number> = { OpenCode: 3, Gemini: 2, Claude: 1 };
  return priority[source] ?? 0;
}

export function encodeSkillToolName(skillName: string): string {
  return `${SKILL_TOOL_PREFIX}${Buffer.from(skillName, "utf-8").toString("base64url")}`;
}

export function decodeSkillToolName(toolName: string): string | null {
  if (!toolName.startsWith(SKILL_TOOL_PREFIX)) return null;
  const encoded = toolName.slice(SKILL_TOOL_PREFIX.length);
  if (!encoded) return null;
  try {
    return Buffer.from(encoded, "base64url").toString("utf-8");
  } catch {
    return null;
  }
}

export class SkillManager {
  private skills: Map<string, Skill> = new Map();
  private readonly scanPaths: SkillSource[];

  constructor(scanPaths: SkillSource[] = getDefaultScanPaths()) {
    this.scanPaths = scanPaths;
    this.refresh();
  }

  public refresh() {
    const previousSkills = this.skills;
    const nextSkills = new Map<string, Skill>();

    for (const source of this.scanPaths) {
      this.scanDirectory(source.path, source.name, nextSkills, previousSkills);
    }

    this.skills = nextSkills;
  }

  private scanDirectory(
    dir: string,
    sourceName: string,
    nextSkills: Map<string, Skill>,
    previousSkills: Map<string, Skill>,
  ) {
    if (!fs.existsSync(dir)) return;

    try {
      const folders = fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);

      for (const folder of folders) {
        const skillMdPath = path.join(dir, folder, "SKILL.md");
        if (!fs.existsSync(skillMdPath)) continue;

        const stats = fs.statSync(skillMdPath);
        const mtime = stats.mtimeMs;
        const existing = nextSkills.get(folder);

        if (existing && getSourcePriority(existing.source) >= getSourcePriority(sourceName)) {
          continue;
        }

        const previous = previousSkills.get(folder);
        let content: string;
        let description: string;

        if (
          previous &&
          previous.source === sourceName &&
          previous.path === skillMdPath &&
          previous.mtime === mtime &&
          previous.content
        ) {
          content = previous.content;
          description = previous.description;
        } else {
          content = fs.readFileSync(skillMdPath, "utf-8");
          description = this.extractDescription(content) ?? `来自 ${sourceName} 的 ${folder} 技能`;
        }

        nextSkills.set(folder, {
          name: folder,
          source: sourceName,
          path: skillMdPath,
          description,
          mtime,
          content,
        });
      }
    } catch (error) {
      console.error(`Error scanning ${dir}:`, error);
    }
  }

  private extractDescription(content: string): string | null {
    const descMatch = content.match(/<description>([\s\S]*?)<\/description>/i);
    if (descMatch) return descMatch[1].trim();

    const lines = content.split("\n");
    let foundH1 = false;
    for (let line of lines) {
      line = line.trim();
      if (!line) continue;
      if (line.startsWith("# ")) {
        foundH1 = true;
        continue;
      }
      if (foundH1 && !line.startsWith("<") && !line.startsWith("#")) {
        return line.length > 120 ? `${line.substring(0, 117)}...` : line;
      }
    }

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#") && !trimmed.startsWith("<")) {
        return trimmed.length > 100 ? `${trimmed.substring(0, 97)}...` : trimmed;
      }
    }

    return null;
  }

  public getAllSkills(): Skill[] {
    return Array.from(this.skills.values());
  }

  public getSkill(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  public getSkillContent(name: string): string {
    const skill = this.skills.get(name);
    if (!skill) return "技能未找到";

    try {
      const stats = fs.statSync(skill.path);
      if (stats.mtimeMs > skill.mtime) {
        const updatedContent = fs.readFileSync(skill.path, "utf-8");
        skill.content = updatedContent;
        skill.mtime = stats.mtimeMs;
        skill.description = this.extractDescription(updatedContent) ?? skill.description;
      }
      return skill.content ?? fs.readFileSync(skill.path, "utf-8");
    } catch {
      return skill.content ?? "无法读取技能文件";
    }
  }
}

export function createServer(skillManager: SkillManager = new SkillManager()): Server {
  const server = new Server(
    { name: "universal-skill-adapter", version: SERVER_VERSION },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    skillManager.refresh();
    const skills = skillManager.getAllSkills();

    const tools: Tool[] = skills.map((skill) => ({
      name: encodeSkillToolName(skill.name),
      description: `${skill.description} (来源: ${skill.source})`,
      inputSchema: {
        type: "object",
        properties: {
          reason: { type: "string", description: "为什么要使用这个技能" },
        },
      },
    }));

    tools.push({
      name: "refresh_skills",
      description: "手动刷新所有 Agent 的技能目录",
      inputSchema: { type: "object", properties: {} },
    });

    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name } = request.params;

    if (name === "refresh_skills") {
      skillManager.refresh();
      return { content: [{ type: "text", text: "已刷新所有技能目录。" }] };
    }

    const skillId = decodeSkillToolName(name);
    if (!skillId) {
      return { content: [{ type: "text", text: `非法工具名: ${name}` }], isError: true };
    }

    const skill = skillManager.getSkill(skillId);
    if (!skill) {
      return { content: [{ type: "text", text: `未找到技能: ${skillId}` }], isError: true };
    }

    const content = skillManager.getSkillContent(skillId);
    return {
      content: [
        {
          type: "text",
          text: `已从 ${skill.source} 成功加载并激活 "${skillId}" 技能专家指令。请遵循以下指南进行后续工作：\n\n${content}`,
        },
      ],
    };
  });

  return server;
}

export async function startServer() {
  const transport = new StdioServerTransport();
  const server = createServer();
  await server.connect(transport);
}

if (typeof require !== "undefined" && require.main === module) {
  startServer().catch((error) => {
    console.error("Failed to start MCP server:", error);
    process.exitCode = 1;
  });
}
