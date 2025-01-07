import * as puppeteer from 'puppeteer-core'
import * as XLSX from 'xlsx'
import path from 'node:path'
import fs from 'fs/promises'
import * as fsSync from 'fs'

interface ProductData {
  // 등록구분을 위한 텍스트 값
  saleTypeText: SaleType;

  goodsName: string; // 물품명
  spec: string; // 규격
  modelName: string; // 모델명
  estimateAmt: string; // 제시금액
  factory: string; // 제조사
  material: string; // 소재/재질
  remainQnt: string; // 재고수량
  assure: string; // 보증기간
  returnFee: string; // 반품배송비
  exchangeFee: string; // 교환배송비

  estimateValidity?: string; // 견적서 유효기간

  // 납품가능기간
  deliveryLimitText: DeliveryLimitType;  // 텍스트 형태의 납품가능기간
  deliveryLimit: string; // 납품가능기간

  // 카테고리 관련
  category1: string; // 1차 카테고리
  category2: string; // 2차 카테고리
  category3: string; // 3차 카테고리

  // 인증정보
  womanCert: string; // 여성기업
  disabledCompanyCert: string; // 장애인기업
  foundationCert: string; // 창업기업
  disabledCert: string; // 장애인표준사업장
  severalCert: string; // 중증장애인생산품
  cooperationCert: string; // 사회적협동조합
  societyCert: string; // 사회적기업
  recycleCert: string; // 우수재활용제품
  environmentCert: string; // 환경표지제품
  lowCarbonCert: string; // 저탄소인증
  swQualityCert: string; // SW품질인증
  nepCert: string; // 신제품인증
  netCert: string; // 신기술인증
  greenProductCert: string; // 녹색기술인증
  epcCert: string; // 성능인증
  procureCert: string; // 우수조달제품
  seoulTownCert: string; // 마을기업
  seoulSelfCert: string; // 자활기업
  seoulCollaborationCert: string; // 협동조합
  seoulReserveCert: string; // 예비사회적기업

  // KC 인증 정보 추가
  // 어린이제품 인증
  kidsKcType: string; // 'Y': 인증번호등록, 'F': 공급자적합성확인, 'N': 인증표시대상아님
  kidsKcCertId?: string; // 국가기술표준원 인증번호
  kidsKcFile?: string; // 공급자적합성확인 시험성적서 파일경로

  // 전기용품 인증
  elecKcType: string; // 'Y': 인증번호등록, 'F': 공급자적합성확인, 'N': 인증표시대상아님
  elecKcCertId?: string; // 국가기술표준원 인증번호
  elecKcFile?: string; // 공급자적합성확인 시험성적서 파일경로

  // 생활용품 인증
  dailyKcType: string; // 'Y': 인증번호등록, 'F': 공급자적합성확인, 'N': 인증표시대상아님
  dailyKcCertId?: string; // 국가기술표준원 인증번호
  dailyKcFile?: string; // 공급자적합성확인 시험성적서 파일경로

  // 방송통신기자재 인증
  broadcastingKcType: string; // 'Y': 인증번호등록, 'F': 공급자적합성확인, 'N': 인증표시대상아님
  broadcastingKcCertId?: string; // KC 전파적합성인증 번호
  broadcastingKcFile?: string; // 공급자적합성확인 시험성적서 파일경로

  // 배송비 관련
  deliveryFeeKindText: DeliveryFeeType;
  deliveryFeeKind: string; // 배송비 종류 (1: 무료, 2: 유료, 3: 조건부무료)
  deliveryFee: string; // 배송비 금액
  deliveryFeeLimit1?: string; // 조건부무료 기준금액1
  deliveryFeeLimit2?: string; // 조건부무료 기준금액2
  deliveryGroupYn: string; // 묶음배송여부 (Y/N)
  jejuDeliveryYn: string; // 제주배송여부 (Y/N)
  jejuDeliveryFee?: string; // 제주추가배송비

