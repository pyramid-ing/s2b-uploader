import { useRecoilState, useRecoilCallback } from 'recoil'
import { useEffect } from 'react'
import dayjs from 'dayjs'
import { logsState, progressState, LogMessage } from '../stores/logStore'

const { ipcRenderer } = window.require('electron')

export const useLog = () => {
  const [logs, setLogs] = useRecoilState(logsState)
  const [progress, setProgress] = useRecoilState(progressState)

  // 로그 추가 함수
  const addLog = useRecoilCallback(
    ({ set }) =>
      (log: LogMessage) => {
        const logWithTimestamp = {
          ...log,
          timestamp: log.timestamp || dayjs().format('YYYY-MM-DD HH:mm:ss'),
        }
        set(logsState, prevLogs => [...prevLogs, logWithTimestamp])
      },
    [],
  )

  // 로그 초기화 함수
  const clearLogs = useRecoilCallback(
    ({ set }) =>
      () => {
        set(logsState, [])
        set(progressState, { current: 0, total: 0 })
      },
    [],
  )

  // IPC 메시지 리스너 설정
  useEffect(() => {
    const handleLogMessage = (_, data: LogMessage) => {
      // 메인 프로세스에서 이미 타임스탬프가 포함된 로그를 보내므로 그대로 사용
      setLogs(prevLogs => [...prevLogs, data])

      // 진행 상황 파싱 및 출력
      const match = data.log.match(/현재 진행: (\d+) \/ (\d+)/)
      if (match) {
        const current = parseInt(match[1], 10)
        const total = parseInt(match[2], 10)
        setProgress({ current, total })

        // 진행상황도 로그로 표시 (타임스탬프 추가)
        const progressLog: LogMessage = {
          log: `진행상황: ${current} / ${total}`,
          level: 'info',
          timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss'),
        }
        setLogs(prevLogs => [...prevLogs, progressLog])
      }
    }

    ipcRenderer.on('log-message', handleLogMessage)

    return () => {
      ipcRenderer.removeAllListeners('log-message')
    }
  }, [setLogs, setProgress])

  return {
    logs,
    progress,
    addLog,
    clearLogs,
  }
}
