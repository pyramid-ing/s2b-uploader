/**
 * 등록용 엑셀 데이터 인터페이스
 */

// KC 인증 타입
export type KcType = 'Y' | 'F' | 'N'

// 등록 구분 타입
export type SaleType = '물품' | '용역'

// 배송비 종류 타입
export type DeliveryFeeType = '무료' | '유료' | '조건부무료'

// 납품 가능 기간 타입
export type DeliveryLimitType = '3일' | '5일' | '7일' | '15일' | '30일' | '45일'

// 원산지 구분 타입
export type OriginType = '국내' | '국외' | ''

// 과세 여부 타입
export type TaxType = '과세(세금계산서)' | '면세'

// 배송 방법 타입
export type DeliveryMethodType = '택배' | '직배송' | '우편 또는 등기'

// 소비기한 선택 타입
export type ConsumptionPeriodType =
  | '제품에 별도 표시'
  | '제조일로부터 1년'
  | '상세설명에 별도표시'
  | '제조일/가공일로부터 14일 이내 물품 발송'
  | '직접입력'

// 등록용 엑셀 데이터 인터페이스
export interface ExcelRegistrationData {
  // UI 관련 필드 (엑셀에는 저장되지 않음)
  selected?: boolean
  result?: string
  // 참고용 필드들 (회색 배경)
  구매처?: string
  구매처URL?: string
  KC문제?: string
  이미지사용여부?: string
  최소구매수량?: number
  원가?: number

  // 기본 상품 정보
  'G2B 물품목록번호'?: string
  카테고리1?: string
  카테고리2?: string
  카테고리3?: string
  등록구분?: SaleType
  물품명: string
  규격?: string
  모델명?: string
  제조사?: string
  '소재/재질'?: string
  판매단위?: string
  보증기간?: string
  납품가능기간?: DeliveryLimitType
  '견적서 유효기간'?: string
  배송비종류?: DeliveryFeeType
  배송비?: number
  반품배송비?: number
  묶음배송여부?: 'Y' | 'N'
  제주배송여부?: 'Y' | 'N'
  제주추가배송비?: number
  상세설명HTML?: string

  // 이미지 필드
  기본이미지1?: string
  기본이미지2?: string
  추가이미지1?: string
  추가이미지2?: string
  상세이미지?: string

  // 원산지 정보
  원산지구분?: OriginType
  국내원산지?: string
  해외원산지?: string

  // 배송 정보
  배송방법?: DeliveryMethodType
  배송지역?: string

  // 전기용품 관련
  '정격전압/소비전력'?: string
  크기및무게?: string
  동일모델출시년월?: string
  냉난방면적?: string
  제품구성?: string
  안전표시?: string
  용량?: string
  주요사양?: string

  // 소비기한 관련
  소비기한선택?: ConsumptionPeriodType | string
  소비기한입력?: string

  // 어린이 하차 확인 장치
  어린이하차확인장치타입?: KcType | string
  어린이하차확인장치인증번호?: string
  어린이하차확인장치첨부파일?: string

  // 안전 확인 대상
  안전확인대상타입?: KcType | string
  안전확인대상신고번호?: string
  안전확인대상첨부파일?: string

  // 조달청 계약
  조달청계약여부?: 'Y' | 'N' | string
  계약시작일?: string
  계약종료일?: string

  // 연락처
  전화번호?: string
  '제조사 A/S전화번호'?: string

  // 과세 정보
  과세여부?: TaxType

  // KC 인증 정보
  어린이제품KC유형?: KcType
  어린이제품KC인증번호?: string
  어린이제품KC성적서?: string
  전기용품KC유형?: KcType
  전기용품KC인증번호?: string
  전기용품KC성적서?: string
  생활용품KC유형?: KcType
  생활용품KC인증번호?: string
  생활용품KC성적서?: string
  방송통신KC유형?: KcType
  방송통신KC인증번호?: string
  방송통신KC성적서?: string

  // 인증 정보
  여성기업?: 'Y' | 'N'
  장애인기업?: 'Y' | 'N'
  창업기업?: 'Y' | 'N'
  장애인표준사업장?: 'Y' | 'N'
  중증장애인생산품?: 'Y' | 'N'
  사회적협동조합?: 'Y' | 'N'
  우수재활용제품?: 'Y' | 'N'
  환경표지?: 'Y' | 'N'
  저탄소제품?: 'Y' | 'N'
  SW품질인증?: 'Y' | 'N'
  '신제품인증(NEP)'?: 'Y' | 'N'
  '신제품인증(NET)'?: 'Y' | 'N'
  녹색기술인증제품?: 'Y' | 'N'
  '성능인증제품(EPC)'?: 'Y' | 'N'
  우수조달제품?: 'Y' | 'N'
  마을기업?: 'Y' | 'N'
  자활기업?: 'Y' | 'N'
  협동조합?: 'Y' | 'N'
  예비사회적기업?: 'Y' | 'N'

