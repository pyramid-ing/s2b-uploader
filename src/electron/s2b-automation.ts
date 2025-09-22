import { chromium, Browser, BrowserContext, Page } from 'playwright'
import * as XLSX from 'xlsx'
import path from 'node:path'
import * as fsSync from 'fs'
import fsPromises from 'fs/promises'
import * as fs from 'fs'
import dayjs from 'dayjs'
import axios from 'axios'
import crypto from 'crypto'
import FileType from 'file-type'
import sharp from 'sharp'
import { pick } from 'lodash'
import { normalizeUrl, VENDOR_CONFIG, VendorConfig, VendorKey } from './sourcing-config'

interface SourcingCrawlData {
  url: string
  vendor: VendorKey | null
  name?: string
  productCode?: string
  categories: string[]
  price?: number
  shippingFee?: string
  minPurchase?: number
  imageUsage?: string
  certifications?: { type: string; number: string }[]
  origin?: string
  manufacturer?: string
  options?: { name: string; price?: number; qty?: number }[][]
  mainImages: string[]
  detailImages: string[]
  listThumbnail?: string
  특성?: { label: string; value: string }[]
  // detailOcrText?: string
}

interface AIRefinedResult {
  물품명: string
  모델명: string
  '소재/재질': string
  원산지구분: '국내' | '국외'
  국내원산지: string
  해외원산지: string
  어린이제품KC인증번호: string
  전기용품KC인증번호: string
  생활용품KC인증번호: string
  방송통신KC인증번호: string
  이미지사용여부: '허용' | '불가' | '모름'
  options: { name: string; price: number; qty: number }[]
  특성: string[]
}

interface ExtractedBasicInfo {
  name: string | null
  productCode: string | null
  price: number | null
  shippingFee: string | null
  minPurchase?: number
  imageUsage?: string
  certifications?: { type: string; number: string }[]
  origin: string | null
  manufacturer: string | null
  categories: string[]
  options?: { name: string; price?: number; qty?: number }[][]
}

interface ProductData {
  // 등록구분을 위한 텍스트 값
  saleTypeText: SaleType

  goodsName: string // 물품명
  spec: string // 규격
  modelName: string // 모델명
  estimateAmt: string // 제시금액
  factory: string // 제조사
  material: string // 소재/재질
  remainQnt: string // 재고수량
  assure: string // 보증기간
  returnFee: string // 반품배송비
  exchangeFee: string // 교환배송비

  estimateValidity?: string // 견적서 유효기간

  // 납품가능기간
  deliveryLimitText: DeliveryLimitType // 텍스트 형태의 납품가능기간
  deliveryLimit: string // 납품가능기간

  // 카테고리 관련
  category1: string // 1차 카테고리
  category2: string // 2차 카테고리
  category3: string // 3차 카테고리

  // 인증정보
  womanCert: string // 여성기업
  disabledCompanyCert: string // 장애인기업
  foundationCert: string // 창업기업
  disabledCert: string // 장애인표준사업장
  severalCert: string // 중증장애인생산품
  cooperationCert: string // 사회적협동조합
  societyCert: string // 사회적기업
  recycleCert: string // 우수재활용제품
  environmentCert: string // 환경표지제품
  lowCarbonCert: string // 저탄소인증
  swQualityCert: string // SW품질인증
  nepCert: string // 신제품인증
  netCert: string // 신기술인증
  greenProductCert: string // 녹색기술인증
  epcCert: string // 성능인증
  procureCert: string // 우수조달제품
  seoulTownCert: string // 마을기업
  seoulSelfCert: string // 자활기업
  seoulCollaborationCert: string // 협동조합
  seoulReserveCert: string // 예비사회적기업

  g2bNumber?: string // G2B 물품목록번호

  // KC 인증 정보 추가
  // 어린이제품 인증
  kidsKcType: string // 'Y': 인증번호등록, 'F': 공급자적합성확인, 'N': 인증표시대상아님
  kidsKcCertId?: string // 국가기술표준원 인증번호
  kidsKcFile?: string // 공급자적합성확인 시험성적서 파일경로

  // 전기용품 인증
  elecKcType: string // 'Y': 인증번호등록, 'F': 공급자적합성확인, 'N': 인증표시대상아님
  elecKcCertId?: string // 국가기술표준원 인증번호
  elecKcFile?: string // 공급자적합성확인 시험성적서 파일경로

  // 생활용품 인증
  dailyKcType: string // 'Y': 인증번호등록, 'F': 공급자적합성확인, 'N': 인증표시대상아님
  dailyKcCertId?: string // 국가기술표준원 인증번호
  dailyKcFile?: string // 공급자적합성확인 시험성적서 파일경로

  // 방송통신기자재 인증
  broadcastingKcType: string // 'Y': 인증번호등록, 'F': 공급자적합성확인, 'N': 인증표시대상아님
  broadcastingKcCertId?: string // KC 전파적합성인증 번호
  broadcastingKcFile?: string // 공급자적합성확인 시험성적서 파일경로

  // 배송비 관련
  deliveryFeeKindText: DeliveryFeeType
  deliveryFeeKind: string // 배송비 종류 (1: 무료, 2: 유료, 3: 조건부무료)
  deliveryFee: string // 배송비 금액
  deliveryGroupYn: string // 묶음배송여부 (Y/N)
  jejuDeliveryYn: string // 제주배송여부 (Y/N)
  jejuDeliveryFee?: string // 제주추가배송비

  // 상세설명 및 이미지
  detailHtml: string // 상세설명 HTML
  image1?: string // 기본이미지1 파일경로
  image2?: string // 기본이미지2 파일경로
  addImage1?: string // 추가이미지1 파일경로
  addImage2?: string // 추가이미지2 파일경로
  detailImage?: string // 상세이미지 파일경로

  // 원산지 관련 필드 추가
  originType: HomeType
  originLocal: string // 국내인 경우: "경기", "서울" 등
  originForeign: string // 국외인 경우: "중국", "일본" 등

  // 판매단위와 과세여부 필드 추가
  salesUnit: string // 판매단위: "개", "세트", "박스" 등
  taxType: string // 과세여부: "과세(세금계산서)", "비과세(계산서)", "비과세(영수증)"

  childExitCheckerKcType?: string // 어린이 하차 확인 장치 부품 성능 확인서 등록 타입
  childExitCheckerKcCertId?: string // 어린이 하차 확인 장치 인증번호
  childExitCheckerKcFile?: string // 어린이 하차 확인 장치 첨부 파일

  safetyCheckKcType?: string // 안전확인대상 생활화학제품 신고번호 등록 타입
  safetyCheckKcCertId?: string // 안전확인대상 생활화학제품 신고번호
  safetyCheckKcFile?: string // 안전확인대상 생활화학제품 첨부 파일

  naraRegisterYn?: 'Y' | 'N' // 나라장터 등록 여부
  naraAmt?: string // 나라장터 등록 가격
  siteName?: string // 사이트명
  siteUrl?: string // 사이트 주소
  otherSiteRegisterYn?: 'Y' | 'N' // 타사이트 등록 여부
  otherSiteAmt?: string // 타사이트 등록 가격

  ppsContractYn?: string // 조달청 계약 여부 (Y/N)
  ppsContractStartDate?: string // 조달청 계약 시작일
  ppsContractEndDate?: string // 조달청 계약 종료일

  // AS 정보
  asTelephone1?: string // 일반 전화번호
  asTelephone2?: string // 제조사 A/S 전화번호
  addressCode?: string // 도로명 코드
  address?: string // 주소
  addressDetail?: string // 나머지 주소

  // 카테고리별 입력사항
  selPower?: string // 정격전압/소비전력
  selWeight?: string // 크기 및 무게
  selSameDate?: string // 동일모델 출시년월
  selArea?: string // 냉난방면적
  selProduct?: string // 제품구성
  selSafety?: string // 안전표시(주의,경고)
  selCapacity?: string // 용량
  selSpecification?: string // 주요사양
  // 소비기한
  validateRadio?: string // 소비기한 선택 (라디오 버튼 값)
  fValidate?: string // 소비기한 직접입력 (직접 입력 필드 값)

  deliveryMethod?: string // 배송 방법 (1: 택배, 2: 직배송, 3: 우편 또는 등기)
  // 새로 추가된 필드
  deliveryAreas?: string[] // 선택된 배송 지역 이름 배열

  approvalRequest: string // 승인관련 요청사항
}

type SaleType = '물품' | '용역'
type DeliveryFeeType = '무료' | '유료' | '조건부무료'
type HomeType = '국내' | '국외'
type DeliveryLimitType = '3일' | '5일' | '7일' | '15일' | '30일' | '45일'

const DELIVERY_METHOD_MAP: Record<string, string> = {
  택배: '1',
  직배송: '2',
  '우편 또는 등기': '3',
}

const DELIVERY_LIMIT_MAP: Record<DeliveryLimitType, string> = {
  '3일': 'ZD000001',
  '5일': 'ZD000002',
  '7일': 'ZD000003',
  '15일': 'ZD000004',
  '30일': 'ZD000005',
  '45일': 'ZD000006',
}

// 매핑 객체에 타입 지정
const SALE_TYPE_MAP: Record<SaleType, string> = {
  물품: '1',
  용역: '3',
}

const DELIVERY_TYPE_MAP: Record<DeliveryFeeType, string> = {
  무료: '1',
  유료: '2',
  조건부무료: '3',
}

const HOME_DIVI_MAP: Record<HomeType, string> = {
  국내: '1',
  국외: '2',
}

const CONSUMPTION_PERIOD_MAP: Record<string, string> = {
  '제품에 별도 표시': '제품에 별도 표시',
  '제조일로부터 1년': '제조일로부터 1년',
  '상세설명에 별도표시': '상세설명에 별도표시',
  '제조일/가공일로부터 14일 이내 물품 발송': '제조일/가공일로부터 14일 이내 물품 발송',
  직접입력: 'date',
}

const KC_TYPE_MAP: Record<string, string> = {
  Y: 'Y',
  F: 'F',
  N: 'N',
  인증번호등록: 'Y',
  '공급자적합성확인 시험성적서등록': 'F',
  인증표시대상아님: 'N',
}

// 유효한 배송 지역 목록
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
]

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

interface BrowserInstance {
  browser: Browser | null
  context: BrowserContext | null
  page: Page | null
}

export class S2BAutomation {
  // 기능별로 별개의 브라우저 관리
  private static browsers: {
    sourcing: BrowserInstance
    registration: BrowserInstance
    management: BrowserInstance
  } = {
    sourcing: { browser: null, context: null, page: null },
    registration: { browser: null, context: null, page: null },
    management: { browser: null, context: null, page: null },
  }

  private browser: Browser | null = null
  private settings: any = null
  private context: BrowserContext | null = null
  private page: Page | null = null
  private baseFilePath: string // 이미지 기본 경로
  private chromePath: string // Chrome 실행 파일 경로 추가
  private dialogErrorMessage: string | null = null // dialog 에러 메시지 추적
  private imageOptimize: boolean = false // 이미지 최적화 여부
  private logCallback: (message: string, level?: 'info' | 'warning' | 'error') => void
  private headless: boolean // ✅ headless mode

  constructor(
    baseImagePath: string,
    logCallback: (message: string, level?: 'info' | 'warning' | 'error') => void,
    headless: boolean = false,
    settings?: any,
  ) {
    this.baseFilePath = baseImagePath
    this.logCallback = logCallback
    this.headless = headless
    this.settings = settings

    // OS별 Chrome 기본 설치 경로 설정
    if (process.platform === 'darwin') {
      // macOS
      this.chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    } else if (process.platform === 'win32') {
      // Windows
      const possiblePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
      ]
      this.chromePath = possiblePaths.find(p => fsSync.existsSync(p)) || ''
    } else {
      // Linux
      this.chromePath = '/usr/bin/google-chrome'
    }

