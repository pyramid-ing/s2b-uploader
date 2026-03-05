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
  Tooltip,
  Alert,
} from 'antd'
import { FolderOpenOutlined, LinkOutlined, InfoCircleOutlined } from '@ant-design/icons'
import { Product } from '../stores/registerStore'
import { buildCategoryTree, CATEGORY_STORAGE_KEY, DEFAULT_CATEGORY_EXCEL_PATH } from '../constants/categories'

const { ipcRenderer } = window.require('electron')

interface EditProductModalProps {
  visible: boolean
  product: Product | null
  onSave: (id: string, updatedData: Partial<Product>) => void
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
  { name: 'womanCert', label: '여성기업', tooltip: '여성기업확인서를 보유한 기업인 경우 "예"를 선택하세요.' },
  {
    name: 'disabledCompanyCert',
    label: '장애인기업',
    tooltip: '장애인기업확인서를 보유한 기업인 경우 "예"를 선택하세요.',
  },
  { name: 'foundationCert', label: '창업기업', tooltip: '중소벤처기업부 창업기업 확인을 받은 경우 "예"를 선택하세요.' },
  { name: 'disabledCert', label: '장애인표준사업장', tooltip: '장애인표준사업장 인증을 받은 경우 "예"를 선택하세요.' },
  { name: 'severalCert', label: '중증장애인생산품', tooltip: '중증장애인생산품 지정을 받은 경우 "예"를 선택하세요.' },
  { name: 'societyCert', label: '사회적협동조합', tooltip: '사회적협동조합으로 인가받은 경우 "예"를 선택하세요.' },
  {
    name: 'recycleCert',
    label: '우수재활용제품',
    tooltip: '환경부 우수재활용(GR) 인증을 받은 제품인 경우 "예"를 선택하세요.',
  },
  { name: 'environmentCert', label: '환경표지', tooltip: '환경부 환경표지 인증을 받은 제품인 경우 "예"를 선택하세요.' },
  { name: 'lowCarbonCert', label: '저탄소제품', tooltip: '저탄소제품 인증을 받은 제품인 경우 "예"를 선택하세요.' },
  {
    name: 'swQualityCert',
    label: 'SW품질인증',
    tooltip: 'SW품질인증(GS인증)을 받은 소프트웨어 제품인 경우 "예"를 선택하세요.',
  },
  {
    name: 'nepCert',
    label: '신제품인증(NEP)',
    tooltip: '산업통상자원부 신제품인증(NEP)을 받은 경우 "예"를 선택하세요.',
  },
  {
    name: 'netCert',
    label: '신제품인증(NET)',
    tooltip: '산업통상자원부 신기술인증(NET)을 받은 경우 "예"를 선택하세요.',
  },
  {
    name: 'greenProductCert',
    label: '녹색기술인증제품',
    tooltip: '녹색기술인증을 받은 제품인 경우 "예"를 선택하세요.',
  },
  { name: 'epcCert', label: '성능인증제품(EPC)', tooltip: '중소기업 성능인증(EPC)을 받은 경우 "예"를 선택하세요.' },
  { name: 'procureCert', label: '우수조달제품', tooltip: '조달청 우수조달제품 지정을 받은 경우 "예"를 선택하세요.' },
  { name: 'seoulTownCert', label: '마을기업', tooltip: '행정안전부 마을기업으로 지정된 경우 "예"를 선택하세요.' },
  {
    name: 'seoulSelfCert',
    label: '자활기업',
    tooltip: '자활근로사업을 통해 설립된 자활기업인 경우 "예"를 선택하세요.',
  },
  {
    name: 'cooperationCert',
    label: '협동조합',
    tooltip: '협동조합기본법에 의해 설립된 협동조합인 경우 "예"를 선택하세요.',
  },
  { name: 'seoulReserveCert', label: '예비사회적기업', tooltip: '예비사회적기업으로 지정된 경우 "예"를 선택하세요.' },
  {
    name: 'seoulCollaborationCert',
    label: '사회적협동조합(서울)',
    tooltip: '서울시 사회적협동조합인 경우 "예"를 선택하세요.',
  },
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
   * product (Product 타입) 필드에서 직접 폼 초기화
   */
  useEffect(() => {
    if (visible && product) {
      // 카테고리 경로 조립
      const categoryPath = [product.category1 || '', product.category2 || '', product.category3 || ''].filter(Boolean)

      // 원산지 경로 조립
      const originPath =
        product.originType === '국내'
          ? ['국내', product.originLocal || '']
          : product.originType === '국외'
            ? ['국외', product.originForeign || '']
            : []

      // 배송지역
      const deliveryAreas = Array.isArray(product.deliveryAreas) ? product.deliveryAreas : []

      form.setFieldsValue({
        // === 기본 정보 ===
        categoryPath,
        saleTypeText: product.saleType || '물품',
        goodsName: product.name || '',
        spec: product.spec || '',
        modelName: product.modelName || '',
        estimateAmt: product.price || '',
        factory: product.manufacturer || '',
        material: product.material || '',
        remainQnt: product.stockQuantity || '',
        salesUnit: product.salesUnit || '개',
        taxType: product.taxType || '과세(세금계산서)',

        // === 배송/납품 ===
        assure: product.warranty || '1년',
        deliveryLimitText: product.deliveryPeriod || '7일',
        estimateValidity: product.quoteValidity || '30일',
        deliveryFeeKindText: product.deliveryFeeType || '무료',
        deliveryFee: product.deliveryFee || '',
        returnFee: product.returnFee || '',
        exchangeFee: '',
        deliveryGroupYn: product.bundleShipping ? 'Y' : 'N',
        jejuDeliveryYn: product.jejuShipping ? 'Y' : 'N',
        jejuDeliveryFee: product.jejuAdditionalFee || '',
        deliveryMethod: product.deliveryMethod || '택배',
        deliveryAreas,

        // === 이미지 ===
        image1: product.image1 || '',
        image2: product.image2 || '',
        addImage1: product.addImage1 || '',
        addImage2: product.addImage2 || '',
        detailImage: product.detailImage || '',
        detailHtml: product.detailHtml || '',

        // === 원산지/기술사양 ===
        originPath,
        g2bNumber: product.g2bNumber || '',
        selPower: product.ratedPower || '',
        selWeight: product.sizeAndWeight || '',
        selSameDate: product.sameModelDate || '',
        selArea: product.coolingHeatingArea || '',
        selProduct: product.productComposition || '',
        selSafety: product.safetyMark || '',
        selCapacity: product.capacity || '',
        selSpecification: product.mainSpec || '',

        // === 소비기한/하차확인 ===
        validateRadio: product.consumptionPeriodType || '',
        fValidate: product.consumptionPeriodValue || '',
        childExitCheckerKcType: product.childExitCheckerKcType || 'N',
        childExitCheckerKcCertId: product.childExitCheckerKcCertId || '',
        childExitCheckerKcFile: product.childExitCheckerKcFile || '',

        // === 안전확인/조달 ===
        safetyCheckKcType: product.safetyCheckKcType || 'N',
        safetyCheckKcCertId: product.safetyCheckKcCertId || '',
        safetyCheckKcFile: product.safetyCheckKcFile || '',
        ppsContractYn: product.ppsContractYn ? 'Y' : 'N',
        ppsContractStartDate: product.ppsContractStartDate || '',
        ppsContractEndDate: product.ppsContractEndDate || '',

        // === 연락처 ===
        asTelephone1: product.phone || '',
        asTelephone2: product.asPhone || '',

        // === KC 인증 ===
        kidsKcType: product.kidsKcType || 'N',
        kidsKcCertId: product.kidsKcCertId || '',
        kidsKcFile: product.kidsKcFile || '',
        elecKcType: product.elecKcType || 'N',
        elecKcCertId: product.elecKcCertId || '',
        elecKcFile: product.elecKcFile || '',
        dailyKcType: product.dailyKcType || 'N',
        dailyKcCertId: product.dailyKcCertId || '',
        dailyKcFile: product.dailyKcFile || '',
        broadcastingKcType: product.broadcastingKcType || 'N',
        broadcastingKcCertId: product.broadcastingKcCertId || '',
        broadcastingKcFile: product.broadcastingKcFile || '',

        // === 기업 인증 ===
        womanCert: product.certWoman ? 'Y' : 'N',
        disabledCompanyCert: product.certDisabledCompany ? 'Y' : 'N',
        foundationCert: product.certFoundation ? 'Y' : 'N',
        disabledCert: product.certDisabled ? 'Y' : 'N',
        severalCert: product.certSevereDisabled ? 'Y' : 'N',
        cooperationCert: product.certCooperation ? 'Y' : 'N',
        societyCert: product.certSociety ? 'Y' : 'N',
        recycleCert: product.certRecycle ? 'Y' : 'N',
        environmentCert: product.certEnvironment ? 'Y' : 'N',
        lowCarbonCert: product.certLowCarbon ? 'Y' : 'N',
        swQualityCert: product.certSwQuality ? 'Y' : 'N',
        nepCert: product.certNep ? 'Y' : 'N',
        netCert: product.certNet ? 'Y' : 'N',
        greenProductCert: product.certGreenProduct ? 'Y' : 'N',
        epcCert: product.certEpc ? 'Y' : 'N',
        procureCert: product.certProcure ? 'Y' : 'N',
        seoulTownCert: product.certTown ? 'Y' : 'N',
        seoulSelfCert: product.certSelf ? 'Y' : 'N',
        seoulCollaborationCert: product.certCollaboration ? 'Y' : 'N',
        seoulReserveCert: product.certReserve ? 'Y' : 'N',

        // === 나라장터/타사이트/기타 ===
        naraRegisterYn: product.naraRegistered ? 'Y' : 'N',
        naraAmt: product.naraPrice || '',
        siteName: product.otherSiteName || '',
        siteUrl: product.otherSiteUrl || '',
        otherSiteRegisterYn: product.otherSiteRegistered ? 'Y' : 'N',
        otherSiteAmt: product.otherSitePrice || '',
        approvalRequest: product.approvalRequest || '',

        // === 참고용 (소싱 원본) ===
        sourceUrl: product.sourceUrl || '',
      })
    }
  }, [visible, product, form])

