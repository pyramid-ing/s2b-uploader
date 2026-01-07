import React, { useEffect } from 'react'
import { Card, Descriptions, Alert } from 'antd'
import { usePermission } from '../hooks/usePermission'

const License: React.FC = () => {
  const { permission, checkPermission } = usePermission()

  useEffect(() => {
    checkPermission()
  }, [checkPermission])

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '정보 없음'
    return new Date(dateString).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  return (
    <Card title="라이센스">
      {permission.isLoading ? (
        <Card loading={true} />
      ) : permission.accountInfo ? (
        <>
          {permission.hasPermission === false && (
            <Alert
              message="계정 인증 실패"
              description="현재 계정으로는 기능이 제한됩니다. 관리자에게 문의하세요."
              type="warning"
              showIcon
              style={{ marginBottom: '20px' }}
            />
          )}
          <Descriptions bordered column={1}>
            <Descriptions.Item label="플랜">{permission.accountInfo.planType || '정보 없음'}</Descriptions.Item>
            <Descriptions.Item label="사용 시작일">{formatDate(permission.accountInfo.periodStart)}</Descriptions.Item>
            <Descriptions.Item label="만료일">
              <span
                style={{
                  color:
                    permission.accountInfo.periodEnd && new Date(permission.accountInfo.periodEnd) < new Date()
                      ? '#ff4d4f'
                      : 'inherit',
                  fontWeight: 'bold',
                }}
              >
                {formatDate(permission.accountInfo.periodEnd)}
              </span>
            </Descriptions.Item>
            <Descriptions.Item label="계정 상태">{permission.accountInfo.status || '정보 없음'}</Descriptions.Item>
          </Descriptions>
        </>
      ) : (
        <Alert
          message="계정 정보를 불러올 수 없습니다"
          description="로그인 정보를 확인하고 다시 시도해주세요."
          type="error"
          showIcon
        />
      )}
    </Card>
  )
}

export default License
