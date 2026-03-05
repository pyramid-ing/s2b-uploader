import React, { useEffect, useState } from 'react'
import { Modal, Form, Input, Divider, Tabs, Select, Radio, Row, Col, Button, Image, Card, Cascader } from 'antd'
import { FolderOpenOutlined, LinkOutlined } from '@ant-design/icons'
import { ProductData } from '../stores/registerStore'
import { buildCategoryTree, CATEGORY_STORAGE_KEY, DEFAULT_CATEGORY_EXCEL_PATH } from '../constants/categories'

const { ipcRenderer } = window.require('electron')

interface EditProductModalProps {
  visible: boolean
  product: ProductData | null
  onSave: (key: string, updatedData: Partial<ProductData>) => void
  onCancel: () => void
}

/**
 * ExcelRegistrationData와 동일한 필드명을 사용하는 모달 폼
 * readExcelFile 매핑 결과와 동일한 구조로 데이터를 저장합니다.
 */

const TAXABLE_OPTIONS = [
  { label: '과세(세금계산서)', value: '과세(세금계산서)' },
  { label: '면세', value: '면세' },
]

const SALE_TYPE_OPTIONS = [
  { label: '물품', value: '물품' },
  { label: '용역', value: '용역' },
]

const SHIPPING_FEE_TYPE_OPTIONS = [
  { label: '무료', value: '무료' },
  { label: '유료', value: '유료' },
  { label: '조건부무료', value: '조건부무료' },
]

const SHIPPING_METHOD_OPTIONS = [
  { label: '택배', value: '택배' },
  { label: '직배송', value: '직배송' },
  { label: '우편 또는 등기', value: '우편 또는 등기' },
]

const YN_OPTIONS = [
  { label: '예', value: 'Y' },
  { label: '아니오', value: 'N' },
]

const SHIPPING_AREA_OPTIONS = [
  { label: '전국', value: '전국' },
  { label: '서울', value: '서울' },
  { label: '경기', value: '경기' },
  { label: '인천', value: '인천' },
  { label: '강원', value: '강원' },
  { label: '충북', value: '충북' },
  { label: '충남', value: '충남' },
  { label: '대전', value: '대전' },
  { label: '세종', value: '세종' },
  { label: '전북', value: '전북' },
  { label: '전남', value: '전남' },
  { label: '광주', value: '광주' },
  { label: '경북', value: '경북' },
  { label: '경남', value: '경남' },
  { label: '대구', value: '대구' },
  { label: '부산', value: '부산' },
  { label: '울산', value: '울산' },
  { label: '제주', value: '제주' },
]

const ORIGIN_OPTIONS = [
  {
    label: '국내',
    value: '국내',
    children: SHIPPING_AREA_OPTIONS.filter(o => o.value !== '전국'),
  },
  {
    label: '국외',
    value: '국외',
    children: [
      { label: '중국', value: '중국' },
      { label: '미국', value: '미국' },
      { label: '일본', value: '일본' },
      { label: '독일', value: '독일' },
      { label: '베트남', value: '베트남' },
      { label: '기타', value: '기타' },
    ],
  },
]

const WARRANTY_OPTIONS = [
  { label: '1개월', value: '1개월' },
  { label: '3개월', value: '3개월' },
  { label: '6개월', value: '6개월' },
  { label: '1년', value: '1년' },
  { label: '2년', value: '2년' },
  { label: '3년', value: '3년' },
  { label: '5년', value: '5년' },
  { label: '소모성 자재 전용', value: '소모성 자재 전용' },
]

const DELIVERY_PERIOD_OPTIONS = [
  { label: '3일', value: '3일' },
  { label: '5일', value: '5일' },
  { label: '7일', value: '7일' },
  { label: '15일', value: '15일' },
  { label: '30일', value: '30일' },
  { label: '45일', value: '45일' },
]

const QUOTE_VALIDITY_OPTIONS = [
  { label: '7일', value: '7일' },
  { label: '10일', value: '10일' },
  { label: '15일', value: '15일' },
  { label: '30일', value: '30일' },
]

