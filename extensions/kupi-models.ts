import { writeFileSync, existsSync, copyFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { API_KEY_ENV, buildModelsJson, fetchModels } from "../src/generate.ts";

function modelsPath(): string {
  return join(process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent"), "models.json");
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("sync-models", {
    description: "건국대 AI 게이트웨이의 현재 모델 목록으로 models.json 갱신",
    handler: async (_args, ctx) => {
      const apiKey = process.env[API_KEY_ENV];
      if (!apiKey) {
        ctx.ui.notify(`${API_KEY_ENV} 환경변수가 없어요 (README 의 환경변수 설정 참고)`, "error");
        return;
      }
      try {
        const { json, count } = buildModelsJson(await fetchModels(apiKey));

        const out = modelsPath();
        mkdirSync(dirname(out), { recursive: true });
        if (existsSync(out)) copyFileSync(out, `${out}.bak`);
        writeFileSync(out, JSON.stringify(json, null, 2) + "\n");

        ctx.ui.notify(`models.json 갱신: ${count}개 모델 (/model 을 열면 반영돼요)`, "info");
      } catch (error) {
        ctx.ui.notify(`sync-models 실패: ${error instanceof Error ? error.message : String(error)}`, "error");
      }
    },
  });
}
