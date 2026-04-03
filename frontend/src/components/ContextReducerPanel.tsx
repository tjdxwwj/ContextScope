import { useState, useEffect } from 'react';
import { Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import ReactECharts from 'echarts-for-react';
import { Activity, Scissors, BarChart3, TrendingDown } from 'lucide-react';
import { fetchReductionLogs, fetchReductionSummary } from '../data/apiClient';
import { useI18n } from '../i18n';
import type {
  ReductionLogEntry,
  ReductionSummary,
  ReductionEntry,
  ReductionDetail,
} from '../types';

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// --- SummaryCards ---
function SummaryCards({ summary, t }: { summary: ReductionSummary; t: (key: string) => string }) {
  const cards = [
    {
      label: t('reducer.totalTokensSaved'),
      value: formatTokens(summary.totalTokensSaved),
      icon: <Scissors className="w-5 h-5 text-green-500" />,
      color: 'text-green-600',
    },
    {
      label: t('reducer.totalRecords'),
      value: String(summary.totalRecords),
      icon: <BarChart3 className="w-5 h-5 text-blue-500" />,
      color: 'text-blue-600',
    },
    {
      label: t('reducer.avgSavingRate'),
      value: `${summary.averageSavingRate}%`,
      icon: <TrendingDown className="w-5 h-5 text-purple-500" />,
      color: 'text-purple-600',
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex items-center gap-4"
        >
          <div className="p-3 rounded-lg bg-slate-50">{card.icon}</div>
          <div>
            <div className={`text-2xl font-bold ${card.color}`}>
              {card.value}
            </div>
            <div className="text-xs text-slate-500 mt-1">{card.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// --- TokenChart ---
function TokenChart({ logs, t }: { logs: ReductionLogEntry[]; t: (key: string) => string }) {
  const sorted = [...logs].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  const option = {
    tooltip: { trigger: 'axis' as const },
    legend: { data: [t('reducer.before'), t('reducer.after'), t('reducer.saved')] },
    grid: {
      left: '3%',
      right: '4%',
      top: '15%',
      bottom: '15%',
      containLabel: true,
    },
    xAxis: {
      type: 'category' as const,
      boundaryGap: false,
      data: sorted.map((l) =>
        new Date(l.timestamp).toLocaleString('zh-CN', {
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        }),
      ),
    },
    yAxis: { type: 'value' as const },
    series: [
      {
        name: t('reducer.before'),
        type: 'line' as const,
        data: sorted.map((l) => l.tokensBefore),
        smooth: true,
        lineStyle: { width: 2 },
        itemStyle: { color: '#6366f1' },
      },
      {
        name: t('reducer.after'),
        type: 'line' as const,
        data: sorted.map((l) => l.tokensAfter),
        smooth: true,
        lineStyle: { width: 2 },
        itemStyle: { color: '#22c55e' },
      },
      {
        name: t('reducer.saved'),
        type: 'line' as const,
        data: sorted.map((l) => l.tokensSaved),
        smooth: true,
        areaStyle: { opacity: 0.15 },
        lineStyle: { width: 2 },
        itemStyle: { color: '#f59e0b' },
      },
    ],
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <h3 className="text-sm font-bold text-slate-700 mb-4">{t('reducer.tokenTrends')}</h3>
      <ReactECharts option={option} style={{ height: 300 }} />
    </div>
  );
}

// --- ReducerPieChart ---
function ReducerPieChart({
  contributions,
  t,
}: {
  contributions: Record<string, { tokensSaved: number; count: number }>;
  t: (key: string) => string;
}) {
  const data = Object.entries(contributions).map(([name, { tokensSaved }]) => ({
    name,
    value: tokensSaved,
  }));

  const option = {
    tooltip: {
      trigger: 'item' as const,
      formatter: '{b}: {c} tokens ({d}%)',
    },
    legend: { orient: 'vertical' as const, left: 'left' },
    series: [
      {
        type: 'pie' as const,
        radius: ['40%', '70%'],
        avoidLabelOverlap: false,
        itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
        label: { show: false, position: 'center' as const },
        emphasis: {
          label: { show: true, fontSize: 14, fontWeight: 'bold' as const },
        },
        labelLine: { show: false },
        data,
      },
    ],
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <h3 className="text-sm font-bold text-slate-700 mb-4">
        {t('reducer.contributions')}
      </h3>
      {data.length > 0 ? (
        <ReactECharts option={option} style={{ height: 300 }} />
      ) : (
        <div className="h-[300px] flex items-center justify-center text-slate-400 text-sm">
          {t('reducer.noData')}
        </div>
      )}
    </div>
  );
}

// --- LogTable ---
function LogTable({ logs, t }: { logs: ReductionLogEntry[]; t: (key: string) => string }) {
  const columns: ColumnsType<ReductionLogEntry> = [
    {
      title: t('reducer.time'),
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 160,
      render: (ts: string) =>
        new Date(ts).toLocaleString('zh-CN', { hour12: false }),
    },
    {
      title: t('reducer.stage'),
      dataIndex: 'stage',
      key: 'stage',
      width: 100,
      render: (s: string) => <Tag color="blue">{s}</Tag>,
    },
    {
      title: t('reducer.before'),
      dataIndex: 'tokensBefore',
      key: 'tokensBefore',
      width: 100,
      render: formatTokens,
    },
    {
      title: t('reducer.after'),
      dataIndex: 'tokensAfter',
      key: 'tokensAfter',
      width: 100,
      render: formatTokens,
    },
    {
      title: t('reducer.saved'),
      dataIndex: 'tokensSaved',
      key: 'tokensSaved',
      width: 100,
      render: (v: number) => (
        <span className="text-green-600 font-medium">{formatTokens(v)}</span>
      ),
    },
    {
      title: t('reducer.reducers'),
      dataIndex: 'reductions',
      key: 'reductions',
      render: (reductions: ReductionEntry[]) => (
        <div className="flex flex-wrap gap-1">
          {reductions.map((r, i) => (
            <Tag key={i} color="geekblue">
              {r.reducer} (-{formatTokens(r.tokensSaved)})
            </Tag>
          ))}
        </div>
      ),
    },
    {
      title: t('reducer.duration'),
      dataIndex: 'durationMs',
      key: 'durationMs',
      width: 90,
      render: (v: number) => `${v}ms`,
    },
  ];

  const expandedRowRender = (record: ReductionLogEntry) => {
    const details: ReductionDetail[] = record.reductions.flatMap(
      (r) => r.details ?? [],
    );
    if (details.length === 0) {
      return <div className="text-slate-400 text-sm p-2">{t('reducer.noDetails')}</div>;
    }
    return (
      <div className="space-y-3 p-2">
        {details.map((d, i) => (
          <div key={i} className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <div className="font-medium text-slate-500 mb-1">
                {d.toolName} — {t('reducer.before')}
              </div>
              <pre className="bg-red-50 p-2 rounded max-h-40 overflow-auto whitespace-pre-wrap text-red-800">
                {d.contentBefore.slice(0, 500)}
              </pre>
            </div>
            <div>
              <div className="font-medium text-slate-500 mb-1">
                {d.toolName} — {t('reducer.after')}
              </div>
              <pre className="bg-green-50 p-2 rounded max-h-40 overflow-auto whitespace-pre-wrap text-green-800">
                {d.contentAfter.slice(0, 500)}
              </pre>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <h3 className="text-sm font-bold text-slate-700 mb-4">{t('reducer.logs')}</h3>
      <Table
        columns={columns}
        dataSource={logs}
        rowKey={(r) => `${r.timestamp}-${r.sessionId}-${r.id ?? ''}`}
        expandable={{ expandedRowRender }}
        size="small"
        pagination={{
          pageSize: 20,
          showSizeChanger: true,
          showTotal: (total) => `${total} ${t('reducer.records')}`,
        }}
      />
    </div>
  );
}

// --- Main Panel ---
export function ContextReducerPanel() {
  const { t } = useI18n();
  const [logs, setLogs] = useState<ReductionLogEntry[]>([]);
  const [summary, setSummary] = useState<ReductionSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchReductionLogs(200), fetchReductionSummary()])
      .then(([logsRes, summaryRes]) => {
        if (cancelled) return;
        setLogs(logsRes?.data ?? []);
        setSummary(summaryRes);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500">
        <Activity className="w-4 h-4 animate-spin mr-2" />
        {t('reducer.loading')}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {summary && <SummaryCards summary={summary} t={t} />}
      <div className="grid grid-cols-2 gap-4">
        <TokenChart logs={logs} t={t} />
        <ReducerPieChart contributions={summary?.reducerContributions ?? {}} t={t} />
      </div>
      <LogTable logs={logs} t={t} />
    </div>
  );
}