  // 상세설명 및 이미지
  detailHtml: string; // 상세설명 HTML
  image1?: string; // 기본이미지1 파일경로
  image2?: string; // 기본이미지2 파일경로
  addImage1?: string; // 추가이미지1 파일경로
  addImage2?: string; // 추가이미지2 파일경로
  detailImage?: string; // 상세이미지 파일경로

  // 원산지 관련 필드 추가
  originType: HomeType;
  originLocal: string; // 국내인 경우: "경기", "서울" 등
  originForeign: string; // 국외인 경우: "중국", "일본" 등

  // 판매단위와 과세여부 필드 추가
  salesUnit: string; // 판매단위: "개", "세트", "박스" 등
  taxType: string;   // 과세여부: "과세(세금계산서)", "비과세(계산서)", "비과세(영수증)"

  approvalRequest: string; // 승인관련 요청사항
}

type SaleType = '물품' | '용역';
type DeliveryFeeType = '무료' | '유료' | '조건부무료';
type HomeType = '국내' | '국외';
type DeliveryLimitType = '3일' | '5일' | '7일' | '15일' | '30일' | '45일';

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
  '물품': '1',
  '용역': '3',
}

const DELIVERY_TYPE_MAP: Record<DeliveryFeeType, string> = {
  '무료': '1',
  '유료': '2',
  '조건부무료': '3',
}

const HOME_DIVI_MAP: Record<HomeType, string> = {
  '국내': '1',
  '국외': '2',
}

const REGION_CODE_MAP = {
  '강원': 'ZD000025',
  '경기': 'ZD000026',
  '경남': 'ZD000027',
  '경북': 'ZD000028',
  '광주': 'ZD000029',
  '대구': 'ZD000030',
  '대전': 'ZD000031',
  '부산': 'ZD000032',
  '서울': 'ZD000033',
  '세종': 'ZD000069',
  '울산': 'ZD000034',
  '인천': 'ZD000035',
  '전남': 'ZD000036',
  '전북': 'ZD000037',
  '제주': 'ZD000038',
  '충남': 'ZD000039',
  '충북': 'ZD000040',
}

const TAX_METHOD_MAP = {
  '과세(세금계산서)': '1',
  '비과세(계산서)': '2',
  '비과세(영수증)': '3',
}

const UNIT_MAP = {
  'cc': 'ZD000127',
  'cm': 'ZD000095',
  'g': 'ZD000108',
  'kg': 'ZD000107',
  'km': 'ZD000097',
  'm': 'ZD000096',
  'SET': 'ZD000244',
  '개': 'ZD000048',
  '건': 'ZD000298',
  '권': 'ZD000050',
  '대': 'ZD000049',
  '박스': 'ZD000303',
  '세트': 'ZD000244',
}