const KC_TYPE_OPTIONS = [
  { label: '인증번호', value: 'Y' },
  { label: '인증파일', value: 'F' },
  { label: '없음', value: 'N' },
]

const CONSUMPTION_PERIOD_OPTIONS = [
  { label: '제품에 별도 표시', value: '제품에 별도 표시' },
  { label: '제조일로부터 1년', value: '제조일로부터 1년' },
  { label: '상세설명에 별도표시', value: '상세설명에 별도표시' },
  { label: '제조일/가공일로부터 14일 이내 물품 발송', value: '제조일/가공일로부터 14일 이내 물품 발송' },
  { label: '직접입력', value: '직접입력' },
]

const CERT_FIELDS = [
  { name: 'womanCert', label: '여성기업' },
  { name: 'disabledCompanyCert', label: '장애인기업' },
  { name: 'foundationCert', label: '창업기업' },
  { name: 'disabledCert', label: '장애인표준사업장' },
  { name: 'severalCert', label: '중증장애인생산품' },
  { name: 'societyCert', label: '사회적협동조합' },
  { name: 'recycleCert', label: '우수재활용제품' },
  { name: 'environmentCert', label: '환경표지' },
  { name: 'lowCarbonCert', label: '저탄소제품' },
  { name: 'swQualityCert', label: 'SW품질인증' },
  { name: 'nepCert', label: '신제품인증(NEP)' },
  { name: 'netCert', label: '신제품인증(NET)' },
  { name: 'greenProductCert', label: '녹색기술인증제품' },
  { name: 'epcCert', label: '성능인증제품(EPC)' },
  { name: 'procureCert', label: '우수조달제품' },
  { name: 'seoulTownCert', label: '마을기업' },
  { name: 'seoulSelfCert', label: '자활기업' },
  { name: 'cooperationCert', label: '협동조합' },
  { name: 'seoulReserveCert', label: '예비사회적기업' },
  { name: 'seoulCollaborationCert', label: '사회적협동조합(서울)' },
]

