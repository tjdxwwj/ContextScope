import { atom } from 'jotai'

// 图表配置
export const chartConfigAtom = atom({
  tokenDistribution: {
    type: 'doughnut' as const,
    colors: ['#58a6ff', '#3fb950', '#d29922', '#f85149', '#bc8cff', '#36A2EB', '#FFCE56', '#4BC0C0']
  },
  hourlyDistribution: {
    type: 'bar' as const,
    color: '#58a6ff'
  },
  tokenTrend: {
    type: 'line' as const,
    colors: {
      input: '#58a6ff',
      output: '#3fb950'
    }
  }
})
