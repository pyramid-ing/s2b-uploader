import React, { useEffect, useState, useRef } from 'react'
import { Card, Button } from 'antd'
import dayjs from 'dayjs'

const { ipcRenderer } = window.require('electron')

export interface LogMessage {
  log: string
  level: 'info' | 'warning' | 'error'
}

const TerminalLog: React.FC = () => {
  const [logs, setLogs] = useState<LogMessage[]>([])
  const terminalRef = useRef<HTMLDivElement>(null)
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 })

  useEffect(() => {
    ipcRenderer.on('log-message', (_, data: LogMessage) => {
      setLogs(prevLogs => [...prevLogs, data])

      // ✅ 진행 상황 파싱 및 출력
      const match = data.log.match(/현재 진행: (\d+) \/ (\d+)/)
      if (match) {
        const current = parseInt(match[1], 10)
        const total = parseInt(match[2], 10)
        setProgress({ current, total })

        // ✅ 진행상황도 [INFO] 로그로 표시
        setLogs(prevLogs => [
          ...prevLogs,
          { log: `[${dayjs().format('YYYY-MM-DD HH:mm:ss')}] 진행상황: ${current} / ${total}`, level: 'info' },
        ])
      }
    })

    return () => {
      ipcRenderer.removeAllListeners('log-message')
    }
  }, [])

  // ✅ 로그 업데이트 시 스크롤을 맨 아래로 이동
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [logs])

  const getLogColor = (level: string) => {
    switch (level) {
      case 'info':
        return '#00FF00' // 초록
      case 'warning':
        return '#FFA500' // 주황
      case 'error':
        return '#FF0000' // 빨강
      default:
        return '#FFFFFF' // 기본 흰색
    }
  }

  const clearLogs = () => setLogs([])

  return (
    <Card
      title="진행 정보"
      extra={
        <Button onClick={clearLogs} size="small">
          로그 초기화
        </Button>
      }
      style={{ marginTop: '20px' }}
    >
      <div
        ref={terminalRef}
        style={{
          backgroundColor: '#000',
          color: '#fff',
          height: '300px',
          overflowY: 'auto',
          padding: '10px',
          fontFamily: 'monospace',
          borderRadius: '5px',
        }}
      >
        {logs.map((log, index) => (
          <div key={index} style={{ color: getLogColor(log.level) }}>
            {log.log}
          </div>
        ))}
      </div>
    </Card>
  )
}

export default TerminalLog
