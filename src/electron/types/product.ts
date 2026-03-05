/**
 * Product type (English field names)
 * 서버 측 데이터 저장 및 renderer 표현을 위한 핵심 타입
 */
import {
  ExcelRegistrationData,
  KcType,
  SaleType,
  DeliveryFeeType,
  DeliveryLimitType,
  OriginType,
  TaxType,
} from './excel'
import type { SourcingItemPayload } from './sourcingItems'

export type { SourcingItemPayload }

// ---------- Product Interface ----------

export interface Product {
  id: string

  // 기본 상품 정보
  name: string // 물품명
  spec: string // 규격
  modelName: string // 모델명
  manufacturer: string // 제조사
  material: string // 소재/재질
  salesUnit: string // 판매단위
  stockQuantity: number // 재고수량
  price: number // 제시금액
  taxType: string // 과세여부
  saleType: string // 등록구분 (물품/용역)
  warranty: string // 보증기간

  // 카테고리
  category1: string
  category2: string
  category3: string

  // G2B
  g2bNumber: string

  // 배송/납품
  deliveryPeriod: string // 납품가능기간 (텍스트: '7일')
  quoteValidity: string // 견적서 유효기간
  deliveryFeeType: string // 배송비종류 (텍스트: '무료')
  deliveryFee: number // 배송비
  returnFee: number // 반품배송비
  bundleShipping: boolean // 묶음배송여부
  jejuShipping: boolean // 제주배송여부
  jejuAdditionalFee: number // 제주추가배송비
  deliveryMethod: string // 배송방법 (텍스트: '택배')
  deliveryAreas: string[] // 배송지역

  // 이미지
  image1: string
  image2: string
  addImage1: string
  addImage2: string
  detailImage: string
  detailHtml: string

  // 원산지
  originType: string // '국내' | '국외'
  originLocal: string // 국내원산지
  originForeign: string // 해외원산지

  // KC 인증
  kidsKcType: string
  kidsKcCertId: string
  kidsKcFile: string
  elecKcType: string
  elecKcCertId: string
  elecKcFile: string
  dailyKcType: string
  dailyKcCertId: string
  dailyKcFile: string
  broadcastingKcType: string
  broadcastingKcCertId: string
  broadcastingKcFile: string

  // 어린이 하차 확인 장치
  childExitCheckerKcType: string
  childExitCheckerKcCertId: string
  childExitCheckerKcFile: string

  // 안전 확인 대상
  safetyCheckKcType: string
  safetyCheckKcCertId: string
  safetyCheckKcFile: string

  // 소비기한
  consumptionPeriodType: string
  consumptionPeriodValue: string

  // 전기용품 관련
  ratedPower: string // 정격전압/소비전력
  sizeAndWeight: string // 크기및무게
  sameModelDate: string // 동일모델출시년월
  coolingHeatingArea: string // 냉난방면적
  productComposition: string // 제품구성
  safetyMark: string // 안전표시
  capacity: string // 용량
  mainSpec: string // 주요사양

  // 인증 정보 (Y/N)
  certWoman: boolean
  certDisabledCompany: boolean
  certFoundation: boolean
  certDisabled: boolean
  certSevereDisabled: boolean
  certCooperation: boolean
  certSociety: boolean
  certRecycle: boolean
  certEnvironment: boolean
  certLowCarbon: boolean
  certSwQuality: boolean
  certNep: boolean
  certNet: boolean
  certGreenProduct: boolean
  certEpc: boolean
  certProcure: boolean
  certTown: boolean
  certSelf: boolean
  certCollaboration: boolean
  certReserve: boolean

  // 조달청 계약
  ppsContractYn: boolean
  ppsContractStartDate: string
  ppsContractEndDate: string

  // 연락처
  phone: string
  asPhone: string

  // 나라장터
  naraRegistered: boolean
  naraPrice: string

  // 타사이트
  otherSiteName: string
  otherSiteUrl: string
  otherSiteRegistered: boolean
  otherSitePrice: string

  // 주소
  addressCode: string
  address: string
  addressDetail: string

  // 승인
  approvalRequest: string

  // 참고용 (소싱 원본)
  sourceUrl: string
  listThumbnail: string

  // 등록 결과
  result: string
}