  /**
   * 저장 시 폼 값 → Product 필드명으로 변환하여 onSave
   */
  const handleOk = async () => {
    try {
      const values = await form.validateFields()

      if (product) {
        // 카테고리 경로 → category1/2/3 분리
        let category1 = '',
          category2 = '',
          category3 = ''
        if (Array.isArray(values.categoryPath)) {
          ;[category1 = '', category2 = '', category3 = ''] = values.categoryPath
        }

        // 원산지 경로 → originType/originLocal/originForeign 분리
        let originType = product.originType
        let originLocal = product.originLocal
        let originForeign = product.originForeign
        if (Array.isArray(values.originPath)) {
          const [type, value] = values.originPath
          originType = type || ''
          if (type === '국내') {
            originLocal = value || ''
            originForeign = ''
          } else if (type === '국외') {
            originForeign = value || ''
            originLocal = ''
          }
        }

        // 배송지역: 전국 포함 시 전국만
        let deliveryAreas = values.deliveryAreas || product.deliveryAreas
        if (Array.isArray(deliveryAreas) && deliveryAreas.some((area: string) => area.includes('전국'))) {
          deliveryAreas = ['전국']
        }

        // 폼 값 → Product 필드명으로 매핑
        const updatedProduct: Partial<Product> = {
          name: values.goodsName,
          spec: values.spec,
          modelName: values.modelName,
          price: parseInt(values.estimateAmt?.toString() || '0', 10) || 0,
          manufacturer: values.factory,
          material: values.material,
          stockQuantity: parseInt(values.remainQnt?.toString() || '0', 10) || 0,
          salesUnit: values.salesUnit,
          taxType: values.taxType,
          saleType: values.saleTypeText,

          category1,
          category2,
          category3,

          warranty: values.assure,
          deliveryPeriod: values.deliveryLimitText,
          quoteValidity: values.estimateValidity,
          deliveryFeeType: values.deliveryFeeKindText,
          deliveryFee: parseFloat(values.deliveryFee?.toString() || '0') || 0,
          returnFee: parseFloat(values.returnFee?.toString() || '0') || 0,
          bundleShipping: values.deliveryGroupYn === 'Y',
          jejuShipping: values.jejuDeliveryYn === 'Y',
          jejuAdditionalFee: parseFloat(values.jejuDeliveryFee?.toString() || '0') || 0,
          deliveryMethod: values.deliveryMethod,
          deliveryAreas,

          image1: values.image1,
          image2: values.image2,
          addImage1: values.addImage1,
          addImage2: values.addImage2,
          detailImage: values.detailImage,
          detailHtml: values.detailHtml,

          originType,
          originLocal,
          originForeign,
          g2bNumber: values.g2bNumber,

          ratedPower: values.selPower,
          sizeAndWeight: values.selWeight,
          sameModelDate: values.selSameDate,
          coolingHeatingArea: values.selArea,
          productComposition: values.selProduct,
          safetyMark: values.selSafety,
          capacity: values.selCapacity,
          mainSpec: values.selSpecification,

          consumptionPeriodType: values.validateRadio,
          consumptionPeriodValue: values.fValidate,

          childExitCheckerKcType: values.childExitCheckerKcType,
          childExitCheckerKcCertId: values.childExitCheckerKcCertId,
          childExitCheckerKcFile: values.childExitCheckerKcFile,
          safetyCheckKcType: values.safetyCheckKcType,
          safetyCheckKcCertId: values.safetyCheckKcCertId,
          safetyCheckKcFile: values.safetyCheckKcFile,

          ppsContractYn: values.ppsContractYn === 'Y',
          ppsContractStartDate: values.ppsContractStartDate,
          ppsContractEndDate: values.ppsContractEndDate,

          phone: values.asTelephone1,
          asPhone: values.asTelephone2,

          kidsKcType: values.kidsKcType,
          kidsKcCertId: values.kidsKcCertId,
          kidsKcFile: values.kidsKcFile,
          elecKcType: values.elecKcType,
          elecKcCertId: values.elecKcCertId,
          elecKcFile: values.elecKcFile,
          dailyKcType: values.dailyKcType,
          dailyKcCertId: values.dailyKcCertId,
          dailyKcFile: values.dailyKcFile,
          broadcastingKcType: values.broadcastingKcType,
          broadcastingKcCertId: values.broadcastingKcCertId,
          broadcastingKcFile: values.broadcastingKcFile,

          certWoman: values.womanCert === 'Y',
          certDisabledCompany: values.disabledCompanyCert === 'Y',
          certFoundation: values.foundationCert === 'Y',
          certDisabled: values.disabledCert === 'Y',
          certSevereDisabled: values.severalCert === 'Y',
          certCooperation: values.cooperationCert === 'Y',
          certSociety: values.societyCert === 'Y',
          certRecycle: values.recycleCert === 'Y',
          certEnvironment: values.environmentCert === 'Y',
          certLowCarbon: values.lowCarbonCert === 'Y',
          certSwQuality: values.swQualityCert === 'Y',
          certNep: values.nepCert === 'Y',
          certNet: values.netCert === 'Y',
          certGreenProduct: values.greenProductCert === 'Y',
          certEpc: values.epcCert === 'Y',
          certProcure: values.procureCert === 'Y',
          certTown: values.seoulTownCert === 'Y',
          certSelf: values.seoulSelfCert === 'Y',
          certCollaboration: values.seoulCollaborationCert === 'Y',
          certReserve: values.seoulReserveCert === 'Y',

          naraRegistered: values.naraRegisterYn === 'Y',
          naraPrice: values.naraAmt,
          otherSiteName: values.siteName,
          otherSiteUrl: values.siteUrl,
          otherSiteRegistered: values.otherSiteRegisterYn === 'Y',
          otherSitePrice: values.otherSiteAmt,
          approvalRequest: values.approvalRequest,

          sourceUrl: values.sourceUrl,
        }

        onSave(product.id, updatedProduct)
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

  /** 도움말 라벨 생성 헬퍼 */
  const labelWithTooltip = (label: string, tip: string) => (
    <span>
      {label}{' '}
      <Tooltip title={tip}>
        <InfoCircleOutlined style={{ color: '#1890ff', cursor: 'help' }} />
      </Tooltip>
    </span>
  )

  /** 안내 텍스트 스타일 */
  const helpStyle: React.CSSProperties = {
    fontSize: 12,
    color: '#888',
    marginTop: -8,
    marginBottom: 12,
    lineHeight: '18px',
  }

  const ImageInputWithPreview: React.FC<{
    name: string
    label: string
    required?: boolean
    helpText?: string
  }> = ({ name, label, required = false, helpText }) => {
    const value = Form.useWatch(name, form)
    return (
      <Card size="small" style={{ marginBottom: 16 }}>
        <Form.Item
          name={name}
          label={labelWithTooltip(
            label,
            helpText || 'URL 또는 파일 경로를 입력하세요. 파일찾기 버튼으로 로컬 파일을 선택할 수 있습니다.',
          )}
          rules={required ? [{ required: true }] : undefined}
        >
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

  const KCFieldGroup: React.FC<{ namePrefix: string; label: string; tooltip?: string }> = ({
    namePrefix,
    label,
    tooltip,
  }) => {
    const typeValue = Form.useWatch(`${namePrefix}Type`, form)
    return (
      <Card
        size="small"
        title={labelWithTooltip(
          label,
          tooltip ||
            `${label} 인증 여부를 선택하세요. 인증번호가 있으면 '인증번호', 성적서 파일이 있으면 '인증파일', 해당 없으면 '없음'을 선택하세요.`,
        )}
        style={{ marginBottom: 16 }}
      >
        <Form.Item
          name={`${namePrefix}Type`}
          label={labelWithTooltip(
            '유형',
            '인증번호 보유 시 "인증번호", 성적서/시험성적서 파일 보유 시 "인증파일", 해당 없으면 "없음" 선택',
          )}
        >
          <Radio.Group options={KC_TYPE_OPTIONS} optionType="button" buttonStyle="solid" />
        </Form.Item>
        {typeValue === 'Y' && (
          <Form.Item
            name={`${namePrefix}CertId`}
            label={labelWithTooltip('인증번호', '인증서에 기재된 KC 인증번호를 정확히 입력하세요. 예: XU100001-20001')}
          >
            <Input placeholder="예: XU100001-20001" />
          </Form.Item>
        )}
        {typeValue === 'F' && (
          <Form.Item
            name={`${namePrefix}File`}
            label={labelWithTooltip(
              '성적서/파일',
              '시험성적서 또는 인증서 파일을 선택하세요. PDF, JPG 등 파일을 업로드합니다.',
            )}
          >
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
          <Alert
            message="물품명 + 규격 + 모델명이 합쳐져 S2B에 제목으로 표시됩니다. 중복 기재를 피해주세요."
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
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
              <Form.Item
                name="categoryPath"
                label={labelWithTooltip(
                  '카테고리',
                  '1차 → 2차 → 3차 카테고리를 순서대로 선택하세요. 중기간경쟁제품은 반드시 해당 카테고리를 선택해야 합니다.',
                )}
                rules={[{ required: true }]}
              >
                <Cascader
                  options={categories}
                  placeholder="1차 → 2차 → 3차 카테고리를 선택하세요"
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
              <Form.Item
                name="saleTypeText"
                label={labelWithTooltip('등록구분', '물품(일반 상품) 또는 용역(서비스) 중 선택하세요.')}
              >
                <Select options={SALE_TYPE_OPTIONS} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="taxType"
                label={labelWithTooltip(
                  '과세여부',
                  '부가세 적용 여부를 선택하세요. 대부분의 물품은 "과세(세금계산서)"입니다.',
                )}
              >
                <Select options={TAXABLE_OPTIONS} placeholder="과세 여부 선택" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="goodsName"
            label={labelWithTooltip(
              '물품명',
              '통상적으로 불리는 물품명 또는 제조사에서 부여한 물품명을 입력합니다. 40자 이내.',
            )}
            rules={[{ required: true }, { max: 40, message: '물품명은 40자 이내로 입력하세요.' }]}
            extra={<span style={helpStyle}>특수문자 사용 불가. 규격·모델명과 중복되지 않게 입력하세요.</span>}
          >
            <Input placeholder="예: 사무용 의자" maxLength={40} showCount />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="spec"
                label={labelWithTooltip(
                  '규격',
                  '사양, 용량, 색상, 판매개수 등 동일 제품군과 구분되는 핵심사항을 입력하세요. 50자 이내.',
                )}
                rules={[{ required: true }, { max: 50, message: '규격은 50자 이내로 입력하세요.' }]}
                extra={<span style={helpStyle}>홍보성 문구(빠른, 최고 등) 입력 시 반려될 수 있습니다.</span>}
              >
                <Input placeholder="예: A4, 80g, 500매, 흰색" maxLength={50} showCount />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="modelName"
                label={labelWithTooltip(
                  '모델명',
                  '제조사에서 부여하고 제품에 표기된 모델명을 입력하세요. 없으면 비워두세요. 40자 이내.',
                )}
                rules={[{ required: true }, { max: 40, message: '모델명은 40자 이내로 입력하세요.' }]}
              >
                <Input placeholder="예: ABC-1234" maxLength={40} showCount />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="estimateAmt"
                label={labelWithTooltip('제시금액', '부가세를 포함한 최종 판매금액을 입력하세요.')}
                rules={[{ required: true }]}
                extra={<span style={helpStyle}>부가세(VAT) 포함 금액을 입력합니다.</span>}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  placeholder="부가세 포함 금액"
                  addonAfter="원"
                  formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  parser={value => value!.replace(/\$\s?|(,*)/g, '')}
                />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item
                name="remainQnt"
                label={labelWithTooltip('재고수량', '현재 판매 가능한 재고 수량을 입력하세요.')}
                rules={[{ required: true }]}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  placeholder="수량"
                  formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  parser={value => value!.replace(/\$\s?|(,*)/g, '')}
                />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item
                name="salesUnit"
                label={labelWithTooltip('판매단위', '제품의 판매 단위를 입력하세요.')}
                rules={[{ required: true }]}
              >
                <Input placeholder="예: 개, 세트, 박스" maxLength={10} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="factory"
                label={labelWithTooltip('제조사', '제조사 또는 브랜드명을 입력하세요. 20자 이내.')}
                rules={[{ required: true }, { max: 20, message: '제조사는 20자 이내로 입력하세요.' }]}
              >
                <Input placeholder="예: 삼성전자" maxLength={20} showCount />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="material"
                label={labelWithTooltip('소재/재질', '제품의 주요 소재 또는 재질을 입력하세요.')}
                rules={[{ required: true }]}
              >
                <Input placeholder="예: 플라스틱, 스테인리스, 면 등" maxLength={50} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item
                name="originPath"
                label={labelWithTooltip('원산지구분', '국내인 경우 시/도를, 국외인 경우 국가를 선택하세요.')}
                rules={[{ required: true }]}
              >
                <Cascader options={ORIGIN_OPTIONS} expandTrigger="hover" placeholder="국내/국외 → 지역/국가 선택" />
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
              <Form.Item
                name="assure"
                label={labelWithTooltip(
                  '보증기간',
                  '제품의 보증(A/S) 기간을 선택하세요. 소모품은 "소모성 자재 전용"을 선택합니다.',
                )}
                rules={[{ required: true }]}
              >
                <Select options={WARRANTY_OPTIONS} placeholder="보증기간 선택" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="deliveryLimitText"
                label={labelWithTooltip('납품가능기간', '주문 후 납품까지 소요되는 최대 일수를 선택하세요.')}
                rules={[{ required: true }]}
              >
                <Select options={DELIVERY_PERIOD_OPTIONS} placeholder="납품가능기간 선택" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="estimateValidity"
            label={labelWithTooltip('견적서 유효기간', '견적서의 가격이 유효한 기간입니다.')}
          >
            <Select options={QUOTE_VALIDITY_OPTIONS} placeholder="견적서 유효기간 선택" />
          </Form.Item>
          <Divider orientation="left">배송 설정</Divider>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name="deliveryFeeKindText"
                label={labelWithTooltip(
                  '배송비종류',
                  '무료: 배송비 없음 / 유료: 고정 배송비 / 조건부무료: 일정 금액 이상 무료',
                )}
                rules={[{ required: true }]}
              >
                <Select options={SHIPPING_FEE_TYPE_OPTIONS} placeholder="정책 선택" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="deliveryFee"
                label={labelWithTooltip('배송비', '유료 배송 시 기본 배송비를 입력하세요.')}
                rules={[{ required: true }]}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  placeholder="금액 입력"
                  addonAfter="원"
                  formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  parser={value => value!.replace(/\$\s?|(,*)/g, '')}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="returnFee"
                label={labelWithTooltip('반품배송비', '고객 귀책 사유로 반품 시 부과되는 배송비입니다.')}
                rules={[{ required: true }]}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  placeholder="금액 입력"
                  addonAfter="원"
                  formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  parser={value => value!.replace(/\$\s?|(,*)/g, '')}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name="deliveryGroupYn"
                label={labelWithTooltip('묶음배송여부', '여러 상품을 한 번에 묶어서 배송할 수 있는지 여부입니다.')}
                rules={[{ required: true }]}
              >
                <Radio.Group options={YN_OPTIONS} optionType="button" buttonStyle="solid" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="jejuDeliveryYn"
                label={labelWithTooltip('제주배송여부', '제주도 지역으로 배송이 가능한지 여부입니다.')}
                rules={[{ required: true }]}
              >
                <Radio.Group options={YN_OPTIONS} optionType="button" buttonStyle="solid" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="jejuDeliveryFee"
                label={labelWithTooltip(
                  '제주추가배송비',
                  '제주도 배송 시 기본 배송비 외에 추가로 부과되는 금액입니다.',
                )}
                rules={[{ required: true }]}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  placeholder="추가 금액"
                  addonAfter="원"
                  formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  parser={value => value!.replace(/\$\s?|(,*)/g, '')}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="deliveryMethod"
                label={labelWithTooltip('배송방법', '택배, 직배송, 우편 중 선택하세요.')}
                rules={[{ required: true }]}
              >
                <Select options={SHIPPING_METHOD_OPTIONS} placeholder="배송 수단 선택" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="deliveryAreas"
                label={labelWithTooltip(
                  '배송지역 (선택)',
                  '미선택 시 환경설정의 기본 배송지역이 적용됩니다. "전국"을 선택하면 다른 지역은 자동 해제됩니다.',
                )}
              >
                <Select
                  mode="multiple"
                  options={SHIPPING_AREA_OPTIONS}
                  placeholder="미선택 시 기본 배송지역 적용"
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
          <Alert
            message="이미지 권장 사이즈: 기본이미지 500×500px / 상세이미지 가로 1200px 이내 / 파일 크기 200KB 이하"
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
          <Row gutter={16}>
            <Col span={12}>
              <ImageInputWithPreview
                name="image1"
                label="기본이미지1 (필수)"
                required={true}
                helpText="목록에 표시되는 대표 이미지입니다. 500×500px, 200KB 이하의 정사각형 이미지를 사용하세요."
              />
            </Col>
            <Col span={12}>
              <ImageInputWithPreview
                name="image2"
                label="기본이미지2 (선택)"
                helpText="두 번째 기본 이미지입니다. 상품을 다른 각도에서 보여주는 이미지를 권장합니다."
              />
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <ImageInputWithPreview
                name="addImage1"
                label="추가이미지1 (선택)"
                helpText="상품의 세부 사항이나 패키지를 보여주는 이미지를 권장합니다."
              />
            </Col>
            <Col span={12}>
              <ImageInputWithPreview
                name="addImage2"
                label="추가이미지2 (선택)"
                helpText="상품 사용 예시나 구성품 이미지를 권장합니다."
              />
            </Col>
          </Row>
          <ImageInputWithPreview
            name="detailImage"
            label="상세이미지 (필수)"
            required={true}
            helpText="상세 설명에 사용되는 이미지입니다. 가로 1200px 이내, 200KB 이하를 권장합니다."
          />
        </div>
      ),
    },
    {
      key: '6',
      label: '상세 설명',
      children: (
        <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: 8 }}>
          <Form.Item
            name="detailHtml"
            label={labelWithTooltip(
              '상세설명HTML',
              '상품 상세페이지에 표시되는 HTML 코드입니다. S2B 사이트의 상세 설명 영역에 직접 삽입됩니다.',
            )}
            rules={[{ required: true }]}
            extra={
              <span style={helpStyle}>
                무단복제 및 도용은 저작권법에 의해 금지되며, 모든 책임은 공급업체에 있습니다.
              </span>
            }
          >
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
          <Alert
            message="아래 항목들은 해당되는 경우에만 입력하세요. 해당 없으면 비워두셔도 됩니다."
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
          <Form.Item
            name="g2bNumber"
            label={labelWithTooltip(
              'G2B 물품목록번호',
              '나라장터(G2B) 물품목록번호 8자리 숫자입니다. 특정 카테고리에서 필수입니다.',
            )}
          >
            <Input placeholder="예: 12345678" maxLength={8} />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="selPower"
                label={labelWithTooltip('정격전압/소비전력', '전자제품의 전압, 주파수, 소비전력을 입력하세요.')}
              >
                <Input placeholder="예: 220V / 60Hz / 500W" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="selWeight"
                label={labelWithTooltip('크기및무게', '제품의 외형 크기(가로×세로×높이)와 무게를 입력하세요.')}
              >
                <Input placeholder="예: 100x200x50mm / 2kg" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="selSameDate"
                label={labelWithTooltip('동일모델출시년월', '같은 모델이 처음 출시된 년월을 입력하세요.')}
              >
                <Input placeholder="예: 2024-03" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="selArea"
                label={labelWithTooltip('냉난방면적', '냉난방 관련 제품의 적용 가능 면적을 입력하세요.')}
              >
                <Input placeholder="예: 33㎡" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="selProduct"
                label={labelWithTooltip('제품구성', '박스에 포함된 모든 구성품을 나열하세요.')}
              >
                <Input placeholder="예: 본체, 전원어댑터, 설명서" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="selSafety"
                label={labelWithTooltip('안전표시', '해당 제품의 안전 관련 인증 또는 표시 사항을 입력하세요.')}
              >
                <Input placeholder="예: KC인증 R-R-ABC-12345" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="selCapacity" label={labelWithTooltip('용량', '제품의 용량 정보를 입력하세요.')}>
                <Input placeholder="예: 500ml, 10kg" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="selSpecification"
                label={labelWithTooltip('주요사양', '제품의 핵심 기능이나 스펙 정보를 입력하세요.')}
              >
                <Input placeholder="예: 해상도 1920x1080, USB-C" />
              </Form.Item>
            </Col>
          </Row>
          <Divider orientation="left">소비기한</Divider>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="validateRadio"
                label={labelWithTooltip('소비기한선택', '식품 등 소비기한이 있는 제품의 경우 선택하세요.')}
              >
                <Select options={CONSUMPTION_PERIOD_OPTIONS} placeholder="해당 시 선택" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item noStyle shouldUpdate={(prev, cur) => prev.validateRadio !== cur.validateRadio}>
                {({ getFieldValue }) =>
                  getFieldValue('validateRadio') === '직접입력' ? (
                    <Form.Item name="fValidate" label="소비기한입력">
                      <Input placeholder="예: 2024-12-31 또는 제조일로부터 6개월" />
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
          <Alert
            message="KC 인증은 해당 제품군에만 선택하세요. 인증번호가 있으면 '인증번호'를, 시험성적서가 있으면 '인증파일'을, 해당 없으면 '없음'을 선택합니다."
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
          <Row gutter={16}>
            <Col span={12}>
              <KCFieldGroup
                namePrefix="kidsKc"
                label="어린이제품 KC"
                tooltip="어린이용 제품(완구, 어린이용 학용품 등)에 해당하는 KC 안전인증입니다. 만 13세 이하 어린이가 사용하는 제품은 필수입니다."
              />
            </Col>
            <Col span={12}>
              <KCFieldGroup
                namePrefix="elecKc"
                label="전기용품 KC"
                tooltip="전기를 사용하는 제품(가전제품, 전선, 충전기 등)에 해당하는 KC 안전인증입니다."
              />
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <KCFieldGroup
                namePrefix="dailyKc"
                label="생활용품 KC"
                tooltip="일상생활에서 사용하는 제품(생활화학제품, 가구, 커튼 등)에 해당하는 KC 안전인증입니다."
              />
            </Col>
            <Col span={12}>
              <KCFieldGroup
                namePrefix="broadcastingKc"
                label="방송통신 KC"
                tooltip="방송통신기자재(와이파이, 블루투스, 무선기기 등)에 해당하는 KC 적합인증입니다."
              />
            </Col>
          </Row>
          <Divider orientation="left">기타 인증</Divider>
          <Row gutter={16}>
            <Col span={12}>
              <KCFieldGroup
                namePrefix="childExitCheckerKc"
                label="어린이하차확인장치"
                tooltip="어린이 통학차량에 설치하는 하차확인장치에 대한 KC 인증입니다."
              />
            </Col>
            <Col span={12}>
              <KCFieldGroup
                namePrefix="safetyCheckKc"
                label="안전확인대상"
                tooltip="안전확인대상 제품(가스용품, 체육용품 등)에 해당하는 인증입니다."
              />
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
          <Alert
            message="해당하는 인증만 '예'로 선택하세요. 인증서를 보유하지 않은 항목은 기본값(아니오) 그대로 두면 됩니다."
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
          <Row gutter={8}>
            {CERT_FIELDS.map(cert => (
              <Col span={6} key={cert.name}>
                <Form.Item name={cert.name} label={labelWithTooltip(cert.label, cert.tooltip)}>
                  <Radio.Group options={YN_OPTIONS} optionType="button" buttonStyle="solid" size="small" />
                </Form.Item>
              </Col>
            ))}
          </Row>
          <Divider orientation="left">연락처</Divider>
          <Row gutter={8}>
            <Col span={12}>
              <Form.Item
                name="asTelephone1"
                label={labelWithTooltip('전화번호', '구매자가 연락할 수 있는 대표 전화번호를 입력하세요.')}
              >
                <Input placeholder="예: 02-1234-5678" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="asTelephone2"
                label={labelWithTooltip(
                  'A/S전화번호',
                  '제품 A/S(수리, 교환) 문의 전화번호를 입력하세요. 대표번호와 같으면 동일하게 입력합니다.',
                )}
              >
                <Input placeholder="예: 1588-0000" />
              </Form.Item>
            </Col>
          </Row>
          <Divider orientation="left">승인 관련</Divider>
          <Form.Item
            name="approvalRequest"
            label={labelWithTooltip(
              '승인관련 요청사항',
              'S2B 관리자에게 전달할 특이사항이나 추가 요청사항을 입력하세요.',
            )}
          >
            <Input.TextArea rows={2} placeholder="관리자에게 전달할 추가 요청사항이 있으면 작성하세요" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name="ppsContractYn"
                label={labelWithTooltip(
                  '조달청계약여부',
                  '조달청(나라장터)과 계약이 체결된 물품인 경우 "예"를 선택하세요.',
                )}
              >
                <Radio.Group options={YN_OPTIONS} optionType="button" buttonStyle="solid" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="naraRegisterYn"
                label={labelWithTooltip(
                  '나라장터등록여부',
                  '나라장터(G2B)에 이미 등록된 물품인 경우 "예"를 선택하세요.',
                )}
              >
                <Radio.Group options={YN_OPTIONS} optionType="button" buttonStyle="solid" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="otherSiteRegisterYn"
                label={labelWithTooltip(
                  '타사이트등록여부',
                  'S2B 외 다른 쇼핑몰이나 조달 사이트에 등록된 경우 "예"를 선택하세요.',
                )}
              >
                <Radio.Group options={YN_OPTIONS} optionType="button" buttonStyle="solid" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            noStyle
            shouldUpdate={(prev, cur) =>
              prev.ppsContractYn !== cur.ppsContractYn ||
              prev.naraRegisterYn !== cur.naraRegisterYn ||
              prev.otherSiteRegisterYn !== cur.otherSiteRegisterYn
            }
          >
            {({ getFieldValue }) => (
              <>
                {getFieldValue('ppsContractYn') === 'Y' && (
                  <Row gutter={16}>
                    <Col span={12}>
                      <Form.Item
                        name="ppsContractStartDate"
                        label={labelWithTooltip('계약시작일', '조달청 계약의 시작일을 입력하세요.')}
                      >
                        <Input placeholder="예: 2024-01-01" />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item
                        name="ppsContractEndDate"
                        label={labelWithTooltip('계약종료일', '조달청 계약의 종료일을 입력하세요.')}
                      >
                        <Input placeholder="예: 2025-12-31" />
                      </Form.Item>
                    </Col>
                  </Row>
                )}
                {getFieldValue('naraRegisterYn') === 'Y' && (
                  <Row gutter={16}>
                    <Col span={12}>
                      <Form.Item
                        name="naraAmt"
                        label={labelWithTooltip('나라장터등록가격', '나라장터에 등록된 판매가격을 입력하세요.')}
                      >
                        <InputNumber
                          style={{ width: '100%' }}
                          placeholder="등록가격"
                          addonAfter="원"
                          formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                          parser={value => value!.replace(/\$\s?|(,*)/g, '')}
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                )}
                {getFieldValue('otherSiteRegisterYn') === 'Y' && (
                  <Row gutter={16}>
                    <Col span={8}>
                      <Form.Item
                        name="siteName"
                        label={labelWithTooltip('사이트명', '등록된 타 사이트의 이름을 입력하세요.')}
                      >
                        <Input placeholder="예: 네이버 스마트스토어" />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item
                        name="siteUrl"
                        label={labelWithTooltip('사이트주소', '해당 사이트의 URL을 입력하세요.')}
                      >
                        <Input placeholder="https://..." />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item
                        name="otherSiteAmt"
                        label={labelWithTooltip('타사이트등록가격', '타 사이트에 등록된 판매가격을 입력하세요.')}
                      >
                        <InputNumber
                          style={{ width: '100%' }}
                          placeholder="등록가격"
                          addonAfter="원"
                          formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                          parser={value => value!.replace(/\$\s?|(,*)/g, '')}
                        />
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

  const validateMessages = {
    required: '${label}은(는) 필수 입력 항목입니다.',
  }

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
      <Form form={form} layout="vertical" validateMessages={validateMessages} size="large">
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={items.map(item => ({ ...item, forceRender: true }))}
        />
      </Form>
    </Modal>
  )
}

export default EditProductModal
