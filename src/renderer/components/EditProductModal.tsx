import React, { useEffect, useState } from 'react'
import {
  Modal,
  Form,
  Input,
  InputNumber,
  Divider,
  Tabs,
  Select,
  Radio,
  Row,
  Col,
  Button,
  Image,
  Card,
  Cascader,
} from 'antd'
import { FolderOpenOutlined } from '@ant-design/icons'
import { ProductData } from '../stores/registerStore'
import { buildCategoryTree, CATEGORY_STORAGE_KEY, DEFAULT_CATEGORY_EXCEL_PATH } from '../constants/categories'

const { ipcRenderer } = window.require('electron')

interface EditProductModalProps {
  visible: boolean
  product: ProductData | null
  onSave: (key: string, updatedData: Partial<ProductData>) => void
  onCancel: () => void
}

const TAXABLE_OPTIONS = [
  { label: '과세(세금계산서)', value: '과세(세금계산서)' },
  { label: '면세', value: '면세' },
  { label: '영세', value: '영세' },
]

const REGISTRATION_TYPE_OPTIONS = [
  { label: '물품', value: '물품' },
  { label: '서비스', value: '서비스' },
  { label: '공사', value: '공사' },
]

const SHIPPING_FEE_TYPE_OPTIONS = [
  { label: '무료', value: '무료' },
  { label: '유료', value: '유료' },
  { label: '조건부무료', value: '조건부무료' },
]

const SHIPPING_METHOD_OPTIONS = [
  { label: '택배', value: '택배' },
  { label: '직배송', value: '직배송' },
  { label: '화물', value: '화물' },
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
  { label: '1일', value: '1일' },
  { label: '3일', value: '3일' },
  { label: '5일', value: '5일' },
  { label: '7일', value: '7일' },
  { label: '10일', value: '10일' },
  { label: '14일', value: '14일' },
  { label: '30일', value: '30일' },
  { label: '60일', value: '60일' },
]

