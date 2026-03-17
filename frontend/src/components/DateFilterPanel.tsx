import { Trash2 } from 'lucide-react'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

interface DateFilterValue {
  date?: string
  startDate?: string
  endDate?: string
}

interface DateFilterPanelProps {
  show: boolean
  dateFilter: DateFilterValue
  isClearingCache: boolean
  onSetSingleDate: (date: string) => void
  onSetStartDate: (startDate: string) => void
  onSetEndDate: (endDate: string) => void
  onReset: () => void
  onClose: () => void
  onClearCurrent: () => void
  onClearAll: () => void
}

export const DateFilterPanel = ({
  show,
  dateFilter,
  isClearingCache,
  onSetSingleDate,
  onSetStartDate,
  onSetEndDate,
  onReset,
  onClose,
  onClearCurrent,
  onClearAll,
}: DateFilterPanelProps) => {
  if (!show) return null

  const hasRange = Boolean(dateFilter.date || dateFilter.startDate || dateFilter.endDate)

  return (
    <div className="absolute top-full right-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-200 p-4 z-50 text-slate-600">
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1">单日选择</label>
          <input
            type="date"
            className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            value={dateFilter.date || ''}
            onChange={(e) => onSetSingleDate(e.target.value)}
          />
        </div>

        <div className="relative flex py-1 items-center">
          <div className="flex-grow border-t border-slate-100"></div>
          <span className="flex-shrink-0 mx-2 text-xs text-slate-300">OR</span>
          <div className="flex-grow border-t border-slate-100"></div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1">日期范围</label>
          <div className="flex gap-2">
            <input
              type="date"
              className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              value={dateFilter.startDate || ''}
              onChange={(e) => onSetStartDate(e.target.value)}
            />
            <span className="self-center text-slate-400">-</span>
            <input
              type="date"
              className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              value={dateFilter.endDate || ''}
              onChange={(e) => onSetEndDate(e.target.value)}
            />
          </div>
        </div>

        <div className="pt-2 flex justify-between">
          <button
            onClick={onReset}
            className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            重置
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors shadow-sm shadow-blue-500/20"
          >
            确定
          </button>
        </div>

        <div className="pt-2 border-t border-slate-100 mt-2">
          <p className="text-[10px] font-bold text-slate-400 mb-2">数据管理</p>
          <div className="flex gap-2">
            <button
              onClick={onClearCurrent}
              disabled={isClearingCache}
              className={cn(
                'flex-1 px-2 py-1.5 text-xs border rounded-lg flex items-center justify-center gap-1',
                !hasRange
                  ? 'border-slate-200 text-slate-400 cursor-not-allowed bg-slate-50'
                  : 'border-rose-200 text-rose-600 hover:bg-rose-50 cursor-pointer'
              )}
              title={hasRange ? '清除当前选中日期或范围的缓存' : '请先选择日期或日期范围'}
            >
              <Trash2 className="w-3 h-3" />
              清除当前
            </button>
            <button
              onClick={onClearAll}
              disabled={isClearingCache}
              className="flex-1 px-2 py-1.5 text-xs bg-rose-50 border border-rose-200 text-rose-700 rounded-lg hover:bg-rose-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
              title="清除所有缓存数据"
            >
              <Trash2 className="w-3 h-3" />
              清除所有
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