const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export class S2BAutomation {
  private browser: puppeteer.Browser | null = null
  private page: puppeteer.Page | null = null
  private baseImagePath: string // 이미지 기본 경로
  private chromePath: string  // Chrome 실행 파일 경로 추가
  private dialogErrorMessage: string | null = null // dialog 에러 메시지 추적

  constructor(baseImagePath: string) {
    this.baseImagePath = baseImagePath

    // OS별 Chrome 기본 설치 경로 설정
    if (process.platform === 'darwin') {  // macOS
      this.chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    } else if (process.platform === 'win32') {  // Windows
      const possiblePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
      ]
      this.chromePath = possiblePaths.find(p => fsSync.existsSync(p)) || ''
    } else {  // Linux
      this.chromePath = '/usr/bin/google-chrome'
    }

    if (!fsSync.existsSync(this.chromePath)) {
      throw new Error('Chrome 브라우저를 찾을 수 없습니다. Chrome이 설치되어 있는지 확인해주세요.')
    }
    if (!this.chromePath || !fsSync.existsSync(this.chromePath)) {
      throw new Error('Chrome 실행 파일 경로를 찾을 수 없습니다. Windows 환경에서 Chrome이 설치되어 있는지 확인하세요.')
    }
  }

  async login(id: string, password: string) {
    if (!this.page) throw new Error('Browser not initialized')

    await this.page.goto('https://www.s2b.kr/S2BNCustomer/Login.do?type=sp&userDomain=')
    await this.page.type('form[name="vendor_loginForm"] [name="uid"]', id)
    await this.page.type('form[name="vendor_loginForm"] [name="pwd"]', password)
    await this.page.click('form[name="vendor_loginForm"] .btn_login > a')
    await this.page.waitForNavigation()
  }

  // Excel 파일 읽기
  async readExcelFile(filePath: string): Promise<any[]> {
    const workbook = XLSX.readFile(filePath)
    const sheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]

    const data = XLSX.utils.sheet_to_json(worksheet)
    return data.map((row: any) => {

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

          // 등록구분 매핑 추가
          saleTypeText,
          saleType: SALE_TYPE_MAP[saleTypeText],

          category1: row['카테고리1']?.toString() || '',
          category2: row['카테고리2']?.toString() || '',
          category3: row['카테고리3']?.toString() || '',

          // 배송비 정보 매핑 수정
          deliveryFeeKindText,
          deliveryFeeKind: DELIVERY_TYPE_MAP[deliveryFeeKindText],
          deliveryFee: row['배송비']?.toString() || '',
          deliveryFeeLimit1: row['조건부무료기준금액1']?.toString(),
          deliveryFeeLimit2: row['조건부무료기준금액2']?.toString(),
          deliveryGroupYn: row['묶음배송여부']?.toString() || 'Y',
          jejuDeliveryYn: row['제주배송여부']?.toString() || 'N',
          jejuDeliveryFee: row['제주추가배송비']?.toString(),

          // KC 인증 정보
          kidsKcType: row['어린이제품KC유형']?.toString() || 'N',
          kidsKcCertId: row['어린이제품KC인증번호']?.toString(),
          kidsKcFile: row['어린이제품KC성적서']?.toString(),

          elecKcType: row['전기용품KC유형']?.toString() || 'N',
          elecKcCertId: row['전기용품KC인증번호']?.toString(),
          elecKcFile: row['전기용품KC성적서']?.toString(),

          dailyKcType: row['생활용품KC유형']?.toString() || 'N',
          dailyKcCertId: row['생활용품KC인증번호']?.toString(),
          dailyKcFile: row['생활용품KC성적서']?.toString(),

          broadcastingKcType: row['방송통신KC유형']?.toString() || 'N',
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

          approvalRequest: row['승인관련 요청사항']?.toString() || '',
        }
      },
    )
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
      headless: false,
      defaultViewport: null,
      executablePath: this.chromePath, // Chrome 실행 파일 경로 지정
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })

    this.page = await this.browser.newPage()

    // Dialog 이벤트 처리
    this.page.on('dialog', async (dialog) => {
      if (dialog.type() === 'alert') {
        const message = dialog.message()

        // 특정 메시지 필터링: 성공 처리 메시지
        if (message.includes('S2B의 “견적정보 등록”은 지방자치단체를 당사자로 하는 계약에 관한 법률 시행령 제30조')) {
          await dialog.accept() // "확인" 버튼 자동 클릭
        } else if (message.includes('등록대기 상태로 변경되었으며')) {
          console.log('Registration successful: "등록대기 상태로 변경되었으며".')
          await dialog.accept() // 성공으로 처리
        } else {
          console.error('Registration Error:', message)
          this.dialogErrorMessage = message // 에러 메시지 저장
          await dialog.dismiss() // Alert 닫기
        }
      }
    })

    // 팝업 감지 및 처리
    this.browser.on('targetcreated', async (target) => {
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
          await delay(1000)
          // iframe 로드 대기
          await page.waitForSelector('#MpreviewerImg', {timeout: 20000})
          const iframeElement = await page.$('#MpreviewerImg')
          if (!iframeElement) throw new Error('Iframe not found.')

          const iframe = await iframeElement.contentFrame()
          await iframe.waitForSelector('#reSizeStatus', {timeout: 20000})
          const resizeStatus = await iframe.$eval('#reSizeStatus', (element) => element.textContent?.trim())

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
          await page.waitForSelector('[onclick^="fnConfirm("]', {timeout: 5000})

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
    if (!this.page) throw new Error('Browser not initialized')

    this.dialogErrorMessage = null // 초기화

    await this.page.goto('https://www.s2b.kr/S2BNVendor/rema100.do?forwardName=goRegistView')
    await this.page.waitForSelector('select[name="sale_type"]')

    try {
      // 기본 정보 입력
      await this.setBasicInfo(data)
      // 이미지 업로드
      await this.uploadAllImages(data)
      // 카테고리 선택
      await this.selectCategory(data)
      // 인증정보 설정
      await this.setCertifications(data)
      // KC 인증 정보 설정
      await this.setKcCertifications(data)
      // 배송비 설정
      await this.setDeliveryFee(data)
      // 상세설명 HTML 설정
      await this.setDetailHtml(data.detailHtml)
      // 판매단위와 과세여부 설정
      await this.setSalesUnitAndTax(data)
      // 반품/교환 배송비 입력
      await this.setReturnExchangeFee(data)
      // 원산지 정보 설정 (자동입력 기능 포함)
      await this.setOriginInfo(data)
      // 청렴서약서 동의 및 등록
      await this.submitRegistration()

      // Dialog에서 에러 메시지가 발생했는지 확인
      if (this.dialogErrorMessage) {
        throw new Error(this.dialogErrorMessage) // 에러 발생 시 throw
      }
    } catch (error) {
      console.error('상품 등록 중 오류 발생:', error)
      throw error
    }
  }

  private async setBasicInfo(data: ProductData) {
    if (!this.page) return

    // 등록구분 선택 (텍스트 기반 매핑 사용)
    await this.page.select('select[name="sale_type"]', SALE_TYPE_MAP[data.saleTypeText] || '1')

    await this.page.type('input[name="f_goods_name"]', data.goodsName)
    await this.page.type('input[name="f_size"]', data.spec)

    // 보증기간 초기화 후 입력
    await this.page.$eval('input[name="f_assure"]', el => (el as HTMLInputElement).value = '')
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
    await this.page.evaluate((deliveryLimitData) => {
      const select = document.querySelector('select[name="f_delivery_limit"]') as HTMLSelectElement
      if (select) {
        select.value = deliveryLimitData.code
        select.dispatchEvent(new Event('change', {bubbles: true}))
      }
    }, {code: data.deliveryLimit})

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

  private async setReturnExchangeFee(data: ProductData) {
    if (!this.page) return

    // 반품배송비 입력
    if (data.returnFee) {
      await this.page.$eval('input[name="f_return_fee"]', el => (el as HTMLInputElement).value = '')
      await this.page.type('input[name="f_return_fee"]', data.returnFee)
    }

    // 교환배송비 입력 (반품배송비의 2배)
    if (data.exchangeFee) {
      await this.page.$eval('input[name="f_exchange_fee"]', el => (el as HTMLInputElement).value = '')
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
      await this.page.evaluate((localName) => {
        const select = document.querySelector('#select_home_01') as HTMLSelectElement
        const options = Array.from(select.options)
        const option = options.find(opt => opt.text.includes(localName))
        if (option) {
          select.value = option.value
          select.dispatchEvent(new Event('change', {bubbles: true}))
        }
      }, data.originLocal)
    } else if (data.originType === '국외' && data.originForeign) {
      await this.page.evaluate((foreignName) => {
        const select = document.querySelector('#select_home_02') as HTMLSelectElement
        const options = Array.from(select.options)
        const option = options.find(opt => opt.text.includes(foreignName))
        if (option) {
          select.value = option.value
          select.dispatchEvent(new Event('change', {bubbles: true}))
        }
      }, data.originForeign)
    }
  }

  private async setDeliveryFee(data: ProductData) {
    if (!this.page) return

    // 배송비 종류 선택 (텍스트 기반 매핑 사용)
    const deliveryType = DELIVERY_TYPE_MAP[data.deliveryFeeKindText] || '1'
    await this.page.click(`input[name="f_delivery_fee_kind"][value="${deliveryType}"]`)

    if (deliveryType === '2' && data.deliveryFee) { // 유료배송
      await this.page.type('input[name="f_delivery_fee1"]', data.deliveryFee)
    } else if (deliveryType === '3') { // 조건부무료
      await this.page.type('input[name="f_delivery_fee2"]', data.deliveryFee)
      if (data.deliveryFeeLimit1) {
        await this.page.type('input[name="f_delivery_fee_limit1"]', data.deliveryFeeLimit1)
      }
      if (data.deliveryFeeLimit2) {
        await this.page.type('input[name="f_delivery_fee_limit2"]', data.deliveryFeeLimit2)
      }
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
    await this.page.evaluate((unitText) => {
      const select = document.querySelector('select[name="f_credit"]') as HTMLSelectElement
      const options = Array.from(select.options)
      const option = options.find(opt => opt.text === unitText)
      if (option) {
        select.value = option.value
        select.dispatchEvent(new Event('change', {bubbles: true}))
      } else {
        throw new Error(`판매단위 "${unitText}"를 찾을 수 없습니다.`)
      }
    }, data.salesUnit)

    // 과세여부 선택
    await this.page.evaluate((taxText) => {
      const select = document.querySelector('select[name="f_tax_method"]') as HTMLSelectElement
      const options = Array.from(select.options)
      const option = options.find(opt => opt.text === taxText)
      if (option) {
        select.value = option.value
        select.dispatchEvent(new Event('change', {bubbles: true}))
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
    await this.page.evaluate((categoryText) => {
      const select = document.querySelector('select[name="f_category_code1"]') as HTMLSelectElement
      const options = Array.from(select.options)
      const option = options.find(opt => opt.text === categoryText)
      if (option) {
        select.value = option.value
        // 변경 이벤트 발생
        const event = new Event('change', {bubbles: true})
        select.dispatchEvent(event)
      }
    }, data.category1)
    await delay(1000)

    // 2차 카테고리 선택
    await this.page.evaluate((categoryText) => {
      const select = document.querySelector('select[name="f_category_code2"]') as HTMLSelectElement
      const options = Array.from(select.options)
      const option = options.find(opt => opt.text === categoryText)
      if (option) {
        select.value = option.value
        // 변경 이벤트 발생
        const event = new Event('change', {bubbles: true})
        select.dispatchEvent(event)
      }
    }, data.category2)
    await delay(1000)

    // 3차 카테고리 선택
    await this.page.evaluate((categoryText) => {
      const select = document.querySelector('select[name="f_category_code3"]') as HTMLSelectElement
      const options = Array.from(select.options)
      const option = options.find(opt => opt.text === categoryText)
      if (option) {
        select.value = option.value
        // 변경 이벤트 발생
        const event = new Event('change', {bubbles: true})
        select.dispatchEvent(event)
      }
    }, data.category3)
  }

  private async setCertifications(data: ProductData) {
    if (!this.page) return

    const certFields = [
      {name: 'f_woman_cert', value: data.womanCert},
      {name: 'f_disabledCompany_cert', value: data.disabledCompanyCert},
      {name: 'f_foundation_cert', value: data.foundationCert},
      {name: 'f_disabled_cert', value: data.disabledCert},
      {name: 'f_several_cert', value: data.severalCert},
      {name: 'f_cooperation_cert', value: data.cooperationCert},
      {name: 'f_society_cert', value: data.societyCert},
      {name: 'f_recycle_cert', value: data.recycleCert},
      {name: 'f_environment_cert', value: data.environmentCert},
      {name: 'f_lowCarbon_cert', value: data.lowCarbonCert},
      {name: 'f_swQuality_cert', value: data.swQualityCert},
      {name: 'f_nep_cert', value: data.nepCert},
      {name: 'f_net_cert', value: data.netCert},
      {name: 'f_greenProduct_cert', value: data.greenProductCert},
      {name: 'f_epc_cert', value: data.epcCert},
      {name: 'f_procure_cert', value: data.procureCert},
      {name: 'f_seoulTown_cert', value: data.seoulTownCert},
      {name: 'f_seoulSelf_cert', value: data.seoulSelfCert},
      {name: 'f_seoulCollaboration_cert', value: data.seoulCollaborationCert},
      {name: 'f_seoulReserve_cert', value: data.seoulReserveCert},
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
    const se2Frame = this.page.frames().find(f =>
      f.url().includes('SmartEditor2Skin.html'),
    )

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
      await this.uploadImage('#f_kcCertKidsImg_file', path.join(this.baseImagePath, data.kidsKcFile))
    }

    // 전기용품 KC
    await this.page.click(`input[name="elecKcUseGubunChk"][value="${data.elecKcType}"]`)
    if (data.elecKcType === 'Y' && data.elecKcCertId) {
      await this.page.type('#elecKcCertId', data.elecKcCertId)
      await this.page.click('a[href="JavaScript:KcCertRegist(\'elec\');"]')
    } else if (data.elecKcType === 'F' && data.elecKcFile) {
      await this.uploadImage('#f_kcCertElecImg_file', path.join(this.baseImagePath, data.elecKcFile))
    }

    // 생활용품 KC
    await this.page.click(`input[name="dailyKcUseGubunChk"][value="${data.dailyKcType}"]`)
    if (data.dailyKcType === 'Y' && data.dailyKcCertId) {
      await this.page.type('#dailyKcCertId', data.dailyKcCertId)
      await this.page.click('a[href="JavaScript:KcCertRegist(\'daily\');"]')
    } else if (data.dailyKcType === 'F' && data.dailyKcFile) {
      await this.uploadImage('#f_kcCertDailyImg_file', path.join(this.baseImagePath, data.dailyKcFile))
    }

    // 방송통신기자재 KC
    await this.page.click(`input[name="broadcastingKcUseGubunChk"][value="${data.broadcastingKcType}"]`)
    if (data.broadcastingKcType === 'Y' && data.broadcastingKcCertId) {
      await this.page.type('#broadcastingKcCertId', data.broadcastingKcCertId)
      await this.page.click('a[href="JavaScript:KcCertRegist(\'broadcasting\');"]')
    } else if (data.broadcastingKcType === 'F' && data.broadcastingKcFile) {
      await this.uploadImage('#f_kcCertBroadcastingImg_file', path.join(this.baseImagePath, data.broadcastingKcFile))
    }
  }

  private async uploadImage(inputSelector: string, filePath: string, statusSelector?: string) {
    if (!this.page) return

    try {
      // 파일 존재 여부 확인
      await fs.access(filePath)

      // 파일 업로드 input 요소에 파일 설정
      const inputElement = await this.page.$(inputSelector)
      if (inputElement) {
        await (inputElement as any).uploadFile(filePath)

        // 파일 업로드 후 필요한 이벤트 트리거
        await this.page.evaluate((selector) => {
          const input = document.querySelector(selector)
          if (input) {
            const event = new Event('change', {bubbles: true})
            input.dispatchEvent(event)
          }
        }, inputSelector)

        if (statusSelector) {
          // 상태 셀렉터가 제공된 경우, 업로드 완료 상태 확인
          await this.page.waitForFunction(
            (selector) => {
              const element = document.querySelector(selector)
              return element && element.textContent?.trim() === '이미지 용량 확인 완료'
            },
            {timeout: 20000},
            statusSelector,
          )
          console.log(`Image uploaded successfully: ${filePath}`)
        } else {
          // 상태 셀렉터가 없는 경우 2000ms 대기
          console.log(`No status selector provided, waiting 2000ms for ${filePath}`)
          await new Promise((resolve) => setTimeout(resolve, 2000))
        }
      }
    } catch (error) {
      console.error(`Failed to upload image ${filePath}:`, error)
      throw error
    }
  }

  private async uploadAllImages(data: ProductData) {
    if (!this.page) return

    if (data.image1) {
      const mainImagePath = path.join(this.baseImagePath, data.image1)
      await this.uploadImage('#f_img1_file', mainImagePath, '#f_img1_file_size_ck')
      await delay(1000)
    }

    if (data.image2) {
      const optionImagePath = path.join(this.baseImagePath, data.image2)
      await this.uploadImage('#f_img2_file', optionImagePath, '#f_img2_file_size_ck')
      await delay(1000)
    }

    if (data.addImage1) {
      const addImage1Path = path.join(this.baseImagePath, data.addImage1)
      await this.uploadImage('#f_img3_file', addImage1Path, '#f_img3_file_size_ck')
      await delay(1000)
    }

    if (data.addImage2) {
      const addImage2Path = path.join(this.baseImagePath, data.addImage2)
      await this.uploadImage('#f_img4_file', addImage2Path, '#f_img4_file_size_ck')
      await delay(1000)
    }

    if (data.detailImage) {
      const detailImagePath = path.join(this.baseImagePath, data.detailImage)
      await this.uploadImage('#f_goods_explain_img_file', detailImagePath, '#f_goods_explain_img_file_size_ck')
      await delay(1000)
    }

    // 이미지 업로드 결과 확인
    await this.verifyImageUploads()
  }

  private async verifyImageUploads() {
    if (!this.page) return

    const imageInputs = [
      'f_img1',
      'f_img2',
      'f_img3',
      'f_img4',
      'f_goods_explain_img',
    ]

    for (const inputName of imageInputs) {
      const value = await this.page.$eval(
        `input[name="${inputName}"]`,
        (el: HTMLInputElement) => el.value,
      ).catch(() => '')

      if (value) {
        console.log(`${inputName} uploaded successfully`)
      }
    }
  }

  async modifyHtmlAndSubmit(page: puppeteer.Page, textContent: string) {
    try {
      // 1. 특정 버튼 클릭
      await page.click('#submit-button') // 버튼 ID를 #submit-button로 가정
      console.log('버튼 클릭 완료')

      // 2. textarea에 값 입력
      await page.type('#text-input', textContent) // textarea의 ID를 #text-input로 가정
      console.log('textarea 값 입력 완료')

      // 3. 입력 후 확인 (옵션)
      const textareaValue = await page.$eval('#text-input', (el: any) => el.value)
      console.log('입력된 값 확인:', textareaValue)
    } catch (error) {
      console.error('HTML 수정 및 제출 중 오류 발생:', error)
    }
  }

// 브라우저 종료
  async close() {
    if (this.browser) {
      await this.browser.close()
    }
  }

// 상품등록 완료 메서드 수정
  private async submitRegistration() {
    if (!this.page) return

    // 청렴서약서 체크 상태 확인
    const isChecked = await this.page.$eval('#uprightContract',
      (el: Element) => (el as HTMLInputElement).checked,
    )

    // 혹시 체크가 안되어 있다면 다시 체크
    if (!isChecked) {
      await this.page.evaluate(() => {
        const checkbox = document.querySelector('#uprightContract') as HTMLInputElement
        if (checkbox) {
          checkbox.checked = true
          checkbox.dispatchEvent(new Event('change', {bubbles: true}))
        }
      })
    }

    // 임시저장 버튼 클릭
    await this.page.click('a[href="javascript:register(\'1\');"]')
  }
}