const EditProductModal: React.FC<EditProductModalProps> = ({ visible, product, onSave, onCancel }) => {
  const [form] = Form.useForm()
  const [activeTab, setActiveTab] = useState('1')
  const [categories, setCategories] = useState<any[]>([])

  useEffect(() => {
    const loadCategories = async () => {
      try {
        // 1. LocalStorage에서 먼저 확인
        const stored = localStorage.getItem(CATEGORY_STORAGE_KEY)
        if (stored) {
          const parsed = JSON.parse(stored)
          if (Array.isArray(parsed) && parsed.length > 0) {
            setCategories(parsed)
            return
          }
        }

        // 2. LocalStorage에 없으면 기본 엑셀 경로에서 최초 로드 시도
        if (DEFAULT_CATEGORY_EXCEL_PATH) {
          const rawData = await ipcRenderer.invoke('read-excel-raw', DEFAULT_CATEGORY_EXCEL_PATH)
          if (rawData && Array.isArray(rawData) && rawData.length > 0) {
            const parsed = buildCategoryTree(rawData)
            setCategories(parsed)
            // LocalStorage에 저장하여 DB처럼 활용
            localStorage.setItem(CATEGORY_STORAGE_KEY, JSON.stringify(parsed))
          }
        }
      } catch (error) {
        console.error('Failed to load categories:', error)
      }
    }
    if (visible) {
      loadCategories()
    }
  }, [visible])

  /**
   * product.originalData → ExcelRegistrationData 필드명으로 폼 초기화
   * readExcelFile의 매핑 결과와 동일한 필드명을 사용
   */
  useEffect(() => {
    if (visible && product) {
      const d = product.originalData || {}

      // 카테고리 경로 조립
      const categoryPath = [d.category1 || '', d.category2 || '', d.category3 || ''].filter(Boolean)

      // 원산지 경로 조립
      const originPath =
        d.originType === '국내'
          ? ['국내', d.originLocal || '']
          : d.originType === '국외'
            ? ['국외', d.originForeign || '']
            : []

      // 배송지역: deliveryAreas(string[]) → Select용 배열
      const deliveryAreas = Array.isArray(d.deliveryAreas) ? d.deliveryAreas : []

      form.setFieldsValue({
        // === 기본 정보 (ExcelRegistrationData 필드명) ===
        categoryPath,
        saleTypeText: d.saleTypeText || '물품',
        goodsName: d.goodsName || '',
        spec: d.spec || '',
        modelName: d.modelName || '',
        estimateAmt: d.estimateAmt || '',
        factory: d.factory || '',
        material: d.material || '',
        remainQnt: d.remainQnt || '',
        salesUnit: d.salesUnit || '개',
        taxType: d.taxType || '과세(세금계산서)',

        // === 배송/납품 ===
        assure: d.assure || '1년',
        deliveryLimitText: d.deliveryLimitText || '7일',
        estimateValidity: d.estimateValidity || '30일',
        deliveryFeeKindText: d.deliveryFeeKindText || '무료',
        deliveryFee: d.deliveryFee || '',
        returnFee: d.returnFee || '',
        exchangeFee: d.exchangeFee || '',
        deliveryGroupYn: d.deliveryGroupYn || 'Y',
        jejuDeliveryYn: d.jejuDeliveryYn || 'N',
        jejuDeliveryFee: d.jejuDeliveryFee || '',
        deliveryMethod: d.deliveryMethod || '1',
        deliveryAreas,

        // === 이미지 ===
        image1: d.image1 || '',
        image2: d.image2 || '',
        addImage1: d.addImage1 || '',
        addImage2: d.addImage2 || '',
        detailImage: d.detailImage || '',
        detailHtml: d.detailHtml || '',

        // === 원산지/기술사양 ===
        originPath,
        g2bNumber: d.g2bNumber || '',
        selPower: d.selPower || '',
        selWeight: d.selWeight || '',
        selSameDate: d.selSameDate || '',
        selArea: d.selArea || '',
        selProduct: d.selProduct || '',
        selSafety: d.selSafety || '',
        selCapacity: d.selCapacity || '',
        selSpecification: d.selSpecification || '',

        // === 소비기한/하차확인 ===
        validateRadio: d.validateRadio || '',
        fValidate: d.fValidate || '',
        childExitCheckerKcType: d.childExitCheckerKcType || 'N',
        childExitCheckerKcCertId: d.childExitCheckerKcCertId || '',
        childExitCheckerKcFile: d.childExitCheckerKcFile || '',

        // === 안전확인/조달 ===
        safetyCheckKcType: d.safetyCheckKcType || 'N',
        safetyCheckKcCertId: d.safetyCheckKcCertId || '',
        safetyCheckKcFile: d.safetyCheckKcFile || '',
        ppsContractYn: d.ppsContractYn || 'N',
        ppsContractStartDate: d.ppsContractStartDate || '',
        ppsContractEndDate: d.ppsContractEndDate || '',

        // === 연락처 ===
        asTelephone1: d.asTelephone1 || '',
        asTelephone2: d.asTelephone2 || '',

        // === KC 인증 ===
        kidsKcType: d.kidsKcType || 'N',
        kidsKcCertId: d.kidsKcCertId || '',
        kidsKcFile: d.kidsKcFile || '',
        elecKcType: d.elecKcType || 'N',
        elecKcCertId: d.elecKcCertId || '',
        elecKcFile: d.elecKcFile || '',
        dailyKcType: d.dailyKcType || 'N',
        dailyKcCertId: d.dailyKcCertId || '',
        dailyKcFile: d.dailyKcFile || '',
        broadcastingKcType: d.broadcastingKcType || 'N',
        broadcastingKcCertId: d.broadcastingKcCertId || '',
        broadcastingKcFile: d.broadcastingKcFile || '',

        // === 기업 인증 ===
        womanCert: d.womanCert || 'N',
        disabledCompanyCert: d.disabledCompanyCert || 'N',
        foundationCert: d.foundationCert || 'N',
        disabledCert: d.disabledCert || 'N',
        severalCert: d.severalCert || 'N',
        cooperationCert: d.cooperationCert || 'N',
        societyCert: d.societyCert || 'N',
        recycleCert: d.recycleCert || 'N',
        environmentCert: d.environmentCert || 'N',
        lowCarbonCert: d.lowCarbonCert || 'N',
        swQualityCert: d.swQualityCert || 'N',
        nepCert: d.nepCert || 'N',
        netCert: d.netCert || 'N',
        greenProductCert: d.greenProductCert || 'N',
        epcCert: d.epcCert || 'N',
        procureCert: d.procureCert || 'N',
        seoulTownCert: d.seoulTownCert || 'N',
        seoulSelfCert: d.seoulSelfCert || 'N',
        seoulCollaborationCert: d.seoulCollaborationCert || 'N',
        seoulReserveCert: d.seoulReserveCert || 'N',

        // === 나라장터/타사이트/기타 ===
        naraRegisterYn: d.naraRegisterYn || 'N',
        naraAmt: d.naraAmt || '',
        siteName: d.siteName || '',
        siteUrl: d.siteUrl || '',
        otherSiteRegisterYn: d.otherSiteRegisterYn || 'N',
        otherSiteAmt: d.otherSiteAmt || '',
        approvalRequest: d.approvalRequest || '',

        // === 참고용 (소싱 원본) ===
        sourceUrl: d.sourceUrl || d.url || '',
      })
    }
  }, [visible, product, form])

  /**
   * 저장 시 폼 값 → ExcelRegistrationData 형태로 변환하여 onSave
   */
  const handleOk = async () => {
    try {
      const values = await form.validateFields()

      if (product) {
        // 카테고리 경로 → category1/2/3 분리
        if (Array.isArray(values.categoryPath)) {
          const [c1, c2, c3] = values.categoryPath
          values.category1 = c1 || ''
          values.category2 = c2 || ''
          values.category3 = c3 || ''
          delete values.categoryPath
        }

        // 원산지 경로 → originType/originLocal/originForeign 분리
        if (Array.isArray(values.originPath)) {
          const [type, value] = values.originPath
          values.originType = type || ''
          if (type === '국내') {
            values.originLocal = value || ''
            values.originForeign = ''
          } else if (type === '국외') {
            values.originForeign = value || ''
            values.originLocal = ''
          }
          delete values.originPath
        }

        // 배송지역: 전국 포함 시 전국만, 빈 배열이면 그대로
        if (Array.isArray(values.deliveryAreas)) {
          if (values.deliveryAreas.some((area: string) => area.includes('전국'))) {
            values.deliveryAreas = ['전국']
          }
        }

        // ExcelRegistrationData 형태 그대로 originalData에 저장
        const excelData = { ...values }

        onSave(product.key, {
          goodsName: excelData.goodsName,
          spec: excelData.spec,
          modelName: excelData.modelName,
          originalData: {
            ...product.originalData,
            ...excelData,
          },
        })
      }
      onCancel()
    } catch (error) {
      console.error('Validation failed:', error)
    }
  }

  const handleSelectFile = async (name: string) => {
    try {
      const result = await ipcRenderer.invoke('select-file')
      if (result) {
        form.setFieldValue(name, result)
      }
    } catch (error) {
      console.error('File selection failed:', error)
    }
  }

  const ImageInputWithPreview: React.FC<{ name: string; label: string }> = ({ name, label }) => {
    const value = Form.useWatch(name, form)
    return (
      <Card size="small" style={{ marginBottom: 16 }}>
        <Form.Item name={name} label={label}>
          <Input
            placeholder="URL 또는 파일 경로"
            addonAfter={
              <Button type="text" size="small" icon={<FolderOpenOutlined />} onClick={() => handleSelectFile(name)} />
            }
          />
        </Form.Item>
        {value && (
          <div style={{ textAlign: 'center', marginTop: 8 }}>
            <Image
              height={100}
              src={value.startsWith('http') ? value : `local-resource://${value}`}
              fallback="https://via.placeholder.com/100?text=No+Image"
              style={{ objectFit: 'contain' }}
            />
          </div>
        )}
      </Card>
    )
  }

  const KCFieldGroup: React.FC<{ namePrefix: string; label: string }> = ({ namePrefix, label }) => {
    const typeValue = Form.useWatch(`${namePrefix}Type`, form)
    return (
      <Card size="small" title={label} style={{ marginBottom: 16 }}>
        <Form.Item name={`${namePrefix}Type`} label="유형">
          <Radio.Group options={KC_TYPE_OPTIONS} optionType="button" buttonStyle="solid" />
        </Form.Item>
        {typeValue === 'Y' && (
          <Form.Item name={`${namePrefix}CertId`} label="인증번호">
            <Input placeholder="KC 인증번호를 입력하세요" />
          </Form.Item>
        )}
        {typeValue === 'F' && (
          <Form.Item name={`${namePrefix}File`} label="성적서/파일">
            <Input
              addonAfter={
                <Button
                  type="text"
                  size="small"
                  icon={<FolderOpenOutlined />}
                  onClick={() => handleSelectFile(`${namePrefix}File`)}
                />
              }
            />
          </Form.Item>
        )}
      </Card>
    )
  }

  const items = [
    {
      key: '1',
      label: '기본 정보',
      children: (
        <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: 8 }}>
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item name="sourceUrl" label="원본 URL">
                <Input
                  readOnly
                  addonAfter={
                    <a href={form.getFieldValue('sourceUrl')} target="_blank" rel="noreferrer">
                      <LinkOutlined />
                    </a>
                  }
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item name="categoryPath" label="카테고리">
                <Cascader
                  options={categories}
                  placeholder="카테고리를 선택하세요"
                  expandTrigger="hover"
                  showSearch={{
                    filter: (inputValue, path) =>
                      path.some(option => option.label.toLowerCase().indexOf(inputValue.toLowerCase()) > -1),
                  }}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="saleTypeText" label="등록구분">
                <Select options={SALE_TYPE_OPTIONS} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="taxType" label="과세여부">
                <Select options={TAXABLE_OPTIONS} placeholder="과세 여부 선택" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="goodsName" label="물품명" rules={[{ required: true }]}>
            <Input placeholder="물품명을 정확히 입력하세요" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="spec" label="규격">
                <Input placeholder="제품 규격/사양" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="modelName" label="모델명">
                <Input placeholder="모델명(형식)" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="estimateAmt" label="제시금액" rules={[{ required: true }]}>
                <Input placeholder="제시 금액(원) 입력" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="remainQnt" label="재고수량">
                <Input placeholder="재고 수량" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="salesUnit" label="판매단위">
                <Input placeholder="예: 개, set" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="factory" label="제조사">
                <Input placeholder="제조사 또는 브랜드" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="material" label="소재/재질">
                <Input placeholder="제품 소재 및 재질" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item name="originPath" label="원산지구분">
                <Cascader options={ORIGIN_OPTIONS} expandTrigger="hover" placeholder="원산지를 선택하세요" />
              </Form.Item>
            </Col>
          </Row>
        </div>
      ),
    },
    {
      key: '2',
      label: '배송/납품',
      children: (
        <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: 8 }}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="assure" label="보증기간">
                <Select options={WARRANTY_OPTIONS} placeholder="보증기간 선택" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="deliveryLimitText" label="납품가능기간">
                <Select options={DELIVERY_PERIOD_OPTIONS} placeholder="납품가능기간 선택" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="estimateValidity" label="견적서 유효기간">
            <Select options={QUOTE_VALIDITY_OPTIONS} placeholder="견적서 유효기간 선택" />
          </Form.Item>
          <Divider orientation="left">배송 설정</Divider>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="deliveryFeeKindText" label="배송비종류">
                <Select options={SHIPPING_FEE_TYPE_OPTIONS} placeholder="정책 선택" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="deliveryFee" label="배송비">
                <Input placeholder="금액 입력" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="returnFee" label="반품배송비">
                <Input placeholder="금액 입력" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="deliveryGroupYn" label="묶음배송여부">
                <Radio.Group options={YN_OPTIONS} optionType="button" buttonStyle="solid" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="jejuDeliveryYn" label="제주배송여부">
                <Radio.Group options={YN_OPTIONS} optionType="button" buttonStyle="solid" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="jejuDeliveryFee" label="제주추가배송비">
                <Input placeholder="제주 추가 금액" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="deliveryMethod" label="배송방법">
                <Select options={SHIPPING_METHOD_OPTIONS} placeholder="배송 수단 선택" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="deliveryAreas" label="배송지역">
                <Select
                  mode="multiple"
                  options={SHIPPING_AREA_OPTIONS}
                  placeholder="배송 가능 지역 선택 (미선택 시 계정 기본값 사용)"
                  maxTagCount="responsive"
                  onChange={vals => {
                    if (vals && vals.some((v: string) => v.includes('전국'))) {
                      form.setFieldValue('deliveryAreas', ['전국'])
                    }
                  }}
                />
              </Form.Item>
            </Col>
          </Row>
        </div>
      ),
    },
    {
      key: '3',
      label: '이미지 설정',
      children: (
        <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: 8 }}>
          <Row gutter={16}>
            <Col span={12}>
              <ImageInputWithPreview name="image1" label="기본이미지1" />
            </Col>
            <Col span={12}>
              <ImageInputWithPreview name="image2" label="기본이미지2" />
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <ImageInputWithPreview name="addImage1" label="추가이미지1" />
            </Col>
            <Col span={12}>
              <ImageInputWithPreview name="addImage2" label="추가이미지2" />
            </Col>
          </Row>
          <ImageInputWithPreview name="detailImage" label="상세이미지" />
        </div>
      ),
    },
    {
      key: '6',
      label: '상세 설명',
      children: (
        <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: 8 }}>
          <Form.Item name="detailHtml" label="상세설명HTML">
            <Input.TextArea rows={12} placeholder="상세 설명 HTML 코드를 붙여넣으세요" />
          </Form.Item>
        </div>
      ),
    },
    {
      key: '4',
      label: '기술 사양',
      children: (
        <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: 8 }}>
          <Form.Item name="g2bNumber" label="G2B 물품목록번호">
            <Input placeholder="예: 12345678 (8자리 숫자)" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="selPower" label="정격전압/소비전력">
                <Input placeholder="예: 220V / 60Hz" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="selWeight" label="크기및무게">
                <Input placeholder="예: 100x200x50mm / 2kg" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="selSameDate" label="동일모델출시년월">
                <Input placeholder="예: 2024-03" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="selArea" label="냉난방면적">
                <Input placeholder="예: 33㎡" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="selProduct" label="제품구성">
                <Input placeholder="제품의 구성품 목록" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="selSafety" label="안전표시">
                <Input placeholder="안전 관련 상세 표시 사양" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="selCapacity" label="용량">
                <Input placeholder="예: 500ml, 10kg" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="selSpecification" label="주요사양">
                <Input placeholder="핵심 기능 및 사양 정보" />
              </Form.Item>
            </Col>
          </Row>
          <Divider orientation="left">소비기한</Divider>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="validateRadio" label="소비기한선택">
                <Select options={CONSUMPTION_PERIOD_OPTIONS} placeholder="소비기한 선택" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                noStyle
                shouldUpdate={(prev, cur) => prev.validateRadio !== cur.validateRadio}
              >
                {({ getFieldValue }) =>
                  getFieldValue('validateRadio') === '직접입력' ? (
                    <Form.Item name="fValidate" label="소비기한입력">
                      <Input placeholder="직접 입력하세요 (예: 2024-12-31)" />
                    </Form.Item>
                  ) : null
                }
              </Form.Item>
            </Col>
          </Row>
        </div>
      ),
    },
    {
      key: 'kc',
      label: 'KC 인증',
      children: (
        <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: 8 }}>
          <Row gutter={16}>
            <Col span={12}>
              <KCFieldGroup namePrefix="kidsKc" label="어린이제품 KC" />
            </Col>
            <Col span={12}>
              <KCFieldGroup namePrefix="elecKc" label="전기용품 KC" />
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <KCFieldGroup namePrefix="dailyKc" label="생활용품 KC" />
            </Col>
            <Col span={12}>
              <KCFieldGroup namePrefix="broadcastingKc" label="방송통신 KC" />
            </Col>
          </Row>
          <Divider orientation="left">기타 인증</Divider>
          <Row gutter={16}>
            <Col span={12}>
              <KCFieldGroup namePrefix="childExitCheckerKc" label="어린이하차확인장치" />
            </Col>
            <Col span={12}>
              <KCFieldGroup namePrefix="safetyCheckKc" label="안전확인대상" />
            </Col>
          </Row>
        </div>
      ),
    },
    {
      key: '5',
      label: '기업 인증/기타',
      children: (
        <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: 8 }}>
          <Row gutter={8}>
            {CERT_FIELDS.map(cert => (
              <Col span={6} key={cert.name}>
                <Form.Item name={cert.name} label={cert.label}>
                  <Radio.Group options={YN_OPTIONS} optionType="button" buttonStyle="solid" size="small" />
                </Form.Item>
              </Col>
            ))}
          </Row>
          <Row gutter={8}>
            <Col span={12}>
              <Form.Item name="asTelephone1" label="전화번호">
                <Input placeholder="02-1234-5678" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="asTelephone2" label="A/S전화번호">
                <Input placeholder="02-1234-5678" />
              </Form.Item>
            </Col>
          </Row>
          <Divider orientation="left">승인 관련</Divider>
          <Form.Item name="approvalRequest" label="승인관련 요청사항">
            <Input.TextArea rows={2} placeholder="관리자에게 전달할 추가 요청사항" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="ppsContractYn" label="조달청계약여부">
                <Radio.Group options={YN_OPTIONS} optionType="button" buttonStyle="solid" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="naraRegisterYn" label="나라장터등록여부">
                <Radio.Group options={YN_OPTIONS} optionType="button" buttonStyle="solid" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="otherSiteRegisterYn" label="타사이트등록여부">
                <Radio.Group options={YN_OPTIONS} optionType="button" buttonStyle="solid" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.ppsContractYn !== cur.ppsContractYn || prev.naraRegisterYn !== cur.naraRegisterYn || prev.otherSiteRegisterYn !== cur.otherSiteRegisterYn}>
            {({ getFieldValue }) => (
              <>
                {getFieldValue('ppsContractYn') === 'Y' && (
                  <Row gutter={16}>
                    <Col span={12}>
                      <Form.Item name="ppsContractStartDate" label="계약시작일">
                        <Input placeholder="YYYY-MM-DD" />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name="ppsContractEndDate" label="계약종료일">
                        <Input placeholder="YYYY-MM-DD" />
                      </Form.Item>
                    </Col>
                  </Row>
                )}
                {getFieldValue('naraRegisterYn') === 'Y' && (
                  <Row gutter={16}>
                    <Col span={12}>
                      <Form.Item name="naraAmt" label="나라장터등록가격">
                        <Input placeholder="등록가격" />
                      </Form.Item>
                    </Col>
                  </Row>
                )}
                {getFieldValue('otherSiteRegisterYn') === 'Y' && (
                  <Row gutter={16}>
                    <Col span={8}>
                      <Form.Item name="siteName" label="사이트명">
                        <Input placeholder="타 서비스 사이트명" />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="siteUrl" label="사이트주소">
                        <Input placeholder="https://..." />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="otherSiteAmt" label="타사이트등록가격">
                        <Input placeholder="등록가격" />
                      </Form.Item>
                    </Col>
                  </Row>
                )}
              </>
            )}
          </Form.Item>
        </div>
      ),
    },
  ]

  return (
    <Modal
      title="상품 정보 상세 수정"
      open={visible}
      onOk={handleOk}
      onCancel={onCancel}
      width={1000}
      okText="저장"
      cancelText="취소"
      centered
    >
      <Form form={form} layout="vertical">
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={items} />
      </Form>
    </Modal>
  )
}

export default EditProductModal