export interface ConfigSetPayload {
  config: {
    deliveryPeriod: string
    quoteValidityPeriod: string
    shippingFeeType: 'free' | 'fixed' | 'conditional'
    shippingFee: number
    returnShippingFee: number
    bundleShipping: boolean
    jejuShipping: boolean
    jejuAdditionalFee: number
    detailHtmlTemplate: string
    marginRate: number
    optionHandling: 'split' | 'single'
  }
}

// ---------- Conversion: Product → ExcelRegistrationData ----------

export function productToExcelData(product: Product): ExcelRegistrationData {
  return {
    물품명: product.name,
    goodsName: product.name,
    spec: product.spec,
    modelName: product.modelName,
    factory: product.manufacturer,
    material: product.material,
    salesUnit: product.salesUnit,
    remainQnt: product.stockQuantity.toString(),
    estimateAmt: product.price.toString(),
    taxType: product.taxType as TaxType,
    saleTypeText: product.saleType as SaleType,
    assure: product.warranty,

    category1: product.category1,
    category2: product.category2,
    category3: product.category3,
    g2bNumber: product.g2bNumber,

    deliveryLimitText: product.deliveryPeriod as DeliveryLimitType,
    estimateValidity: product.quoteValidity,
    deliveryFeeKindText: product.deliveryFeeType as DeliveryFeeType,
    deliveryFee: product.deliveryFee.toString(),
    returnFee: product.returnFee.toString(),
    deliveryGroupYn: product.bundleShipping ? 'Y' : 'N',
    jejuDeliveryYn: product.jejuShipping ? 'Y' : 'N',
    jejuDeliveryFee: product.jejuAdditionalFee.toString(),
    deliveryMethod: product.deliveryMethod,
    deliveryAreas: product.deliveryAreas,

    image1: product.image1,
    image2: product.image2,
    addImage1: product.addImage1,
    addImage2: product.addImage2,
    detailImage: product.detailImage,
    detailHtml: product.detailHtml,

    originType: product.originType as OriginType,
    originLocal: product.originLocal,
    originForeign: product.originForeign,

    kidsKcType: product.kidsKcType as KcType,
    kidsKcCertId: product.kidsKcCertId,
    kidsKcFile: product.kidsKcFile,
    elecKcType: product.elecKcType as KcType,
    elecKcCertId: product.elecKcCertId,
    elecKcFile: product.elecKcFile,
    dailyKcType: product.dailyKcType as KcType,
    dailyKcCertId: product.dailyKcCertId,
    dailyKcFile: product.dailyKcFile,
    broadcastingKcType: product.broadcastingKcType as KcType,
    broadcastingKcCertId: product.broadcastingKcCertId,
    broadcastingKcFile: product.broadcastingKcFile,

    childExitCheckerKcType: product.childExitCheckerKcType as KcType,
    childExitCheckerKcCertId: product.childExitCheckerKcCertId,
    childExitCheckerKcFile: product.childExitCheckerKcFile,
    safetyCheckKcType: product.safetyCheckKcType as KcType,
    safetyCheckKcCertId: product.safetyCheckKcCertId,
    safetyCheckKcFile: product.safetyCheckKcFile,

    asTelephone1: product.phone,
    asTelephone2: product.asPhone,

    naraRegisterYn: product.naraRegistered ? 'Y' : 'N',
    naraAmt: product.naraPrice,
    siteName: product.otherSiteName,
    siteUrl: product.otherSiteUrl,
    otherSiteRegisterYn: product.otherSiteRegistered ? 'Y' : 'N',
    otherSiteAmt: product.otherSitePrice,

    addressCode: product.addressCode,
    address: product.address,
    addressDetail: product.addressDetail,
    approvalRequest: product.approvalRequest,

    ppsContractYn: product.ppsContractYn ? 'Y' : 'N',
    ppsContractStartDate: product.ppsContractStartDate,
    ppsContractEndDate: product.ppsContractEndDate,

    selPower: product.ratedPower,
    selWeight: product.sizeAndWeight,
    selSameDate: product.sameModelDate,
    selArea: product.coolingHeatingArea,
    selProduct: product.productComposition,
    selSafety: product.safetyMark,
    selCapacity: product.capacity,
    selSpecification: product.mainSpec,

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

    selected: false,
    result: product.result,
  }
}