    if (!fsSync.existsSync(this.chromePath)) {
      throw new Error('Chrome 브라우저를 찾을 수 없습니다. Chrome이 설치되어 있는지 확인해주세요.')
    }
    if (!this.chromePath || !fsSync.existsSync(this.chromePath)) {
      throw new Error('Chrome 실행 파일 경로를 찾을 수 없습니다. Windows 환경에서 Chrome이 설치되어 있는지 확인하세요.')
    }
  }

  // ==================== PUBLIC METHODS ====================

  public setImageOptimize(optimize: boolean): void {
    this.imageOptimize = optimize
  }

  public async login(id: string, password: string): Promise<void> {
    if (!this.page) throw new Error('브라우저가 초기화되지 않았습니다.')

    await this.page.goto('https://www.s2b.kr/S2BNCustomer/Login.do?type=sp&userDomain=')
    await this.page.fill('form[name="vendor_loginForm"] [name="uid"]', id)
    await this.page.fill('form[name="vendor_loginForm"] [name="pwd"]', password)
    await this.page.click('form[name="vendor_loginForm"] .btn_login > a')
    await this.page.waitForLoadState('networkidle')
  }

  public async readExcelFile(filePath: string): Promise<any[]> {
    this._log('엑셀 파일 스트림 읽기 시작', 'info')

    const stream = fs.createReadStream(filePath)
    const rawData = await this._readExcelStream(stream)

    // 5) 데이터 변환 및 반환
    return rawData.map((row: any) => {
      const rawSaleType = row['등록구분']?.toString() || '물품'
      const saleTypeText = this._validateSaleType(rawSaleType)

      // 배송비종류 타입 체크 및 변환
      const rawDeliveryFeeType = row['배송비종류']?.toString() || '무료'
      const deliveryFeeKindText = this._validateDeliveryFeeType(rawDeliveryFeeType)

      // 납품가능기간 타입 체크 및 변환
      const rawDeliveryLimit = row['납품가능기간']?.toString() || '7일'
      const deliveryLimitText = this._validateDeliveryLimit(rawDeliveryLimit)

      return {
        goodsName: row['물품명']?.toString() || '',
        spec: row['규격']?.toString() || '',
        modelName: row['모델명']?.toString() || '',
        estimateAmt: row['제시금액']?.toString() || '',
        factory: row['제조사']?.toString() || '',
        material: row['소재/재질']?.toString() || '',
        remainQnt: row['재고수량']?.toString() || '',
        assure: row['보증기간']?.toString() || '1년',
        returnFee: row['반품배송비']?.toString() || '',
        exchangeFee: row['교환배송비']?.toString() || '',

        estimateValidity: row['견적서 유효기간']?.toString() || '30일', // 기본값은 "30일"

        // G2B 물품목록번호 읽기
        g2bNumber: row['G2B 물품목록번호']?.toString(),

        // 등록구분 매핑 추가
        saleTypeText,
        saleType: SALE_TYPE_MAP[saleTypeText],

        category1: row['카테고리1']?.toString().trim() || '',
        category2: row['카테고리2']?.toString().trim() || '',
        category3: row['카테고리3']?.toString().trim() || '',

        // 배송비 정보 매핑 수정
        deliveryFeeKindText,
        deliveryFeeKind: DELIVERY_TYPE_MAP[deliveryFeeKindText],
        deliveryFee: row['배송비']?.toString() || '',
        deliveryGroupYn: row['묶음배송여부']?.toString() || 'Y',
        jejuDeliveryYn: row['제주배송여부']?.toString() || 'N',
        jejuDeliveryFee: row['제주추가배송비']?.toString(),

        // KC 인증 정보
        kidsKcType: KC_TYPE_MAP[row['어린이제품KC유형']?.toString().trim()] || 'N',
        kidsKcCertId: row['어린이제품KC인증번호']?.toString(),
        kidsKcFile: row['어린이제품KC성적서']?.toString(),

        elecKcType: KC_TYPE_MAP[row['전기용품KC유형']?.toString().trim()] || 'N',
        elecKcCertId: row['전기용품KC인증번호']?.toString(),
        elecKcFile: row['전기용품KC성적서']?.toString(),

        dailyKcType: KC_TYPE_MAP[row['생활용품KC유형']?.toString().trim()] || 'N',
        dailyKcCertId: row['생활용품KC인증번호']?.toString(),
        dailyKcFile: row['생활용품KC성적서']?.toString(),

        broadcastingKcType: KC_TYPE_MAP[row['방송통신KC유형']?.toString().trim()] || 'N',
        broadcastingKcCertId: row['방송통신KC인증번호']?.toString(),
        broadcastingKcFile: row['방송통신KC성적서']?.toString(),

        // 이미지 및 상세설명
        image1: row['기본이미지1']?.toString(),
        image2: row['기본이미지2']?.toString(),
        addImage1: row['추가이미지1']?.toString(),
        addImage2: row['추가이미지2']?.toString(),
        detailImage: row['상세이미지']?.toString(),
        detailHtml: row['상세설명HTML']?.toString() || '',

        // 납품가능기간
        deliveryLimitText,
        deliveryLimit: DELIVERY_LIMIT_MAP[deliveryLimitText],

        // 원산지 정보 매핑 (자동입력)
        originType: row['원산지구분']?.toString() || '국내',
        originLocal: row['국내원산지']?.toString() || '서울',
        originForeign: row['해외원산지']?.toString() || '',

        // 판매단위와 과세여부
        salesUnit: row['판매단위']?.toString() || '개',
        taxType: row['과세여부']?.toString() || '과세(세금계산서)',
        // 인증정보
        womanCert: row['여성기업']?.toString() || 'N',
        disabledCompanyCert: row['장애인기업']?.toString() || 'N',
        foundationCert: row['창업기업']?.toString() || 'N',
        disabledCert: row['장애인표준사업장']?.toString() || 'N',
        severalCert: row['중증장애인생산품']?.toString() || 'N',
        cooperationCert: row['사회적협동조합']?.toString() || 'N',
        societyCert: row['우수재활용제품']?.toString() || 'N',
        recycleCert: row['우수재활용제품']?.toString() || 'N',
        environmentCert: row['환경표지']?.toString() || 'N',
        lowCarbonCert: row['저탄소제품']?.toString() || 'N',
        swQualityCert: row['SW품질인증']?.toString() || 'N',
        nepCert: row['신제품인증(NEP)']?.toString() || 'N',
        netCert: row['신제품인증(NET)']?.toString() || 'N',
        greenProductCert: row['녹색기술인증제품']?.toString() || 'N',
        epcCert: row['성능인증제품(EPC)']?.toString() || 'N',
        procureCert: row['우수조달제품']?.toString() || 'N',
        seoulTownCert: row['마을기업']?.toString() || 'N',
        seoulSelfCert: row['자활기업']?.toString() || 'N',
        seoulCollaborationCert: row['협동조합']?.toString() || 'N',
        seoulReserveCert: row['예비사회적기업']?.toString() || 'N',

        childExitCheckerKcType: row['어린이하차확인장치타입']?.toString() || 'N',
        childExitCheckerKcCertId: row['어린이하차확인장치인증번호']?.toString(),
        childExitCheckerKcFile: row['어린이하차확인장치첨부파일']?.toString(),

        safetyCheckKcType: row['안전확인대상타입']?.toString() || 'N',
        safetyCheckKcCertId: row['안전확인대상신고번호']?.toString(),
        safetyCheckKcFile: row['안전확인대상첨부파일']?.toString(),

        naraRegisterYn: row['나라장터등록여부']?.toString().trim() || 'N',
        naraAmt: row['나라장터등록가격']?.toString().trim() || '',
        siteName: row['사이트명']?.toString().trim() || '',
        siteUrl: row['사이트주소']?.toString().trim() || '',
        otherSiteRegisterYn: row['타사이트등록여부']?.toString().trim() || 'N',
        otherSiteAmt: row['타사이트등록가격']?.toString().trim() || '',

        deliveryMethod: DELIVERY_METHOD_MAP[row['배송방법']?.toString().trim()] || '1', // 기본값: 택배
        // 배송 지역 처리
        deliveryAreas: row['배송지역']?.split(',').map((area: string) => area.trim()) || [],

        asTelephone1: row['전화번호']?.toString() || '',
        asTelephone2: row['제조사 A/S전화번호']?.toString() || '',
        addressCode: row['도로명 코드']?.toString() || '',
        address: row['주소']?.toString() || '',
        addressDetail: row['나머지 주소']?.toString() || '',

        ppsContractYn: row['조달청계약여부']?.toString() || 'N',
        ppsContractStartDate: row['계약시작일'] ? dayjs(row['계약시작일'].toString()).format('YYYYMMDD') : '',
        ppsContractEndDate: row['계약종료일'] ? dayjs(row['계약종료일'].toString()).format('YYYYMMDD') : '',

        selPower: row['정격전압/소비전력']?.toString() || '',
        selWeight: row['크기및무게']?.toString() || '',
        selSameDate: row['동일모델출시년월']?.toString() || '',
        selArea: row['냉난방면적']?.toString() || '',
        selProduct: row['제품구성']?.toString() || '',
        selSafety: row['안전표시']?.toString() || '',
        selCapacity: row['용량']?.toString() || '',
        selSpecification: row['주요사양']?.toString() || '',
        // 소비기한 매핑
        validateRadio: CONSUMPTION_PERIOD_MAP[row['소비기한선택']] || '',
        fValidate: row['소비기한입력']?.toString(),

        approvalRequest: row['승인관련 요청사항']?.toString() || '',
      }
    })
  }

  // 소싱용 브라우저 시작
  public async launchSourcing(): Promise<void> {
    await this._launchBrowser('sourcing')
  }

  // 상품등록용 브라우저 시작
  public async launchRegistration(): Promise<void> {
    await this._launchBrowser('registration')
  }

  // 관리일 연장용 브라우저 시작
  public async launchManagement(): Promise<void> {
    await this._launchBrowser('management')
  }

  public async collectNormalizedDetailForUrls(urls: string[]): Promise<
    (SourcingCrawlData & {
      excelMapped?: any[] // 최종 엑셀 매핑 결과 (옵션별로 배열)
    })[]
  > {
    // 소싱용 브라우저로 전환
    await this.launchSourcing()

    if (!this.page) throw new Error('Browser page not initialized')
    const outputs: (SourcingCrawlData & {
      excelMapped?: any[]
    })[] = []

    for (const url of urls) {
      this._log(`상품 데이터 수집 시작: ${url}`, 'info')

      const { vendorKey, vendor } = this._getVendor(url)

      await this._navigateToUrl(url)

      const basicInfo = await this._extractBasicInfo(vendorKey, vendor)

      // 상품별 저장 폴더 생성 (downloads/YYYYMMDD/<상품명_타임스탬프>)
      const baseName = (basicInfo.name || basicInfo.productCode || 'product').toString()
      const productDir = this._createProductDir(baseName)

      const { savedMainImages, detailCapturePath } = await this._collectImages(vendor, productDir)
      const 특성 = await this._collectAdditionalInfo(vendor)

      // 1. 크롤링된 원본 데이터
      const crawlData: SourcingCrawlData = {
        url,
        vendor: vendorKey,
        name: basicInfo.name || undefined,
        productCode: basicInfo.productCode || undefined,
        categories: basicInfo.categories,
        price: basicInfo.price ?? undefined,
        shippingFee: basicInfo.shippingFee || undefined,
        minPurchase: basicInfo.minPurchase,
        imageUsage: basicInfo.imageUsage,
        certifications: basicInfo.certifications,
        origin: basicInfo.origin || undefined,
        manufacturer: basicInfo.manufacturer || undefined,
        options: basicInfo.options,
        mainImages: savedMainImages,
        detailImages: detailCapturePath ? [detailCapturePath] : [],
        // detailOcrText,
        특성,
      }

      this._log(`AI 데이터 정제 시작: ${basicInfo.name}`, 'info')

      // 2. AI 데이터 정제
      const aiRefined = await this._refineCrawlWithAI(crawlData)

      // 3. 카테고리 매핑
      const categoryMapped =
        basicInfo.categories && basicInfo.categories.length >= 3
          ? await this._mapCategories(vendorKey || '', basicInfo.categories)
          : {}

      // 4. 최종 엑셀 매핑 (설정 전달)
      const excelMapped = this._mapToExcelFormat(crawlData, aiRefined, categoryMapped, this.settings)

      this._log(`데이터 정제 완료: ${basicInfo.name}`, 'info')

      outputs.push({
        ...crawlData,
        excelMapped,
      })
    }
    return outputs
  }

  public async extendManagementDateForRange(
    startDate: string,
    endDate: string,
    registrationStatus: string = '',
  ): Promise<void> {
    // 관리일 연장용 브라우저로 전환
    await this.launchManagement()

    if (!this.page) throw new Error('브라우저가 초기화되지 않았습니다.')
    try {
      await this._gotoAndSearchListPageByRange(startDate, endDate, registrationStatus)
      const products = await this._collectAllProductLinks()
      await this._processExtendProducts(products)
    } finally {
      // 관리용 브라우저는 닫지 않음 (다른 인스턴스에서 사용할 수 있음)
    }
  }

  public async close(): Promise<void> {
    // 인스턴스 변수만 초기화 (공유 브라우저/페이지는 유지)
    this.page = null
    this.context = null
    this.browser = null
  }

  public getCurrentUrl(): string {
    try {
      return this.page?.url() ?? ''
    } catch {
      return ''
    }
  }

  public async openUrl(url: string): Promise<void> {
    if (!this.page) throw new Error('Browser page not initialized')
    await this.page.goto(url, { waitUntil: 'domcontentloaded' })
  }

  public async collectListFromUrl(
    targetUrl: string,
  ): Promise<{ name: string; url: string; price?: number; listThumbnail?: string }[]> {
    // 소싱용 브라우저로 전환
    await this.launchSourcing()

    if (!this.page) throw new Error('Browser page not initialized')

    const vendorKey = this._detectVendorByUrl(targetUrl)
    if (!vendorKey) throw new Error('지원하지 않는 사이트 입니다.')
    const vendor: VendorConfig = VENDOR_CONFIG[vendorKey]

    await this.page.goto(targetUrl, { waitUntil: 'domcontentloaded' })

    const hrefs: string[] = await this.page.evaluate((xpath: string) => {
      const result: string[] = []
      const iterator = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null)
      let node = iterator.iterateNext() as any
      while (node) {
        if (node instanceof HTMLAnchorElement && node.href) {
          result.push(node.href)
        } else if ((node as Element).getAttribute) {
          const href = (node as Element).getAttribute('href')
          if (href) result.push(href)
        }
        node = iterator.iterateNext() as any
      }
      return result
    }, vendor.product_list_xpath)

    const names: string[] = await this.page.evaluate((xpath: string) => {
      const result: string[] = []
      const iterator = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null)
      let node = iterator.iterateNext() as any
      while (node) {
        const text = (node as Element).textContent || ''
        result.push(text.trim())
        node = iterator.iterateNext() as any
      }
      return result
    }, vendor.product_name_list_xpath)

    // 썸네일 이미지 추출
    let thumbnails: (string | null)[] = []
    if (vendor.product_thumbnail_list_xpath) {
      thumbnails = await this.page.evaluate((xpath: string) => {
        const result: (string | null)[] = []
        const iterator = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null)
        let node = iterator.iterateNext() as any
        while (node) {
          if (node instanceof HTMLImageElement) {
            result.push(node.src || null)
          } else {
            result.push(null)
          }
          node = iterator.iterateNext() as any
        }
        return result
      }, vendor.product_thumbnail_list_xpath)
    }

    // 가격 리스트 시도: 1) 명시 XPath, 2) 앵커 주변 휴리스틱
    let prices: (number | null)[] = []
    if (vendor.product_price_list_xpath) {
      const priceTexts: string[] = await this.page.evaluate((xpath: string) => {
        const result: string[] = []
        const iterator = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null)
        let node = iterator.iterateNext() as any
        while (node) {
          const text = (node as Element).textContent || ''
          result.push(text.trim())
          node = iterator.iterateNext() as any
        }
        return result
      }, vendor.product_price_list_xpath)
      prices = priceTexts.map(t => {
        const digits = t.replace(/[^0-9]/g, '')
        return digits ? Number(digits) : null
      })
    }

    // 매핑: 길이가 불일치하면 가격은 휴리스틱으로 보강
    const items = hrefs.map((rawHref, idx) => {
      const href = normalizeUrl(rawHref, vendor)
      let price: number | undefined = undefined
      if (prices[idx] != null) {
        price = prices[idx] ?? undefined
      }
      const listThumbnail = thumbnails[idx] || undefined
      return { name: names[idx] || '', url: href, price, listThumbnail }
    })

    // 가격 누락건 보정: 각 앵커의 부모 요소에서 가격 후보 텍스트 탐색
    const needsPrice = items.some(it => typeof it.price === 'undefined')
    if (needsPrice) {
      const fallbackPrices: (number | null)[] = await this.page.evaluate((xpath: string) => {
        const anchors: Element[] = []
        const iterator = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null)
        let node = iterator.iterateNext() as any
        while (node) {
          anchors.push(node as Element)
          node = iterator.iterateNext() as any
        }
        const results: (number | null)[] = []
        for (const a of anchors) {
          let container: Element | null = a.closest('li') || a.parentElement
          if (!container) {
            results.push(null)
            continue
          }
          const text = (container.textContent || '').replace(/\s+/g, ' ')
          const match = text.match(/([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{4,})\s*(?:원|W|won)?/i)
          if (match && match[1]) {
            const digits = match[1].replace(/[^0-9]/g, '')
            results.push(digits ? Number(digits) : null)
          } else {
            results.push(null)
          }
        }
        return results
      }, vendor.product_list_xpath)

      items.forEach((it, i) => {
        if (typeof it.price === 'undefined' && fallbackPrices[i] != null) {
          it.price = fallbackPrices[i] ?? undefined
        }
      })
    }

    return items
  }

  public async registerProduct(data: ProductData): Promise<void> {
    // 상품등록용 브라우저로 전환
    await this.launchRegistration()
    this._setupRegistrationPopupHandlers()

    if (!this.page) throw new Error('브라우저가 초기화되지 않았습니다.')

    this.dialogErrorMessage = null // 초기화

    // 등록 프로세스를 위한 dialog 이벤트 핸들러
    const handleRegistrationDialog = async dialog => {
      const message = dialog.message()

      switch (dialog.type()) {
        case 'alert':
          // 특정 메시지 필터링: 성공 처리 메시지
          if (message.includes('S2B의 "견적정보 등록"은 지방자치단체를 당사자로 하는 계약에 관한 법률 시행령 제30조')) {
            await dialog.accept() // "확인" 버튼 자동 클릭
          } else if (
            message.includes('등록대기 상태로 변경되었으며') ||
            message.includes('식품을 등록 할 경우 소비기한은 필수 입력 값입니다')
          ) {
            // 무시
            await dialog.accept()
          } else {
            console.error('Registration Error:', message)
            this.dialogErrorMessage = message // 에러 메시지 저장
            await dialog.dismiss() // Alert 닫기
          }
          break

        case 'confirm':
          // 모든 confirm 다이얼로그는 기본적으로 거절
          await dialog.dismiss()
          break
      }
    }

    // 등록 프로세스를 위한 dialog 이벤트 리스너 등록
    this.page.on('dialog', handleRegistrationDialog)

    // ✅ 로그: 상품 등록 시작
    this._log(`상품 등록 시작: ${data.goodsName}`, 'info')

    try {
      await this.page.goto('https://www.s2b.kr/S2BNVendor/rema100.do?forwardName=goRegistView')
      this._log('상품 등록 페이지 접속 완료', 'info')

      // 상품 등록 폼
      try {
        await this.page.waitForSelector('select[name="sale_type"]', { timeout: 10000 })
      } catch (error) {
        if (error && error.name === 'TimeoutError') {
          throw new Error('상품 등록 폼이 10초 내에 로드되지 않았습니다. (타임아웃)')
        }
        throw error
      }
      this._log('상품 등록 폼 로드 완료', 'info')

      // ✅ 팝업 닫기 로직
      try {
        await this.page.waitForSelector('article.popup.alert', { timeout: 5000 }) // 팝업 감지
        await this.page.evaluate(() => {
          const closeButton = document.querySelector('span.btn_popclose a') as HTMLElement
          if (closeButton) {
            closeButton.click() // 닫기 버튼 클릭
          }
        })
        this._log('팝업이 성공적으로 닫혔습니다.', 'info')
      } catch (error) {
        this._log('팝업이 발견되지 않았습니다. 계속 진행합니다.', 'warning')
      }

      // ✅ 단계별 입력 처리
      // 기본 정보 입력
      this._log('기본 정보 입력 중...', 'info')
      await this._setBasicInfo(data)
      this._log('기본 정보 입력 완료', 'info')

      // 이미지 업로드
      this._log('이미지 업로드 시작', 'info')
      await this._uploadAllImages(data)
      this._log('이미지 업로드 완료', 'info')

      // 카테고리 선택
      this._log('카테고리 선택 중...', 'info')
      await this._selectCategory(data)
      this._log('카테고리 선택 완료', 'info')

      // 카테고리별 입력사항 설정
      this._log('카테고리별 상세 정보 입력 중...', 'info')
      await this._setCategoryDetails(data)

      // 인증정보 설정
      this._log('인증 정보 입력 중...', 'info')
      await this._setCertifications(data)

      // KC 인증 정보 설정
      this._log('KC 인증 정보 입력 중...', 'info')
      await this._setKcCertifications(data)

      // 기타첨부서류
      this._log('기타 첨부 서류 업로드 중...', 'info')
      await this._setOtherAttachments(data)

      // G2B 물품목록번호 설정
      this._log(`G2B 정보 입력 중 (번호: ${data.g2bNumber})`, 'info')
      await this._setG2bInformation(data.g2bNumber)

      // 조달청 계약여부
      this._log('조달청 계약 여부 설정 중...', 'info')
      await this._setPpsContract(data)

      // 배송정보
      this._log('배송 정보 입력 중...', 'info')
      await this._setDeliveryInfo(data)

      // 배송비 설정
      this._log('배송비 정보 입력 중...', 'info')
      await this._setDeliveryFee(data)

      // 상세설명 HTML 설정
      this._log('상세 설명 입력 중...', 'info')
      await this._setDetailHtml(data.detailHtml)

      // 나라장터 정보 설정
      this._log('나라장터 정보 입력 중...', 'info')
      await this._setNaraInformation(data)

      // 타사이트 정보 설정
      this._log('타 사이트 정보 입력 중...', 'info')
      await this._setOtherSiteInformation(data)

      // 판매단위와 과세여부 설정
      this._log('판매 단위 및 과세 여부 설정 중...', 'info')
      await this._setSalesUnitAndTax(data)

      // 반품/교환 배송비 입력
      this._log('반품/교환 배송비 입력 중...', 'info')
      await this._setReturnExchangeFee(data)

      // AS정보입력
      this._log('AS 정보 입력 중...', 'info')
      await this._setAsInfo(data)

      // 원산지 정보 설정
      this._log('원산지 정보 입력 중...', 'info')
      await this._setOriginInfo(data)

      // 청렴서약서 동의 및 등록
      this._log('청렴서약서 등록 중...', 'info')
      await this._submitRegistration()

      // ✅ Dialog 에러 확인
      if (this.dialogErrorMessage) {
        this._log(`등록 중 에러 발생: ${this.dialogErrorMessage}`, 'error')
        throw new Error(this.dialogErrorMessage) // 에러 발생 시 throw
      }

      // ✅ 최종 성공 로그
      this._log(`✅ 상품 등록 성공: ${data.goodsName}`, 'info')
    } catch (error) {
      this._log(`상품 등록 실패: ${error.message}`, 'error')
      throw error
    } finally {
      // 등록 프로세스 완료 후 dialog 이벤트 리스너 제거
      if (this.page) {
        this.page.off('dialog', handleRegistrationDialog)
      }
    }
  }

  // 브라우저 시작 공통 메서드
  private async _launchBrowser(type: keyof typeof S2BAutomation.browsers): Promise<void> {
    const browserInstance = S2BAutomation.browsers[type]

    if (!browserInstance.browser) {
      browserInstance.browser = await chromium.launch({
        headless: this.headless,
        executablePath: this.chromePath,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      })

      browserInstance.context = await browserInstance.browser.newContext({
        viewport: null,
      })

      browserInstance.page = await browserInstance.context.newPage()
    }

    this.browser = browserInstance.browser
    this.context = browserInstance.context
    this.page = browserInstance.page
  }

  // 팝업 감지 및 처리 설정 (상품등록용)
  private _setupRegistrationPopupHandlers(): void {
    if (!this.context) return

    this.context.on('page', async newPage => {
      const url = newPage.url()
      console.log(`Detected popup with URL: ${url}`)

      // 팝업 URL별 처리
      if (url.includes('certificateInfo_pop.jsp')) {
        // certificateInfo_pop.jsp 팝업은 바로 닫기
        console.log('Closing popup for certificateInfo_pop.jsp.')
        await newPage.close()
      } else if (url.includes('mygPreviewerThumb.jsp')) {
        // mygPreviewerThumb.jsp 팝업에서 iframe 내 상태 검사
        try {
          await delay(3000)

          // iframe 로드 대기
          await newPage.waitForSelector('#MpreviewerImg', { timeout: 20000 })

          // iframe 내부 상태 확인
          const resizeStatus = await newPage.evaluate(() => {
            const iframe = document.querySelector('#MpreviewerImg iframe') as HTMLIFrameElement
            if (!iframe) return null

            const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document
            if (!iframeDoc) return null

            const statusElement = iframeDoc.querySelector('#reSizeStatus')
            return statusElement?.textContent?.trim() || null
          })

          if (resizeStatus === 'pass') {
            console.log('Upload passed. Closing popup.')
            await newPage.close() // 조건 충족 시 팝업 닫기
          } else {
            console.log(`Upload status: ${resizeStatus}. Popup remains open.`)
          }
        } catch (error) {
          console.error('Error while interacting with mygPreviewerThumb.jsp:', error)
          await newPage.close() // 에러 발생 시 팝업 닫기
        }
      } else if (url.includes('rema100_statusWaitPopup.jsp')) {
        // rema100_statusWaitPopup.jsp 팝업 처리
        try {
          console.log('Interacting with rema100_statusWaitPopup.jsp popup.')

          // 팝업 로드 대기 및 버튼 클릭
          await newPage.waitForSelector('[onclick^="fnConfirm("]', { timeout: 5000 })

          await newPage.evaluate(() => {
            const confirmButton = document.querySelector('[onclick^="fnConfirm(\'1\')"]')
            if (confirmButton instanceof HTMLElement) {
              confirmButton.click() // 버튼 클릭
              console.log('Confirm button clicked.')
            } else {
              throw new Error('Confirm button not found.')
            }
          })
        } catch (error) {
          console.error('Error interacting with rema100_statusWaitPopup.jsp:', error)
          await newPage.close() // 에러 발생 시 팝업 닫기
        }
      } else {
        console.log('Popup URL does not match any criteria. Leaving it open.')
      }
    })

    // 페이지 로드 타임아웃 설정 (선택사항)
    if (this.page) {
      this.page.setDefaultNavigationTimeout(30000)
      this.page.setDefaultTimeout(30000)
    }
  }

  private async _setBasicInfo(data: ProductData): Promise<void> {
    if (!this.page) return

    // 등록구분 선택 (텍스트 기반 매핑 사용)
    await this.page.selectOption('select[name="sale_type"]', SALE_TYPE_MAP[data.saleTypeText] || '1')

    await this.page.fill('input[name="f_goods_name"]', data.goodsName)
    await this.page.fill('input[name="f_size"]', data.spec)

    // 보증기간 초기화 후 입력
    await this.page.evaluate(() => {
      const el = document.querySelector('input[name="f_assure"]') as HTMLInputElement
      if (el) el.value = ''
    })
    await this.page.fill('input[name="f_assure"]', data.assure)

    if (data.modelName) {
      await this.page.check('input[name="f_model_yn"][value="N"]')
      await this.page.fill('input[name="f_model"]', data.modelName)
    }

    await this.page.fill('input[name="f_estimate_amt"]', data.estimateAmt)
    await this.page.fill('input[name="f_factory"]', data.factory)
    await this.page.fill('input[name="f_material"]', data.material)
    await this.page.fill('input[name="f_remain_qnt"]', data.remainQnt)

    // 납품가능기간 설정
    await this.page.evaluate(
      deliveryLimitData => {
        const select = document.querySelector('select[name="f_delivery_limit"]') as HTMLSelectElement
        if (select) {
          select.value = deliveryLimitData.code
          select.dispatchEvent(new Event('change', { bubbles: true }))
        }
      },
      { code: data.deliveryLimit },
    )

    // 승인관련 요청사항 입력
    if (data.approvalRequest) {
      await this.page.fill('input[name="f_memo"]', data.approvalRequest)
    }

    // 견적서 유효기간 선택
    if (data.estimateValidity) {
      const validityMap: { [key: string]: string } = {
        '30일': 'ZD000004',
        '15일': 'ZD000003',
        '10일': 'ZD000002',
        '7일': 'ZD000001',
      }

      const optionValue = validityMap[data.estimateValidity]
      if (optionValue) {
        await this.page.selectOption('select[name="f_estimate_validate_code"]', optionValue)
      } else {
        console.error(`Invalid estimate validity: ${data.estimateValidity}`)
      }
    }
  }

  private async _setG2bInformation(g2bNumber: string): Promise<void> {
    if (!this.page) throw new Error('브라우저가 초기화되지 않았습니다.')

    try {
      if (g2bNumber) {
        // G2B 물품목록번호 입력
        await this.page.fill('input[name="f_uid2"]', g2bNumber)

        // 등록 버튼 클릭
        await this.page.click('a[href^="javascript:fnCheckApiG2B();"]')
        console.log('G2B 물품목록번호 등록 버튼 클릭됨.')

        // G2B 데이터가 나타날 때까지 대기
        try {
          await this.page.waitForSelector('#apiData', { timeout: 10000 })
        } catch (error) {
          if (error.name === 'TimeoutError') {
            throw new Error('G2B 데이터가 10초 내에 로드되지 않았습니다. (타임아웃)')
          }
          throw error
        }
        console.log('G2B 물품목록번호 등록 성공.')

        // G2B 등록된 데이터 확인
        const g2bData = await this.page.evaluate(() => {
          const row = document.querySelector('#apiData')
          if (!row) return null

          const imageSrc = row.querySelector('img')?.getAttribute('src') || ''
          const productName = row.children[1]?.textContent?.trim() || ''
          const categoryId = row.children[2]?.textContent?.trim() || ''
          const detailId = row.children[3]?.textContent?.trim() || ''
          const productId = row.children[4]?.textContent?.trim() || ''

          return { imageSrc, productName, categoryId, detailId, productId }
        })

        if (g2bData) {
          console.log('등록된 G2B 데이터:', g2bData)
        } else {
          console.error('G2B 데이터가 발견되지 않음.')
          throw new Error('G2B 데이터가 발견되지 않음.')
        }
      }
    } catch (error) {
      console.error('G2B 물품목록번호 등록 중 오류 발생:', error)
      throw error
    }
  }

  private async _setReturnExchangeFee(data: ProductData): Promise<void> {
    if (!this.page) return

    // 반품배송비 입력
    if (data.returnFee) {
      await this.page.evaluate(() => {
        const el = document.querySelector('input[name="f_return_fee"]') as HTMLInputElement
        if (el) el.value = ''
      })
      await this.page.fill('input[name="f_return_fee"]', data.returnFee)
    }

    // 교환배송비 입력 (반품배송비의 2배)
    if (data.exchangeFee) {
      await this.page.evaluate(() => {
        const el = document.querySelector('input[name="f_exchange_fee"]') as HTMLInputElement
        if (el) el.value = ''
      })
      await this.page.fill('input[name="f_exchange_fee"]', data.exchangeFee)
    }
  }

  private async _setOriginInfo(data: ProductData): Promise<void> {
    if (!this.page) return

    // 원산지구분 선택
    const homeValue = HOME_DIVI_MAP[data.originType] || '1'
    await this.page.check(`input[name="f_home_divi"][value="${homeValue}"]`)
    await delay(500)

    if (data.originType === '국내' && data.originLocal) {
      await this.page.evaluate(localName => {
        const select = document.querySelector('#select_home_01') as HTMLSelectElement
        const options = Array.from(select.options)
        const option = options.find(opt => opt.text.includes(localName))
        if (option) {
          select.value = option.value
          select.dispatchEvent(new Event('change', { bubbles: true }))
        }
      }, data.originLocal)
    } else if (data.originType === '국외' && data.originForeign) {
      await this.page.evaluate(foreignName => {
        const select = document.querySelector('#select_home_02') as HTMLSelectElement
        const options = Array.from(select.options)
        const option = options.find(opt => opt.text.includes(foreignName))
        if (option) {
          select.value = option.value
          select.dispatchEvent(new Event('change', { bubbles: true }))
        }
      }, data.originForeign)
    }
  }

  private async _setDeliveryFee(data: ProductData): Promise<void> {
    if (!this.page) return

    // 배송비 종류 선택 (텍스트 기반 매핑 사용)
    const deliveryType = DELIVERY_TYPE_MAP[data.deliveryFeeKindText] || '1'
    await this.page.check(`input[name="f_delivery_fee_kind"][value="${deliveryType}"]`)

    if (deliveryType === '2' && data.deliveryFee) {
      // 유료배송
      await this.page.fill('input[name="f_delivery_fee1"]', data.deliveryFee)
    } else if (deliveryType === '3') {
      // 조건부무료
    }

    // 나머지 배송 관련 설정들...
    await this.page.check(`input[name="f_delivery_group_yn"][value="${data.deliveryGroupYn}"]`)

    if (data.jejuDeliveryYn === 'Y') {
      await this.page.check('input[name="f_jeju_delivery_yn"]')
      if (data.jejuDeliveryFee) {
        await this.page.fill('input[name="f_jeju_delivery_fee"]', data.jejuDeliveryFee)
      }
    }
  }

  private async _setSalesUnitAndTax(data: ProductData): Promise<void> {
    if (!this.page) return

    // 판매단위 선택
    await this.page.evaluate(unitText => {
      const select = document.querySelector('select[name="f_credit"]') as HTMLSelectElement
      const options = Array.from(select.options)
      const option = options.find(opt => opt.text === unitText)
      if (option) {
        select.value = option.value
        select.dispatchEvent(new Event('change', { bubbles: true }))
      } else {
        throw new Error(`판매단위 "${unitText}"를 찾을 수 없습니다.`)
      }
    }, data.salesUnit)

    // 과세여부 선택
    await this.page.evaluate(taxText => {
      const select = document.querySelector('select[name="f_tax_method"]') as HTMLSelectElement
      const options = Array.from(select.options)
      const option = options.find(opt => opt.text === taxText)
      if (option) {
        select.value = option.value
        select.dispatchEvent(new Event('change', { bubbles: true }))
      } else {
        throw new Error(`과세유형 "${taxText}"를 찾을 수 없습니다.`)
      }
    }, data.taxType)
  }

  private async _selectCategory(data: ProductData): Promise<void> {
    if (!this.page) return

    // 등록구분 선택
    await this.page.selectOption('select[name="sale_type"]', data.saleTypeText)

    // 1차 카테고리 선택 - 텍스트 기반으로 선택
    await this.page.evaluate(categoryText => {
      const select = document.querySelector('select[name="f_category_code1"]') as HTMLSelectElement
      const options = Array.from(select.options)
      const option = options.find(opt => opt.text === categoryText)
      if (option) {
        select.value = option.value
        // 변경 이벤트 발생
        const event = new Event('change', { bubbles: true })
        select.dispatchEvent(event)
      }
    }, data.category1)
    await delay(1000)

    // 2차 카테고리 선택
    await this.page.evaluate(categoryText => {
      const select = document.querySelector('select[name="f_category_code2"]') as HTMLSelectElement
      const options = Array.from(select.options)
      const option = options.find(opt => opt.text === categoryText)
      if (option) {
        select.value = option.value
        // 변경 이벤트 발생
        const event = new Event('change', { bubbles: true })
        select.dispatchEvent(event)
      }
    }, data.category2)
    await delay(1000)

    // 3차 카테고리 선택
    await this.page.evaluate(categoryText => {
      const select = document.querySelector('select[name="f_category_code3"]') as HTMLSelectElement
      const options = Array.from(select.options)
      const option = options.find(opt => opt.text === categoryText)
      if (option) {
        select.value = option.value
        // 변경 이벤트 발생
        const event = new Event('change', { bubbles: true })
        select.dispatchEvent(event)
      }
    }, data.category3)
  }

  private async _setCategoryDetails(data: ProductData): Promise<void> {
    if (!this.page) throw new Error('브라우저가 초기화되지 않았습니다.')

    // 소비기한 설정
    if (data.validateRadio) {
      await this.page.check(`input[name="validateRadio"][value="${data.validateRadio}"]`)
      if (data.validateRadio === 'date' && data.fValidate) {
        await this.page.fill('input[name="f_validate"]', data.fValidate)
      }
    }

    // 기존 카테고리별 입력사항 설정 로직
    if (data.selPower) await this.page.fill('input[name="f_sel_power"]', data.selPower)
    if (data.selWeight) await this.page.fill('input[name="f_sel_weight"]', data.selWeight)
    if (data.selSameDate) await this.page.fill('input[name="f_sel_samedate"]', data.selSameDate)
    if (data.selArea) await this.page.fill('input[name="f_sel_area"]', data.selArea)
    if (data.selProduct) await this.page.fill('input[name="f_sel_product"]', data.selProduct)
    if (data.selSafety) await this.page.fill('input[name="f_sel_safety"]', data.selSafety)
    if (data.selCapacity) await this.page.fill('input[name="f_sel_capacity"]', data.selCapacity)
    if (data.selSpecification) await this.page.fill('input[name="f_sel_specification"]', data.selSpecification)
  }

  private async _setCertifications(data: ProductData): Promise<void> {
    if (!this.page) return

    const certFields = [
      { name: 'f_woman_cert', value: data.womanCert },
      { name: 'f_disabledCompany_cert', value: data.disabledCompanyCert },
      { name: 'f_foundation_cert', value: data.foundationCert },
      { name: 'f_disabled_cert', value: data.disabledCert },
      { name: 'f_several_cert', value: data.severalCert },
      { name: 'f_cooperation_cert', value: data.cooperationCert },
      { name: 'f_society_cert', value: data.societyCert },
      { name: 'f_recycle_cert', value: data.recycleCert },
      { name: 'f_environment_cert', value: data.environmentCert },
      { name: 'f_lowCarbon_cert', value: data.lowCarbonCert },
      { name: 'f_swQuality_cert', value: data.swQualityCert },
      { name: 'f_nep_cert', value: data.nepCert },
      { name: 'f_net_cert', value: data.netCert },
      { name: 'f_greenProduct_cert', value: data.greenProductCert },
      { name: 'f_epc_cert', value: data.epcCert },
      { name: 'f_procure_cert', value: data.procureCert },
      { name: 'f_seoulTown_cert', value: data.seoulTownCert },
      { name: 'f_seoulSelf_cert', value: data.seoulSelfCert },
      { name: 'f_seoulCollaboration_cert', value: data.seoulCollaborationCert },
      { name: 'f_seoulReserve_cert', value: data.seoulReserveCert },
    ]

    for (const cert of certFields) {
      if (cert.value === 'Y') {
        await this.page.check(`input[name="${cert.name}"][value="Y"]`)
      }
    }
  }

  private async _setDetailHtml(html: string): Promise<void> {
    if (!this.page) return

    // iframe 내부의 에디터에 접근
    const se2Frame = this.page.frameLocator('iframe[src*="SmartEditor2Skin.html"]')

    try {
      // 메인 페이지에서 HTML 버튼 클릭
      await se2Frame.locator('.se2_to_html').click()

      // 버튼 클릭 후 약간의 대기 시간
      await delay(500)

      // 편집기 영역 선택 및 텍스트 입력
      await se2Frame.locator('.se2_input_htmlsrc').fill(html)

      // 메인 페이지에서 Editor 버튼 클릭하여 다시 에디터 모드로 전환
      await se2Frame.locator('.se2_to_editor').click()
    } catch (error) {
      console.error('Failed to set detail HTML:', error)
      throw error
    }
  }

  private async _setKcCertifications(data: ProductData): Promise<void> {
    if (!this.page) return

    // 어린이제품 KC
    await this.page.check(`input[name="kidsKcUseGubunChk"][value="${data.kidsKcType}"]`)
    if (data.kidsKcType === 'Y' && data.kidsKcCertId) {
      await this.page.fill('#kidsKcCertId', data.kidsKcCertId)
      await this.page.click('a[href="JavaScript:KcCertRegist(\'kids\');"]')
    } else if (data.kidsKcType === 'F' && data.kidsKcFile) {
      await this._uploadFile('#f_kcCertKidsImg_file', data.kidsKcFile)
    }

    // 전기용품 KC
    await this.page.check(`input[name="elecKcUseGubunChk"][value="${data.elecKcType}"]`)
    if (data.elecKcType === 'Y' && data.elecKcCertId) {
      await this.page.fill('#elecKcCertId', data.elecKcCertId)
      await this.page.click('a[href="JavaScript:KcCertRegist(\'elec\');"]')
    } else if (data.elecKcType === 'F' && data.elecKcFile) {
      await this._uploadFile('#f_kcCertElecImg_file', data.elecKcFile)
    }

    // 생활용품 KC
    await this.page.check(`input[name="dailyKcUseGubunChk"][value="${data.dailyKcType}"]`)
    if (data.dailyKcType === 'Y' && data.dailyKcCertId) {
      await this.page.fill('#dailyKcCertId', data.dailyKcCertId)
      await this.page.click('a[href="JavaScript:KcCertRegist(\'daily\');"]')
    } else if (data.dailyKcType === 'F' && data.dailyKcFile) {
      await this._uploadFile('#f_kcCertDailyImg_file', data.dailyKcFile)
    }

    // 방송통신기자재 KC
    await this.page.check(`input[name="broadcastingKcUseGubunChk"][value="${data.broadcastingKcType}"]`)
    if (data.broadcastingKcType === 'Y' && data.broadcastingKcCertId) {
      await this.page.fill('#broadcastingKcCertId', data.broadcastingKcCertId)
      await this.page.click('a[href="JavaScript:KcCertRegist(\'broadcasting\');"]')
    } else if (data.broadcastingKcType === 'F' && data.broadcastingKcFile) {
      await this._uploadFile('#f_kcCertBroadcastingImg_file', data.broadcastingKcFile)
    }
  }

  private async _setOtherAttachments(data: ProductData): Promise<void> {
    if (!this.page) throw new Error('브라우저가 초기화되지 않았습니다.')

    // 어린이 하차 확인 장치
    await this.page.check(`input[name="childexitcheckerKcUseGubunChk"][value="${data.childExitCheckerKcType}"]`)
    if (data.childExitCheckerKcType === 'Y' && data.childExitCheckerKcCertId) {
      await this.page.fill('#childexitcheckerKcCertId', data.childExitCheckerKcCertId)
      await this.page.click('a[href="JavaScript:KcCertRegist(\'childexitchecker\');"]')
    } else if (data.childExitCheckerKcType === 'F' && data.childExitCheckerKcFile) {
      await this._uploadFile('#f_kcCertChildExitCheckerImg_file', data.childExitCheckerKcFile)
    }

    // 안전확인대상 생활화학제품
    await this.page.check(`input[name="safetycheckKcUseGubunChk"][value="${data.safetyCheckKcType}"]`)
    if (data.safetyCheckKcType === 'Y' && data.safetyCheckKcCertId) {
      await this.page.fill('#safetycheckKcCertId', data.safetyCheckKcCertId)
    } else if (data.safetyCheckKcType === 'F' && data.safetyCheckKcFile) {
      await this._uploadFile('#f_kcCertSafetycheckImg_file', data.safetyCheckKcFile)
    }
  }

  private async _setPpsContract(data: ProductData): Promise<void> {
    if (!this.page) throw new Error('브라우저가 초기화되지 않았습니다.')

    // 계약 여부 설정
    await this.page.check(`input[name="f_pps_c_yn"][value="${data.ppsContractYn}"]`)

    // 계약일 입력
    if (data.ppsContractYn === 'Y') {
      if (data.ppsContractStartDate) {
        await this.page.fill('input[name="f_pps_c_s_dt"]', data.ppsContractStartDate)
      }

      if (data.ppsContractEndDate) {
        await this.page.fill('input[name="f_pps_c_e_dt"]', data.ppsContractEndDate)
      }
    }
  }

  private async _uploadFile(inputSelector: string, filePathOrUrl: string, statusSelector?: string): Promise<void> {
    if (!this.page) return

    // 이미지 타입별 이름 매핑
    const imageTypeMap: { [key: string]: string } = {
      '#f_img1_file': '기본이미지1',
      '#f_img2_file': '기본이미지2',
      '#f_img3_file': '추가이미지1',
      '#f_img4_file': '추가이미지2',
      '#f_goods_explain_img_file': '상세이미지',
    }

    const imageType = imageTypeMap[inputSelector] || '이미지'
    this._log(`${imageType} 업로드 시작: ${filePathOrUrl}`, 'info')

    let filePath: string

    try {
      // 임시 파일 저장
      const tempDir = path.join(this.baseFilePath, 'temp')
      if (!fsSync.existsSync(tempDir)) {
        fsSync.mkdirSync(tempDir)
      }

      // 외부 파일 다운로드 또는 로컬 파일 경로 설정
      if (filePathOrUrl.startsWith('http')) {
        const url = new URL(filePathOrUrl)
        const originalFileName = path.basename(url.pathname) || `image.jpg`

        // 파일명을 unique하게 만들기
        let counter = 1
        let fileName = originalFileName
        filePath = path.join(tempDir, fileName)

        // 동일한 파일명이 존재하면 숫자를 붙여서 unique하게 만듦
        while (fsSync.existsSync(filePath)) {
          const nameWithoutExt = path.parse(originalFileName).name
          const ext = path.parse(originalFileName).ext
          fileName = `${nameWithoutExt}_${counter}${ext}`
          filePath = path.join(tempDir, fileName)
          counter++
        }

        this._log(`외부 이미지 다운로드 시작: ${filePathOrUrl}`, 'info')
        try {
          const response = await axios.get(filePathOrUrl, { responseType: 'stream' })
          const writer = fsSync.createWriteStream(filePath)

          response.data.pipe(writer)

          await new Promise((resolve, reject) => {
            writer.on('finish', resolve)
            writer.on('error', reject)
          })
        } catch (err) {
          throw new Error(`외부 이미지 다운로드에 실패했습니다: ${filePathOrUrl}`)
        }

        // 다운로드 후 파일 존재 여부 확인
        if (!fsSync.existsSync(filePath)) {
          throw new Error(`외부 이미지를 찾을 수 없습니다: ${filePathOrUrl}`)
        }

        // 파일 타입 검사 (외부 URL)
        const fileTypeResult = await FileType.fromFile(filePath)
        if (!fileTypeResult || !fileTypeResult.mime.startsWith('image/')) {
          throw new Error(`외부 파일이 이미지가 아닙니다: ${filePathOrUrl}`)
        }

        this._log(`외부 이미지 확인완료: ${filePathOrUrl}`, 'info')
      } else {
        if (path.isAbsolute(filePathOrUrl)) {
          filePath = filePathOrUrl
        } else {
          filePath = path.join(this.baseFilePath, filePathOrUrl)
        }
        if (!fsSync.existsSync(filePath)) {
          throw new Error(`로컬 이미지를 찾을 수 없습니다: ${filePath}`)
        }
        // 파일 타입 검사 (로컬 파일)
        const fileTypeResult = await FileType.fromFile(filePath)
        if (!fileTypeResult || !fileTypeResult.mime.startsWith('image/')) {
          throw new Error(`로컬 파일이 이미지가 아닙니다: ${filePath}`)
        }

        this._log(`컴퓨터 이미지 확인완료: ${filePathOrUrl}`, 'info')
      }

      // 이미지 유형별 크기 조정
      let type: string = 'detail'

      switch (inputSelector) {
        case '#f_img1_file':
        case '#f_img2_file':
        case '#f_img3_file':
        case '#f_img4_file':
          type = 'thumb'
          break
        case '#f_goods_explain_img_file':
          type = 'detail'
          break
        default:
          this._log(`이미지 변환 처리 불필요: ${inputSelector}`, 'info')
          break
      }

      // sharp를 사용한 이미지 변환 처리
      this._log(`이미지 변환 처리 시작: ${imageType}`, 'info')

      let sharpInstance = sharp(filePath)

      // n8n의 ImageMagick 명령어와 동일한 로직 구현
      switch (type) {
        case 'thumb':
          // 1단계: 262x262로 cover 리사이즈 (크롭 포함) - ImageMagick의 '262x262^>'와 동일
          sharpInstance = sharpInstance.resize(262, 262, {
            fit: 'cover',
          })

          // 2단계: 1000x1000 이하로 inside 리사이즈 (확대 방지) - ImageMagick의 '1000x1000>'와 동일
          sharpInstance = sharpInstance.resize(1000, 1000, {
            fit: 'inside',
            withoutEnlargement: true,
          })
          break
        case 'detail':
          // 너비 680px로 리사이즈 (높이는 비율에 맞춤) - ImageMagick의 '680x>'와 동일
          sharpInstance = sharpInstance.resize(680, null, {
            withoutEnlargement: true,
          })
          break
      }

      // quality 설정 (n8n과 동일: optimize가 true면 70, false면 100)
      const quality = this.imageOptimize ? 70 : 100
      sharpInstance = sharpInstance.jpeg({ quality })

      const tempFilePath = path.join(tempDir, `${crypto.randomUUID()}.jpg`)
      await sharpInstance.toFile(tempFilePath)
      filePath = tempFilePath

      this._log(`이미지 변환 처리 완료: ${imageType}`, 'info')

      // 파일 업로드
      const inputElement = this.page.locator(inputSelector)
      if ((await inputElement.count()) > 0) {
        await inputElement.setInputFiles(filePath)
        this._log(`${imageType} 파일 업로드 완료`, 'info')

        if (statusSelector) {
          try {
            await this.page.waitForFunction(
              (selector: string) => {
                const element = document.querySelector(selector)
                return element && element.textContent?.trim() === '이미지 용량 확인 완료'
              },
              statusSelector,
              { timeout: 20000 },
            )
            this._log(`${imageType} 용량 확인 완료`, 'info')
          } catch (error) {
            if (error.name === 'TimeoutError') {
              throw new Error('이미지 용량 확인이 20초 내에 완료되지 않았습니다. (타임아웃)')
            }
            throw error
          }
        }
      } else {
        throw new Error(`Input element not found for selector: ${inputSelector}`)
      }
    } catch (error) {
      this._log(`${imageType} 업로드 실패: ${error.message}`, 'error')
      throw error
    }
  }

  private async _uploadAllImages(data: ProductData): Promise<void> {
    if (!this.page) return

    this._log('이미지 업로드 프로세스 시작', 'info')

    if (data.image1) {
      this._log('기본이미지1 업로드 시작', 'info')
      await this._uploadFile('#f_img1_file', data.image1, '#f_img1_file_size_ck')
      await delay(5000)
      this._log('기본이미지1 업로드 완료', 'info')
    }

    if (data.image2) {
      this._log('기본이미지2 업로드 시작', 'info')
      await this._uploadFile('#f_img2_file', data.image2, '#f_img2_file_size_ck')
      await delay(5000)
      this._log('기본이미지2 업로드 완료', 'info')
    }

    if (data.addImage1) {
      this._log('추가이미지1 업로드 시작', 'info')
      await this._uploadFile('#f_img3_file', data.addImage1, '#f_img3_file_size_ck')
      await delay(5000)
      this._log('추가이미지1 업로드 완료', 'info')
    }

    if (data.addImage2) {
      this._log('추가이미지2 업로드 시작', 'info')
      await this._uploadFile('#f_img4_file', data.addImage2, '#f_img4_file_size_ck')
      await delay(5000)
      this._log('추가이미지2 업로드 완료', 'info')
    }

    if (data.detailImage) {
      this._log('상세이미지 업로드 시작', 'info')
      await this._uploadFile('#f_goods_explain_img_file', data.detailImage, '#f_goods_explain_img_file_size_ck')
      await delay(5000)
      this._log('상세이미지 업로드 완료', 'info')
    }

    this._log('이미지 업로드 프로세스 완료', 'info')

    // 이미지 업로드 결과 확인
    await this._verifyImageUploads()
  }

  private async _verifyImageUploads(): Promise<void> {
    if (!this.page) return

    const imageInputs = ['f_img1', 'f_img2', 'f_img3', 'f_img4', 'f_goods_explain_img']

    for (const inputName of imageInputs) {
      const value = await this.page.inputValue(`input[name="${inputName}"]`).catch(() => '')

      if (value) {
        console.log(`${inputName} uploaded successfully`)
      }
    }
  }

  private async _setAsInfo(data: ProductData): Promise<void> {
    if (!this.page) return

    // 전화번호 입력
    if (data.asTelephone1) {
      await this.page.fill('input[name="f_as_telephone1"]', data.asTelephone1)
    }

    // 제조사 A/S 전화번호 입력
    if (data.asTelephone2) {
      await this.page.fill('input[name="f_as_telephone2"]', data.asTelephone2)
    }

    // 주소 입력
    if (data.addressCode) {
      await this.page.fill('input[name="f_address_code"]', data.addressCode)
    }

    if (data.address) {
      await this.page.fill('input[name="f_address"]', data.address)
    }

    if (data.addressDetail) {
      await this.page.fill('input[name="f_address_detail"]', data.addressDetail)
    }
  }

  private async _setDeliveryInfo(data: ProductData): Promise<void> {
    if (!this.page) return

    // 배송 방법 선택
    if (data.deliveryMethod) {
      await this.page.check(`input[name="f_delivery_method"][value="${data.deliveryMethod}"]`)
    }

    // 배송 지역 검증 및 선택
    if (data.deliveryAreas?.length > 0) {
      // 빈 문자열만 있는 경우 전국으로 처리
      const filteredAreas = data.deliveryAreas.filter(area => area.trim() !== '')

      if (filteredAreas.length === 0 || data.deliveryAreas.includes('전국')) {
        // 전국 배송 선택
        await this.page.check('input[name="delivery_area"][value="1"]')
      } else {
        // 유효하지 않은 지역 검증
        const invalidAreas = filteredAreas.filter(area => !VALID_DELIVERY_AREAS.includes(area))

        if (invalidAreas.length > 0) {
          const errorMessage = `${invalidAreas.join(', ')}는 유효하지않은 지역입니다. 유효한 지역을 확인하고 입력해주세요.\n\n유효한 지역: ${VALID_DELIVERY_AREAS.join(', ')}`
          throw new Error(errorMessage)
        }

        // "지역선택" 라디오 버튼 클릭
        await this.page.check('input[name="delivery_area"][value="2"]')

        for (const area of filteredAreas) {
          await this.page.evaluate(areaName => {
            const checkboxes = document.querySelectorAll('#area1 input[type="checkbox"]')
            checkboxes.forEach(checkbox => {
              const label = checkbox.nextSibling?.textContent?.trim()
              if (label === areaName) {
                ;(checkbox as HTMLInputElement).checked = true // 체크박스 선택
              }
            })
          }, area)
        }
      }
    } else {
      // 배송 지역이 지정되지 않은 경우 전국으로 설정
      await this.page.check('input[name="delivery_area"][value="1"]')
    }
  }

  // ==================== PRIVATE METHODS ====================

  private _log(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
    if (this.logCallback) {
      this.logCallback(message, level)
    }
  }

  private async _collectAllProductLinks(): Promise<{ name: string; link: string }[]> {
    const products: { name: string; link: string }[] = []
    let hasNextPage = true
    while (hasNextPage) {
      // 현재 페이지의 상품 정보 수집
      const pageProducts = await this.page.$$eval('#listTable tr', rows => {
        return Array.from(rows)
          .map(row => {
            const linkEl = row.querySelector('td.td_graylist_l a') as HTMLAnchorElement
            const nameEl = row.querySelector('td.td_graylist_l')
            if (linkEl && nameEl) {
              return { name: nameEl.textContent?.trim() || '', link: linkEl.href }
            }
            return null
          })
          .filter(Boolean)
      })
      products.push(...(pageProducts as any[]))

      await delay(3000)

      // 페이지네이션 이동
      hasNextPage = await this.page.evaluate(() => {
        const paginate = document.querySelector('.paginate2')
        if (!paginate) return false

        const current = paginate.querySelector('strong')
        if (!current) return false

        const currentPage = parseInt(current.textContent.trim(), 10)

        // 현재 페이지가 10의 배수일 경우 (10, 20, 30 등) next 버튼을 클릭
        if (currentPage % 10 === 0) {
          const nextButton = paginate.querySelector('a.next')
          if (nextButton) {
            ;(nextButton as HTMLElement).click()
            return true
          }
        }

        // 일반적인 페이지 이동
        const pageLinks = Array.from(paginate.querySelectorAll('a')).filter(a => {
          const num = parseInt(a.textContent.trim(), 10)
          return !isNaN(num) && num > currentPage
        })
        if (pageLinks.length > 0) {
          ;(pageLinks[0] as HTMLElement).click()
          return true
        }

        return false
      })
      if (hasNextPage) {
        await this.page.waitForLoadState('domcontentloaded')
      }
    }
    return products
  }

  private _detectVendorByUrl(targetUrl: string): VendorKey | null {
    try {
      const host = new URL(targetUrl).hostname
      if (host.includes('domeggook')) return VendorKey.도매꾹
      if (host.includes('domesin')) return VendorKey.도매신
      return null
    } catch {
      return null
    }
  }

  private async _textByXPath(xpath: string | undefined): Promise<string | null> {
    if (!xpath) return null
    try {
      const text = await this.page.evaluate((xp: string) => {
        try {
          const res = document.evaluate(xp, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
          const node = res.singleNodeValue as Element | null
          return node ? (node.textContent || '').trim() : null
        } catch {
          return null
        }
      }, xpath)
      return text || null
    } catch {
      return null
    }
  }

  private _getVendor(url: string): { vendorKey: VendorKey | null; vendor?: VendorConfig } {
    const vendorKey = this._detectVendorByUrl(url)
    const vendor = vendorKey ? VENDOR_CONFIG[vendorKey] : undefined
    return { vendorKey, vendor }
  }

  private async _navigateToUrl(url: string): Promise<void> {
    if (!this.page) throw new Error('Browser page not initialized')
    await this.page.goto(url, { waitUntil: 'domcontentloaded' })
  }

  private async _extractBasicInfo(vendorKey: VendorKey | null, vendor?: VendorConfig): Promise<ExtractedBasicInfo> {
    if (!this.page) throw new Error('Browser page not initialized')

    const name = vendor ? await this._textByXPath(vendor.product_name_xpath) : null

    const productCodeText = vendor?.product_code_xpath ? await this._textByXPath(vendor.product_code_xpath) : null
    const productCode = productCodeText ? productCodeText.replace(/[^0-9]/g, '') : null

    let priceText: string | null = null
    if (vendor?.price_xpaths && vendor.price_xpaths.length) {
      for (const px of vendor.price_xpaths) {
        priceText = await this._textByXPath(px)
        if (priceText) break
      }
    } else if (vendor?.price_xpath) {
      priceText = await this._textByXPath(vendor.price_xpath)
    }
    const price = this._parsePrice(priceText)

    const shippingFee = vendor?.shipping_fee_xpath ? await this._textByXPath(vendor.shipping_fee_xpath) : null

    let minPurchase: number | undefined
    if (vendor?.min_purchase_xpath) {
      const mp = await this._textByXPath(vendor.min_purchase_xpath)
      if (mp) {
        const d = mp.replace(/[^0-9]/g, '')
        if (d) minPurchase = Number(d)
      }
    }

    let imageUsage: string | undefined
    if (vendor?.image_usage_xpath) {
      const usage = await this._textByXPath(vendor.image_usage_xpath)
      if (usage) imageUsage = usage.trim()
    }

    let certifications: { type: string; number: string }[] | undefined
    if (vendor?.certification_xpath) {
      const certItems = await this.page.$$eval(`xpath=${vendor.certification_xpath}`, nodes => {
        return Array.from(nodes)
          .map(li => {
            const titleEl = li.querySelector('.lCertTitle')
            const numEl = li.querySelector('.lCertNum')
            const type = titleEl ? titleEl.textContent?.trim() || '' : ''
            const number = numEl ? numEl.textContent?.replace(/자세히보기.*/, '').trim() || '' : ''
            return { type, number }
          })
          .filter(cert => cert.type && cert.number)
      })
      if (certItems.length > 0) certifications = certItems as { type: string; number: string }[]
    }

    const origin = vendor?.origin_xpath ? await this._textByXPath(vendor.origin_xpath) : null
    let manufacturer = vendor?.manufacturer_xpath ? await this._textByXPath(vendor.manufacturer_xpath) : null
    if ((!manufacturer || !manufacturer.trim()) && vendor?.fallback_manufacturer) {
      manufacturer = vendor.fallback_manufacturer
    }

    const categories: string[] = []
    for (const cx of [
      vendor?.category_1_xpath,
      vendor?.category_2_xpath,
      vendor?.category_3_xpath,
      vendor?.category_4_xpath,
    ]) {
      if (!cx) continue
      const val = await this._textByXPath(cx)
      if (val) categories.push(val)
    }

    let options: { name: string; price?: number; qty?: number }[][] | undefined
    if (vendor?.option_xpath && vendor.option_xpath.length > 0) {
      options = await this._collectOptionsByXpaths(vendor.option_xpath)
    } else {
      const xpaths: string[] = []
      if (vendor?.option1_item_xpaths) xpaths.push(vendor.option1_item_xpaths)
      if (vendor?.option2_item_xpaths) xpaths.push(vendor.option2_item_xpaths)
      if (xpaths.length > 0) options = await this._collectOptionsByXpaths(xpaths)
    }

    return {
      name,
      productCode,
      price,
      shippingFee,
      minPurchase,
      imageUsage,
      certifications,
      origin,
      manufacturer,
      categories,
      options,
    }
  }

  private async _collectImages(
    vendor?: VendorConfig,
    productDir?: string,
  ): Promise<{ savedMainImages: string[]; detailCapturePath: string | null }> {
    if (!this.page) throw new Error('Browser page not initialized')

    const mainImageUrls: string[] = vendor?.main_image_xpath
      ? await this.page.$$eval(`xpath=${vendor.main_image_xpath}`, nodes =>
          Array.from(nodes)
            .map(n => (n as HTMLImageElement).src || (n as HTMLSourceElement).getAttribute('srcset') || '')
            .filter(Boolean),
        )
      : []

    let detailCapturePath: string | null = null
    if (vendor?.detail_image_xpath) {
      const targetDir = productDir || path.join(this.baseFilePath, 'downloads', dayjs().format('YYYYMMDD'))
      if (!fsSync.existsSync(targetDir)) fsSync.mkdirSync(targetDir, { recursive: true })
      detailCapturePath = await this._screenshotElement(
        path.join(targetDir, `상세이미지.jpg`),
        vendor.detail_image_xpath,
      )
    }

    const savedMainImages: string[] = []
    const targetDir = productDir || path.join(this.baseFilePath, 'downloads', dayjs().format('YYYYMMDD'))
    if (!fsSync.existsSync(targetDir)) fsSync.mkdirSync(targetDir, { recursive: true })

    // 썸네일 파일명 규칙 및 최대 4개 제한
    const thumbnailNames = ['기본이미지1.jpg', '기본이미지2.jpg', '추가이미지1.jpg', '추가이미지2.jpg']
    const limitedUrls = mainImageUrls.slice(0, 4)
    for (let i = 0; i < limitedUrls.length; i++) {
      const buf = await this._downloadToBuffer(limitedUrls[i])
      if (!buf) continue
      const outPath = path.join(targetDir, thumbnailNames[i])
      await this._saveJpg(buf, outPath)
      savedMainImages.push(outPath)
    }

    return { savedMainImages, detailCapturePath }
  }

  private async _collectAdditionalInfo(vendor?: VendorConfig): Promise<{ label: string; value: string }[] | undefined> {
    if (!this.page) throw new Error('Browser page not initialized')
    if (!vendor?.additional_info_pairs || vendor.additional_info_pairs.length === 0) return undefined

    const collected: { label: string; value: string }[] = []
    for (const pair of vendor.additional_info_pairs) {
      try {
        const labels: string[] = pair.label_xpath
          ? await this.page.$$eval(`xpath=${pair.label_xpath}`, nodes =>
              Array.from(nodes)
                .map(n => (n.textContent || '').trim())
                .filter(Boolean),
            )
          : []
        const values: string[] = pair.value_xpath
          ? await this.page.$$eval(`xpath=${pair.value_xpath}`, nodes =>
              Array.from(nodes)
                .map(n => (n.textContent || '').trim())
                .filter(Boolean),
            )
          : []
        const len = Math.min(labels.length, values.length)
        for (let i = 0; i < len; i++) {
          collected.push({ label: labels[i], value: values[i] })
        }
      } catch {}
    }
    return collected.length > 0 ? collected : undefined
  }

  private _parsePrice(text: string | null): number | null {
    if (!text) return null
    const digits = text.replace(/[^0-9]/g, '')
    if (!digits) return null
    return Number(digits)
  }

  // ---------------- Image helpers ----------------
  private async _downloadToBuffer(url: string): Promise<Buffer | null> {
    try {
      const res = await axios.get(url, { responseType: 'arraybuffer' })
      return Buffer.from(res.data)
    } catch {
      return null
    }
  }

  private async _saveJpg(buffer: Buffer, outPath: string): Promise<string> {
    await fsPromises.writeFile(outPath, await sharp(buffer).jpeg({ quality: 90 }).toBuffer())
    return outPath
  }

  private async _screenshotElement(outPath: string, xpath?: string): Promise<string | null> {
    try {
      if (!xpath) return null
      const locator = this.page.locator(`xpath=${xpath}`)
      // Playwright screenshot options do not accept 'quality' for jpeg in some versions; use default
      await locator.first().screenshot({ path: outPath })
      return outPath
    } catch {
      return null
    }
  }

  // ---------------- 파일/폴더 유틸 ----------------
  private _sanitizeFileName(name: string): string {
    const replaced = name.replace(/[\\/:*?"<>|\n\r\t]/g, ' ').trim()
    return replaced.slice(0, 80) || 'product'
  }

  private _ensureDir(dirPath: string): void {
    if (!fsSync.existsSync(dirPath)) fsSync.mkdirSync(dirPath, { recursive: true })
  }

  private _createProductDir(baseName: string): string {
    const dateDir = dayjs().format('YYYYMMDD')
    const safeName = this._sanitizeFileName(baseName)
    const dir = path.join(this.baseFilePath, 'downloads', dateDir, `${safeName}_${Date.now()}`)
    this._ensureDir(dir)
    return dir
  }

  // ---------------- AI 데이터 정제 ----------------
  private async _refineCrawlWithAI(data: SourcingCrawlData): Promise<AIRefinedResult> {
    try {
      const response = await axios.post(
        'https://n8n.pyramid-ing.com/webhook/s2b-sourcing',
        pick(data, ['name', 'shippingFee', 'imageUsage', 'origin', 'manufacturer', 'options', 'additionalInfo']),
        {
          headers: {
            'Content-Type': 'application/json',
          },
        },
      )

      return response.data.output || ({} as AIRefinedResult)
    } catch (error) {
      this._log(`AI 데이터 정제 실패: ${error.message}`, 'error')
      return {} as AIRefinedResult
    }
  }

  // ---------------- 카테고리 매핑 ----------------
  private async _mapCategories(
    vendor: string,
    categories: string[],
  ): Promise<{
    targetCategory1?: string
    targetCategory2?: string
    targetCategory3?: string
    g2bCode?: string
  }> {
    try {
      // 엑셀 파일 경로
      const excelPath = path.join(process.cwd(), 'files', 'S2B_Sourcing_category_mapper.xlsx')

      if (!fsSync.existsSync(excelPath)) {
        this._log('카테고리 매핑 엑셀 파일을 찾을 수 없습니다.', 'warning')
        return {}
      }

      const workbook = XLSX.readFile(excelPath)
      const sheetName = vendor // 벤더명으로 시트 찾기

      if (!workbook.Sheets[sheetName]) {
        this._log(`${vendor} 시트를 찾을 수 없습니다.`, 'warning')
        return {}
      }

      const worksheet = workbook.Sheets[sheetName]
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 })

      // 헤더 행 찾기
      const headerRow = data.find(
        (row: any[]) => row.includes('크롤링_1차') && row.includes('크롤링_2차') && row.includes('크롤링_3차'),
      )

      if (!headerRow) {
        this._log('카테고리 매핑 헤더를 찾을 수 없습니다.', 'warning')
        return {}
      }

      const headerIndex = data.indexOf(headerRow)
      const crawling1Index = (headerRow as any[]).indexOf('크롤링_1차')
      const crawling2Index = (headerRow as any[]).indexOf('크롤링_2차')
      const crawling3Index = (headerRow as any[]).indexOf('크롤링_3차')
      const crawling4Index = (headerRow as any[]).indexOf('크롤링_4차')
      const category1Index = (headerRow as any[]).indexOf('1차카테고리')
      const category2Index = (headerRow as any[]).indexOf('2차카테고리')
      const category3Index = (headerRow as any[]).indexOf('3차카테고리')
      const g2bIndex = (headerRow as any[]).indexOf('G2B')

      // 매칭되는 행 찾기
      for (let i = headerIndex + 1; i < data.length; i++) {
        const row = data[i] as any[]
        if (
          row[crawling1Index] === categories[0] &&
          row[crawling2Index] === categories[1] &&
          row[crawling3Index] === categories[2] &&
          (categories.length < 4 || row[crawling4Index] === categories[3])
        ) {
          return {
            targetCategory1: row[category1Index],
            targetCategory2: row[category2Index],
            targetCategory3: row[category3Index],
            g2bCode: row[g2bIndex],
          }
        }
      }

      this._log(`카테고리 매핑을 찾을 수 없습니다: ${categories.join(' > ')}`, 'warning')
      return {}
    } catch (error) {
      this._log(`카테고리 매핑 실패: ${error.message}`, 'error')
      return {}
    }
  }

  // ---------------- 최종 엑셀 매핑 ----------------
  private _mapToExcelFormat(rawData: any, aiRefined: any, categoryMapped: any, settings?: any): any[] {
    const originalPrice = rawData.price || 0
    const marginRate = settings?.marginRate || 20

    // 기본 상품 정보
    const baseProduct = {
      'G2B 물품목록번호': categoryMapped.g2bCode || '',
      카테고리1: categoryMapped.targetCategory1 || '',
      카테고리2: categoryMapped.targetCategory2 || '',
      카테고리3: categoryMapped.targetCategory3 || '',
      등록구분: '물품',
      물품명: aiRefined.물품명 || rawData.name || '',
      규격: (() => {
        const baseSpec = aiRefined['특성']?.map((info: any) => info).join(', ') || ''
        const minPurchase = rawData.minPurchase || 1
        if (minPurchase > 1) {
          return baseSpec ? `${baseSpec}, 최소구매수량: ${minPurchase}개` : `최소구매수량: ${minPurchase}개`
        }
        return baseSpec
      })(),
      모델명: aiRefined.모델명 || '상세설명참고',
      원가: originalPrice, // 참고용
      이미지사용허가: aiRefined.이미지사용여부 || '', // 참고용
      제조사: rawData.manufacturer || '상세설명참고',
      '소재/재질': aiRefined.소재재질 || '상세설명참고',
      최소구매수량: rawData.minPurchase || 1, // 참고용
      판매단위: '개',
      보증기간: '1년',
      납품가능기간: '7일',
      '견적서 유효기간': '',
      배송비종류: '유료',
      배송비: 3000,
      반품배송비: 3500,
      묶음배송여부: 'Y',
      제주배송여부: 'Y',
      제주추가배송비: 5000,
      상세설명HTML: settings?.detailHtmlTemplate || '<p>상세설명을 입력하세요.</p>',
      기본이미지1: rawData.mainImages?.[0] || '',
      기본이미지2: rawData.mainImages?.[1] || '',
      추가이미지1: rawData.mainImages?.[2] || '',
      추가이미지2: rawData.mainImages?.[3] || '',
      상세이미지: rawData.detailImages?.[0] || '',
      원산지구분: aiRefined.원산지구분 || '',
      국내원산지: aiRefined.국내원산지 || '',
      해외원산지: aiRefined.해외원산지 || '',
      배송방법: '택배',
      배송지역: '',
      '정격전압/소비전력': '',
      크기및무게: '',
      동일모델출시년월: '',
      냉난방면적: '',
      제품구성: '',
      안전표시: '',
      용량: '',
      주요사양: '',
      소비기한선택: '',
      소비기한입력: '',
      어린이하차확인장치타입: '',
      어린이하차확인장치인증번호: '',
      어린이하차확인장치첨부파일: '',
      안전확인대상타입: '',
      안전확인대상신고번호: '',
      안전확인대상첨부파일: '',
      조달청계약여부: '',
      계약시작일: '',
      계약종료일: '',
      전화번호: '',
      '제조사 A/S전화번호': '',
      과세여부: '과세(세금계산서)',
      어린이제품KC유형: '',
      어린이제품KC인증번호: aiRefined.어린이제품KC인증번호 || '',
      어린이제품KC성적서: '',
      전기용품KC유형: '',
      전기용품KC인증번호: aiRefined.전기용품KC인증번호 || '',
      전기용품KC성적서: '',
      생활용품KC유형: '',
      생활용품KC인증번호: aiRefined.생활용품KC인증번호 || '',
      생활용품KC성적서: '',
      방송통신KC유형: '',
      방송통신KC인증번호: aiRefined.방송통신KC인증번호 || '',
      방송통신KC성적서: '',
    }

    // 옵션이 있는 경우 옵션별로 상품 생성
    if (aiRefined.options && aiRefined.options.length > 0) {
      return aiRefined.options.map((option: any) => ({
        ...baseProduct,
        물품명: baseProduct.물품명,
        규격: `${option.name}, ${baseProduct.규격}`,
        제시금액: Math.ceil(((originalPrice + (option.price || 0)) * (1 + marginRate / 100)) / 100) * 100,
        재고수량: Math.min(option.qty || 9999, 9999),
      }))
    }

    // 옵션이 없는 경우 기본 상품 1개 반환
    return [
      {
        ...baseProduct,
        제시금액: Math.ceil((originalPrice * (1 + marginRate / 100)) / 100) * 100,
        재고수량: 9999,
      },
    ]
  }

  // ---------------- Normalized detail collection ----------------

  private async _collectOptionsByXpaths(xpaths: string[]): Promise<{ name: string; price?: number; qty?: number }[][]> {
    if (!this.page) return []
    const levels: { name: string; price?: number; qty?: number }[][] = []
    for (const xp of xpaths) {
      try {
        const items: { name: string; price?: number; qty?: number }[] = await this.page.evaluate((xpath: string) => {
          const result: { name: string; price?: number; qty?: number }[] = []
          const iterator = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null)
          let node = iterator.iterateNext() as any
          while (node) {
            const el = node as Element
            // 텍스트/값 우선순위 추출
            let t = ''
            const isOption = el.tagName.toLowerCase() === 'option'
            const btnLabel = el.querySelector('label')
            if (isOption) {
              const opt = el as HTMLOptionElement
              t = (opt.textContent || opt.value || '').trim()
              const name = t.replace(/\s+/g, ' ').trim()
              if (name && !/선택|옵션|선택하세요|옵션선택/i.test(name)) {
                result.push({ name, price: 0, qty: 9999 })
              }
            } else {
              // 버튼 기반 UI: 내부 label 수량 표기 제거
              let nameText = (el.textContent || '').trim()
              const labels = Array.from(el.querySelectorAll('label')).map(l => (l.textContent || '').trim())
              for (const lbl of labels) {
                nameText = nameText.replace(lbl, '')
              }
              nameText = nameText.replace(/\s+/g, ' ').trim()

              // price delta: (+200원) 형태
              let delta: number | undefined
              const priceLabel = labels.find(v => /\([+\-]?\d{1,3}(?:,\d{3})*원\)/.test(v))
              if (priceLabel) {
                const sign = priceLabel.includes('-') ? -1 : 1
                const digits = priceLabel.replace(/[^0-9]/g, '')
                if (digits) delta = sign * Number(digits)
              }

              // qty: (495개) 형태
              let qty: number | undefined
              const qtyLabel = labels.find(v => /\([0-9,]+개\)/.test(v))
              if (qtyLabel) {
                const q = qtyLabel.replace(/[^0-9]/g, '')
                if (q) qty = Number(q)
              }

              // placeholder/disabled 제외
              const isDisabled = (el as any).disabled === true || el.getAttribute('disabled') !== null
              if (nameText && !isDisabled && !/선택|옵션|선택하세요|옵션선택/i.test(nameText)) {
                // 기본값: price 0, qty 9999
                result.push({
                  name: nameText,
                  price: typeof delta === 'number' ? delta : 0,
                  qty: typeof qty === 'number' ? qty : 9999,
                })
              }
            }
            node = iterator.iterateNext() as any
          }
          return result
        }, xp)
        levels.push(items)
      } catch {
        levels.push([])
      }
    }
    return levels
  }

  private async _processExtendProducts(
    products: {
      name: string
      link: string
      status?: 'success' | 'fail'
      errorMessage?: string
      extendedDate?: string
    }[],
  ): Promise<
    { name: string; link: string; status?: 'success' | 'fail'; errorMessage?: string; extendedDate?: string }[]
  > {
    for (const product of products) {
      try {
        await this.page.goto(product.link, { waitUntil: 'domcontentloaded' })
        await this.page.waitForLoadState('domcontentloaded')

        // 관리일 연장 버튼 클릭
        const extendButton = this.page.locator('a[href^="javascript:fnLimitDateUpdate()"]')
        if ((await extendButton.count()) === 0) {
          product.status = 'fail'
          product.errorMessage = '관리일 연장 버튼을 찾을 수 없습니다'
          this._log(`관리일 연장 버튼을 찾을 수 없습니다: ${product.name}`, 'error')
          continue
        }

        let isSuccess = undefined
        let errorMessage = ''

        // 관리일 연장 처리를 위한 임시 dialog 이벤트 핸들러
        const handleExtensionDialog = async dialog => {
          const message = dialog.message()

          switch (dialog.type()) {
            case 'alert':
              if (message.match(/\d{4}년\s\d{1,2}월\s\d{1,2}일\s까지\s관리기간이\s연장되었습니다/)) {
                isSuccess = true
                const dateMatch = message.match(/(\d{4}년\s\d{1,2}월\s\d{1,2}일)/)
                product.extendedDate = dateMatch ? dateMatch[1] : null
                await dialog.accept()
              } else {
                isSuccess = false
                errorMessage = message
                this._log(`관리일 연장 실패 - ${message}`, 'error')
                await dialog.dismiss()
              }
              break

            case 'confirm':
              if (message.includes('최종관리일을 연장하시겠습니까?')) {
                await dialog.accept()
              }
              break
          }
        }
        // dialog 이벤트 핸들러 등록
        this.page?.on('dialog', handleExtensionDialog)

        try {
          // 연장 버튼 클릭
          await extendButton.click()

          // alert 처리 완료 대기 (5초 타임아웃)
          try {
            await Promise.race([
              new Promise((_, reject) => {
                setTimeout(() => reject(new Error('연장 다이얼로그 대기 시간 초과')), 5000)
              }),
              new Promise<void>(resolve => {
                const checkInterval = setInterval(() => {
                  if (isSuccess !== undefined) {
                    // alert이 처리되었다면
                    clearInterval(checkInterval)
                    this.page?.off('dialog', handleExtensionDialog)
                    resolve()
                  }
                }, 100)
              }),
            ])
          } catch (error) {
            this.page?.off('dialog', handleExtensionDialog)
            product.status = 'fail'
            product.errorMessage = '연장 처리 중 타임아웃이 발생했습니다.'
            this._log(`관리일 연장 실패 (타임아웃) - ${product.name}`, 'error')
            continue
          }

          if (isSuccess) {
            product.status = 'success'
            this._log(`관리일 연장 성공: ${product.name} (${product.extendedDate}까지)`, 'info')
          } else {
            product.status = 'fail'
            product.errorMessage = errorMessage
            this._log(`관리일 연장 실패: ${product.name}`, 'error')
          }
        } finally {
          // 임시 이벤트 리스너 제거
          this.page.off('dialog', handleExtensionDialog)
        }

        await delay(2000)
      } catch (error) {
        product.status = 'fail'
        product.errorMessage = error.message
        this._log(`상품 처리 중 오류가 발생했습니다 (${product.name}): ${error}`, 'error')
      }
    }

    const successProducts = products.filter(p => p.status === 'success')
    const failedProducts = products.filter(p => p.status === 'fail')

    this._log(
      `관리일 연장 처리 완료 - 총: ${products.length}개, 성공: ${successProducts.length}개, 실패: ${failedProducts.length}개`,
      successProducts.length === products.length ? 'info' : 'warning',
    )

    // 실패한 상품 목록 로깅
    if (failedProducts.length > 0) {
      this._log('실패한 상품 목록:', 'error')
      failedProducts.forEach(product => {
        this._log(`- ${product.name}: ${product.errorMessage}`, 'error')
      })
    }

    return products // 처리 결과가 포함된 상품 목록 반환
  }

  private async _readExcelStream(stream: fs.ReadStream): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []

      stream.on('data', (chunk: Buffer) => {
        chunks.push(chunk)
      })

      stream.on('end', () => {
        try {
          const buffer = Buffer.concat(chunks)
          const workbook = XLSX.read(buffer, {
            type: 'buffer',
            cellNF: false,
            cellHTML: false,
            cellFormula: false,
            sheetStubs: false,
            bookDeps: false,
            bookFiles: false,
            bookProps: false,
            bookSheets: false,
            bookVBA: false,
          })

          const sheetName = workbook.SheetNames[0]
          if (!sheetName) {
            throw new Error('시트를 찾을 수 없습니다')
          }

          const worksheet = workbook.Sheets[sheetName]
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '', blankrows: false })

          resolve(jsonData as any[])
        } catch (error) {
          reject(error)
        }
      })

      stream.on('error', error => {
        reject(error)
      })
    })
  }

  private _validateDeliveryLimit(value: string): DeliveryLimitType {
    if (value.endsWith('일') && value in DELIVERY_LIMIT_MAP) {
      return value as DeliveryLimitType
    }
    return '7일' // 기본값
  }

  private _validateSaleType(value: string): SaleType {
    if (value === '물품' || value === '용역') {
      return value
    }
    return '물품' // 기본값
  }

  private _validateDeliveryFeeType(value: string): DeliveryFeeType {
    if (value === '무료' || value === '유료' || value === '조건부무료') {
      return value
    }
    return '무료' // 기본값
  }

  private async _gotoAndSearchListPageByRange(
    startDate: string,
    endDate: string,
    registrationStatus: string = '',
  ): Promise<void> {
    await this.page.goto('https://www.s2b.kr/S2BNVendor/S2B/srcweb/remu/rema/rema100_list_new.jsp', {
      waitUntil: 'domcontentloaded',
    })

    // 페이지당 항목 수를 100개로 설정하고 적용
    await this.page.waitForLoadState('domcontentloaded')
    await this.page.evaluate(() => {
      ;(document.querySelector('#rowCount') as HTMLSelectElement).value = '100'
      const setRowCountButton = document.querySelector('a[href^="javascript:setRowCount2()"]') as HTMLElement
      if (setRowCountButton) setRowCountButton.click()
    })
    await this.page.waitForLoadState('domcontentloaded')

    // 검색 조건 설정
    await this.page.waitForLoadState('domcontentloaded')

    // 검색 날짜 타입 설정
    await this.page.selectOption('#search_date', 'LIMIT_DATE')

    // 시작일 설정
    await this.page.fill('#search_date_start', startDate)

    // 종료일 설정
    await this.page.fill('#search_date_end', endDate)

    // 등록상태 설정
    if (registrationStatus) {
      await this.page.check(`input[name="tgruStatus"][value="${registrationStatus}"]`)
    }

    // 검색 실행
    await this.page.click('[href^="javascript:search()"]')
    await this.page.waitForLoadState('domcontentloaded')
  }

  private async _setOtherSiteInformation(data: ProductData): Promise<void> {
    if (!this.page) return

    // 타사이트 등록 여부
    if (data.otherSiteRegisterYn) {
      await this.page.check(`input[name="f_site_register_yn"][value="${data.otherSiteRegisterYn}"]`)
    }

    // 타사이트 등록 가격
    if (data.otherSiteAmt) {
      await this.page.fill('input[name="f_site_amt"]', data.otherSiteAmt)
    }
  }

  private async _setNaraInformation(data: ProductData): Promise<void> {
    if (!this.page) return

    // 나라장터 등록 여부
    if (data.naraRegisterYn) {
      await this.page.check(`input[name="f_nara_register_yn"][value="${data.naraRegisterYn}"]`)
    }

    // 나라장터 등록 가격
    if (data.naraAmt) {
      await this.page.fill('input[name="f_nara_amt"]', data.naraAmt)
    }

    // 사이트명
    if (data.siteName) {
      await this.page.fill('input[name="f_site_name"]', data.siteName)
    }

    // 사이트주소
    if (data.siteUrl) {
      await this.page.fill('input[name="f_site_url"]', data.siteUrl)
    }
  }

  private async _submitRegistration(): Promise<void> {
    if (!this.page) return

    // 청렴서약서 체크 상태 확인
    const isChecked = await this.page.isChecked('#uprightContract')

    // 혹시 체크가 안되어 있다면 다시 체크
    if (!isChecked) {
      await this.page.check('#uprightContract')
    }

    // 임시저장 버튼 클릭
    await this.page.click('a[href="javascript:register(\'1\');"]')
    console.log('Register button clicked.')

    // 등록 완료 대기
    await delay(5000)

    // ✅ Dialog 에러 확인
    if (this.dialogErrorMessage) {
      throw new Error(this.dialogErrorMessage)
    }
  }
}
