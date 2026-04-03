/**
 * Content Previewer
 *
 * 对旧 turn 中的大型 tool 结果进行 head+tail 预览。
 * 将完整内容替换为摘要行 + 前 N 行 + 后 M 行。
 * 跳过写操作工具（由 toolResultPrioritizer 处理）和错误结果。
 */

import type { ILogger } from '../../../shared/logger.js';
import type { ContentPreviewerConfig, ReducerResult, ReductionDetail } from '../types.js';
import { truncateForLog } from '../types.js';
import { estimateTokens } from '../token-estimator.js';

// Write-type tools — previewer skips these (handled by toolResultPrioritizer).
const WRITE_TOOL_NAMES = new Set([
  'write_file',
  'create_file',
  'write',
  'create',
  'mv',
  'cp',
  'mkdir',
  'rm',
  'rename',
  'save_file',
]);

function getTextContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const block of content) {
      const b = block as Record<string, unknown>;
      if (b.type === 'text' && typeof b.text === 'string') {
        parts.push(b.text as string);
      }
    }
    return parts.join('\n');
  }
  return '';
}

function replaceContent(msg: Record<string, unknown>, text: string): void {
  const content = msg.content;
  if (typeof content === 'string') {
    msg.content = text;
  } else if (Array.isArray(content)) {
    const nonText = content.filter(
      (b: unknown) => (b as Record<string, unknown>).type !== 'text',
    );
    nonText.push({ type: 'text', text });
    msg.content = nonText;
  } else {
    msg.content = text;
  }
}

function buildSummaryLine(
  toolName: string,
  args: Record<string, unknown>,
  lines: number,
  chars: number,
): string {
  switch (toolName) {
    case 'read_file':
    case 'Read':
    case 'read': {
      const p = args.path ?? args.file_path ?? 'unknown';
      const ext = String(p).split('.').pop() ?? '';
      return `[file: ${p} — ${lines} lines${ext ? `, ${ext}` : ''}]`;
    }
    case 'grep':
    case 'Grep': {
      const pattern = args.pattern ?? '?';
      return `[grep: "${pattern}" — ${lines} result lines]`;
    }
    case 'glob':
    case 'Glob': {
      const pattern = args.pattern ?? '?';
      return `[glob: "${pattern}" — ${lines} files]`;
    }
    case 'bash':
    case 'Bash': {
      const cmd = String(args.command ?? '').slice(0, 80);
      return `[bash: ${cmd} — ${lines} lines output]`;
    }
    default:
      return `[${toolName}: ${chars} chars, ${lines} lines]`;
  }
}

export function contentPreviewer(
  messages: unknown[],
  config: ContentPreviewerConfig,
  preserveRecentTurns: number,
  logger: ILogger,
): ReducerResult {
  if (!config.enabled) return { tokensSaved: 0, itemsProcessed: 0, details: [] };

  // First pass: build callId → { toolName, args } from assistant messages.
  const callIdToMeta = new Map<
    string,
    { toolName: string; args: Record<string, unknown> }
  >();
  for (const msg of messages) {
    const m = msg as Record<string, unknown>;
    if (m.role !== 'assistant') continue;
    const content = m.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      const b = block as Record<string, unknown>;
      if (b.type === 'toolCall' && typeof b.id === 'string') {
        let args: Record<string, unknown> = {};
        try {
          const raw = b.arguments;
          if (typeof raw === 'string') {
            args = JSON.parse(raw) as Record<string, unknown>;
          } else if (raw && typeof raw === 'object') {
            args = raw as Record<string, unknown>;
          }
        } catch {
          // keep empty args
        }
        callIdToMeta.set(b.id as string, {
          toolName: (b.name as string) ?? '',
          args,
        });
      }
    }
  }

  // Find protected boundary (last N assistant turns).
  const assistantIndices: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    if ((messages[i] as Record<string, unknown>).role === 'assistant')
      assistantIndices.push(i);
  }
  const protectedStart =
    assistantIndices.length > preserveRecentTurns
      ? assistantIndices[assistantIndices.length - preserveRecentTurns]
      : 0;

  let tokensSaved = 0;
  let itemsProcessed = 0;
  const details: ReductionDetail[] = [];

  for (let i = 0; i < protectedStart; i++) {
    const msg = messages[i] as Record<string, unknown>;
    if (msg.role !== 'toolResult') continue;

    // Skip errors — high priority, keep intact.
    if (msg.isError === true) continue;

    const callId = msg.toolCallId as string | undefined;
    const meta = callId ? callIdToMeta.get(callId) : undefined;
    const toolName = meta?.toolName ?? '';

    // Skip write-type tools — handled by toolResultPrioritizer.
    if (WRITE_TOOL_NAMES.has(toolName)) continue;

    const text = getTextContent(msg.content);
    if (text.length < config.minContentChars) continue;

    const allLines = text.split('\n');
    const totalLines = allLines.length;

    // If content fits within head + tail, no need to preview.
    if (totalLines <= config.headLines + config.tailLines) continue;

    const headLines = allLines.slice(0, config.headLines);
    const tailLines = allLines.slice(-config.tailLines);
    const args = meta?.args ?? {};

    const summary = buildSummaryLine(toolName, args, totalLines, text.length);
    const preview = [
      summary,
      `--- head (${config.headLines} lines) ---`,
      ...headLines,
      `--- tail (${config.tailLines} lines) ---`,
      ...tailLines,
      '[content previewed — use read_file to see full content]',
    ].join('\n');

    replaceContent(msg, preview);

    const saved = estimateTokens(text) - estimateTokens(preview);
    if (saved > 0) {
      tokensSaved += saved;
      itemsProcessed++;

      details.push({
        toolName,
        toolCallId: callId,
        contentBefore: truncateForLog(text),
        contentAfter: preview,
      });
    }
  }

  if (itemsProcessed > 0) {
    logger.info(
      `[context-reducer] contentPreviewer: previewed ${itemsProcessed} results, saved ~${tokensSaved} tokens`,
    );
  }

  return { tokensSaved, itemsProcessed, details };
}