// ---------- Conversion: ExcelRegistrationData → Product ----------

export function excelDataToProduct(data: ExcelRegistrationData, id?: string): Product {
  return {
    id: id || `product-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,

    name: data.goodsName || data['물품명'] || '',
    spec: data.spec || data['규격'] || '',
    modelName: data.modelName || data['모델명'] || '',
    manufacturer: data.factory || data['제조사'] || '',
    material: data.material || data['소재/재질'] || '',
    salesUnit: data.salesUnit || data['판매단위'] || '개',
    stockQuantity: parseInt(data.remainQnt || '9999', 10) || 9999,
    price: parseInt(data.estimateAmt || '0', 10) || 0,
    taxType: data.taxType || data['과세여부'] || '과세(세금계산서)',
    saleType: data.saleTypeText || data['등록구분'] || '물품',
    warranty: data.assure || data['보증기간'] || '1년',

    category1: data.category1 || data['카테고리1'] || '',
    category2: data.category2 || data['카테고리2'] || '',
    category3: data.category3 || data['카테고리3'] || '',
    g2bNumber: data.g2bNumber || data['G2B 물품목록번호'] || '',

    deliveryPeriod: data.deliveryLimitText || data['납품가능기간'] || '7일',
    quoteValidity: data.estimateValidity || data['견적서 유효기간'] || '30일',
    deliveryFeeType: data.deliveryFeeKindText || data['배송비종류'] || '무료',
    deliveryFee: parseFloat(data.deliveryFee || '0') || 0,
    returnFee: parseFloat(data.returnFee || '3500') || 3500,
    bundleShipping: (data.deliveryGroupYn || data['묶음배송여부'] || 'Y') === 'Y',
    jejuShipping: (data.jejuDeliveryYn || data['제주배송여부'] || 'N') === 'Y',
    jejuAdditionalFee: parseFloat(data.jejuDeliveryFee || '0') || 0,
    deliveryMethod: data.deliveryMethod || data['배송방법'] || '택배',
    deliveryAreas: data.deliveryAreas || [],

    image1: data.image1 || data['기본이미지1'] || '',
    image2: data.image2 || data['기본이미지2'] || '',
    addImage1: data.addImage1 || data['추가이미지1'] || '',
    addImage2: data.addImage2 || data['추가이미지2'] || '',
    detailImage: data.detailImage || data['상세이미지'] || '',
    detailHtml: data.detailHtml || data['상세설명HTML'] || '',

    originType: data.originType || data['원산지구분'] || '국내',
    originLocal: data.originLocal || data['국내원산지'] || '',
    originForeign: data.originForeign || data['해외원산지'] || '',

    kidsKcType: data.kidsKcType || 'N',
    kidsKcCertId: data.kidsKcCertId || '',
    kidsKcFile: data.kidsKcFile || '',
    elecKcType: data.elecKcType || 'N',
    elecKcCertId: data.elecKcCertId || '',
    elecKcFile: data.elecKcFile || '',
    dailyKcType: data.dailyKcType || 'N',
    dailyKcCertId: data.dailyKcCertId || '',
    dailyKcFile: data.dailyKcFile || '',
    broadcastingKcType: data.broadcastingKcType || 'N',
    broadcastingKcCertId: data.broadcastingKcCertId || '',
    broadcastingKcFile: data.broadcastingKcFile || '',

    childExitCheckerKcType: data.childExitCheckerKcType || 'N',
    childExitCheckerKcCertId: data.childExitCheckerKcCertId || '',
    childExitCheckerKcFile: data.childExitCheckerKcFile || '',
    safetyCheckKcType: data.safetyCheckKcType || 'N',
    safetyCheckKcCertId: data.safetyCheckKcCertId || '',
    safetyCheckKcFile: data.safetyCheckKcFile || '',

    consumptionPeriodType: data['소비기한선택'] || '',
    consumptionPeriodValue: data['소비기한입력'] || '',

    ratedPower: data.selPower || data['정격전압/소비전력'] || '',
    sizeAndWeight: data.selWeight || data['크기및무게'] || '',
    sameModelDate: data.selSameDate || data['동일모델출시년월'] || '',
    coolingHeatingArea: data.selArea || data['냉난방면적'] || '',
    productComposition: data.selProduct || data['제품구성'] || '',
    safetyMark: data.selSafety || data['안전표시'] || '',
    capacity: data.selCapacity || data['용량'] || '',
    mainSpec: data.selSpecification || data['주요사양'] || '',

    certWoman: (data.womanCert || data['여성기업']) === 'Y',
    certDisabledCompany: (data.disabledCompanyCert || data['장애인기업']) === 'Y',
    certFoundation: (data.foundationCert || data['창업기업']) === 'Y',
    certDisabled: (data.disabledCert || data['장애인표준사업장']) === 'Y',
    certSevereDisabled: (data.severalCert || data['중증장애인생산품']) === 'Y',
    certCooperation: (data.cooperationCert || data['협동조합']) === 'Y',
    certSociety: (data.societyCert || data['우수재활용제품']) === 'Y',
    certRecycle: (data.recycleCert || data['환경표지']) === 'Y',
    certEnvironment: (data.environmentCert || data['저탄소제품']) === 'Y',
    certLowCarbon: (data.lowCarbonCert || data['SW품질인증']) === 'Y',
    certSwQuality: (data.swQualityCert || data['신제품인증(NEP)']) === 'Y',
    certNep: (data.nepCert || data['신제품인증(NET)']) === 'Y',
    certNet: (data.netCert || data['녹색기술인증제품']) === 'Y',
    certGreenProduct: (data.greenProductCert || data['성능인증제품(EPC)']) === 'Y',
    certEpc: (data.epcCert || data['우수조달제품']) === 'Y',
    certProcure: (data.procureCert || data['마을기업']) === 'Y',
    certTown: (data.seoulTownCert || data['자활기업']) === 'Y',
    certSelf: (data.seoulSelfCert || data['예비사회적기업']) === 'Y',
    certCollaboration: (data.seoulCollaborationCert || data['사회적협동조합']) === 'Y',
    certReserve: (data.seoulReserveCert || data['여성기업']) === 'Y',

    ppsContractYn: (data.ppsContractYn || data['조달청계약여부'] || 'N') === 'Y',
    ppsContractStartDate: data.ppsContractStartDate || data['계약시작일'] || '',
    ppsContractEndDate: data.ppsContractEndDate || data['계약종료일'] || '',

    phone: data.asTelephone1 || data['전화번호'] || '',
    asPhone: data.asTelephone2 || data['제조사 A/S전화번호'] || '',

    naraRegistered: (data.naraRegisterYn || data['나라장터등록여부'] || 'N') === 'Y',
    naraPrice: data.naraAmt || data['나라장터등록가격'] || '',
    otherSiteName: data.siteName || data['사이트명'] || '',
    otherSiteUrl: data.siteUrl || data['사이트주소'] || '',
    otherSiteRegistered: (data.otherSiteRegisterYn || data['타사이트등록여부'] || 'N') === 'Y',
    otherSitePrice: data.otherSiteAmt || data['타사이트등록가격'] || '',

    addressCode: data.addressCode || data['도로명 코드'] || '',
    address: data.address || data['주소'] || '',
    addressDetail: data.addressDetail || data['나머지 주소'] || '',

    approvalRequest: data.approvalRequest || data['승인관련 요청사항'] || '',

    sourceUrl: (data as any).sourceUrl || '',
    listThumbnail: (data as any).listThumbnail || '',

    result: data.result || '',
  }
}

// ---------- Conversion: SourcingItem → Product ----------

export function sourcingItemToProduct(item: SourcingItemPayload): Product {
  const info = item.additionalInfo || {}
  const excel = item.excelMapped?.[0] || {}

  // 원산지 파싱 로직
  const originStr = excel['원산지구분'] || info.originType || item.origin || ''
  const overseasStr = excel['해외원산지'] || info.originOverseas || ''
  let originType = '국내'
  let originLocal = ''
  let originForeign = ''

  if (
    originStr.includes('수입') ||
    originStr.includes('국외') ||
    originStr.includes('중국') ||
    originStr.includes('아시아')
  ) {
    originType = '국외'
    if (overseasStr.includes('중국') || originStr.includes('중국')) originForeign = '중국'
    else if (overseasStr.includes('베트남') || originStr.includes('베트남')) originForeign = '베트남'
    else originForeign = '기타'
  } else if (originStr.includes('국내') || originStr.includes('한국')) {
    originType = '국내'
    originLocal = '기타'
  }

  const estimateAmt = excel['제시금액'] || item.price || 0

  return {
    id: `sourcing-${Date.now()}-${item.key}`,

    name: excel['물품명'] || item.name || '',
    spec: excel['규격'] || info.spec || '',
    modelName: excel['모델명'] || info.modelName || '상세설명참고',
    manufacturer: excel['제조사'] || info.brand || item.vendor || '상세설명참고',
    material: excel['소재/재질'] || info.material || '상세설명참고',
    salesUnit: excel['판매단위'] || info.salesUnit || '개',
    stockQuantity: parseInt((excel['재고수량'] ?? info.stock ?? 9999).toString(), 10) || 9999,
    price: parseInt(estimateAmt.toString(), 10) || 0,
    taxType: excel['과세여부'] || info.taxType || '과세(세금계산서)',
    saleType: excel['등록구분'] || info.saleTypeText || '물품',
    warranty: excel['보증기간'] || info.warranty || '1년',

    category1: excel['카테고리1'] || info.category1 || '',
    category2: excel['카테고리2'] || info.category2 || '',
    category3: excel['카테고리3'] || info.category3 || '',
    g2bNumber: excel['G2B 물품목록번호'] || item.g2bItemNo || info.g2bItemNo || '',

    deliveryPeriod: excel['납품가능기간'] || info.deliveryPeriod || '7일',
    quoteValidity: excel['견적서 유효기간'] || info.estimateValidity || '30일',
    deliveryFeeType: excel['배송비종류'] || info.shippingFeeType || '무료',
    deliveryFee: parseFloat((excel['배송비'] || info.shippingFee || 0).toString()) || 0,
    returnFee: parseFloat((excel['반품배송비'] || info.returnShippingFee || 3500).toString()) || 3500,
    bundleShipping: (excel['묶음배송여부'] || 'Y') === 'Y',
    jejuShipping: (excel['제주배송여부'] || 'N') === 'Y',
    jejuAdditionalFee: parseFloat((excel['제주추가배송비'] || 0).toString()) || 0,
    deliveryMethod: excel['배송방법'] || '택배',
    deliveryAreas: (excel['배송지역']?.toString().split(',') || []).map((a: string) => a.trim()).filter(Boolean),

    image1: excel['기본이미지1'] || info.images?.[0] || item.listThumbnail || '',
    image2: excel['기본이미지2'] || info.images?.[1] || '',
    addImage1: excel['추가이미지1'] || info.images?.[2] || '',
    addImage2: excel['추가이미지2'] || info.images?.[3] || '',
    detailImage: excel['상세이미지'] || info.imageDetail || info.images?.[4] || '',
    detailHtml: excel['상세설명HTML'] || info.content || '',

    originType,
    originLocal,
    originForeign,

    kidsKcType: excel['어린이제품KC유형'] || 'N',
    kidsKcCertId: excel['어린이제품KC인증번호'] || '',
    kidsKcFile: excel['어린이제품KC성적서'] || '',
    elecKcType: excel['전기용품KC유형'] || 'N',
    elecKcCertId: excel['전기용품KC인증번호'] || '',
    elecKcFile: excel['전기용품KC성적서'] || '',
    dailyKcType: excel['생활용품KC유형'] || 'N',
    dailyKcCertId: excel['생활용품KC인증번호'] || '',
    dailyKcFile: excel['생활용품KC성적서'] || '',
    broadcastingKcType: excel['방송통신KC유형'] || 'N',
    broadcastingKcCertId: excel['방송통신KC인증번호'] || '',
    broadcastingKcFile: excel['방송통신KC성적서'] || '',

    childExitCheckerKcType: excel['어린이하차확인장치타입'] || 'N',
    childExitCheckerKcCertId: '',
    childExitCheckerKcFile: '',
    safetyCheckKcType: excel['안전확인대상타입'] || 'N',
    safetyCheckKcCertId: '',
    safetyCheckKcFile: '',

    consumptionPeriodType: '',
    consumptionPeriodValue: '',

    ratedPower: '',
    sizeAndWeight: '',
    sameModelDate: '',
    coolingHeatingArea: '',
    productComposition: '',
    safetyMark: '',
    capacity: '',
    mainSpec: '',

    certWoman: false,
    certDisabledCompany: false,
    certFoundation: false,
    certDisabled: false,
    certSevereDisabled: false,
    certCooperation: false,
    certSociety: false,
    certRecycle: false,
    certEnvironment: false,
    certLowCarbon: false,
    certSwQuality: false,
    certNep: false,
    certNet: false,
    certGreenProduct: false,
    certEpc: false,
    certProcure: false,
    certTown: false,
    certSelf: false,
    certCollaboration: false,
    certReserve: false,

    ppsContractYn: false,
    ppsContractStartDate: '',
    ppsContractEndDate: '',

    phone: excel['전화번호'] || '',
    asPhone: excel['제조사 A/S전화번호'] || '',

    naraRegistered: (excel['나라장터등록여부'] || 'N') === 'Y',
    naraPrice: '',
    otherSiteName: '',
    otherSiteUrl: '',
    otherSiteRegistered: (excel['타사이트등록여부'] || 'N') === 'Y',
    otherSitePrice: '',

    addressCode: '',
    address: '',
    addressDetail: '',

    approvalRequest: excel['승인관련 요청사항'] || '',

    sourceUrl: item.url || info.url || '',
    listThumbnail: item.listThumbnail || '',

    result: '',
  }
}

// ---------- Default Product (empty) ----------

export function createDefaultProduct(id?: string): Product {
  return {
    id: id || `product-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: '',
    spec: '',
    modelName: '',
    manufacturer: '',
    material: '',
    salesUnit: '개',
    stockQuantity: 9999,
    price: 0,
    taxType: '과세(세금계산서)',
    saleType: '물품',
    warranty: '1년',
    category1: '',
    category2: '',
    category3: '',
    g2bNumber: '',
    deliveryPeriod: '7일',
    quoteValidity: '30일',
    deliveryFeeType: '무료',
    deliveryFee: 0,
    returnFee: 3500,
    bundleShipping: true,
    jejuShipping: false,
    jejuAdditionalFee: 0,
    deliveryMethod: '택배',
    deliveryAreas: [],
    image1: '',
    image2: '',
    addImage1: '',
    addImage2: '',
    detailImage: '',
    detailHtml: '',
    originType: '국내',
    originLocal: '',
    originForeign: '',
    kidsKcType: 'N',
    kidsKcCertId: '',
    kidsKcFile: '',
    elecKcType: 'N',
    elecKcCertId: '',
    elecKcFile: '',
    dailyKcType: 'N',
    dailyKcCertId: '',
    dailyKcFile: '',
    broadcastingKcType: 'N',
    broadcastingKcCertId: '',
    broadcastingKcFile: '',
    childExitCheckerKcType: 'N',
    childExitCheckerKcCertId: '',
    childExitCheckerKcFile: '',
    safetyCheckKcType: 'N',
    safetyCheckKcCertId: '',
    safetyCheckKcFile: '',
    consumptionPeriodType: '',
    consumptionPeriodValue: '',
    ratedPower: '',
    sizeAndWeight: '',
    sameModelDate: '',
    coolingHeatingArea: '',
    productComposition: '',
    safetyMark: '',
    capacity: '',
    mainSpec: '',
    certWoman: false,
    certDisabledCompany: false,
    certFoundation: false,
    certDisabled: false,
    certSevereDisabled: false,
    certCooperation: false,
    certSociety: false,
    certRecycle: false,
    certEnvironment: false,
    certLowCarbon: false,
    certSwQuality: false,
    certNep: false,
    certNet: false,
    certGreenProduct: false,
    certEpc: false,
    certProcure: false,
    certTown: false,
    certSelf: false,
    certCollaboration: false,
    certReserve: false,
    ppsContractYn: false,
    ppsContractStartDate: '',
    ppsContractEndDate: '',
    phone: '',
    asPhone: '',
    naraRegistered: false,
    naraPrice: '',
    otherSiteName: '',
    otherSiteUrl: '',
    otherSiteRegistered: false,
    otherSitePrice: '',
    addressCode: '',
    address: '',
    addressDetail: '',
    approvalRequest: '',
    sourceUrl: '',
    listThumbnail: '',
    result: '',
  }
}
