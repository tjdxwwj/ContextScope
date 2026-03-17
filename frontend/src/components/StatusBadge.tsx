import { Activity, AlertCircle, CheckCircle2 } from 'lucide-react'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export type RunStatus = 'success' | 'running' | 'error' | 'unknown'

interface StatusBadgeProps {
  status: RunStatus
}

export const StatusBadge = ({ status }: StatusBadgeProps) => {
  const isSuccess = status === 'success'
  const isRunning = status === 'running'
  const isError = status === 'error'
  const styles = {
    success: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    running: 'bg-blue-100 text-blue-700 border-blue-200',
    error: 'bg-rose-100 text-rose-700 border-rose-200',
  }
  const icons = {
    success: <CheckCircle2 className="w-3 h-3" />,
    running: <Activity className="w-3 h-3 animate-pulse" />,
    error: <AlertCircle className="w-3 h-3" />,
  }
  const currentStatus = isSuccess ? 'success' : isRunning ? 'running' : 'error'
  const label = isSuccess ? '已完成' : isRunning ? '进行中' : isError ? '失败' : '未知'
  return (
    <span
      className={cn(
        'flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border',
        styles[currentStatus]
      )}
    >
      {icons[currentStatus]}
      {label}
    </span>
  )
}

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
