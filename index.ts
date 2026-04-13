import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * 通用的技能模型 (增强版)
 */
interface Skill {
  name: string;        // 技能 ID (e.g., shadcn, brainstorming)
  source: string;      // 来源 (Gemini, Claude, OpenCode)
  path: string;        // 技能文件绝对路径
  description: string; // 从 SKILL.md 提取的描述
  mtime: number;       // 文件最后修改时间 (Unix Timestamp)
  content?: string;    // 缓存的内容
}

class SkillManager {
  private skills: Map<string, Skill> = new Map();

  // 待扫描的目录列表
  private scanPaths = [
    { name: 'Gemini', path: path.join(os.homedir(), '.gemini/skills') },
    { name: 'Claude', path: path.join(os.homedir(), '.agents/skills') },
    { name: 'OpenCode', path: path.join(process.cwd(), '.opencode/skills') },
  ];

  constructor() {
    this.refresh();
  }

  /**
   * 刷新并增量更新技能
   */
  public refresh() {
    // 记录本次扫描中发现的所有技能名称，用于清理已删除的技能
    const foundSkillsInThisScan = new Set<string>();

    for (const source of this.scanPaths) {
      this.scanDirectory(source.path, source.name, foundSkillsInThisScan);
    }

    // 清理那些在物理目录中已经不存在的技能
    for (const skillName of this.skills.keys()) {
      if (!foundSkillsInThisScan.has(skillName)) {
        this.skills.delete(skillName);
      }
    }
  }

  private scanDirectory(dir: string, sourceName: string, foundSet: Set<string>) {
    if (!fs.existsSync(dir)) return;

    try {
      const folders = fs.readdirSync(dir).filter(f => fs.statSync(path.join(dir, f)).isDirectory());
      
      for (const folder of folders) {
        const skillMdPath = path.join(dir, folder, 'SKILL.md');
        if (fs.existsSync(skillMdPath)) {
          const stats = fs.statSync(skillMdPath);
          const mtime = stats.mtimeMs;
          const existing = this.skills.get(folder);

          foundSet.add(folder);

          // 决定是否需要更新：
          // 1. 技能不存在
          // 2. 来源优先级更高 (例如 OpenCode 覆盖 Gemini)
          // 3. 来源相同但文件修改时间更新了
          if (!existing || 
              this.shouldOverwrite(folder, sourceName) || 
              (existing.source === sourceName && mtime > existing.mtime)) {
            
            const content = fs.readFileSync(skillMdPath, 'utf-8');
            const description = this.extractDescription(content);
            
            this.skills.set(folder, {
              name: folder,
              source: sourceName,
              path: skillMdPath,
              description: description || `来自 ${sourceName} 的 ${folder} 技能`,
              mtime: mtime,
              content: content // 预热缓存
            });
          }
        }
      }
    } catch (err) {
      console.error(`Error scanning ${dir}:`, err);
    }
  }

  private shouldOverwrite(name: string, newSource: string): boolean {
    const existing = this.skills.get(name);
    if (!existing) return true;
    if (existing.source === newSource) return false;
    
    // 优先级排序: OpenCode (本地项目) > Gemini > Claude
    const priority: Record<string, number> = { 'OpenCode': 3, 'Gemini': 2, 'Claude': 1 };
    return (priority[newSource] || 0) > (priority[existing.source] || 0);
  }

  private extractDescription(content: string): string | null {
    // 1. 尝试提取 <description> 标签
    const descMatch = content.match(/<description>([\s\S]*?)<\/description>/i);
    if (descMatch) return descMatch[1].trim();
    
    // 2. 尝试提取首个 H1 标题之后的段落
    const lines = content.split('\n');
    let foundH1 = false;
    for (let line of lines) {
      line = line.trim();
      if (!line) continue;
      if (line.startsWith('# ')) {
        foundH1 = true;
        continue;
      }
      // 找到 H1 后的第一个非空、非标签行
      if (foundH1 && !line.startsWith('<') && !line.startsWith('#')) {
        return line.length > 120 ? line.substring(0, 117) + '...' : line;
      }
    }

    // 3. 保底：寻找第一行非空描述
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('<')) {
        return trimmed.length > 100 ? trimmed.substring(0, 97) + '...' : trimmed;
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
    
    // 二次检查文件是否变动 (用于 CallTool 时的高性能读取)
    try {
      const stats = fs.statSync(skill.path);
      if (stats.mtimeMs > skill.mtime) {
        skill.content = fs.readFileSync(skill.path, 'utf-8');
        skill.mtime = stats.mtimeMs;
        skill.description = this.extractDescription(skill.content) || skill.description;
      }
      return skill.content || fs.readFileSync(skill.path, 'utf-8');
    } catch {
      return skill.content || "无法读取技能文件";
    }
  }
}

const skillManager = new SkillManager();

const server = new Server(
  { name: "universal-skill-adapter", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

/**
 * 映射技能到 MCP Tools
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  skillManager.refresh();
  const skills = skillManager.getAllSkills();
  
  const tools: Tool[] = skills.map(skill => ({
    name: `activate_skill_${skill.name.replace(/-/g, '_')}`,
    description: `${skill.description} (来源: ${skill.source})`,
    inputSchema: {
      type: "object",
      properties: {
        reason: { type: "string", description: "为什么要使用这个技能" }
      }
    }
  }));

  // 添加一个刷新工具
  tools.push({
    name: "refresh_skills",
    description: "手动刷新所有 Agent 的技能目录",
    inputSchema: { type: "object", properties: {} }
  });

  return { tools };
});

/**
 * 处理技能调用
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name } = request.params;

  if (name === "refresh_skills") {
    skillManager.refresh();
    return { content: [{ type: "text", text: "已刷新所有技能目录。" }] };
  }

  const skillId = name.replace('activate_skill_', '').replace(/_/g, '-');
  const skill = skillManager.getSkill(skillId);

  if (!skill) {
    return { content: [{ type: "text", text: `未找到技能: ${skillId}` }], isError: true };
  }

  const content = skillManager.getSkillContent(skillId);
  return {
    content: [
      { 
        type: "text", 
        text: `已从 ${skill.source} 成功加载并激活 "${skillId}" 技能专家指令。请遵循以下指南进行后续工作：\n\n${content}` 
      }
    ]
  };
});

const transport = new StdioServerTransport();
server.connect(transport).catch(console.error);
