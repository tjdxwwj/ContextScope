/**
 * ContextScope — OpenClaw 插件入口
 *
 * 功能：
 * 1. 启动独立 HTTP 服务器（Dashboard + API + 数据存储）
 * 2. 注册 OpenClaw 生命周期 hooks（llm_input, llm_output, before_prompt_build 等）
 * 3. before_prompt_build hook 原地修改 event.messages 进行上下文裁剪
 */

import { definePluginEntry, type PluginLogger } from "openclaw/plugin-sdk/plugin-entry";
import { Application } from "./src/app/bootstrap.js";
import { resolveConfig } from "./src/domain/context-reducer/types.js";
import { config } from "./src/config/index.js";

let app: Application | null = null;

export default definePluginEntry({
  id: "contextscope",
  name: "ContextScope",
  description: "Visualize API requests, prompts, token usage + intelligent context reduction",
  register(api) {
    const log = api.logger;
    const pluginConfig = (api.pluginConfig ?? {}) as Record<string, unknown>;
    const serverUrl = `http://localhost:${config.port}`;

    // --- 1. 启动 ContextScope 独立服务器 ---

    startServer(log).catch((err) => {
      log.error(`[ContextScope] Failed to start server: ${err}`);
    });

    // --- 2. 注册数据采集 hooks ---
    // 所有 hook handler 签名为 (event, ctx)，ctx 包含 sessionId, sessionKey, agentId 等

    api.on("session_start", async (_event, ctx) => {
      log.info(`[ContextScope] session_start — id=${ctx.sessionId} key=${ctx.sessionKey}`);
    });

    api.on("llm_input", async (event, ctx) => {
      try {
        await fetch(`${serverUrl}/hooks/llm_input`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event, ctx }),
        });
      } catch {
        // best-effort
      }
    });

    api.on("llm_output", async (event, ctx) => {
      try {
        await fetch(`${serverUrl}/hooks/llm_output`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event, ctx }),
        });
      } catch {
        // best-effort
      }
    });

    api.on("after_tool_call", async (event, ctx) => {
      try {
        await fetch(`${serverUrl}/hooks/after_tool_call`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event, ctx }),
        });
      } catch {
        // best-effort
      }
    });

    api.on("agent_end", async (event, ctx) => {
      try {
        await fetch(`${serverUrl}/hooks/agent_end`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event, ctx }),
        });
      } catch {
        // best-effort
      }
    });

    // --- 3. before_prompt_build — 核心：上下文裁剪 ---
    //
    // 签名: (event: { prompt, messages }, ctx: { sessionId, agentId, ... })
    // event.messages 是引用语义 — 原地修改数组即可生效
    // 返回值仅支持 systemPrompt / prependContext / appendSystemContext 等字段

    const reducerConfig = resolveConfig(pluginConfig.contextReducer);
    log.info(`[ContextScope] context-reducer enabled=${reducerConfig.enabled}`);

    api.on("before_prompt_build", async (event, ctx) => {
      const msgs = event.messages ?? [];
      if (!reducerConfig.enabled || msgs.length === 0) return;

      try {
        const resp = await fetch(`${serverUrl}/hooks/before_prompt_build`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: {
              messages: msgs,
              sessionId: ctx.sessionId ?? "unknown",
              config: pluginConfig.contextReducer,
            },
            ctx,
          }),
        });

        const data = (await resp.json()) as {
          ok: boolean;
          messages?: unknown[];
          stats?: { tokensSaved?: number; durationMs?: number };
        };

        if (data.ok && Array.isArray(data.messages)) {
          // 原地替换 messages 数组内容（引用语义，OpenClaw 会读取修改后的 messages）
          msgs.length = 0;
          msgs.push(...data.messages);
          log.info(
            `[ContextScope] context-reducer: saved ${data.stats?.tokensSaved ?? 0} tokens in ${data.stats?.durationMs ?? 0}ms`,
          );
        }
      } catch (err) {
        log.error(`[ContextScope] context-reducer failed: ${err}`);
        // 失败时 messages 保持原样，不影响正常流程
      }
    });

    log.info("[ContextScope] all hooks registered");
  },
});

/**
 * 启动 ContextScope HTTP 服务器（单例）
 */
async function startServer(log: PluginLogger): Promise<void> {
  if (app) return; // 已启动
  try {
    app = new Application();
    await app.start();
    log.info(`[ContextScope] server started on http://localhost:${config.port}`);
  } catch (err) {
    log.error(`[ContextScope] server start failed: ${err}`);
    app = null;
  }
}