const KC_TYPE_OPTIONS = [
  { label: '인증번호', value: '인증번호' },
  { label: '인증파일', value: '인증파일' },
  { label: '없음', value: '없음' },
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

  useEffect(() => {
    if (visible && product) {
      const d = product.originalData || {}
      const categoryPath = [
        d.category1 || d['카테고리1'] || '',
        d.category2 || d['카테고리2'] || '',
        d.category3 || d['카테고리3'] || '',
      ].filter(Boolean)

      form.setFieldsValue({
        // 기본 정보
        categoryPath,
        registrationType: d.registrationType || d.saleTypeText || d['등록구분'] || '물품',
        goodsName: product.goodsName || d.goodsName || d['물품명'] || '',
        spec: product.spec || d.spec || d['규격'] || '',
        modelName: product.modelName || d.modelName || d['모델명'] || '상세설명참고',
        price: d.price || d.estimateAmt || d['제시금액'] || 0,
        brand: d.brand || d.factory || d['제조사'] || '',
        material: d.material || d['소재/재질'] || '',
        stock: d.stock || d.remainQnt || d['재고수량'] || 999,
        saleUnit: d.saleUnit || d.salesUnit || d['판매단위'] || '개',

        // 배송/납품
        warranty: d.warranty || d.assure || d['보증기간'] || '1년',
        deliveryPeriod: d.deliveryPeriod || d.deliveryLimitText || d['납품가능기간'] || '7일',
        quoteValidity: d.quoteValidity || d.estimateValidity || d['견적서 유효기간'] || '',
        shippingFeeType: d.shippingFeeType || d.deliveryFeeKindText || d['배송비종류'] || '무료',
        shippingFee: d.shippingFee || d.deliveryFee || d['배송비'] || 0,
        returnShippingFee: d.returnShippingFee || d.returnFee || d['반품배송비'] || 3500,
        bundleShipping: d.bundleShipping || d.deliveryGroupYn || d['묶음배송여부'] || 'Y',
        jejuShipping: d.jejuShipping || d.jejuDeliveryYn || d['제주배송여부'] || 'Y',
        jejuAdditionalFee: d.jejuAdditionalFee || d.jejuDeliveryFee || d['제주추가배송비'] || 0,
        shippingMethod: d.shippingMethod || d.deliveryMethod || d['배송방법'] || '택배',
        shippingArea: Array.isArray(d.shippingArea)
          ? d.shippingArea
          : Array.isArray(d.deliveryAreas)
            ? d.deliveryAreas
            : [],

        // 상세 설명/이미지
        detailHtml: d.detailHtml || d['상세설명HTML'] || '',
        image1: d.image1 || d['기본이미지1'] || '',
        image2: d.image2 || d['기본이미지2'] || '',
        imageAdd1: d.imageAdd1 || d.addImage1 || d['추가이미지1'] || '',
        imageAdd2: d.imageAdd2 || d.addImage2 || d['추가이미지2'] || '',
        imageDetail: d.imageDetail || d.detailImage || d['상세이미지'] || '',

        // 기술 사양
        originPath:
          d.originPath ||
          (d.originType === '국내' || d['원산지구분'] === '국내'
            ? ['국내', d.originKorea || d.originLocal || d['국내원산지']]
            : d.originType === '국외' || d['원산지구분'] === '국외'
              ? ['국외', d.originOverseas || d.originForeign || d['해외원산지']]
              : []),
        g2bItemNo: d.g2bItemNo || d.g2bNumber || d['G2B 물품목록번호'] || '',
        voltage: d.voltage || d.selPower || d['정격전압/소비전력'] || '',
        sizeWeight: d.sizeWeight || d.selWeight || d['크기및무게'] || '',
        releaseDate: d.releaseDate || d.selSameDate || d['동일모델출시년월'] || '',
        coolingArea: d.coolingArea || d['냉난방면적'] || '',
        composition: d.composition || d['제품구성'] || '',
        safetyMark: d.safetyMark || d['안전표시'] || '',
        capacity: d.capacity || d['용량'] || '',
        mainSpec: d.mainSpec || d['주요사양'] || '',

        // 소비기한/하차확인
        expiryDateType: d.expiryDateType || d['소비기한선택'] || '제품에 별도 표시',
        expiryDateInput: d.expiryDateInput || d['소비기한입력'] || '',
        childAlightingType: d.childAlightingType || d.childExitCheckerKcType || d['어린이하차확인장치타입'] || '',
        childAlightingNo: d.childAlightingNo || d.childExitCheckerKcCertId || d['어린이하차확인장치인증번호'] || '',
        childAlightingFile: d.childAlightingFile || d.childExitCheckerKcFile || d['어린이하차확인장치첨부파일'] || '',

        // 안전확인/조달
        safetyTargetType: d.safetyTargetType || d.safetyCheckKcType || d['안전확인대상타입'] || '',
        safetyTargetNo: d.safetyTargetNo || d.safetyCheckKcCertId || d['안전확인대상신고번호'] || '',
        safetyTargetFile: d.safetyTargetFile || d.safetyCheckKcFile || d['안전확인대상첨부파일'] || '',
        g2bContracted: d.g2bContracted || d.ppsContractYn || d['조달청계약여부'] || 'N',
        contractStartDate: d.contractStartDate || d.ppsContractStartDate || d['계약시작일'] || '',
        contractEndDate: d.contractEndDate || d.ppsContractEndDate || d['계약종료일'] || '',
        phone: d.phone || d.asTelephone1 || d['전화번호'] || '',
        asPhone: d.asPhone || d.asTelephone2 || d['제조사 A/S전화번호'] || '',
        taxable: d.taxable || d.taxType || d['과세여부'] || '과세(세금계산서)',

        // KC/각종인증
        childKcType: d.childKcType || d.kidsKcType || d['어린이제품KC유형'] || '',
        childKcNo: d.childKcNo || d.kidsKcCertId || d['어린이제품KC인증번호'] || '',
        childKcReport: d.childKcReport || d.kidsKcFile || d['어린이제품KC성적서'] || '',
        elecKcType: d.elecKcType || d['전기용품KC유형'] || '',
        elecKcNo: d.elecKcNo || d.elecKcCertId || d['전기용품KC인증번호'] || '',
        elecKcReport: d.elecKcReport || d.elecKcFile || d['전기용품KC성적서'] || '',
        lifeKcType: d.lifeKcType || d['생활용품KC유형'] || '',
        lifeKcNo: d.lifeKcNo || d.dailyKcCertId || d['생활용품KC인증번호'] || '',
        lifeKcReport: d.lifeKcReport || d.dailyKcFile || d['생활용품KC성적서'] || '',
        commKcType: d.commKcType || d.broadcastingKcType || d['방송통신KC유형'] || '',
        commKcNo: d.commKcNo || d.broadcastingKcCertId || d['방송통신KC인증번호'] || '',
        commKcReport: d.commKcReport || d.broadcastingKcFile || d['방송통신KC성적서'] || '',

        // 기업 인증
        femaleCorp: d.femaleCorp || '',
        disabledCorp: d.disabledCorp || '',
        startupCorp: d.startupCorp || '',
        disabledStandardCorp: d.disabledStandardCorp || '',
        severeDisabledCorp: d.severeDisabledCorp || '',
        socialCoop: d.socialCoop || '',
        grMark: d.grMark || '',
        envMark: d.envMark || '',
        lowCarbon: d.lowCarbon || '',
        swQuality: d.swQuality || '',
        nepMark: d.nepMark || '',
        netMark: d.netMark || '',
        greenTech: d.greenTech || '',
        epcMark: d.epcMark || '',
        excellentG2B: d.excellentG2B || '',
        villageCorp: d.villageCorp || '',
        selfSupportCorp: d.selfSupportCorp || '',
        coopCorp: d.coopCorp || '',
        preSocialCorp: d.preSocialCorp || '',

        // 기타 요청
        approvalRequest: d.approvalRequest || '',
        g2bRegistered: d.g2bRegistered || '',
        g2bPrice: d.g2bPrice || '',
        otherSiteRegistered: d.otherSiteRegistered || '',
        otherSitePrice: d.otherSitePrice || '',
        siteName: d.siteName || '',
        siteUrl: d.siteUrl || '',
      })
    }
  }, [visible, product, form])

  const handleOk = async () => {
    try {
      const values = await form.validateFields()
      if (product) {
        const updatedValues = { ...values }
        if (Array.isArray(updatedValues.shippingArea)) {
          if (updatedValues.shippingArea.length === 0) {
            // 선택된 지역이 없으면 '전국' 또는 빈값으로 두어 크롤러가 계정 설정을 따르게 함
            updatedValues.shippingArea = ''
          } else if (updatedValues.shippingArea.includes('전국')) {
            updatedValues.shippingArea = '전국'
          } else {
            updatedValues.shippingArea = updatedValues.shippingArea.join(',')
          }
        }
        if (Array.isArray(updatedValues.categoryPath)) {
          const [c1, c2, c3] = updatedValues.categoryPath
          updatedValues.category1 = c1 || ''
          updatedValues.category2 = c2 || ''
          updatedValues.category3 = c3 || ''
          delete updatedValues.categoryPath
        }
        if (Array.isArray(updatedValues.originPath)) {
          const [type, value] = updatedValues.originPath
          updatedValues.originType = type || ''
          if (type === '국내') {
            updatedValues.originKorea = value || ''
            updatedValues.originOverseas = ''
          } else if (type === '국외') {
            updatedValues.originOverseas = value || ''
            updatedValues.originKorea = ''
          }
          delete updatedValues.originPath
        }

        // 인증번호 공란일 경우 '없음' 처리
        const certFields = ['childKcNo', 'elecKcNo', 'lifeKcNo', 'commKcNo', 'childAlightingNo', 'safetyTargetNo']
        certFields.forEach(field => {
          if (updatedValues[field] !== undefined && (updatedValues[field] === '' || updatedValues[field] === null)) {
            updatedValues[field] = '없음'
          }
        })

        onSave(product.key, {
          goodsName: values.goodsName,
          spec: values.spec,
          modelName: values.modelName,
          originalData: {
            ...product.originalData,
            ...updatedValues,
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
          <Select options={KC_TYPE_OPTIONS} />
        </Form.Item>
        {typeValue === '인증번호' && (
          <Form.Item name={`${namePrefix}No`} label="인증번호">
            <Input placeholder="인증번호를 입력하세요 (공란 시 '없음' 자동입력)" />
          </Form.Item>
        )}
        {typeValue === '인증파일' && (
          <Form.Item name={`${namePrefix}Report`} label="성적서/파일">
            <Input
              addonAfter={
                <Button
                  type="text"
                  size="small"
                  icon={<FolderOpenOutlined />}
                  onClick={() => handleSelectFile(`${namePrefix}Report`)}
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
              <Form.Item name="registrationType" label="등록구분">
                <Select options={REGISTRATION_TYPE_OPTIONS} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="taxable" label="과세여부">
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
              <Form.Item name="price" label="제시금액" rules={[{ required: true }]}>
                <InputNumber
                  style={{ width: '100%' }}
                  placeholder="제시 금액(원) 입력"
                  formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  parser={v => v!.replace(/\$\s?|(,*)/g, '') as any}
                />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="stock" label="재고수량">
                <InputNumber style={{ width: '100%' }} placeholder="재고 수량" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="saleUnit" label="판매단위">
                <Input placeholder="예: ea, set" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="brand" label="제조사">
                <Input placeholder="제조사 또는 브랜드" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="material" label="소재/재질">
                <Input placeholder="제품 소재 및 재질" />
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
              <Form.Item name="warranty" label="보증기간">
                <Select options={WARRANTY_OPTIONS} placeholder="보증기간 선택" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="deliveryPeriod" label="납품가능기간">
                <Select options={DELIVERY_PERIOD_OPTIONS} placeholder="납품가능기간 선택" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="quoteValidity" label="견적서 유효기간">
            <Input placeholder="예: 견적일로부터 30일" />
          </Form.Item>
          <Divider orientation="left">배송 설정</Divider>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="shippingFeeType" label="배송비종류">
                <Select options={SHIPPING_FEE_TYPE_OPTIONS} placeholder="정책 선택" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="shippingFee" label="배송비">
                <InputNumber style={{ width: '100%' }} placeholder="금액 입력" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="returnShippingFee" label="반품배송비">
                <InputNumber style={{ width: '100%' }} placeholder="금액 입력" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="bundleShipping" label="묶음배송여부">
                <Radio.Group options={YN_OPTIONS} optionType="button" buttonStyle="solid" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="jejuShipping" label="제주배송여부">
                <Radio.Group options={YN_OPTIONS} optionType="button" buttonStyle="solid" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="jejuAdditionalFee" label="제주추가배송비">
                <InputNumber style={{ width: '100%' }} placeholder="제주 추가 금액" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="shippingMethod" label="배송방법">
                <Select options={SHIPPING_METHOD_OPTIONS} placeholder="배송 수단 선택" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="shippingArea" label="배송지역">
                <Select
                  mode="multiple"
                  options={SHIPPING_AREA_OPTIONS}
                  placeholder="배송 가능 지역 선택 (미선택 시 계정 기본값 사용)"
                  maxTagCount="responsive"
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
              <ImageInputWithPreview name="imageAdd1" label="추가이미지1" />
            </Col>
            <Col span={12}>
              <ImageInputWithPreview name="imageAdd2" label="추가이미지2" />
            </Col>
          </Row>
          <ImageInputWithPreview name="imageDetail" label="상세이미지" />
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
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item name="originPath" label="원산지구분">
                <Cascader options={ORIGIN_OPTIONS} expandTrigger="hover" placeholder="원산지를 선택하세요" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="g2bItemNo" label="G2B 물품목록번호">
            <Input placeholder="예: 12345678 (8자리 숫자)" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="voltage" label="정격전압/소비전력">
                <Input placeholder="예: 220V / 60Hz" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="sizeWeight" label="크기및무게">
                <Input placeholder="예: 100x200x50mm / 2kg" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="releaseDate" label="동일모델출시년월">
                <Input placeholder="예: 2024-03" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="coolingArea" label="냉난방면적">
                <Input placeholder="예: 33㎡" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="composition" label="제품구성">
                <Input placeholder="제품의 구성품 목록" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="safetyMark" label="안전표시">
                <Input placeholder="안전 관련 상세 표시 사양" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="capacity" label="용량">
                <Input placeholder="예: 500ml, 10kg" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="mainSpec" label="주요사양">
                <Input placeholder="핵심 기능 및 사양 정보" />
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
              <KCFieldGroup namePrefix="childKc" label="어린이제품 KC" />
            </Col>
            <Col span={12}>
              <KCFieldGroup namePrefix="elecKc" label="전기용품 KC" />
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <KCFieldGroup namePrefix="lifeKc" label="생활용품 KC" />
            </Col>
            <Col span={12}>
              <KCFieldGroup namePrefix="commKc" label="방송통신 KC" />
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
            <Col span={6}>
              <Form.Item name="femaleCorp" label="여성기업">
                <Input placeholder="인증번호" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="disabledCorp" label="장애인기업">
                <Input placeholder="인증번호" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="startupCorp" label="창업기업">
                <Input placeholder="인증번호" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="excellentG2B" label="우수조달">
                <Input placeholder="인증번호" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={8}>
            <Col span={12}>
              <Form.Item name="phone" label="전화번호">
                <Input placeholder="02-1234-5678" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="asPhone" label="A/S전화번호">
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
              <Form.Item name="g2bContracted" label="조달청계약여부">
                <Radio.Group options={YN_OPTIONS} optionType="button" buttonStyle="solid" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="g2bRegistered" label="나라장터등록여부">
                <Radio.Group options={YN_OPTIONS} optionType="button" buttonStyle="solid" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="otherSiteRegistered" label="타사이트등록여부">
                <Radio.Group options={YN_OPTIONS} optionType="button" buttonStyle="solid" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="siteName" label="사이트명">
                <Input placeholder="타 서비스 사이트명" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="siteUrl" label="사이트주소">
                <Input placeholder="https://..." />
              </Form.Item>
            </Col>
          </Row>
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
