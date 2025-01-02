import React, {useEffect, useState} from 'react'
import {Button, Card, message, Space, Table} from 'antd'
import {DownloadOutlined, ReloadOutlined, UploadOutlined} from '@ant-design/icons'
import type {ColumnsType} from 'antd/es/table'
import {TableRowSelection} from 'antd/es/table/interface'
import path from 'node:path'

const {ipcRenderer} = window.require('electron')

interface ProductData {
  key: string;
  goodsName: string;
  spec: string;
  modelName: string;
  originalData?: any;
}

const Upload: React.FC = () => {
  const [data, setData] = useState<ProductData[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedKey, setSelectedKey] = useState<React.Key | null>(null)

  useEffect(() => {
    loadExcelData()
  }, [])

  const loadExcelData = async () => {
    try {
      const settings = await ipcRenderer.invoke('get-settings')
      if (!settings?.excelPath) {
        message.warning('Excel 파일 경로가 설정되지 않았습니다.')
        return
      }

      if (!settings?.imageDir) {
        message.warning('이미지 디렉토리가 설정되지 않았습니다.')
        return
      }

      setLoading(true)

      // Excel 데이터 로드 (main process에서 처리)
      const products = await ipcRenderer.invoke('load-excel-data', {
        excelPath: settings.excelPath,
        imageDir: settings.imageDir,
      })

      setData(products.map((p: any, index: number) => ({
        key: index.toString(),
        goodsName: p.goodsName,
        spec: p.spec,
        modelName: p.modelName,
        originalData: p,
      })))

      message.success('Excel 데이터를 성공적으로 불러왔습니다.')
    } catch (error) {
      console.error('Failed to load Excel data:', error)
      message.error('데이터 로드에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const handleUpload = async () => {
    try {
      if (selectedKey === null) {
        message.warning('등록할 상품을 선택해주세요.')
        return
      }

      const settings = await ipcRenderer.invoke('get-settings')
      if (!settings?.loginId || !settings?.loginPw) {
        message.error('로그인 정보가 설정되지 않았습니다.')
        return
      }

      setLoading(true)

      // 자동화 시작
      await ipcRenderer.invoke('start-automation', {
        loginId: settings.loginId,
        loginPw: settings.loginPw,
      })

      // 선택된 상품 등록
      const index = data.findIndex(item => item.key === selectedKey)
      if (index !== -1) {
        const product = data[index]

        try {
          // 상품 등록 실행 (main process에서 처리)
          await ipcRenderer.invoke('register-product', product.originalData)
          message.success(`상품 "${product.goodsName}"이 성공적으로 등록되었습니다.`)
        } catch (error) {
          console.error(`Failed to register product: ${product.goodsName}`, error)
          message.error(`상품 "${product.goodsName}" 등록에 실패했습니다.`)
        }
      }
    } catch (error) {
      console.error('Upload process failed:', error)
      message.error('상품 등록 과정에서 오류가 발생했습니다.')
    } finally {
      // 자동화 종료
      // await ipcRenderer.invoke('close-automation')
      setLoading(false)
    }
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

  const rowSelection: TableRowSelection<ProductData> = {
    type: 'radio',
    selectedRowKeys: selectedKey ? [selectedKey] : [],
    onChange: (selectedRowKeys) => {
      setSelectedKey(selectedRowKeys[0] || null)
    },
    getCheckboxProps: (record) => ({
      disabled: loading,
    }),
  }

  const downloadSampleExcel = () => {
    const excelFilePath = path.join(__dirname, '../../files/상품등록_형식포함_예시양식.xlsx')
    ipcRenderer.invoke('download-file', excelFilePath)
    message.success('엑셀 파일 다운로드가 시작되었습니다.')
  }

  return (
    <Card
      title="상품 등록"
      extra={
        <Space>
          <Button
            icon={<ReloadOutlined/>}
            onClick={loadExcelData}
            loading={loading}
          >
            새로고침
          </Button>
          <Button
            type="primary"
            icon={<UploadOutlined/>}
            onClick={handleUpload}
            loading={loading}
            disabled={selectedKey === null}
          >
            선택 상품 등록
          </Button>
          <Button
            type="primary"
            icon={<DownloadOutlined/>}
            onClick={downloadSampleExcel}
          >
            엑셀 예시 다운로드
          </Button>
        </Space>
      }
    >
      <Table
        columns={columns}
        dataSource={data}
        rowSelection={rowSelection}
        loading={loading}
      />
    </Card>
  )
}

export default Upload
