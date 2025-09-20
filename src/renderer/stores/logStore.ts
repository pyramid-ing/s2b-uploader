import { atom } from 'recoil'

export interface LogMessage {
  log: string
  level: 'info' | 'warning' | 'error'
  timestamp?: string
}

export interface ProgressState {
  current: number
  total: number
}

// 로그 메시지들을 저장하는 atom
export const logsState = atom<LogMessage[]>({
  key: 'logsState',
  default: [],
})

// 진행상황을 저장하는 atom
export const progressState = atom<ProgressState>({
  key: 'progressState',
  default: { current: 0, total: 0 },
})

// 로그 추가를 위한 selector (action)
export const addLogSelector = atom({
  key: 'addLogSelector',
  default: null,
})

// 로그 초기화를 위한 selector (action)
export const clearLogsSelector = atom({
  key: 'clearLogsSelector',
  default: null,
})
