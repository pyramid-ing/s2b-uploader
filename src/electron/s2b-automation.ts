import * as puppeteer from 'puppeteer-core'
import * as XLSX from 'xlsx'
import path from 'node:path'
import * as fsSync from 'fs'
import * as fs from 'fs'
import dayjs from 'dayjs'
import axios from 'axios'
import crypto from 'crypto'
import FileType from 'file-type'
import sharp from 'sharp'

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

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export class S2BAutomation {
  private browser: puppeteer.Browser | null = null
  private page: puppeteer.Page | null = null
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
  ) {
    this.baseFilePath = baseImagePath
    this.logCallback = logCallback
    this.headless = headless

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

  // 이미지 최적화 여부 설정
  public setImageOptimize(optimize: boolean) {
    this.imageOptimize = optimize
  }

  private log(message: string, level: 'info' | 'warning' | 'error' = 'info') {
    if (this.logCallback) {
      this.logCallback(message, level)
    }
  }

  async login(id: string, password: string) {
    if (!this.page) throw new Error('브라우저가 초기화되지 않았습니다.')

    await this.page.goto('https://www.s2b.kr/S2BNCustomer/Login.do?type=sp&userDomain=')
    await this.page.type('form[name="vendor_loginForm"] [name="uid"]', id)
    await this.page.type('form[name="vendor_loginForm"] [name="pwd"]', password)
    await this.page.click('form[name="vendor_loginForm"] .btn_login > a')
    await this.page.waitForNavigation()
  }

  // Excel 파일 읽기 (스트리밍 방식)
  async readExcelFile(filePath: string): Promise<any[]> {
    this.log('엑셀 파일 스트림 읽기 시작', 'info')

    const stream = fs.createReadStream(filePath)
    const rawData = await this.readExcelStream(stream)

    // 5) 데이터 변환 및 반환
    return rawData.map((row: any) => {
      const rawSaleType = row['등록구분']?.toString() || '물품'
      const saleTypeText = this.validateSaleType(rawSaleType)

      // 배송비종류 타입 체크 및 변환
      const rawDeliveryFeeType = row['배송비종류']?.toString() || '무료'
      const deliveryFeeKindText = this.validateDeliveryFeeType(rawDeliveryFeeType)

      // 납품가능기간 타입 체크 및 변환
      const rawDeliveryLimit = row['납품가능기간']?.toString() || '7일'
      const deliveryLimitText = this.validateDeliveryLimit(rawDeliveryLimit)

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

  // 스트리밍 헬퍼 메서드
  private async readExcelStream(stream: fs.ReadStream): Promise<any[]> {
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

  // 타입 검증 헬퍼 메서드 추가
  private validateDeliveryLimit(value: string): DeliveryLimitType {
    if (value.endsWith('일') && value in DELIVERY_LIMIT_MAP) {
      return value as DeliveryLimitType
    }
    return '7일' // 기본값
  }

  // 타입 검증 헬퍼 메서드 추가
  private validateSaleType(value: string): SaleType {
    if (value === '물품' || value === '용역') {
      return value
    }
    return '물품' // 기본값
  }

  private validateDeliveryFeeType(value: string): DeliveryFeeType {
    if (value === '무료' || value === '유료' || value === '조건부무료') {
      return value
    }
    return '무료' // 기본값
  }

  // 브라우저 시작
  async start() {
    this.browser = await puppeteer.launch({
      headless: this.headless,
      defaultViewport: null,
      executablePath: this.chromePath, // Chrome 실행 파일 경로 지정
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })

    this.page = await this.browser.newPage()

    // 팝업 감지 및 처리
    this.browser.on('targetcreated', async target => {
      const page = await target.page()
      if (!page) return // 페이지가 없는 경우 무시

      const url = target.url()
      console.log(`Detected popup with URL: ${url}`)

      // 팝업 URL별 처리
      if (url.includes('certificateInfo_pop.jsp')) {
        // certificateInfo_pop.jsp 팝업은 바로 닫기
        console.log('Closing popup for certificateInfo_pop.jsp.')
        await page.close()
      } else if (url.includes('mygPreviewerThumb.jsp')) {
        // mygPreviewerThumb.jsp 팝업에서 iframe 내 상태 검사
        try {
          await delay(3000)

          // iframe 로드 대기
          await page.waitForSelector('#MpreviewerImg', { timeout: 20000 })
          const iframeElement = await page.$('#MpreviewerImg')
          if (!iframeElement) throw new Error('Iframe not found.')

          const iframe = await iframeElement.contentFrame()
          await iframe.waitForSelector('#reSizeStatus', { timeout: 20000 })
          const resizeStatus = await iframe.$eval('#reSizeStatus', element => element.textContent?.trim())

          if (resizeStatus === 'pass') {
            console.log('Upload passed. Closing popup.')
            await page.close() // 조건 충족 시 팝업 닫기
          } else {
            console.log(`Upload status: ${resizeStatus}. Popup remains open.`)
          }
        } catch (error) {
          console.error('Error while interacting with mygPreviewerThumb.jsp:', error)
          await page.close() // 에러 발생 시 팝업 닫기
        }
      } else if (url.includes('rema100_statusWaitPopup.jsp')) {
        // rema100_statusWaitPopup.jsp 팝업 처리
        try {
          console.log('Interacting with rema100_statusWaitPopup.jsp popup.')

          // 팝업 로드 대기 및 버튼 클릭
          await page.waitForSelector('[onclick^="fnConfirm("]', { timeout: 5000 })

          await page.evaluate(() => {
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
          await page.close() // 에러 발생 시 팝업 닫기
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
  // 상품 등록
  async registerProduct(data: ProductData) {
    if (!this.page) throw new Error('브라우저가 초기화되지 않았습니다.')

    this.dialogErrorMessage = null // 초기화

    // 등록 프로세스를 위한 dialog 이벤트 핸들러
    const handleRegistrationDialog = async (dialog: puppeteer.Dialog) => {
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
    this.log(`상품 등록 시작: ${data.goodsName}`, 'info')

    try {
      await this.page.goto('https://www.s2b.kr/S2BNVendor/rema100.do?forwardName=goRegistView')
      this.log('상품 등록 페이지 접속 완료', 'info')

      // 상품 등록 폼
      try {
        await this.page.waitForSelector('select[name="sale_type"]', { timeout: 10000 })
      } catch (error) {
        if (error && error.name === 'TimeoutError') {
          throw new Error('상품 등록 폼이 10초 내에 로드되지 않았습니다. (타임아웃)')
        }
        throw error
      }
      this.log('상품 등록 폼 로드 완료', 'info')

      // ✅ 팝업 닫기 로직
      try {
        await this.page.waitForSelector('article.popup.alert', { timeout: 5000 }) // 팝업 감지
        await this.page.evaluate(() => {
          const closeButton = document.querySelector('span.btn_popclose a') as HTMLElement
          if (closeButton) {
            closeButton.click() // 닫기 버튼 클릭
          }
        })
        this.log('팝업이 성공적으로 닫혔습니다.', 'info')
      } catch (error) {
        this.log('팝업이 발견되지 않았습니다. 계속 진행합니다.', 'warning')
      }

      // ✅ 단계별 입력 처리
      // 기본 정보 입력
      this.log('기본 정보 입력 중...', 'info')
      await this.setBasicInfo(data)
      this.log('기본 정보 입력 완료', 'info')

      // 이미지 업로드
      this.log('이미지 업로드 시작', 'info')
      await this.uploadAllImages(data)
      this.log('이미지 업로드 완료', 'info')

      // 카테고리 선택
      this.log('카테고리 선택 중...', 'info')
      await this.selectCategory(data)
      this.log('카테고리 선택 완료', 'info')

      // 카테고리별 입력사항 설정
      this.log('카테고리별 상세 정보 입력 중...', 'info')
      await this.setCategoryDetails(data)

      // 인증정보 설정
      this.log('인증 정보 입력 중...', 'info')
      await this.setCertifications(data)

      // KC 인증 정보 설정
      this.log('KC 인증 정보 입력 중...', 'info')
      await this.setKcCertifications(data)

      // 기타첨부서류
      this.log('기타 첨부 서류 업로드 중...', 'info')
      await this.setOtherAttachments(data)

      // G2B 물품목록번호 설정
      this.log(`G2B 정보 입력 중 (번호: ${data.g2bNumber})`, 'info')
      await this.setG2bInformation(data.g2bNumber)

      // 조달청 계약여부
      this.log('조달청 계약 여부 설정 중...', 'info')
      await this.setPpsContract(data)

      // 배송정보
      this.log('배송 정보 입력 중...', 'info')
      await this.setDeliveryInfo(data)

      // 배송비 설정
      this.log('배송비 정보 입력 중...', 'info')
      await this.setDeliveryFee(data)

      // 상세설명 HTML 설정
      this.log('상세 설명 입력 중...', 'info')
      await this.setDetailHtml(data.detailHtml)

      // 나라장터 정보 설정
      this.log('나라장터 정보 입력 중...', 'info')
      await this.setNaraInformation(data)

      // 타사이트 정보 설정
      this.log('타 사이트 정보 입력 중...', 'info')
      await this.setOtherSiteInformation(data)

      // 판매단위와 과세여부 설정
      this.log('판매 단위 및 과세 여부 설정 중...', 'info')
      await this.setSalesUnitAndTax(data)

      // 반품/교환 배송비 입력
      this.log('반품/교환 배송비 입력 중...', 'info')
      await this.setReturnExchangeFee(data)

      // AS정보입력
      this.log('AS 정보 입력 중...', 'info')
      await this.setAsInfo(data)

      // 원산지 정보 설정
      this.log('원산지 정보 입력 중...', 'info')
      await this.setOriginInfo(data)

      // 청렴서약서 동의 및 등록
      this.log('청렴서약서 등록 중...', 'info')
      await this.submitRegistration()

      // ✅ Dialog 에러 확인
      if (this.dialogErrorMessage) {
        this.log(`등록 중 에러 발생: ${this.dialogErrorMessage}`, 'error')
        throw new Error(this.dialogErrorMessage) // 에러 발생 시 throw
      }

      // ✅ 최종 성공 로그
      this.log(`✅ 상품 등록 성공: ${data.goodsName}`, 'info')
    } catch (error) {
      this.log(`상품 등록 실패: ${error.message}`, 'error')
      throw error
    } finally {
      // 등록 프로세스 완료 후 dialog 이벤트 리스너 제거
      if (this.page) {
        this.page.off('dialog', handleRegistrationDialog)
      }
    }
  }

  private async setBasicInfo(data: ProductData) {
    if (!this.page) return

    // 등록구분 선택 (텍스트 기반 매핑 사용)
    await this.page.select('select[name="sale_type"]', SALE_TYPE_MAP[data.saleTypeText] || '1')

    await this.page.type('input[name="f_goods_name"]', data.goodsName)
    await this.page.type('input[name="f_size"]', data.spec)

    // 보증기간 초기화 후 입력
    await this.page.$eval('input[name="f_assure"]', el => ((el as HTMLInputElement).value = ''))
    await this.page.type('input[name="f_assure"]', data.assure)

    if (data.modelName) {
      await this.page.click('input[name="f_model_yn"][value="N"]')
      await this.page.type('input[name="f_model"]', data.modelName)
    }

    await this.page.type('input[name="f_estimate_amt"]', data.estimateAmt)
    await this.page.type('input[name="f_factory"]', data.factory)
    await this.page.type('input[name="f_material"]', data.material)
    await this.page.type('input[name="f_remain_qnt"]', data.remainQnt)

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
      await this.page.type('input[name="f_memo"]', data.approvalRequest)
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
        await this.page.select('select[name="f_estimate_validate_code"]', optionValue)
      } else {
        console.error(`Invalid estimate validity: ${data.estimateValidity}`)
      }
    }
  }

  // G2B 물품목록번호 등록
  private async setG2bInformation(g2bNumber: string) {
    if (!this.page) throw new Error('브라우저가 초기화되지 않았습니다.')

    try {
      if (g2bNumber) {
        // G2B 물품목록번호 입력
        await this.page.type('input[name="f_uid2"]', g2bNumber)

        // 등록 버튼 클릭
        await this.page.click('a[href^="javascript:fnCheckApiG2B();"]')
        console.log('G2B 물품목록번호 등록 버튼 클릭됨.')

        // G2B 데이터가 나타날 때까지 대기
        try {
          await this.page.waitForSelector('#apiData', { timeout: 10000 })
        } catch (error) {
          if (error && error.name === 'TimeoutError') {
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

  private async setReturnExchangeFee(data: ProductData) {
    if (!this.page) return

    // 반품배송비 입력
    if (data.returnFee) {
      await this.page.$eval('input[name="f_return_fee"]', el => ((el as HTMLInputElement).value = ''))
      await this.page.type('input[name="f_return_fee"]', data.returnFee)
    }

    // 교환배송비 입력 (반품배송비의 2배)
    if (data.exchangeFee) {
      await this.page.$eval('input[name="f_exchange_fee"]', el => ((el as HTMLInputElement).value = ''))
      await this.page.type('input[name="f_exchange_fee"]', data.exchangeFee)
    }
  }

  private async setOriginInfo(data: ProductData) {
    if (!this.page) return

    // 원산지구분 선택
    const homeValue = HOME_DIVI_MAP[data.originType] || '1'
    await this.page.click(`input[name="f_home_divi"][value="${homeValue}"]`)
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

  private async setDeliveryFee(data: ProductData) {
    if (!this.page) return

    // 배송비 종류 선택 (텍스트 기반 매핑 사용)
    const deliveryType = DELIVERY_TYPE_MAP[data.deliveryFeeKindText] || '1'
    await this.page.click(`input[name="f_delivery_fee_kind"][value="${deliveryType}"]`)

    if (deliveryType === '2' && data.deliveryFee) {
      // 유료배송
      await this.page.type('input[name="f_delivery_fee1"]', data.deliveryFee)
    } else if (deliveryType === '3') {
      // 조건부무료
    }

    // 나머지 배송 관련 설정들...
    await this.page.click(`input[name="f_delivery_group_yn"][value="${data.deliveryGroupYn}"]`)

    if (data.jejuDeliveryYn === 'Y') {
      await this.page.click('input[name="f_jeju_delivery_yn"]')
      if (data.jejuDeliveryFee) {
        await this.page.type('input[name="f_jeju_delivery_fee"]', data.jejuDeliveryFee)
      }
    }
  }

  private async setSalesUnitAndTax(data: ProductData) {
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

  private async selectCategory(data: ProductData) {
    if (!this.page) return

    // 등록구분 선택
    await this.page.select('select[name="sale_type"]', data.saleTypeText)

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

  async setCategoryDetails(data: ProductData) {
    if (!this.page) throw new Error('브라우저가 초기화되지 않았습니다.')

    // 소비기한 설정
    if (data.validateRadio) {
      await this.page.click(`input[name="validateRadio"][value="${data.validateRadio}"]`)
      if (data.validateRadio === 'date' && data.fValidate) {
        await this.page.type('input[name="f_validate"]', data.fValidate)
      }
    }

    // 기존 카테고리별 입력사항 설정 로직
    if (data.selPower) await this.page.type('input[name="f_sel_power"]', data.selPower)
    if (data.selWeight) await this.page.type('input[name="f_sel_weight"]', data.selWeight)
    if (data.selSameDate) await this.page.type('input[name="f_sel_samedate"]', data.selSameDate)
    if (data.selArea) await this.page.type('input[name="f_sel_area"]', data.selArea)
    if (data.selProduct) await this.page.type('input[name="f_sel_product"]', data.selProduct)
    if (data.selSafety) await this.page.type('input[name="f_sel_safety"]', data.selSafety)
    if (data.selCapacity) await this.page.type('input[name="f_sel_capacity"]', data.selCapacity)
    if (data.selSpecification) await this.page.type('input[name="f_sel_specification"]', data.selSpecification)
  }

  private async setCertifications(data: ProductData) {
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
        await this.page.click(`input[name="${cert.name}"][value="Y"]`)
      }
    }
  }

  private async setDetailHtml(html: string) {
    if (!this.page) return

    // iframe 내부의 에디터에 접근
    const se2Frame = this.page.frames().find(f => f.url().includes('SmartEditor2Skin.html'))

    if (!se2Frame) throw new Error('Editor iframe not found')

    try {
      // 메인 페이지에서 HTML 버튼 클릭
      await se2Frame.evaluate(() => {
        const htmlButton = document.querySelector('.se2_to_html')
        if (htmlButton instanceof HTMLButtonElement) {
          htmlButton.click()
        } else {
          throw new Error('HTML button not found')
        }
      })

      // 버튼 클릭 후 약간의 대기 시간
      await delay(500)

      // 편집기 영역 선택
      await se2Frame.waitForSelector('.se2_input_htmlsrc') // 편집기 컨테이너
      const $editorArea = await se2Frame.$('.se2_input_htmlsrc')
      if (!$editorArea) {
        throw new Error('Editor area not found')
      }

      // 편집기에 포커스 설정
      await $editorArea.click()

      // 텍스트 입력 (키보드 방식)
      await this.page.keyboard.type(html)

      // 메인 페이지에서 Editor 버튼 클릭하여 다시 에디터 모드로 전환
      await se2Frame.evaluate(() => {
        const editorButton = document.querySelector('.se2_to_editor')
        if (editorButton instanceof HTMLButtonElement) {
          editorButton.click()
        } else {
          throw new Error('Editor button not found')
        }
      })
    } catch (error) {
      console.error('Failed to set detail HTML:', error)
      throw error
    }
  }

  // KC 인증 정보 설정 메서드
  private async setKcCertifications(data: ProductData) {
    if (!this.page) return

    // 어린이제품 KC
    await this.page.click(`input[name="kidsKcUseGubunChk"][value="${data.kidsKcType}"]`)
    if (data.kidsKcType === 'Y' && data.kidsKcCertId) {
      await this.page.type('#kidsKcCertId', data.kidsKcCertId)
      await this.page.click('a[href="JavaScript:KcCertRegist(\'kids\');"]')
    } else if (data.kidsKcType === 'F' && data.kidsKcFile) {
      await this.uploadFile('#f_kcCertKidsImg_file', data.kidsKcFile)
    }

    // 전기용품 KC
    await this.page.click(`input[name="elecKcUseGubunChk"][value="${data.elecKcType}"]`)
    if (data.elecKcType === 'Y' && data.elecKcCertId) {
      await this.page.type('#elecKcCertId', data.elecKcCertId)
      await this.page.click('a[href="JavaScript:KcCertRegist(\'elec\');"]')
    } else if (data.elecKcType === 'F' && data.elecKcFile) {
      await this.uploadFile('#f_kcCertElecImg_file', data.elecKcFile)
    }

    // 생활용품 KC
    await this.page.click(`input[name="dailyKcUseGubunChk"][value="${data.dailyKcType}"]`)
    if (data.dailyKcType === 'Y' && data.dailyKcCertId) {
      await this.page.type('#dailyKcCertId', data.dailyKcCertId)
      await this.page.click('a[href="JavaScript:KcCertRegist(\'daily\');"]')
    } else if (data.dailyKcType === 'F' && data.dailyKcFile) {
      await this.uploadFile('#f_kcCertDailyImg_file', data.dailyKcFile)
    }

    // 방송통신기자재 KC
    await this.page.click(`input[name="broadcastingKcUseGubunChk"][value="${data.broadcastingKcType}"]`)
    if (data.broadcastingKcType === 'Y' && data.broadcastingKcCertId) {
      await this.page.type('#broadcastingKcCertId', data.broadcastingKcCertId)
      await this.page.click('a[href="JavaScript:KcCertRegist(\'broadcasting\');"]')
    } else if (data.broadcastingKcType === 'F' && data.broadcastingKcFile) {
      await this.uploadFile('#f_kcCertBroadcastingImg_file', data.broadcastingKcFile)
    }
  }

  async setOtherAttachments(data: ProductData) {
    if (!this.page) throw new Error('브라우저가 초기화되지 않았습니다.')

    // 어린이 하차 확인 장치
    await this.page.click(`input[name="childexitcheckerKcUseGubunChk"][value="${data.childExitCheckerKcType}"]`)
    if (data.childExitCheckerKcType === 'Y' && data.childExitCheckerKcCertId) {
      await this.page.type('#childexitcheckerKcCertId', data.childExitCheckerKcCertId)
      await this.page.click('a[href="JavaScript:KcCertRegist(\'childexitchecker\');"]')
    } else if (data.childExitCheckerKcType === 'F' && data.childExitCheckerKcFile) {
      await this.uploadFile('#f_kcCertChildExitCheckerImg_file', data.childExitCheckerKcFile)
    }

    // 안전확인대상 생활화학제품
    await this.page.click(`input[name="safetycheckKcUseGubunChk"][value="${data.safetyCheckKcType}"]`)
    if (data.safetyCheckKcType === 'Y' && data.safetyCheckKcCertId) {
      await this.page.type('#safetycheckKcCertId', data.safetyCheckKcCertId)
    } else if (data.safetyCheckKcType === 'F' && data.safetyCheckKcFile) {
      await this.uploadFile('#f_kcCertSafetycheckImg_file', data.safetyCheckKcFile)
    }
  }

  async setPpsContract(data: ProductData) {
    if (!this.page) throw new Error('브라우저가 초기화되지 않았습니다.')

    // 계약 여부 설정
    await this.page.click(`input[name="f_pps_c_yn"][value="${data.ppsContractYn}"]`)

    // 계약일 입력
    if (data.ppsContractYn === 'Y') {
      if (data.ppsContractStartDate) {
        await this.page.evaluate(startDate => {
          const input = document.querySelector('input[name="f_pps_c_s_dt"]') as HTMLInputElement
          if (input) {
            input.value = startDate
          }
        }, data.ppsContractStartDate)
      }

      if (data.ppsContractEndDate) {
        await this.page.evaluate(endDate => {
          const input = document.querySelector('input[name="f_pps_c_e_dt"]') as HTMLInputElement
          if (input) {
            input.value = endDate
          }
        }, data.ppsContractEndDate)
      }
    }
  }

  private async uploadFile(inputSelector: string, filePathOrUrl: string, statusSelector?: string) {
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
    this.log(`${imageType} 업로드 시작: ${filePathOrUrl}`, 'info')

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

        this.log(`외부 이미지 다운로드 시작: ${filePathOrUrl}`, 'info')
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

        this.log(`외부 이미지 확인완료: ${filePathOrUrl}`, 'info')
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

        this.log(`컴퓨터 이미지 확인완료: ${filePathOrUrl}`, 'info')
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
          this.log(`이미지 변환 처리 불필요: ${inputSelector}`, 'info')
          break
      }

      // sharp를 사용한 이미지 변환 처리
      this.log(`이미지 변환 처리 시작: ${imageType}`, 'info')

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

      this.log(`이미지 변환 처리 완료: ${imageType}`, 'info')

      // 파일 업로드
      const inputElement = (await this.page.$(inputSelector)) as puppeteer.ElementHandle<HTMLInputElement>
      if (inputElement) {
        await inputElement.uploadFile(filePath)
        this.log(`${imageType} 파일 업로드 완료`, 'info')

        if (statusSelector) {
          try {
            await this.page.waitForFunction(
              selector => {
                const element = document.querySelector(selector)
                return element && element.textContent?.trim() === '이미지 용량 확인 완료'
              },
              { timeout: 20000 },
              statusSelector,
            )
            this.log(`${imageType} 용량 확인 완료`, 'info')
          } catch (error) {
            if (error && error.name === 'TimeoutError') {
              throw new Error('이미지 용량 확인이 20초 내에 완료되지 않았습니다. (타임아웃)')
            }
            throw error
          }
        }
      } else {
        throw new Error(`Input element not found for selector: ${inputSelector}`)
      }
    } catch (error) {
      this.log(`${imageType} 업로드 실패: ${error.message}`, 'error')
      throw error
    }
  }

  private async uploadAllImages(data: ProductData) {
    if (!this.page) return

    this.log('이미지 업로드 프로세스 시작', 'info')

    if (data.image1) {
      this.log('기본이미지1 업로드 시작', 'info')
      await this.uploadFile('#f_img1_file', data.image1, '#f_img1_file_size_ck')
      await delay(5000)
      this.log('기본이미지1 업로드 완료', 'info')
    }

    if (data.image2) {
      this.log('기본이미지2 업로드 시작', 'info')
      await this.uploadFile('#f_img2_file', data.image2, '#f_img2_file_size_ck')
      await delay(5000)
      this.log('기본이미지2 업로드 완료', 'info')
    }

    if (data.addImage1) {
      this.log('추가이미지1 업로드 시작', 'info')
      await this.uploadFile('#f_img3_file', data.addImage1, '#f_img3_file_size_ck')
      await delay(5000)
      this.log('추가이미지1 업로드 완료', 'info')
    }

    if (data.addImage2) {
      this.log('추가이미지2 업로드 시작', 'info')
      await this.uploadFile('#f_img4_file', data.addImage2, '#f_img4_file_size_ck')
      await delay(5000)
      this.log('추가이미지2 업로드 완료', 'info')
    }

    if (data.detailImage) {
      this.log('상세이미지 업로드 시작', 'info')
      await this.uploadFile('#f_goods_explain_img_file', data.detailImage, '#f_goods_explain_img_file_size_ck')
      await delay(5000)
      this.log('상세이미지 업로드 완료', 'info')
    }

    this.log('이미지 업로드 프로세스 완료', 'info')

    // 이미지 업로드 결과 확인
    await this.verifyImageUploads()
  }

  private async verifyImageUploads() {
    if (!this.page) return

    const imageInputs = ['f_img1', 'f_img2', 'f_img3', 'f_img4', 'f_goods_explain_img']

    for (const inputName of imageInputs) {
      const value = await this.page
        .$eval(`input[name="${inputName}"]`, (el: HTMLInputElement) => el.value)
        .catch(() => '')

      if (value) {
        console.log(`${inputName} uploaded successfully`)
      }
    }
  }

  private async setAsInfo(data: ProductData) {
    if (!this.page) return

    // 전화번호 입력
    if (data.asTelephone1) {
      // 값 지우기
      await this.page.evaluate(() => {
        const input = document.querySelector('input[name="f_as_telephone1"]') as HTMLInputElement
        if (input) input.value = '' // 기존 값 지우기
      })
      // 새 값 입력
      await this.page.type('input[name="f_as_telephone1"]', data.asTelephone1)
    }

    // 제조사 A/S 전화번호 입력
    if (data.asTelephone2) {
      // 값 지우기
      await this.page.evaluate(() => {
        const input = document.querySelector('input[name="f_as_telephone2"]') as HTMLInputElement
        if (input) input.value = '' // 기존 값 지우기
      })
      // 새 값 입력
      await this.page.type('input[name="f_as_telephone2"]', data.asTelephone2)
    }

    // 주소 입력
    if (data.addressCode) {
      await this.page.evaluate(addressCode => {
        const input = document.querySelector<HTMLInputElement>('input[name="f_address_code"]')
        if (input) {
          input.value = addressCode
        }
      }, data.addressCode)
    }

    if (data.address) {
      await this.page.evaluate(address => {
        const input = document.querySelector<HTMLInputElement>('input[name="f_address"]')
        if (input) {
          input.value = address
        }
      }, data.address)
    }

    if (data.addressDetail) {
      await this.page.evaluate(addressDetail => {
        const input = document.querySelector<HTMLInputElement>('input[name="f_address_detail"]')
        if (input) {
          input.value = addressDetail
        }
      }, data.addressDetail)
    }
  }

  private async setDeliveryInfo(data: ProductData) {
    if (!this.page) return

    // 배송 방법 선택
    if (data.deliveryMethod) {
      await this.page.click(`input[name="f_delivery_method"][value="${data.deliveryMethod}"]`)
    }

    // 배송 지역 선택
    if (data.deliveryAreas?.length > 0 && !data.deliveryAreas.includes('전국')) {
      // "지역선택" 라디오 버튼 클릭
      await this.page.click('input[name="delivery_area"][value="2"]')

      for (const area of data.deliveryAreas) {
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
    } else {
      await this.page.click('input[name="delivery_area"][value="1"]')
    }
  }

  public async extendManagementDateForRange(startDate: string, endDate: string, registrationStatus: string = '') {
    if (!this.page) throw new Error('브라우저가 초기화되지 않았습니다.')
    try {
      await this.gotoAndSearchListPageByRange(startDate, endDate, registrationStatus)
      const products = await this.collectAllProductLinks()
      await this.processExtendProducts(products)
    } finally {
      await this.browser.close()
    }
  }

  private async gotoAndSearchListPageByRange(startDate: string, endDate: string, registrationStatus: string = '') {
    await this.page.goto('https://www.s2b.kr/S2BNVendor/S2B/srcweb/remu/rema/rema100_list_new.jsp', {
      waitUntil: 'domcontentloaded',
    })

    // 페이지당 항목 수를 100개로 설정하고 적용
    await this.page.evaluate(() => {
      ;(document.querySelector('#rowCount') as HTMLSelectElement).value = '100'
      const setRowCountButton = document.querySelector('a[href^="javascript:setRowCount2()"]') as HTMLElement
      if (setRowCountButton) setRowCountButton.click()
    })
    await this.page.waitForNavigation({ waitUntil: 'domcontentloaded' })

    // 검색 조건 설정
    await this.page.evaluate(
      (start, end, status) => {
        ;(document.querySelector('#search_date') as HTMLSelectElement).value = 'LIMIT_DATE'
        ;(document.querySelector('#search_date_start') as HTMLInputElement).value = start
        ;(document.querySelector('#search_date_end') as HTMLInputElement).value = end
        if (status) {
          const radio = document.querySelector(`input[name="tgruStatus"][value="${status}"]`) as HTMLInputElement
          if (radio) {
            radio.checked = true
            radio.dispatchEvent(new Event('change', { bubbles: true }))
          }
        }
      },
      startDate,
      endDate,
      registrationStatus,
    )
    await Promise.all([
      this.page.click('[href^="javascript:search()"]'),
      this.page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    ])
  }

  // 브라우저 종료
  async close() {
    if (this.browser) {
      await this.browser.close()
    }
  }

  // 타사이트 등록 여부 및 정보 설정
  private async setOtherSiteInformation(data: ProductData) {
    if (!this.page) return

    // 타사이트 등록 여부
    if (data.otherSiteRegisterYn) {
      await this.page.click(`input[name="f_site_register_yn"][value="${data.otherSiteRegisterYn}"]`)
    }

    // 타사이트 등록 가격
    if (data.otherSiteAmt) {
      await this.page.evaluate(amt => {
        const input = document.querySelector<HTMLInputElement>('input[name="f_site_amt"]')
        if (input) {
          input.value = amt
          input.dispatchEvent(new Event('change', { bubbles: true }))
        }
      }, data.otherSiteAmt)
    }
  }

  // 나라장터 등록 여부 및 정보 설정
  private async setNaraInformation(data: ProductData) {
    if (!this.page) return

    // 나라장터 등록 여부
    if (data.naraRegisterYn) {
      await this.page.click(`input[name="f_nara_register_yn"][value="${data.naraRegisterYn}"]`)
    }

    // 나라장터 등록 가격
    if (data.naraAmt) {
      await this.page.evaluate(amt => {
        const input = document.querySelector<HTMLInputElement>('input[name="f_nara_amt"]')
        if (input) {
          input.value = amt
          input.dispatchEvent(new Event('change', { bubbles: true }))
        }
      }, data.naraAmt)
    }

    // 사이트명
    if (data.siteName) {
      await this.page.evaluate(name => {
        const input = document.querySelector<HTMLInputElement>('input[name="f_site_name"]')
        if (input) {
          input.value = name
          input.dispatchEvent(new Event('change', { bubbles: true }))
        }
      }, data.siteName)
    }

    // 사이트주소
    if (data.siteUrl) {
      await this.page.evaluate(url => {
        const input = document.querySelector<HTMLInputElement>('input[name="f_site_url"]')
        if (input) {
          input.value = url
          input.dispatchEvent(new Event('change', { bubbles: true }))
        }
      }, data.siteUrl)
    }
  }

  // 상품등록 완료 메서드 수정
  private async submitRegistration() {
    if (!this.page) return

    // 청렴서약서 체크 상태 확인
    const isChecked = await this.page.$eval('#uprightContract', (el: Element) => (el as HTMLInputElement).checked)

    // 혹시 체크가 안되어 있다면 다시 체크
    if (!isChecked) {
      await this.page.evaluate(() => {
        const checkbox = document.querySelector('#uprightContract') as HTMLInputElement
        if (checkbox) {
          checkbox.checked = true
          checkbox.dispatchEvent(new Event('change', { bubbles: true }))
        }
      })
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

  public async collectAllProductLinks(): Promise<{ name: string; link: string }[]> {
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
        await this.page.waitForNavigation({ waitUntil: 'domcontentloaded' })
      }
    }
    return products
  }

  public async processExtendProducts(
    products: {
      name: string
      link: string
      status?: 'success' | 'fail'
      errorMessage?: string
      extendedDate?: string
    }[],
  ) {
    for (const product of products) {
      try {
        await this.page.goto(product.link, { waitUntil: 'domcontentloaded' })

        // 관리일 연장 버튼 클릭
        const extendButton = await this.page.$('a[href^="javascript:fnLimitDateUpdate()"]')
        if (!extendButton) {
          product.status = 'fail'
          product.errorMessage = '관리일 연장 버튼을 찾을 수 없습니다'
          this.log(`관리일 연장 버튼을 찾을 수 없습니다: ${product.name}`, 'error')
          continue
        }

        let isSuccess = undefined
        let errorMessage = ''

        // 관리일 연장 처리를 위한 임시 dialog 이벤트 핸들러
        const handleExtensionDialog = async (dialog: puppeteer.Dialog) => {
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
                this.log(`관리일 연장 실패 - ${message}`, 'error')
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
            this.log(`관리일 연장 실패 (타임아웃) - ${product.name}`, 'error')
            continue
          }

          if (isSuccess) {
            product.status = 'success'
            this.log(`관리일 연장 성공: ${product.name} (${product.extendedDate}까지)`, 'info')
          } else {
            product.status = 'fail'
            product.errorMessage = errorMessage
            this.log(`관리일 연장 실패: ${product.name}`, 'error')
          }
        } finally {
          // 임시 이벤트 리스너 제거
          this.page.off('dialog', handleExtensionDialog)
        }

        await delay(2000)
      } catch (error) {
        product.status = 'fail'
        product.errorMessage = error.message
        this.log(`상품 처리 중 오류가 발생했습니다 (${product.name}): ${error}`, 'error')
      }
    }

    const successProducts = products.filter(p => p.status === 'success')
    const failedProducts = products.filter(p => p.status === 'fail')

    this.log(
      `관리일 연장 처리 완료 - 총: ${products.length}개, 성공: ${successProducts.length}개, 실패: ${failedProducts.length}개`,
      successProducts.length === products.length ? 'info' : 'warning',
    )

    // 실패한 상품 목록 로깅
    if (failedProducts.length > 0) {
      this.log('실패한 상품 목록:', 'error')
      failedProducts.forEach(product => {
        this.log(`- ${product.name}: ${product.errorMessage}`, 'error')
      })
    }

    return products // 처리 결과가 포함된 상품 목록 반환
  }
}
