import React, { useEffect } from 'react'
import { Alert, Button, Card, Collapse, DatePicker, Input, InputNumber, Radio, Select, Space } from 'antd'
import { useRecoilState } from 'recoil'
import { useLog } from '../hooks/useLog'
import { usePricing } from '../hooks/usePricing'
import { managementVideoCollapsedState, REGISTRATION_STATUS_LABELS } from '../stores/managementStore'
import { ROUNDING_BASE_OPTIONS, ROUNDING_MODE_OPTIONS } from '../stores/pricingStore'
import dayjs from 'dayjs'
import 'dayjs/locale/ko'
import koKR from 'antd/es/date-picker/locale/ko_KR'

dayjs.locale('ko')

const { RangePicker } = DatePicker

const Pricing: React.FC = () => {
  const { logs, clearLogs } = useLog()
  const {
    settings,
    permission,
    checkPermission,
    updatePricing,
    updateDateRange,
    updateStatusDateRange,
    updateRegistrationStatus,
    updateSearchQuery,
    updatePriceChangePercent,
    updateRoundingBase,
    updateRoundingMode,
  } = usePricing()
  const [videoCollapsed, setVideoCollapsed] = useRecoilState(managementVideoCollapsedState)

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
              현재 계정으로는 상품가격수정 기능이 제한됩니다. 관리자에게 문의하세요.
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

      <Collapse
        activeKey={videoCollapsed ? [] : ['video']}
        onChange={keys => setVideoCollapsed(!keys.includes('video'))}
        items={[
          {
            key: 'video',
            label: '사용 방법',
            children: (
              <div
                style={{
                  position: 'relative',
                  paddingBottom: '56.25%',
                  height: 0,
                  overflow: 'hidden',
                  maxWidth: '100%',
                  borderRadius: '8px',
                }}
              >
                <iframe
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    border: 0,
                  }}
                  src="https://www.youtube.com/embed/dkLT_swmnio?si=E_gLnmW52ClwwpbT"
                  title="상품가격수정 사용 방법"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              </div>
            ),
          },
        ]}
      />

      <Card
        title="상품가격수정"
        style={{ marginBottom: '20px', opacity: permission.hasPermission === false ? 0.5 : 1 }}
        bordered={false}
      >
        <Space direction="vertical" size="middle">
          <Space>
            <label>판매관리일 범위:</label>
            <RangePicker
              value={settings.dateRange ?? null}
              onChange={dates => updateDateRange((dates as [any, any]) ?? null)}
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
              allowClear
            />
          </Space>
          <Space>
            <label>상태일자 범위:</label>
            <RangePicker
              value={settings.statusDateRange}
              onChange={dates => updateStatusDateRange(dates as [any, any] | null)}
              disabled={permission.hasPermission === false}
              format="YYYY-MM-DD"
              locale={koKR}
              placeholder={['시작일', '종료일']}
              allowClear
              style={{ width: 300 }}
            />
            <span style={{ fontSize: '12px', color: '#888' }}>(선택 시 검색 결과에서 해당 기간만 필터)</span>
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
          <Space>
            <label>금액변경 %:</label>
            <InputNumber
              value={settings.priceChangePercent}
              onChange={value => updatePriceChangePercent(Number(value || 0))}
              min={-10}
              max={10}
              step={0.1}
              style={{ width: 100 }}
              disabled={permission.hasPermission === false}
            />
            <span style={{ fontSize: '12px', color: '#888' }}>(-10% ~ 10% 제한)</span>
          </Space>
          <Space>
            <label>올림기준:</label>
            <Select
              value={settings.roundingBase}
              onChange={updateRoundingBase}
              options={ROUNDING_BASE_OPTIONS}
              style={{ width: 100 }}
              disabled={permission.hasPermission === false}
            />
            <label style={{ marginLeft: 8 }}>올림/내림:</label>
            <Select
              value={settings.roundingMode}
              onChange={updateRoundingMode}
              options={ROUNDING_MODE_OPTIONS}
              style={{ width: 90 }}
              disabled={permission.hasPermission === false}
            />
          </Space>
          <div
            style={{
              fontSize: '13px',
              color: '#555',
              lineHeight: 1.6,
              padding: '12px 16px',
              backgroundColor: '#fafafa',
              borderRadius: '8px',
              border: '1px solid #f0f0f0',
              marginBottom: '16px',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: '8px', color: '#333' }}>가격 수정 안내</div>
            <ul style={{ margin: 0, paddingLeft: '20px' }}>
              <li>검색된 상품의 제시금액을 설정한 %만큼 변경합니다.</li>
              <li>등록후 3개월 이내 상품만 수정 가능합니다.</li>
              <li>등록후 3개월 이상 지난 상품은 최대 10%까지 1회만 수정할 수 있습니다.</li>
            </ul>
          </div>
          <Button
            type="primary"
            onClick={updatePricing}
            disabled={permission.hasPermission === false || settings.loading}
            loading={settings.loading}
          >
            가격 수정
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

export default Pricing
