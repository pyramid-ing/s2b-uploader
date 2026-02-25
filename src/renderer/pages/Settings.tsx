import React, { useEffect, useMemo, useState } from 'react'
import { Button, Card, Divider, Form, Input, message, Space, Switch, Select, Radio } from 'antd'
import { FolderOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons'

const { ipcRenderer } = window.require('electron')

const VALID_DELIVERY_AREAS = [
  '강원',
  '경기',
  '경남',
  '경북',
  '광주',
  '대구',
  '대전',
  '부산',
  '서울',
  '울산',
  '인천',
  '전남',
  '전북',
  '제주',
  '충남',
  '충북',
  '세종',
] as const

type DeliveryAreaPresetMode = 'nationwide' | 'custom'

interface AccountFormItem {
  id: string
  name?: string
  loginId: string
  loginPw: string
  lastRegisteredIp?: string
  deliveryAreaPresetMode: DeliveryAreaPresetMode
  deliveryAreas: string[]
}

interface SettingsForm {
  fileDir: string
  accounts: AccountFormItem[]
  activeAccountId?: string
  registrationDelayMin: number
  registrationDelayMax: number
  imageOptimize: boolean
  headless: boolean
}

const createEmptyAccount = (): AccountFormItem => ({
  id: `account-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  name: '',
  loginId: '',
  loginPw: '',
  lastRegisteredIp: '',
  deliveryAreaPresetMode: 'nationwide',
  deliveryAreas: [],
})

const normalizeAccounts = (accounts?: Partial<AccountFormItem>[]): AccountFormItem[] => {
  const raw = Array.isArray(accounts) ? accounts : []
  return raw.map(account => {
    const mode: DeliveryAreaPresetMode =
      account.deliveryAreaPresetMode === 'custom' &&
      Array.isArray(account.deliveryAreas) &&
      account.deliveryAreas.length > 0
        ? 'custom'
        : 'nationwide'
    return {
      id: account.id || createEmptyAccount().id,
      name: typeof account.name === 'string' ? account.name : '',
      loginId: typeof account.loginId === 'string' ? account.loginId : '',
      loginPw: typeof account.loginPw === 'string' ? account.loginPw : '',
      lastRegisteredIp: typeof account.lastRegisteredIp === 'string' ? account.lastRegisteredIp : '',
      deliveryAreaPresetMode: mode,
      deliveryAreas:
        mode === 'custom'
          ? (account.deliveryAreas || []).filter((area): area is string =>
              VALID_DELIVERY_AREAS.includes(area as (typeof VALID_DELIVERY_AREAS)[number]),
            )
          : [],
    }
  })
}

const Settings: React.FC = () => {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const watchedAccounts = Form.useWatch('accounts', form) as AccountFormItem[] | undefined

  const accountOptions = useMemo(
    () =>
      (watchedAccounts || [])
        .filter(account => !!account?.id)
        .map((account, index) => ({
          label: account.name?.trim() || account.loginId?.trim() || `계정 ${index + 1}`,
          value: account.id!,
        })),
    [watchedAccounts],
  )

  useEffect(() => {
    loadSettings().finally(() => setInitialLoading(false))
  }, [])

  const loadSettings = async () => {
    try {
      const settings = await ipcRenderer.invoke('get-settings')
      if (settings) {
        const legacyDelay = Number(settings.registrationDelay)
        const rawMin = Number(settings.registrationDelayMin)
        const rawMax = Number(settings.registrationDelayMax)
        const fallbackDelay = Number.isFinite(legacyDelay) ? legacyDelay : 0
        const registrationDelayMin = Number.isFinite(rawMin) ? rawMin : fallbackDelay
        const registrationDelayMax = Number.isFinite(rawMax) ? rawMax : fallbackDelay
        const normalizedAccounts = normalizeAccounts(settings.accounts)

        form.setFieldsValue({
          ...settings,
          accounts: normalizedAccounts,
          activeAccountId:
            normalizedAccounts.find((account: AccountFormItem) => account.id === settings.activeAccountId)?.id ||
            normalizedAccounts[0]?.id ||
            undefined,
          registrationDelayMin,
          registrationDelayMax,
        })
        console.log('Settings loaded successfully:', settings)
      }
    } catch (error) {
      console.error('Failed to load settings:', error)
      message.error({
        content: '설정을 불러오는데 실패했습니다.',
        key: 'settings-error',
        duration: 3,
      })
    }
  }

  const handleSelectDirectory = async () => {
    try {
      let dirPath = await ipcRenderer.invoke('select-directory')
      if (dirPath) {
        dirPath = decodeURIComponent(encodeURIComponent(dirPath))
        form.setFieldValue('fileDir', dirPath)
        console.log('Selected file directory:', dirPath)
      }
    } catch (error) {
      console.error('Failed to select directory:', error)
      message.error('디렉토리 선택에 실패했습니다.')
    }
  }

  const handleSubmit = async (values: SettingsForm) => {
    try {
      setLoading(true)

      const normalizedAccounts = normalizeAccounts(values.accounts).filter(
        account => account.loginId.trim() && account.loginPw,
      )
      const activeAccountId =
        normalizedAccounts.find(account => account.id === values.activeAccountId)?.id || normalizedAccounts[0]?.id || ''

      await ipcRenderer.invoke('save-settings', {
        ...values,
        accounts: normalizedAccounts,
        activeAccountId,
      })

      form.setFieldValue('activeAccountId', activeAccountId || undefined)

      message.success({
        content: '설정이 저장되었습니다.',
        key: 'settings-success',
        duration: 2,
      })
      console.log('Settings saved successfully:', values)
    } catch (error) {
      console.error('Failed to save settings:', error)
      message.error({
        content: '설정 저장에 실패했습니다.',
        key: 'settings-error',
        duration: 3,
      })
    } finally {
      setLoading(false)
    }
  }

  if (initialLoading) {
    return <Card loading={true} />
  }

  return (
    <Card title="설정">
      <Form form={form} layout="vertical" onFinish={handleSubmit} autoComplete="off" disabled={loading}>
        <Form.Item
          label="파일 폴더 경로"
          name="fileDir"
          rules={[{ required: true, message: '파일 폴더를 선택해주세요' }]}
        >
          <Input
            readOnly
            addonAfter={
              <Button type="text" icon={<FolderOutlined />} onClick={handleSelectDirectory} disabled={loading}>
                선택
              </Button>
            }
          />
        </Form.Item>

        <Divider type="horizontal" />

        <Form.List name="accounts">
          {(fields, { add, remove }) => (
            <>
              <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontWeight: 600 }}>S2B 계정 Preset</div>
                <Button
                  type="dashed"
                  icon={<PlusOutlined />}
                  onClick={() => add(createEmptyAccount())}
                  disabled={loading}
                  size="small"
                >
                  계정 추가
                </Button>
              </Space>

              {fields.length === 0 && (
                <div style={{ marginBottom: 12, color: '#888' }}>
                  계정을 추가하면 아이디/비밀번호와 배송가능 지역 preset을 계정별로 저장할 수 있습니다.
                </div>
              )}

              {fields.map((field, index) => {
                const account = (watchedAccounts || [])[field.name]
                const mode = account?.deliveryAreaPresetMode || 'nationwide'

                return (
                  <Card
                    key={field.key}
                    size="small"
                    style={{ marginBottom: 12 }}
                    title={account?.name?.trim() || account?.loginId?.trim() || `계정 ${index + 1}`}
                    extra={
                      <Button
                        danger
                        type="text"
                        icon={<DeleteOutlined />}
                        onClick={() => {
                          const removingId = (form.getFieldValue(['accounts', field.name, 'id']) as string) || ''
                          remove(field.name)
                          const currentActiveId = form.getFieldValue('activeAccountId')
                          if (currentActiveId && currentActiveId === removingId) {
                            const nextAccounts = (form.getFieldValue('accounts') || []) as AccountFormItem[]
                            form.setFieldValue('activeAccountId', nextAccounts[0]?.id)
                          }
                        }}
                        disabled={loading}
                      >
                        삭제
                      </Button>
                    }
                  >
                    <Form.Item name={[field.name, 'id']} hidden>
                      <Input />
                    </Form.Item>

                    <Form.Item label="계정명 (선택)" name={[field.name, 'name']}>
                      <Input placeholder="예: 서울권 계정" />
                    </Form.Item>

                    <Form.Item
                      label="로그인 아이디"
                      name={[field.name, 'loginId']}
                      rules={[{ required: true, message: '아이디를 입력해주세요' }]}
                    >
                      <Input />
                    </Form.Item>

                    <Form.Item
                      label="비밀번호"
                      name={[field.name, 'loginPw']}
                      rules={[{ required: true, message: '비밀번호를 입력해주세요' }]}
                    >
                      <Input.Password />
                    </Form.Item>

                    <Form.Item
                      label="배송가능 지역 preset"
                      name={[field.name, 'deliveryAreaPresetMode']}
                      initialValue="nationwide"
                    >
                      <Radio.Group
                        options={[
                          { label: '전국', value: 'nationwide' },
                          { label: '지역선택', value: 'custom' },
                        ]}
                        optionType="button"
                        buttonStyle="solid"
                      />
                    </Form.Item>

                    {mode === 'custom' && (
                      <Form.Item
                        label="배송가능 지역 설정"
                        name={[field.name, 'deliveryAreas']}
                        rules={[{ required: true, message: '배송가능 지역을 1개 이상 선택해주세요' }]}
                      >
                        <Select
                          mode="multiple"
                          allowClear
                          placeholder="배송가능 지역 선택"
                          options={VALID_DELIVERY_AREAS.map(area => ({ label: area, value: area }))}
                        />
                      </Form.Item>
                    )}
                  </Card>
                )
              })}
            </>
          )}
        </Form.List>

        <Form.Item
          label="기본 사용 계정"
          name="activeAccountId"
          tooltip="관리/가격/소싱 등 다른 기능에서 기본으로 사용할 계정입니다."
        >
          <Select allowClear placeholder="기본 계정 선택" options={accountOptions} />
        </Form.Item>

        <Divider type="horizontal" />

        <Form.Item label="상품 등록 간격 (초)" tooltip="각 상품 등록 사이의 대기 시간(최소~최대)을 설정합니다.">
          <Space align="start">
            <Form.Item name="registrationDelayMin" initialValue={0} noStyle>
              <Input type="number" min={0} addonAfter="초" placeholder="최소" />
            </Form.Item>
            <span>~</span>
            <Form.Item name="registrationDelayMax" initialValue={0} noStyle>
              <Input type="number" min={0} addonAfter="초" placeholder="최대" />
            </Form.Item>
          </Space>
        </Form.Item>

        <Divider type="horizontal" />

        <Form.Item
          label="이미지 최적화"
          name="imageOptimize"
          valuePropName="checked"
          initialValue={false}
          tooltip="이미지 업로드 시 최적화를 진행합니다."
        >
          <Switch />
        </Form.Item>

        <Form.Item
          label="브라우저 숨김"
          name="headless"
          valuePropName="checked"
          initialValue={false}
          tooltip="브라우저 숨김 여부를 선택합니다."
        >
          <Switch />
        </Form.Item>

        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading}>
            저장
          </Button>
        </Form.Item>
      </Form>
    </Card>
  )
}

export default Settings
