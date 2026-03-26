/**
 * Hook 路由
 */

import { Router, Request, Response } from 'express';
import { inject, injectable } from 'inversify';
import { RequestService } from '../../../domain/request/request.service.js';
import { TaskService } from '../../../domain/task/task.service.js';

/**
 * Hook 路由
 */
@injectable()
export class HooksRouter {
  private readonly router: Router;

  constructor(
    @inject(RequestService) private readonly requestService: RequestService,
    @inject(TaskService) private readonly taskService: TaskService
  ) {
    this.router = Router();
    this.routes();
  }

  private routes(): void {
    // POST /hooks/llm_input
    this.router.post('/llm_input', this.handleLlmInput.bind(this));

    // POST /hooks/llm_output
    this.router.post('/llm_output', this.handleLlmOutput.bind(this));

    // POST /hooks/after_tool_call
    this.router.post('/after_tool_call', this.handleToolCall.bind(this));

    // POST /hooks/agent_end
    this.router.post('/agent_end', this.handleAgentEnd.bind(this));
  }

  /**
   * 处理 LLM 输入
   */
  private async handleLlmInput(req: Request, res: Response): Promise<void> {
    try {
      const { event, ctx } = req.body;

      // 创建请求记录
      const request = await this.requestService.createRequest({
        type: 'input',
        runId: event.runId,
        taskId: event.taskId,
        sessionId: event.sessionId,
        sessionKey: ctx.sessionKey,
        provider: event.provider,
        model: event.model,
        prompt: event.prompt,
        systemPrompt: event.systemPrompt,
        historyMessages: event.historyMessages,
        imagesCount: event.imagesCount,
        usage: event.usage,
        metadata: {
          agentId: ctx.agentId,
          channelId: ctx.channelId,
          trigger: ctx.trigger,
        },
      });

      res.json({ ok: true, requestId: request.id });
    } catch (error) {
      console.error('[HooksRouter] handleLlmInput error:', error);
      res.status(500).json({ ok: false, error: String(error) });
    }
  }

  /**
   * 处理 LLM 输出
   */
  private async handleLlmOutput(req: Request, res: Response): Promise<void> {
    try {
      const { event, ctx } = req.body;

      // 获取对应的 input request 来计算 input tokens
      const inputRequest = await this.requestService.getInputForRun(event.runId);
      const inputTokens = inputRequest.getTotalTokens();
      const outputTokens = event.usage?.output || 0;

      // 记录 LLM 调用
      await this.taskService.recordLLMCall(
        event.sessionId,
        event.runId,
        inputTokens,
        outputTokens
      );

      // 创建输出请求记录
      await this.requestService.createRequest({
        type: 'output',
        runId: event.runId,
        sessionId: event.sessionId,
        sessionKey: ctx.sessionKey,
        provider: event.provider,
        model: event.model,
        assistantTexts: event.assistantTexts,
        usage: event.usage,
        metadata: {
          agentId: ctx.agentId,
          channelId: ctx.channelId,
        },
      });

      res.json({ ok: true });
    } catch (error) {
      console.error('[HooksRouter] handleLlmOutput error:', error);
      res.status(500).json({ ok: false, error: String(error) });
    }
  }

  /**
   * 处理工具调用
   */
  private async handleToolCall(req: Request, res: Response): Promise<void> {
    try {
      const { event, ctx } = req.body;
      
      // TODO: 实现工具调用记录
      console.log('[HooksRouter] Tool call:', event.toolName);

      res.json({ ok: true });
    } catch (error) {
      console.error('[HooksRouter] handleToolCall error:', error);
      res.status(500).json({ ok: false, error: String(error) });
    }
  }

  /**
   * 处理 Agent 结束
   */
  private async handleAgentEnd(req: Request, res: Response): Promise<void> {
    try {
      const { event } = req.body;
      const sessionId = event.sessionId || event.ctx?.sessionId;

      if (!sessionId) {
        res.status(400).json({ ok: false, error: 'sessionId is required' });
        return;
      }

      const reason = event.error ? 'error' : 'completed';
      await this.taskService.endTask(sessionId, reason, event.error);

      res.json({ ok: true });
    } catch (error) {
      console.error('[HooksRouter] handleAgentEnd error:', error);
      res.status(500).json({ ok: false, error: String(error) });
    }
  }

  /**
   * 获取路由器
   */
  public getRouter(): Router {
    return this.router;
  }
}
