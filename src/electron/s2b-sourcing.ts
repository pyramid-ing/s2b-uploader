import path from 'node:path'
import * as fsSync from 'fs'
import fs from 'node:fs/promises'
import axios from 'axios'
import dayjs from 'dayjs'
import { pick } from 'lodash'
import { type AiRefinedPayload, fetchAiRefined } from './lib/ai-client'
import { VENDOR_CONFIG, VendorConfig, VendorKey } from './sourcing-config'
import DomeggookScraper from './scrapers/DomeggookScraper'
import DomesinScraper from './scrapers/DomesinScraper'
import CoupangScraper from './scrapers/CoupangScraper'
import type { Scraper } from './scrapers/BaseScraper'
import { S2BBase } from './s2b-base'
import { validateKcByCertNum, KcValidationError } from './kc-validator'
import { envConfig } from './envConfig'
import { ConfigSet, ExcelRegistrationData } from './types/excel'

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
  downloadDir?: string
}

export class S2BSourcing extends S2BBase {
  private baseFilePath: string
  private settings: any
  private configSet?: ConfigSet

  constructor(
    baseImagePath: string,
    logCallback: (message: string, level?: 'info' | 'warning' | 'error') => void,
    headless: boolean = false,
    settings?: any,
    configSet?: ConfigSet,
  ) {
    super(logCallback, headless)
    this.baseFilePath = baseImagePath
    this.settings = settings
    this.configSet = configSet
  }

  public setConfigSet(configSet?: ConfigSet): void {
    this.configSet = configSet
  }

  public async launch(): Promise<void> {
    await super.launch()
  }

  public async openUrl(url: string): Promise<void> {
    if (!this.page) throw new Error('Browser page not initialized')
    await this.page.goto(url, { waitUntil: 'domcontentloaded' })
  }

  public async collectListFromUrl(
    targetUrl: string,
  ): Promise<{ name: string; url: string; price?: number; listThumbnail?: string; vendor?: string }[]> {
    if (!this.page) throw new Error('Browser page not initialized')
    const vendorKey = this._detectVendorByUrl(targetUrl)
    if (!vendorKey) throw new Error('지원하지 않는 사이트 입니다.')
    const vendor: VendorConfig = VENDOR_CONFIG[vendorKey]
    const scraper = this._getScraper(vendorKey)
    if (!scraper) throw new Error('지원하지 않는 사이트 입니다.')
    await this.page.goto(targetUrl, { waitUntil: 'domcontentloaded' })
    return await scraper.collectList(this.page, vendor)
  }

