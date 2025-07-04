import React, { useEffect, useState } from 'react'
import { Alert, Button, Card, message, Space, Table, DatePicker } from 'antd'
import { FolderOpenOutlined, ReloadOutlined, StopOutlined, UploadOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import TerminalLog from './TerminalLog'
import { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import 'dayjs/locale/ko'
import koKR from 'antd/es/date-picker/locale/ko_KR'
dayjs.locale('ko')

const { ipcRenderer } = window.require('electron')

interface ProductData {
  key: string
  goodsName: string
  spec: string
  modelName: string
  originalData?: any
}

const { RangePicker } = DatePicker

const defaultStart = dayjs()
const defaultEnd = dayjs().add(3, 'month')

const Upload: React.FC = () => {
  const [data, setData] = useState<ProductData[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([])
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([defaultStart, defaultEnd])
  const [isAccountValid, setIsAccountValid] = useState<boolean | null>(null)

  useEffect(() => {
    checkAccountValidity()
    loadExcelData()
  }, [])

  const checkAccountValidity = async () => {
    try {
      const settings = await ipcRenderer.invoke('get-settings')
      if (!settings?.loginId) {
        message.error('로그인 정보가 설정되지 않았습니다.')
        setIsAccountValid(false)
        return
      }
      const result = await ipcRenderer.invoke('check-account-validity', {
        accountId: settings.loginId,
      })
      setIsAccountValid(result)
    } catch (error) {
      console.error('계정 유효성 확인 실패:', error)
      setIsAccountValid(false)
      message.error('계정 유효성 확인 중 오류가 발생했습니다.')
    }
  }

  const loadExcelData = async () => {
    try {
      const settings = await ipcRenderer.invoke('get-settings')
      if (!settings?.excelPath) {
        message.warning('Excel 파일 경로가 설정되지 않았습니다.')
        return
      }
      if (!settings?.fileDir) {
        message.warning('파일 폴더가 설정되지 않았습니다.')
        return
      }

      setLoading(true)

      const products = await ipcRenderer.invoke('load-excel-data', {
        excelPath: settings.excelPath,
        fileDir: settings.fileDir,
      })

      const loadedData = products.map((p: any, index: number) => ({
        key: index.toString(),
        goodsName: p.goodsName,
        spec: p.spec,
        modelName: p.modelName,
        originalData: p,
      }))
      setData(loadedData)
      setSelectedKeys(loadedData.map(item => item.key))

      message.success('Excel 데이터를 성공적으로 불러왔습니다.')
    } catch (error) {
      console.error('Failed to load Excel data:', error)
      message.error('데이터 로드에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  // ✅ 결과 폴더 열기
  const openResultFolder = async () => {
    try {
      const settings = await ipcRenderer.invoke('get-settings')
      if (!settings?.excelPath) {
        message.warning('결과 폴더 경로가 설정되지 않았습니다.')
        return
      }

      await ipcRenderer.invoke('open-folder', settings.excelPath)
    } catch (error) {
      console.error('Failed to open folder:', error)
      message.error('폴더를 여는 중 오류가 발생했습니다.')
    }
  }

  const handleUpload = async () => {
    try {
      if (selectedKeys.length === 0) {
        message.warning('등록할 상품을 선택해주세요.')
        return
      }

      const settings = await ipcRenderer.invoke('get-settings')
      if (!settings?.loginId || !settings?.loginPw) {
        message.error('로그인 정보가 설정되지 않았습니다.')
        return
      }

      setLoading(true)

      // ✅ 전체 데이터 유지, 선택 여부 포함
      const allProducts = data.map(item => ({
        ...item.originalData,
        selected: selectedKeys.includes(item.key), // ✅ 선택된 상품만 true
      }))

      const result = await ipcRenderer.invoke('start-and-register-products', { allProducts })

      if (result.success) {
        message.success('모든 상품이 성공적으로 처리했습니다')
      } else {
        message.error(`일부 상품 등록 실패: ${result.error}`)
      }
    } catch (error) {
      console.error('Upload process failed:', error)
      message.error('상품 등록 과정에서 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const handleExtendManagementDate = async () => {
    try {
      const settings = await ipcRenderer.invoke('get-settings')
      if (!settings?.loginId || !settings?.loginPw) {
        message.error('로그인 정보가 설정되지 않았습니다.')
        return
      }
      if (!dateRange) {
        message.error('기간을 선택해주세요.')
        return
      }
      const [start, end] = dateRange
      await ipcRenderer.invoke('extend-management-date', {
        startDate: start.format('YYYYMMDD'),
        endDate: end.format('YYYYMMDD'),
      })
    } catch (error) {
      console.error('관리일 연장 실패:', error)
    }
  }

  const handleCancel = async () => {
    await ipcRenderer.invoke('cancel-registration')
  }

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
      {isAccountValid === false && (
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
        style={{ marginBottom: '20px', opacity: isAccountValid === false ? 0.5 : 1 }}
        bordered={false}
      >
        <Space direction="vertical" size="middle">
          <Space>
            <label>관리일(기간):</label>
            <RangePicker
              value={dateRange}
              onChange={dates => setDateRange(dates as [Dayjs, Dayjs])}
              disabled={isAccountValid === false}
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
          <Button
            type="primary"
            onClick={handleExtendManagementDate}
            disabled={isAccountValid === false || loading || !dateRange}
          >
            관리일 연장
          </Button>
        </Space>
      </Card>

      <Card
        title="상품 등록"
        style={{ marginBottom: '20px', opacity: isAccountValid === false ? 0.5 : 1 }}
        extra={
          <Space>
            <Button type="default" icon={<FolderOpenOutlined />} onClick={openResultFolder}>
              결과 폴더 열기
            </Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={loadExcelData}
              loading={loading}
              disabled={isAccountValid === false}
            >
              새로고침
            </Button>
            <Button
              type="primary"
              icon={<UploadOutlined />}
              onClick={handleUpload}
              loading={loading}
              disabled={selectedKeys.length === 0 || isAccountValid === false}
            >
              선택 상품 등록
            </Button>
            <Button type="primary" danger icon={<StopOutlined />} onClick={handleCancel} disabled={!loading}>
              중단
            </Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={data}
          rowSelection={{
            type: 'checkbox',
            selectedRowKeys: selectedKeys,
            onChange: setSelectedKeys,
            getCheckboxProps: () => ({
              disabled: isAccountValid === false || loading,
            }),
          }}
          loading={loading}
        />
      </Card>

      <TerminalLog />
    </>
  )
}

export default Upload