  // 나라장터 정보
  나라장터등록여부?: 'Y' | 'N'
  나라장터등록가격?: string

  // 타사이트 정보
  사이트명?: string
  사이트주소?: string
  타사이트등록여부?: 'Y' | 'N'
  타사이트등록가격?: string

  // 주소 정보
  '도로명 코드'?: string
  주소?: string
  '나머지 주소'?: string

  // 승인 관련
  '승인관련 요청사항'?: string

  // 가격 및 재고 (계산된 값)
  제시금액?: number
  재고수량?: number

  // 등록 처리용 필드 (엑셀에서 읽어온 후 변환된 값)
  goodsName?: string
  spec?: string
  modelName?: string
  estimateAmt?: string
  factory?: string
  material?: string
  remainQnt?: string
  assure?: string
  returnFee?: string
  exchangeFee?: string
  estimateValidity?: string
  g2bNumber?: string
  saleTypeText?: SaleType
  saleType?: string
  category1?: string
  category2?: string
  category3?: string
  deliveryFeeKindText?: DeliveryFeeType
  deliveryFeeKind?: string
  deliveryFee?: string
  deliveryGroupYn?: string
  jejuDeliveryYn?: string
  jejuDeliveryFee?: string
  kidsKcType?: KcType
  kidsKcCertId?: string
  kidsKcFile?: string
  elecKcType?: KcType
  elecKcCertId?: string
  elecKcFile?: string
  dailyKcType?: KcType
  dailyKcCertId?: string
  dailyKcFile?: string
  broadcastingKcType?: KcType
  broadcastingKcCertId?: string
  broadcastingKcFile?: string
  image1?: string
  image2?: string
  addImage1?: string
  addImage2?: string
  detailImage?: string
  detailHtml?: string
  deliveryLimitText?: DeliveryLimitType
  deliveryLimit?: string
  originType?: OriginType
  originLocal?: string
  originForeign?: string
  salesUnit?: string
  taxType?: TaxType
  womanCert?: string
  disabledCompanyCert?: string
  foundationCert?: string
  disabledCert?: string
  severalCert?: string
  cooperationCert?: string
  societyCert?: string
  recycleCert?: string
  environmentCert?: string
  lowCarbonCert?: string
  swQualityCert?: string
  nepCert?: string
  netCert?: string
  greenProductCert?: string
  epcCert?: string
  procureCert?: string
  seoulTownCert?: string
  seoulSelfCert?: string
  seoulCollaborationCert?: string
  seoulReserveCert?: string
  childExitCheckerKcType?: KcType
  childExitCheckerKcCertId?: string
  childExitCheckerKcFile?: string
  safetyCheckKcType?: KcType
  safetyCheckKcCertId?: string
  safetyCheckKcFile?: string
  naraRegisterYn?: string
  naraAmt?: string
  siteName?: string
  siteUrl?: string
  otherSiteRegisterYn?: string
  otherSiteAmt?: string
  deliveryMethod?: string
  deliveryAreas?: string[]
  asTelephone1?: string
  asTelephone2?: string
  addressCode?: string
  address?: string
  addressDetail?: string
  ppsContractYn?: string
  ppsContractStartDate?: string
  ppsContractEndDate?: string
  selPower?: string
  selWeight?: string
  selSameDate?: string
  selArea?: string
  selProduct?: string
  selSafety?: string
  selCapacity?: string
  selSpecification?: string
  validateRadio?: string
  fValidate?: string
  approvalRequest?: string
}

// 엑셀에서 읽어온 원시 데이터 타입
export interface ExcelRawData {
  [key: string]: any
}

// 설정값 세트 인터페이스
export interface ConfigSet {
  id: string
  name: string
  isDefault: boolean
  isActive: boolean
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
    /**
     * 옵션 처리 방법
     * - 'split': 옵션별로 풀어서 각각 개별 상품으로 생성 (기본값)
     * - 'single': 옵션이 있는 상품을 하나의 상품으로 묶어서 생성
     */
    optionHandling: 'split' | 'single'
  }
  createdAt: string
  updatedAt: string
}
