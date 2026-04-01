import React, { useEffect } from 'react'
import { Alert, Button, Card, Collapse, DatePicker, Input, Radio, Space, Typography } from 'antd'
import { useRecoilState } from 'recoil'
import { useLog } from '../hooks/useLog'
import { useManagement } from '../hooks/useManagement'
import { managementVideoCollapsedState, REGISTRATION_STATUS_LABELS } from '../stores/managementStore'
import dayjs from 'dayjs'
import 'dayjs/locale/ko'
import koKR from 'antd/es/date-picker/locale/ko_KR'

dayjs.locale('ko')

const { RangePicker } = DatePicker

const { shell } = window.require('electron')

const Management: React.FC = () => {
  const { logs, clearLogs } = useLog()
  const {
    settings,
    permission,
    checkPermission,
    extendManagementDate,
    updateDateRange,
    updateRegistrationStatus,
    updateSearchQuery,
  } = useManagement()

  useEffect(() => {
    checkPermission()
  }, [checkPermission])

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {permission.hasPermission === false && (
        <Alert
          message="계정 인증 실패"
          description={
            <>
              현재 계정으로는 판매관리일 연장 기능이 제한됩니다. 관리자에게 문의하세요.
              {permission.accountInfo?.periodEnd && (
                <div style={{ marginTop: '8px', fontSize: '14px' }}>
                  계정 만료일: {new Date(permission.accountInfo.periodEnd).toLocaleDateString('ko-KR')}
                </div>
              )}
            </>
          }
          type="warning"
          showIcon
          style={{ marginBottom: '20px' }}
        />
      )}

      <Alert
        message={
          <Space>
            <span>도움말:</span>
            <Typography.Link
              onClick={() => shell.openExternal('https://www.youtube.com/watch?v=dkLT_swmnio')}
              style={{ fontWeight: 'bold' }}
            >
              판매관리일 연장 사용 방법 영상 보기 (Youtube)
            </Typography.Link>
          </Space>
        }
        type="info"
        showIcon
      />

      <Card
        title="판매관리일 연장"
        style={{ marginBottom: '20px', opacity: permission.hasPermission === false ? 0.5 : 1 }}
        bordered={false}
      >
        <Space direction="vertical" size="middle">
          <Space>
            <label>판매관리일 범위:</label>
            <RangePicker
              value={settings.dateRange}
              onChange={dates => updateDateRange(dates as [any, any])}
              disabled={permission.hasPermission === false}
              format="YYYY-MM-DD"
              locale={koKR}
              presets={[
                { label: '전체', value: [dayjs('2000-01-01'), dayjs('2100-01-01')] },
                { label: '1주일', value: [dayjs(), dayjs().add(1, 'week')] },
                { label: '1개월', value: [dayjs(), dayjs().add(1, 'month')] },
                { label: '3개월', value: [dayjs(), dayjs().add(3, 'month')] },
                { label: '1년', value: [dayjs(), dayjs().add(1, 'year')] },
              ]}
              showNow
              allowClear={false}
            />
          </Space>
          <Space>
            <label>등록상태:</label>
            <Radio.Group
              value={settings.registrationStatus}
              onChange={e => updateRegistrationStatus(e.target.value)}
              disabled={permission.hasPermission === false}
            >
              {Object.entries(REGISTRATION_STATUS_LABELS).map(([value, label]) => (
                <Radio key={value} value={value}>
                  {label}
                </Radio>
              ))}
            </Radio.Group>
          </Space>
          <Space>
            <label>검색어:</label>
            <Input
              value={settings.searchQuery}
              onChange={e => updateSearchQuery(e.target.value)}
              placeholder="물품명/규격/모델명/제조사/S2B물품번호"
              style={{ width: 360 }}
              disabled={permission.hasPermission === false}
              allowClear
            />
          </Space>
          <div style={{ fontSize: '12px', color: '#888' }}>검색된 상품의 판매관리일 연장이 진행됩니다.</div>
          <Button
            type="primary"
            onClick={extendManagementDate}
            disabled={permission.hasPermission === false || settings.loading || !settings.dateRange}
            loading={settings.loading}
          >
            관리일 연장
          </Button>
        </Space>
      </Card>

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
            <div
              key={index}
              style={{ color: log.level === 'error' ? '#FF0000' : log.level === 'warning' ? '#FFA500' : '#00FF00' }}
            >
              {log.log}
            </div>
          ))}
        </div>
      </Card>
    </Space>
  )
}

export default Management
