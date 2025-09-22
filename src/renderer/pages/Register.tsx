import React, { useEffect, useRef } from 'react'
import { Alert, Button, Card, Space, Table, DatePicker, Radio, Input } from 'antd'
import { FolderOpenOutlined, ReloadOutlined, StopOutlined, UploadOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useLog } from '../hooks/useLog'
import { useRegister } from '../hooks/useRegister'
import { ProductData, REGISTRATION_STATUS_LABELS } from '../stores/registerStore'
import dayjs from 'dayjs'
import 'dayjs/locale/ko'
import koKR from 'antd/es/date-picker/locale/ko_KR'

dayjs.locale('ko')

const { RangePicker } = DatePicker

const Register: React.FC = () => {
  const { logs, progress, clearLogs } = useLog()
  const {
    products,
    selectedKeys,
    settings,
    permission,
    setSelectedKeys,
    checkPermission,
    loadExcelData,
    openResultFolder,
    registerProducts,
    extendManagementDate,
    cancelRegistration,
    updateDateRange,
    updateRegistrationStatus,
  } = useRegister()

  const { ipcRenderer } = (window as any).require('electron')
  const terminalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    checkPermission()
    loadExcelData()
  }, [checkPermission, loadExcelData])

  // 로그 업데이트 시 스크롤을 맨 아래로 이동
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [logs])

  const columns: ColumnsType<ProductData> = [
    {
      title: '상품명',
      dataIndex: 'goodsName',
      key: 'goodsName',
    },
    {
      title: '규격',
      dataIndex: 'spec',
      key: 'spec',
    },
    {
      title: '모델명',
      dataIndex: 'modelName',
      key: 'modelName',
    },
  ]

  return (
    <>
      {permission.hasPermission === false && (
        <Alert
          message="계정 인증 실패"
          description="현재 계정으로는 상품 등록이 불가능합니다. 관리자에게 문의하세요."
          type="error"
          showIcon
          style={{ marginBottom: '20px' }}
        />
      )}

      <Card
        title="관리일 설정"
        style={{ marginBottom: '20px', opacity: permission.hasPermission === false ? 0.5 : 1 }}
        bordered={false}
      >
        <Space direction="vertical" size="middle">
          <Space>
            <label>관리일(기간):</label>
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
          <Button
            type="primary"
            onClick={extendManagementDate}
            disabled={permission.hasPermission === false || settings.loading || !settings.dateRange}
          >
            관리일 연장
          </Button>
        </Space>
      </Card>

      <Card
        title="상품 등록"
        style={{ marginBottom: '20px', opacity: permission.hasPermission === false ? 0.5 : 1 }}
        extra={
          <Space>
            <Input
              readOnly
              style={{ width: 320 }}
              value={settings.excelPath}
              placeholder="등록용 Excel 파일 경로"
              addonAfter={
                <Button
                  type="text"
                  icon={<FolderOpenOutlined />}
                  onClick={async () => {
                    const filePath = await ipcRenderer.invoke('select-excel')
                    if (filePath) {
                      await ipcRenderer.invoke('save-settings', { excelPath: filePath })
                      await loadExcelData()
                    }
                  }}
                  disabled={settings.loading}
                >
                  선택
                </Button>
              }
            />
            <Button type="default" icon={<FolderOpenOutlined />} onClick={openResultFolder}>
              결과 폴더 열기
            </Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={loadExcelData}
              loading={settings.loading}
              disabled={permission.hasPermission === false}
            >
              새로고침
            </Button>
            <Button
              type="primary"
              icon={<UploadOutlined />}
              onClick={registerProducts}
              loading={settings.loading}
              disabled={selectedKeys.length === 0 || permission.hasPermission === false}
            >
              선택 상품 등록
            </Button>
            <Button
              type="primary"
              danger
              icon={<StopOutlined />}
              onClick={cancelRegistration}
              disabled={!settings.loading}
            >
              중단
            </Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={products}
          rowSelection={{
            type: 'checkbox',
            selectedRowKeys: selectedKeys,
            onChange: setSelectedKeys,
            getCheckboxProps: () => ({
              disabled: permission.hasPermission === false || settings.loading,
            }),
          }}
          loading={settings.loading}
          pagination={{ defaultPageSize: 50, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100, 200, 500] }}
        />
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
            <div
              key={index}
              style={{ color: log.level === 'error' ? '#FF0000' : log.level === 'warning' ? '#FFA500' : '#00FF00' }}
            >
              {log.log}
            </div>
          ))}
        </div>
      </Card>
    </>
  )
}

export default Register
