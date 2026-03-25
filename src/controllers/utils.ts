import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RequestAnalyzerService } from '../services/request.service.js';
import type { PluginLogger } from '../models/shared-types.js';

export function sendJson(res: ServerResponse, statusCode: number, payload: unknown): boolean {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
  return true;
}

export function parseTimeFilters(searchParams: URLSearchParams): { startTime?: number; endTime?: number } {
  const rawStartTime = searchParams.get('startTime');
  const rawEndTime = searchParams.get('endTime');
  const rawDate = searchParams.get('date');
  const rawStartDate = searchParams.get('startDate');
  const rawEndDate = searchParams.get('endDate');

  let startTime = rawStartTime ? parseInteger(rawStartTime, 'startTime') : undefined;
  let endTime = rawEndTime ? parseInteger(rawEndTime, 'endTime') : undefined;

  if (startTime === undefined && endTime === undefined && rawDate) {
    startTime = toDayStart(rawDate);
    endTime = toDayEnd(rawDate);
  }

  if (startTime === undefined && rawStartDate) {
    startTime = toDayStart(rawStartDate);
  }
  if (endTime === undefined && rawEndDate) {
    endTime = toDayEnd(rawEndDate);
  }

  return { startTime, endTime };
}

function parseInteger(value: string, name: string): number {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) throw new Error(`Invalid ${name}: ${value}`);
  return n;
}

function toDayStart(dateStr: string): number {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) throw new Error(`Invalid date format: ${dateStr}`);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function toDayEnd(dateStr: string): number {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) throw new Error(`Invalid date format: ${dateStr}`);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

export function convertToCSV(requests: any[]): string {
  const headers = ['ID', 'Type', 'Run ID', 'Session ID', 'Provider', 'Model', 'Timestamp', 'Input Tokens', 'Output Tokens', 'Total Tokens'];
  const escapeCell = (value: unknown): string => {
    let cell = value == null ? '' : String(value);
    if (/^[=\-+@]/.test(cell)) {
      cell = `'${cell}`;
    }
    if (cell.includes('"')) {
      cell = cell.replace(/"/g, '""');
    }
    if (/[",\r\n]/.test(cell)) {
      cell = `"${cell}"`;
    }
    return cell;
  };
  const rows = requests.map(req => [
    req.id ?? '',
    req.type ?? '',
    req.runId ?? '',
    req.sessionId ?? '',
    req.provider ?? '',
    req.model ?? '',
    new Date(req.timestamp).toISOString(),
    req.usage?.input ?? '',
    req.usage?.output ?? '',
    req.usage?.total ?? ''
  ]);
  return [headers, ...rows].map(row => row.map(escapeCell).join(',')).join('\n');
}