  public async collectNormalizedDetailForUrls(urls: string[], optionHandling?: 'split' | 'single') {
    if (!this.page) throw new Error('Browser page not initialized')
    const outputs: (SourcingCrawlData & { excelMapped?: ExcelRegistrationData[] })[] = []
    for (const url of urls) {
      this._log(`상품 데이터 수집 시작: ${url}`, 'info')
      const { vendorKey, vendor } = this._getVendor(url)
      await this._navigateToUrl(url)
      const scraper = this._getScraper(vendorKey)
      if (scraper && (await scraper.checkLoginRequired(this.page))) {
        throw new Error(
          '로그인이 필요합니다: 로그인 페이지로 이동되었습니다. 소싱 브라우저에서 로그인 후 다시 시도하세요.',
        )
      }
      if (!scraper || !vendorKey || !vendor) {
        throw new Error('지원하지 않는 사이트 입니다.')
      }

      await scraper.waitBeforeCapture(this.page)
      const basicInfo = await scraper.extractBasicInfo(this.page, vendorKey, vendor)
      if (!basicInfo.name || !basicInfo.name.trim()) {
        throw new Error('크롤링 실패: 상품명(name) 추출에 실패했습니다.')
      }
      const baseName = (basicInfo.name || basicInfo.productCode || 'product').toString()
      const productDir = this._createProductDir(baseName, basicInfo.productCode, vendorKey)
      const savedMainImages = await scraper.collectThumbnails(this.page, vendor, productDir)
      const detailCapturePath = await scraper.collectDetailImage(this.page, vendor, productDir)
      const 특성 = await scraper.collectAdditionalInfo(this.page, vendor)
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
        downloadDir: productDir,
        특성,
      }
      this._log(`AI 데이터 정제 시작: ${basicInfo.name}`, 'info')
      const aiRefined = await this._refineCrawlWithAI(crawlData)
      const kcResolved = await this._determineKcFromAI(aiRefined)
      const categoryMapped =
        basicInfo.categories && basicInfo.categories.length >= 3
          ? await this._mapCategories(vendorKey || '', basicInfo.categories)
          : {}
      const excelMapped = this._mapToExcelFormat(
        crawlData,
        aiRefined,
        categoryMapped,
        this.configSet?.config
          ? {
              ...this.configSet.config,
              optionHandling: optionHandling || this.configSet.config.optionHandling || 'split',
            }
          : undefined,
        kcResolved,
      )
      this._log(`데이터 정제 완료: ${basicInfo.name}`, 'info')
      outputs.push({ ...crawlData, excelMapped })
    }
    return outputs
  }

  public getCurrentUrl(): string {
    try {
      return this.page?.url() ?? ''
    } catch {
      return ''
    }
  }

  private _detectVendorByUrl(targetUrl: string): VendorKey | null {
    try {
      const host = new URL(targetUrl).hostname
      if (host.includes('domeggook')) return VendorKey.도매꾹
      if (host.includes('domesin')) return VendorKey.도매의신
      if (host.includes('coupang')) return VendorKey.쿠팡
      return null
    } catch {
      return null
    }
  }

  private _getVendor(url: string): { vendorKey: VendorKey | null; vendor?: VendorConfig } {
    const vendorKey = this._detectVendorByUrl(url)
    const vendor = vendorKey ? VENDOR_CONFIG[vendorKey] : undefined
    return { vendorKey, vendor }
  }

  private _getScraper(vendorKey: VendorKey | null): Scraper | null {
    if (!vendorKey) return null
    switch (vendorKey) {
      case VendorKey.도매꾹:
        return new DomeggookScraper()
      case VendorKey.도매의신:
        return new DomesinScraper()
      case VendorKey.쿠팡:
        return new CoupangScraper()
      default:
        return null
    }
  }

  private async _navigateToUrl(url: string): Promise<void> {
    if (!this.page) throw new Error('Browser page not initialized')
    await this.page.goto(url, { waitUntil: 'domcontentloaded' })
  }

  private _sanitizeFileName(name: string): string {
    const replaced = name.replace(/[\\/:*?"<>|\n\r\t]/g, ' ').trim()
    return replaced.slice(0, 80) || 'product'
  }

  private _ensureDir(dirPath: string): void {
    if (!fsSync.existsSync(dirPath)) fsSync.mkdirSync(dirPath, { recursive: true })
  }

  private _createProductDir(baseName: string, productCode?: string, vendorKey?: VendorKey): string {
    const dateDir = dayjs().format('YYYYMMDD')

    // 상품코드가 있으면 상품코드 기반으로 폴더명 생성, 없으면 기존 방식 사용
    let folderName: string
    if (productCode && productCode.trim()) {
      // 채널별 접두사 추가 (설정에서 가져오기)
      const prefix = this._getVendorPrefix(vendorKey)
      folderName = `${prefix}${productCode.trim()}`
    } else {
      // 상품코드가 없으면 기존 방식 (상품명 기반)
      const safeName = this._sanitizeFileName(baseName)
      folderName = `${safeName}_${Date.now()}`
    }

    const dir = path.join(this.baseFilePath, 'downloads', dateDir, folderName)
    this._ensureDir(dir)
    return dir
  }

  private _getVendorPrefix(vendorKey?: VendorKey): string {
    if (!vendorKey) return 'UNK_'

    const vendor = VENDOR_CONFIG[vendorKey]
    return vendor?.prefix || 'UNK_'
  }

  private async _refineCrawlWithAI(data: SourcingCrawlData): Promise<AiRefinedPayload> {
    const payload = pick(data, [
      'name',
      'shippingFee',
      'imageUsage',
      'origin',
      'manufacturer',
      'options',
      'certifications',
      '특성',
    ])

    const s2bId = this.settings?.loginId
    const ocrText = await this._runDetailImageOcr(data.detailImages?.[0])

    return await fetchAiRefined({
      ...payload,
      s2b_id: s2bId,
      ocr_text: ocrText,
    })
  }

  private async _runDetailImageOcr(detailImagePath?: string): Promise<string | undefined> {
    try {
      const fileBuffer = await fs.readFile(detailImagePath)
      const g: any = globalThis as any
      if (!g.FormData || !g.Blob) {
        this._log('현재 런타임에서 FormData/Blob 을 지원하지 않아 OCR을 건너뜁니다.', 'warning')
        return undefined
      }

      const formData = new g.FormData()
      const blob = new g.Blob([fileBuffer])
      formData.append('image', blob, path.basename(detailImagePath))

      const response = await axios.post<{ text?: string }>('https://n8n.pyramid-ing.com/webhook/s2b-ocr', formData)

      if (!response || response.status < 200 || response.status >= 300) {
        this._log(`OCR 요청 실패: ${response?.status} ${response?.statusText}`, 'warning')
        return undefined
      }

      const result = response.data as { ocrText?: string }
      const text = result?.ocrText?.trim()
      if (!text) {
        this._log('OCR 결과가 비어 있습니다.', 'warning')
        return undefined
      }

      this._log('OCR 처리 완료', 'info')
      return text
    } catch (error: any) {
      this._log(`OCR 처리 중 오류: ${error?.message || String(error)}`, 'warning')
      return undefined
    }
  }

  private async _determineKcFromAI(aiRefined: AiRefinedPayload): Promise<{
    kids?: { type: 'Y' | 'F' | 'N'; certNum?: string }
    elec?: { type: 'Y' | 'F' | 'N'; certNum?: string }
    daily?: { type: 'Y' | 'F' | 'N'; certNum?: string }
    broadcasting?: { type: 'Y' | 'F' | 'N'; certNum?: string }
    issue: boolean
    issuesText: string
  }> {
    const kcAuthKey = 'c953b79d-7da6-4cde-8086-bc866fcb5d27'

    const defaultBucket: { type: 'Y' | 'F' | 'N'; certNum?: string } = { type: 'N' }
    const result: {
      kids: { type: 'Y' | 'F' | 'N'; certNum?: string }
      elec: { type: 'Y' | 'F' | 'N'; certNum?: string }
      daily: { type: 'Y' | 'F' | 'N'; certNum?: string }
      broadcasting: { type: 'Y' | 'F' | 'N'; certNum?: string }
      issue: boolean
      issuesText: string
    } = {
      kids: { ...defaultBucket },
      elec: { ...defaultBucket },
      daily: { ...defaultBucket },
      broadcasting: { ...defaultBucket },
      issue: false,
      issuesText: '',
    }

    const detectBucket = (num: string, detail: any): 'kids' | 'elec' | 'daily' | 'broadcasting' => {
      const n = (num || '').toUpperCase().trim()
      if (n.startsWith('R-') || n.includes('MSIP') || n.includes('KCC')) return 'broadcasting'
      const div: string = String(detail?.certDiv || '').trim()
      if (div.includes('어린이')) return 'kids'
      if (div.includes('전기')) return 'elec'
      // 기타는 생활용품으로 분류
      return 'daily'
    }

    const numbers: string[] = Array.isArray(aiRefined?.certificationNumbers)
      ? (aiRefined.certificationNumbers as any[]).map(v => (v ?? '').toString().trim()).filter(Boolean)
      : []

    let failed = 0
    const errorByBucket: Partial<Record<'kids' | 'elec' | 'daily' | 'broadcasting', { num: string; msg: string }>> = {}
    for (const num of numbers) {
      try {
        const detail = await validateKcByCertNum(kcAuthKey, num)
        const bucket = detectBucket(num, detail)
        if (!result[bucket].certNum) {
          result[bucket] = { type: 'Y', certNum: num }
        }
        this._log(`KC 검증 성공(${bucket}): ${num}`, 'info')
      } catch (err: any) {
        failed++
        const bucketOnFail = detectBucket(num, undefined)
        const msg = err instanceof KcValidationError ? err.statusText || err.message : err?.message
        if (msg && !errorByBucket[bucketOnFail]) errorByBucket[bucketOnFail] = { num, msg }
        this._log(`KC 검증 실패(AI 추출): ${num}${msg ? ` - ${msg}` : ''}`, 'warning')
      }
    }

    result.issue = failed > 0
    if (result.issue) {
      const parts: string[] = []
      if (errorByBucket.kids) parts.push(`[${errorByBucket.kids.num}] 어린이제품: ${errorByBucket.kids.msg}`)
      if (errorByBucket.daily) parts.push(`[${errorByBucket.daily.num}] 생활용품: ${errorByBucket.daily.msg}`)
      if (errorByBucket.broadcasting)
        parts.push(`[${errorByBucket.broadcasting.num}] 방송통신: ${errorByBucket.broadcasting.msg}`)
      if (errorByBucket.elec) parts.push(`[${errorByBucket.elec.num}] 전기용품: ${errorByBucket.elec.msg}`)
      result.issuesText = parts.join(' / ')
    }

    return result
  }

  private async _mapCategories(
    vendor: string,
    categories: string[],
  ): Promise<{ targetCategory1?: string; targetCategory2?: string; targetCategory3?: string; g2bCode?: string }> {
    try {
      const excelPath = path.join(envConfig.filesPath, 'S2B_Sourcing_category_mapper.xlsx')
      if (!fsSync.existsSync(excelPath)) {
        this._log('카테고리 매핑 엑셀 파일을 찾을 수 없습니다.', 'warning')
        return {}
      }
      const XLSX = await import('xlsx')
      const workbook = XLSX.readFile(excelPath)
      const sheetName = vendor
      if (!workbook.Sheets[sheetName]) {
        this._log(`${vendor} 시트를 찾을 수 없습니다.`, 'warning')
        return {}
      }
      const worksheet = workbook.Sheets[sheetName]
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[]
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
    } catch (error: any) {
      this._log(`카테고리 매핑 실패: ${error.message}`, 'error')
      return {}
    }
  }

  private _mapToExcelFormat(
    rawData: SourcingCrawlData,
    aiRefined: AiRefinedPayload,
    categoryMapped: any,
    config?: ConfigSet['config'],
    kcResolved?: {
      kids?: { type: 'Y' | 'F' | 'N'; certNum?: string }
      elec?: { type: 'Y' | 'F' | 'N'; certNum?: string }
      daily?: { type: 'Y' | 'F' | 'N'; certNum?: string }
      broadcasting?: { type: 'Y' | 'F' | 'N'; certNum?: string }
      issue: boolean
      issuesText?: string
    },
  ): ExcelRegistrationData[] {
    const optionHandling: 'split' | 'single' = config?.optionHandling || 'split'
    const originalPrice = rawData.price || 0

    const deliveryOption: Record<string, string> = {
      ZD000001: '3일',
      ZD000002: '5일',
      ZD000003: '7일',
      ZD000004: '15일',
      ZD000005: '30일',
      ZD000006: '45일',
    }

    const quoteOption: Record<string, string> = {
      ZD000001: '7일',
      ZD000002: '10일',
      ZD000003: '15일',
      ZD000004: '30일',
    }

    const shippingTypeMap: Record<'free' | 'fixed' | 'conditional', '무료' | '유료' | '조건부무료'> = {
      free: '무료',
      fixed: '유료',
      conditional: '조건부무료',
    }
    const effectiveConfig: ConfigSet['config'] = config || {
      deliveryPeriod: 'ZD000001', // 3일
      quoteValidityPeriod: 'ZD000001', // 7일
      shippingFeeType: 'fixed',
      shippingFee: 3000,
      returnShippingFee: 3500,
      bundleShipping: true,
      jejuShipping: true,
      jejuAdditionalFee: 5000,
      detailHtmlTemplate: '<p>상세설명을 입력하세요.</p>',
      marginRate: 20,
      optionHandling: 'split',
    }
    const marginRate = effectiveConfig.marginRate ?? 20

    // 기본 상품 정보
    const baseProduct: ExcelRegistrationData = {
      KC문제: kcResolved?.issuesText || '',
      이미지사용여부: aiRefined.이미지사용여부 || '', // 참고용
      원가: originalPrice, // 참고용
      최소구매수량: rawData.minPurchase || 1, // 참고용
      구매처: String(rawData.vendor || ''), // 참고용
      구매처URL: rawData.url || '', // 참고용
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
      제조사: rawData.manufacturer || '상세설명참고',
      '소재/재질': aiRefined['소재/재질'] || '상세설명참고',
      판매단위: '개',
      보증기간: '1년',
      납품가능기간: (deliveryOption[effectiveConfig.deliveryPeriod] || '3일') as any,
      '견적서 유효기간': quoteOption[effectiveConfig.quoteValidityPeriod] || '',
      배송비종류: shippingTypeMap[effectiveConfig.shippingFeeType] || '유료',
      배송비: effectiveConfig.shippingFee,
      반품배송비: effectiveConfig.returnShippingFee,
      묶음배송여부: effectiveConfig.bundleShipping ? 'Y' : 'N',
      제주배송여부: effectiveConfig.jejuShipping ? 'Y' : 'N',
      제주추가배송비: effectiveConfig.jejuAdditionalFee,
      상세설명HTML: effectiveConfig.detailHtmlTemplate,
      기본이미지1: rawData.mainImages?.[0] || '',
      기본이미지2: rawData.mainImages?.[1] || '',
      추가이미지1: rawData.mainImages?.[2] || '',
      추가이미지2: rawData.mainImages?.[3] || '',
      상세이미지: rawData.detailImages?.[0] || '',
      원산지구분: aiRefined.원산지구분 || '국내',
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
      소비기한선택: '제품에 별도 표시',
      소비기한입력: '',
      어린이하차확인장치타입: 'N',
      어린이하차확인장치인증번호: '',
      어린이하차확인장치첨부파일: '',
      안전확인대상타입: 'N',
      안전확인대상신고번호: '',
      안전확인대상첨부파일: '',
      조달청계약여부: 'N',
      계약시작일: '',
      계약종료일: '',
      전화번호: '',
      '제조사 A/S전화번호': '',
      과세여부: '과세(세금계산서)',
      어린이제품KC유형: kcResolved?.kids?.type || 'N',
      어린이제품KC인증번호: kcResolved?.kids?.certNum || '',
      어린이제품KC성적서: '',
      전기용품KC유형: kcResolved?.elec?.type || 'N',
      전기용품KC인증번호: kcResolved?.elec?.certNum || '',
      전기용품KC성적서: '',
      생활용품KC유형: kcResolved?.daily?.type || 'N',
      생활용품KC인증번호: kcResolved?.daily?.certNum || '',
      생활용품KC성적서: '',
      방송통신KC유형: kcResolved?.broadcasting?.type || 'N',
      방송통신KC인증번호: kcResolved?.broadcasting?.certNum || '',
      방송통신KC성적서: '',
    }
    // 옵션 처리 방법에 따른 분기
    if (aiRefined.options && aiRefined.options.length > 0) {
      switch (optionHandling) {
        case 'single': {
          // 여러 옵션 중 "가장 비싼 옵션"을 기준으로 가격 산정
          const maxOptionExtraPrice = Math.max(...aiRefined.options.map((o: any) => Number(o?.price) || 0), 0)
          const singleBasePrice = originalPrice + maxOptionExtraPrice

          const optionNames = aiRefined.options.map((o: any) => o?.name).filter(Boolean)
          const optionText = optionNames.length > 0 ? optionNames.join(', ') : ''

          const mergedSpec = (() => {
            if (baseProduct.규격 && optionText) return `${baseProduct.규격}, 옵션: ${optionText}`
            if (baseProduct.규격) return baseProduct.규격
            if (optionText) return `옵션: ${optionText}`
            return ''
          })()

          return [
            {
              ...baseProduct,
              규격: mergedSpec,
              제시금액: Math.ceil((singleBasePrice * (1 + marginRate / 100)) / 100) * 100,
              재고수량: 9999,
            } as ExcelRegistrationData,
          ]
        }
        case 'split':
        default: {
          // 방어 로직: 알 수 없는 값이면 기본 split 방식 사용
          return aiRefined.options.map(
            (option: any) =>
              ({
                ...baseProduct,
                물품명: baseProduct.물품명,
                규격: `${option.name}, ${baseProduct.규격}`,
                제시금액: Math.ceil(((originalPrice + (option.price || 0)) * (1 + marginRate / 100)) / 100) * 100,
                재고수량: Math.min(option.qty || 9999, 9999),
              }) as ExcelRegistrationData,
          )
        }
      }
    }

    // 옵션이 없는 경우 기본 상품 1개 반환
    return [
      {
        ...baseProduct,
        제시금액: Math.ceil((originalPrice * (1 + marginRate / 100)) / 100) * 100,
        재고수량: 9999,
      } as ExcelRegistrationData,
    ]
  }
}
