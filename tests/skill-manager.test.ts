import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";

import { decodeSkillToolName, encodeSkillToolName, SkillManager } from "../index";

function writeSkill(baseDir: string, skillName: string, content: string) {
  const skillDir = path.join(baseDir, skillName);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), content, "utf-8");
}

test("refresh falls back to lower-priority source when higher source disappears", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "skill-nexus-"));
  const geminiDir = path.join(root, "gemini");
  const claudeDir = path.join(root, "claude");
  const opencodeDir = path.join(root, "opencode");

  fs.mkdirSync(geminiDir, { recursive: true });
  fs.mkdirSync(claudeDir, { recursive: true });
  fs.mkdirSync(opencodeDir, { recursive: true });

  try {
    writeSkill(geminiDir, "shared-skill", "# Gemini\nGemini content");
    writeSkill(claudeDir, "shared-skill", "# Claude\nClaude fallback content");

    const manager = new SkillManager([
      { name: "Gemini", path: geminiDir },
      { name: "Claude", path: claudeDir },
      { name: "OpenCode", path: opencodeDir },
    ]);

    assert.equal(manager.getSkill("shared-skill")?.source, "Gemini");

    fs.rmSync(path.join(geminiDir, "shared-skill"), { recursive: true, force: true });
    manager.refresh();

    const fallbackSkill = manager.getSkill("shared-skill");
    assert.equal(fallbackSkill?.source, "Claude");
    assert.match(manager.getSkillContent("shared-skill"), /Claude fallback content/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("tool name encoding is reversible for underscores, hyphens and unicode", () => {
  const skillNames = ["foo_bar", "foo-bar", "技能-tool"];

  for (const skillName of skillNames) {
    const toolName = encodeSkillToolName(skillName);
    assert.equal(decodeSkillToolName(toolName), skillName);
  }

  assert.equal(decodeSkillToolName("activate_skill_"), null);
  assert.equal(decodeSkillToolName("refresh_skills"), null);
});
