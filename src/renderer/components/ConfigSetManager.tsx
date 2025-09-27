import React, { useState, useEffect } from 'react'
import {
  Card,
  Button,
  Table,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Switch,
  Space,
  message,
  Popconfirm,
  Upload,
  Divider,
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, DownloadOutlined, UploadOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useRecoilState, useRecoilCallback } from 'recoil'
import { sourcingConfigSetsState, activeConfigSetIdState, SourcingConfigSet } from '../stores/sourcingStore'

const { TextArea } = Input
const { Option } = Select

// 납품가능기간 옵션
const DELIVERY_PERIOD_OPTIONS = [
  { value: 'ZD000001', label: '3일' },
  { value: 'ZD000002', label: '5일' },
  { value: 'ZD000003', label: '7일' },
  { value: 'ZD000004', label: '15일' },
  { value: 'ZD000005', label: '30일' },
  { value: 'ZD000006', label: '45일' },
]

// 견적 유효기간 옵션
const QUOTE_VALIDITY_OPTIONS = [
  { value: 'ZD000001', label: '7일' },
  { value: 'ZD000002', label: '10일' },
  { value: 'ZD000003', label: '15일' },
  { value: 'ZD000004', label: '30일' },
]

const ConfigSetManager: React.FC = () => {
  const [configSets, setConfigSets] = useRecoilState(sourcingConfigSetsState)
  const [activeConfigSetId, setActiveConfigSetId] = useRecoilState(activeConfigSetIdState)
  const [isModalVisible, setIsModalVisible] = useState(false)
  const [editingConfigSet, setEditingConfigSet] = useState<SourcingConfigSet | null>(null)
  const [form] = Form.useForm()

  // 설정값 세트 불러오기
  const loadConfigSets = useRecoilCallback(
    ({ set }) =>
      async () => {
        try {
          const { ipcRenderer } = window.require('electron')
          const result = await ipcRenderer.invoke('get-config-sets')

          if (result.configSets && result.configSets.length > 0) {
            set(sourcingConfigSetsState, result.configSets)
            set(activeConfigSetIdState, result.activeConfigSetId)
          } else {
            // 저장된 설정값 세트가 없으면 기본 설정값 세트 생성
            await initializeDefaultConfigSet()
          }
        } catch (error) {
          console.error('설정값 세트 불러오기 실패:', error)
          // 오류 발생 시 기본 설정값 세트 생성
          await initializeDefaultConfigSet()
        }
      },
    [],
  )

  // 설정값 세트 저장하기
  const saveConfigSets = useRecoilCallback(
    ({ snapshot }) =>
      async () => {
        try {
          const configSets = await snapshot.getPromise(sourcingConfigSetsState)
          const activeConfigSetId = await snapshot.getPromise(activeConfigSetIdState)

          const { ipcRenderer } = window.require('electron')
          await ipcRenderer.invoke('save-config-sets', { configSets, activeConfigSetId })
        } catch (error) {
          console.error('설정값 세트 저장 실패:', error)
          message.error('설정값 세트 저장에 실패했습니다.')
        }
      },
    [],
  )

  // 기본 설정값 세트 초기화
  const initializeDefaultConfigSet = useRecoilCallback(
    ({ set }) =>
      async () => {
        const defaultConfigSet: SourcingConfigSet = {
          id: 'default',
          name: '기본 설정',
          isDefault: true,
          isActive: true,
          config: {
            deliveryPeriod: 'ZD000001', // 납품가능기간 3일
            quoteValidityPeriod: 'ZD000001', // 견적서 유효기간 7일
            shippingFeeType: 'fixed', // 고정배송비
            shippingFee: 3000, // 배송비 3000원
            returnShippingFee: 3000, // 반품배송비 3000원
            bundleShipping: true, // 묶음배송여부 true
            jejuShipping: true, // 제주배송여부 true
            jejuAdditionalFee: 5000, // 제주추가배송비 5000원
            detailHtmlTemplate: '<p>상세설명을 입력하세요.</p>',
            marginRate: 20, // 마진율 20%
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }

        set(sourcingConfigSetsState, [defaultConfigSet])
        set(activeConfigSetIdState, 'default')

        // 기본 설정값 세트를 영구 저장
        try {
          const { ipcRenderer } = window.require('electron')
          await ipcRenderer.invoke('save-config-sets', {
            configSets: [defaultConfigSet],
            activeConfigSetId: 'default',
          })
        } catch (error) {
          console.error('기본 설정값 세트 저장 실패:', error)
        }
      },
    [],
  )

  // 컴포넌트 마운트 시 설정값 세트 불러오기
  useEffect(() => {
    loadConfigSets()
  }, [loadConfigSets])

  const columns: ColumnsType<SourcingConfigSet> = [
    {
      title: '이름',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '납품가능기간',
      key: 'deliveryPeriod',
      render: (_, record) => {
        const option = DELIVERY_PERIOD_OPTIONS.find(opt => opt.value === record.config.deliveryPeriod)
        return option ? option.label : record.config.deliveryPeriod
      },
    },
    {
      title: '견적서 유효기간',
      key: 'quoteValidityPeriod',
      render: (_, record) => {
        const option = QUOTE_VALIDITY_OPTIONS.find(opt => opt.value === record.config.quoteValidityPeriod)
        return option ? option.label : record.config.quoteValidityPeriod
      },
    },
    {
      title: '배송비종류',
      key: 'shippingFeeType',
      render: (_, record) => {
        const typeMap = {
          free: '무료',
          fixed: '유료',
          conditional: '조건부무료',
        }
        return typeMap[record.config.shippingFeeType]
      },
    },
    {
      title: '배송비',
      key: 'shippingFee',
      render: (_, record) => `${record.config.shippingFee.toLocaleString()}원`,
    },
    {
      title: '묶음배송',
      key: 'bundleShipping',
      render: (_, record) => (record.config.bundleShipping ? '가능' : '불가능'),
    },
    {
      title: '제주배송',
      key: 'jejuShipping',
      render: (_, record) => (record.config.jejuShipping ? '가능' : '불가능'),
    },
    {
      title: '상태',
      key: 'status',
      render: (_, record) => (
        <Button
          type={record.isActive ? 'primary' : 'default'}
          size="small"
          onClick={() => handleActivate(record.id)}
          disabled={record.isActive}
        >
          {record.isActive ? '✓ 활성' : '사용하기'}
        </Button>
      ),
    },
    {
      title: '액션',
      key: 'action',
      render: (_, record) => (
        <Space>
          <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            수정
          </Button>
          <Popconfirm
            title="정말 삭제하시겠습니까?"
            onConfirm={() => handleDelete(record.id)}
            disabled={record.isDefault}
          >
            <Button type="link" danger icon={<DeleteOutlined />} disabled={record.isDefault}>
              삭제
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const handleAdd = () => {
    setEditingConfigSet(null)
    form.resetFields()
    setIsModalVisible(true)
  }

  const handleEdit = (configSet: SourcingConfigSet) => {
    setEditingConfigSet(configSet)
    form.setFieldsValue({
      name: configSet.name,
      deliveryPeriod: configSet.config.deliveryPeriod,
      quoteValidityPeriod: configSet.config.quoteValidityPeriod,
      shippingFeeType: configSet.config.shippingFeeType,
      shippingFee: configSet.config.shippingFee,
      returnShippingFee: configSet.config.returnShippingFee,
      bundleShipping: configSet.config.bundleShipping,
      jejuShipping: configSet.config.jejuShipping,
      jejuAdditionalFee: configSet.config.jejuAdditionalFee,
      marginRate: configSet.config.marginRate,
      detailHtmlTemplate: configSet.config.detailHtmlTemplate,
    })
    setIsModalVisible(true)
  }

  const handleActivate = async (id: string) => {
    setConfigSets(prev =>
      prev.map(configSet => ({
        ...configSet,
        isActive: configSet.id === id,
      })),
    )
    setActiveConfigSetId(id)
    await saveConfigSets()
    message.success('설정값 세트가 적용되었습니다.')
  }

  const handleDelete = async (id: string) => {
    setConfigSets(prev => prev.filter(configSet => configSet.id !== id))
    if (activeConfigSetId === id) {
      const remainingConfigSets = configSets.filter(configSet => configSet.id !== id)
      if (remainingConfigSets.length > 0) {
        const firstConfigSet = remainingConfigSets[0]
        setActiveConfigSetId(firstConfigSet.id)
        setConfigSets(prev =>
          prev.map(configSet => ({
            ...configSet,
            isActive: configSet.id === firstConfigSet.id,
          })),
        )
      } else {
        setActiveConfigSetId(null)
      }
    }
    await saveConfigSets()
    message.success('설정값 세트가 삭제되었습니다.')
  }

  const handleModalOk = async () => {
    form.validateFields().then(async values => {
      const now = new Date().toISOString()
      const newConfigSet: SourcingConfigSet = {
        id: editingConfigSet?.id || `config_${Date.now()}`,
        name: values.name,
        isDefault: editingConfigSet?.isDefault || false,
        isActive: editingConfigSet?.isActive || false,
        config: {
          deliveryPeriod: values.deliveryPeriod,
          quoteValidityPeriod: values.quoteValidityPeriod,
          shippingFeeType: values.shippingFeeType,
          shippingFee: values.shippingFee,
          returnShippingFee: values.returnShippingFee,
          bundleShipping: values.bundleShipping,
          jejuShipping: values.jejuShipping,
          jejuAdditionalFee: values.jejuAdditionalFee,
          detailHtmlTemplate: values.detailHtmlTemplate,
          marginRate: values.marginRate || 20,
        },
        createdAt: editingConfigSet?.createdAt || now,
        updatedAt: now,
      }

      if (editingConfigSet) {
        setConfigSets(prev => prev.map(configSet => (configSet.id === editingConfigSet.id ? newConfigSet : configSet)))
        message.success('설정값 세트가 수정되었습니다.')
      } else {
        setConfigSets(prev => [...prev, newConfigSet])
        message.success('설정값 세트가 추가되었습니다.')
      }

      await saveConfigSets()
      setIsModalVisible(false)
      form.resetFields()
    })
  }

  const handleModalCancel = () => {
    setIsModalVisible(false)
    form.resetFields()
  }

  const handleDownloadExcel = () => {
    const activeConfigSet = configSets.find(cs => cs.isActive)
    if (!activeConfigSet) {
      message.warning('활성화된 설정값 세트가 없습니다.')
      return
    }

    // 엑셀 다운로드 로직 (실제 구현은 electron에서 처리)
    const { ipcRenderer } = window.require('electron')
    ipcRenderer.invoke('download-config-set-excel', activeConfigSet)
  }

  const handleUploadExcel = async (file: File) => {
    const { ipcRenderer } = window.require('electron')
    try {
      // File 객체에서 경로를 직접 가져올 수 없으므로, 파일을 읽어서 전달
      const arrayBuffer = await file.arrayBuffer()
      const result = await ipcRenderer.invoke('upload-config-set-excel', arrayBuffer)
      if (result.success) {
        setConfigSets(prev => [...prev, ...result.configSets])
        await saveConfigSets()
        message.success('설정값 세트가 업로드되었습니다.')
      } else {
        message.error(`업로드 실패: ${result.error}`)
      }
    } catch (error) {
      message.error(`업로드 중 오류가 발생했습니다: ${error.message}`)
    }
    return false // 파일 업로드 방지
  }

  return (
    <Card title="설정값 세트 관리">
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          새 설정값 세트 추가
        </Button>
        <Button icon={<DownloadOutlined />} onClick={handleDownloadExcel}>
          엑셀 다운로드
        </Button>
        <Upload beforeUpload={handleUploadExcel} showUploadList={false}>
          <Button icon={<UploadOutlined />}>엑셀 업로드</Button>
        </Upload>
      </Space>

      <Table columns={columns} dataSource={configSets} rowKey="id" pagination={false} size="small" />

      <Modal
        title={editingConfigSet ? '설정값 세트 수정' : '새 설정값 세트 추가'}
        open={isModalVisible}
        onOk={handleModalOk}
        onCancel={handleModalCancel}
        width={800}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="설정값 세트 이름" rules={[{ required: true, message: '이름을 입력하세요.' }]}>
            <Input placeholder="설정값 세트 이름을 입력하세요" />
          </Form.Item>

          <Divider>배송 설정</Divider>

          <Form.Item
            name="deliveryPeriod"
            label="납품가능기간"
            rules={[{ required: true, message: '납품가능기간을 선택하세요.' }]}
          >
            <Select placeholder="납품가능기간을 선택하세요" style={{ width: '100%' }}>
              {DELIVERY_PERIOD_OPTIONS.map(option => (
                <Option key={option.value} value={option.value}>
                  {option.label}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="quoteValidityPeriod"
            label="견적서 유효기간"
            rules={[{ required: true, message: '견적서 유효기간을 선택하세요.' }]}
            initialValue="ZD000001"
          >
            <Select placeholder="견적서 유효기간을 선택하세요" style={{ width: '100%' }}>
              {QUOTE_VALIDITY_OPTIONS.map(option => (
                <Option key={option.value} value={option.value}>
                  {option.label}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="shippingFeeType"
            label="배송비종류"
            rules={[{ required: true, message: '배송비종류를 선택하세요.' }]}
            initialValue="fixed"
          >
            <Select>
              <Option value="free">무료</Option>
              <Option value="fixed">유료</Option>
              <Option value="conditional">조건부무료</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="shippingFee"
            label="배송비 (원)"
            rules={[{ required: true, message: '배송비를 입력하세요.' }]}
            initialValue={3000}
          >
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="returnShippingFee"
            label="반품배송비 (원)"
            rules={[{ required: true, message: '반품배송비를 입력하세요.' }]}
            initialValue={3000}
          >
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item name="bundleShipping" label="묶음배송여부" valuePropName="checked" initialValue={true}>
            <Switch />
          </Form.Item>

          <Form.Item name="jejuShipping" label="제주배송여부" valuePropName="checked" initialValue={true}>
            <Switch />
          </Form.Item>

          <Form.Item
            name="jejuAdditionalFee"
            label="제주추가배송비 (원)"
            rules={[{ required: true, message: '제주추가배송비를 입력하세요.' }]}
            initialValue={5000}
          >
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="marginRate"
            label="마진율 (%)"
            rules={[{ required: true, message: '마진율을 입력하세요.' }]}
            initialValue={20}
          >
            <InputNumber min={0} max={100} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="detailHtmlTemplate"
            label="상세설명 HTML"
            rules={[
              { required: true, message: '상세설명 HTML을 입력하세요.' },
              { min: 10, message: '상세설명 HTML은 10자 이상 입력해야 합니다.' },
            ]}
          >
            <TextArea rows={4} placeholder="상세설명 HTML을 입력하세요..." />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  )
}

export default ConfigSetManager
