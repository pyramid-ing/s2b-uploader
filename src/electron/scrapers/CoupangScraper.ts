import type { Page } from 'patchright'
import path from 'node:path'
import * as fsSync from 'fs'
import dayjs from 'dayjs'
import { VendorConfig, VendorKey } from '../sourcing-config'
import type { ExtractedBasicInfo } from './BaseScraper'
import { BaseScraper } from './BaseScraper'
import { envConfig } from '../envConfig'
import sharp from 'sharp'

/**
 * 쿠팡용 Scraper
 * - 목록: 현재 페이지(검색/리스트 페이지)에서 DOM 기반으로 수집
 * - 상세: 상품 상세 페이지에서 기본 정보만 최소한으로 수집
 *   (기존 도매꾹/도매의신과 동일한 인터페이스를 맞추기 위한 용도)
 */
export class CoupangScraper extends BaseScraper {
  public vendorKey: VendorKey = VendorKey.쿠팡

  /**
   * 검색/카테고리 결과 목록 수집
   */
  async collectList(
    page: Page,
    _vendor: VendorConfig,
  ): Promise<{ name: string; url: string; price?: number; listThumbnail?: string; vendor?: string }[]> {
    // 쿠팡 검색/카테고리 페이지 DOM 구조 기반
    await page.waitForSelector('#product-list', { timeout: 5000 })

    const items = await page.$$eval('li[class^="ProductUnit_productUnit"]', nodes => {
      const results: {
        name: string
        url: string
        price?: number
        listThumbnail?: string
        vendor?: string
      }[] = []

      for (const li of nodes as HTMLElement[]) {
        // 광고 표시 제외: 내부에 class^=AdMark_ 요소가 있으면 skip
        const hasAd = !!li.querySelector('[class^="AdMark_"]')
        if (hasAd) continue

        const anchor = li.querySelector('a') as HTMLAnchorElement | null
        const nameEl = li.querySelector('[class^="ProductUnit_productName"]') as HTMLElement | null
        const priceEls = li.querySelectorAll('[class^="PriceArea_priceArea"] .fw-font-bold') as NodeListOf<HTMLElement>
        const imageEl = li.querySelector('[class^="ProductUnit_productImage"] img') as HTMLImageElement | null

        const title = (nameEl?.textContent || '').trim()

        // 가격 요소들을 순회하며 정규표현식에 매칭되는 첫 번째 가격 추출
        let price = 0
        for (const priceEl of Array.from(priceEls)) {
          const priceText = priceEl.textContent || ''
          const priceMatch = priceText.match(/\d{1,3}(,\d{3})*원/)
          if (priceMatch) {
            price = parseInt(priceMatch[0].replace(/[^\d]/g, ''), 10)
            break
          }
        }

        let href = anchor?.getAttribute('href') || ''
        if (href && href.startsWith('//')) href = `https:${href}`
        else if (href && href.startsWith('/')) href = `https://www.coupang.com${href}`

        let imageUrl = ''
        if (imageEl) {
          imageUrl = imageEl.getAttribute('src') || imageEl.getAttribute('data-src') || ''
          if (imageUrl) {
            // 320x320ex를 1000x1000ex로 변경하여 고해상도 이미지 가져오기
            imageUrl = imageUrl.replace(/320x320ex/g, '1000x1000ex')
          }
        }

        if (!title || !href) continue

        results.push({
          name: title,
          url: href,
          price: price || undefined,
          listThumbnail: imageUrl || undefined,
          vendor: '쿠팡',
        })
      }

      return results
    })

    return items
  }

  /**
   * 기본 정보 수집
   */
  async extractBasicInfo(page: Page, _vendorKey: VendorKey, _vendor: VendorConfig): Promise<ExtractedBasicInfo> {
    // 모델명/품번 (상품코드로 활용)
    let productCode: string | null = null
    try {
      const modelHandle = await page.$(
        'xpath=//div[contains(@class,"option-picker-container")]//span[contains(normalize-space(.),"모델명/품번")]/following-sibling::span[1]',
      )
      const modelText = (await modelHandle?.textContent())?.trim()
      if (modelText) productCode = modelText
    } catch {
      productCode = null
    }

    // 제목
    let name: string | null = null
    try {
      await page.waitForSelector('h1.product-title', { timeout: 5000 })
      const titleElement = await page.$('h1.product-title')
      const title = (await titleElement?.textContent())?.trim()
      if (title) name = title
    } catch {
      name = '상품 제목'
    }

    // 가격
    let price: number | null = null
    try {
      const priceElement = await page.$('.final-price-amount')
      const priceText = (await priceElement?.textContent()) || ''
      const digits = priceText.replace(/[^\d]/g, '')
      if (digits) price = parseInt(digits, 10)
    } catch {
      price = null
    }

    // 배송비 (예: 무료배송 / 일반배송 3,000원 등)
    let shippingFee: string | null = null
    try {
      const shippingHandle = await page.$('.delivery-container .regular-shipping-fee-container .shipping-fee-desc')
      const shippingText = (await shippingHandle?.textContent()) || ''
      const cleaned = shippingText.replace(/\s+/g, ' ').trim()
      if (cleaned) shippingFee = cleaned
    } catch {
      shippingFee = null
    }

    // 카테고리 (상단 네비게이션 기반, 없으면 빈 배열)
    const categories: string[] = await page
      .$$eval('.breadcrumb a, .breadcrumb span', nodes =>
        Array.from(nodes)
          .map(n => (n.textContent || '').trim())
          .filter(Boolean),
      )
      .catch(() => [])

    // 옵션 목록 (단일/다중 옵션 드롭다운 기준)
    let options: { name: string; price?: number; qty?: number }[][] | undefined
    try {
      const rawOptions = await page.$$eval(
        '.option-picker-container .option-picker-select ul.custom-scrollbar',
        uls => {
          const levels: { name: string; price?: number; qty?: number }[][] = []
          for (const ul of Array.from(uls)) {
            const items: { name: string; price?: number; qty?: number }[] = []
            const optionEls = ul.querySelectorAll('li .select-item')
            for (const el of Array.from(optionEls)) {
              const nameEl = (el as HTMLElement).querySelector('.twc-font-bold') as HTMLElement | null
              let name = (nameEl?.textContent || '').trim()
              name = name.replace(/\s+/g, ' ').trim()
              if (!name || /선택|옵션|선택하세요|옵션선택/i.test(name)) continue

              // 옵션 가격 (예: 20,900원) 추출
              const priceEl = (el as HTMLElement).querySelector('.price-text') as HTMLElement | null
              let price: number | undefined
              if (priceEl) {
                const priceText = (priceEl.textContent || '').trim()
                const match = priceText.match(/([0-9][0-9,]*)/)
                if (match) {
                  const digits = match[1].replace(/[^\d]/g, '')
                  if (digits) {
                    price = Number(digits)
                  }
                }
              }

              items.push({ name, price, qty: 9999 })
            }
            if (items.length > 0) {
              levels.push(items)
            }
          }
          return levels
        },
      )
      if (rawOptions && rawOptions.length > 0) {
        options = rawOptions
      }
    } catch {
      options = undefined
    }

    // 옵션 price에서 기본 가격을 제거하여 "추가 금액"만 남기기
    if (options && typeof price === 'number' && price > 0) {
      options = options.map(level =>
        level.map(opt => {
          const originalOptionPrice = opt.price ?? 0
          let extraPrice = originalOptionPrice

          // 쿠팡 옵션 가격이 기본가를 포함한 "총 가격"인 경우를 대비해 기본 가격을 차감
          if (originalOptionPrice >= price) {
            extraPrice = originalOptionPrice - price
          }

          if (extraPrice < 0) extraPrice = 0

          return {
            ...opt,
            price: extraPrice || undefined,
          }
        }),
      )
    }

    return {
      name,
      productCode,
      price,
      shippingFee,
      minPurchase: undefined,
      imageUsage: undefined,
      certifications: undefined,
      origin: null,
      manufacturer: null,
      categories,
      options,
    }
  }

  /**
   * 썸네일(기본/추가 이미지) 저장
   */
  async collectThumbnails(page: Page, _vendor: VendorConfig, productDir?: string): Promise<string[]> {
    let imageUrls: string[] = await page
      .$$eval('.product-image li img', nodes =>
        Array.from(nodes)
          .map(n => (n as HTMLImageElement).src || (n as HTMLImageElement).getAttribute('data-src') || '')
          .filter(Boolean),
      )
      .catch(() => [])

    // 이미지가 여전히 없다면 바로 반환
    if (imageUrls.length === 0) {
      return []
    }

    const normalized = Array.from(
      new Set(
        imageUrls.map(url => {
          let processed = url
          if (processed.startsWith('//')) processed = `https:${processed}`
          else if (!processed.startsWith('http')) processed = `https://${processed}`
          return processed.replace(/48x48ex|320x320ex/g, '1000x1000ex')
        }),
      ),
    )

    const targetDir = productDir || path.join(envConfig.downloadsPath, dayjs().format('YYYYMMDD'))
    if (!fsSync.existsSync(targetDir)) fsSync.mkdirSync(targetDir, { recursive: true })

    const savedMainImages: string[] = []
    const thumbnailNames = ['기본이미지1.jpg', '기본이미지2.jpg', '추가이미지1.jpg', '추가이미지2.jpg']
    for (let i = 0; i < Math.min(4, normalized.length); i++) {
      const buf = await this.downloadToBuffer(normalized[i])
      if (!buf) continue
      const outPath = path.join(targetDir, thumbnailNames[i])
      await this.saveJpg(buf, outPath, 90)
      savedMainImages.push(outPath)
    }

    return savedMainImages
  }

  /**
   * 상세 이미지(페이지 캡처) 저장
   */
  async collectDetailImage(page: Page, _vendor: VendorConfig, productDir?: string): Promise<string | null> {
    // 1) 상세 영역(.product-detail-content)까지 먼저 스크롤
    try {
      await page.evaluate(() => {
        const detailContent = document.querySelector('.product-detail-content')
        if (detailContent) {
          detailContent.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      })
      await page.waitForTimeout(800)
    } catch {}

    // 2) 상세이미지 추출 준비:
    //    .product-detail-content 내부에서 자신의 텍스트(text())에 "상품정보 더보기"를 직접 포함한
    //    가장 가까운(직접 텍스트를 가진) 엘리먼트만 선택해서 클릭
    const seeMoreBtn = await page.$('xpath=//main//*[contains(normalize-space(text()),"상품정보 더보기")]')
    if (seeMoreBtn) {
      await seeMoreBtn.click()
      await page.waitForTimeout(1500) // 상세 내용 로딩 대기
    }

    const targetDir = productDir || path.join(envConfig.downloadsPath, dayjs().format('YYYYMMDD'))
    if (!fsSync.existsSync(targetDir)) fsSync.mkdirSync(targetDir, { recursive: true })

    const outPath = path.join(targetDir, `상세이미지.jpg`)

    // 상품 상세 내용이 담긴 주요 영역(.product-detail-content-inside)을 그대로 캡처 (텍스트+이미지 포함)
    const contentLocator = page.locator('.product-detail-content-inside')
    const count = await contentLocator.count()
    if (!count) {
      return null
    }

    // 공통 헬퍼를 사용해 .product-detail-content-inside 영역만 여러 구간으로 나눠 캡처 후 하나로 합친다
    await this.screenshotLongElement(page, contentLocator.first(), outPath, 4000)

    // 쿠팡일 경우: 생성된 이미지를 중앙 기준 780px 폭으로 한 번 더 크롭하여 좌우 여백 제거
    const meta = await sharp(outPath).metadata()
    const width = meta.width || 0
    const height = meta.height || 0
    const targetWidth = 780

    if (width > targetWidth && height > 0) {
      // 쿠팡 상세 구조상 좌측에 약간의 여백(약 8px)이 더 생기는 것을 보정
      const marginAdjust = 8
      let left = Math.floor((width - targetWidth) / 2 + marginAdjust)
      left = Math.max(0, Math.min(left, width - targetWidth))

      await sharp(outPath)
        .extract({ left, top: 0, width: targetWidth, height })
        .toFile(outPath + '.tmp')
      // 원본을 교체
      fsSync.renameSync(outPath + '.tmp', outPath)
    }

    return outPath
  }

  /**
   * 추가 정보 (쿠팡 상품설명 bullet 영역)
   */
  async collectAdditionalInfo(
    page: Page,
    _vendor: VendorConfig,
  ): Promise<{ label: string; value: string }[] | undefined> {
    try {
      const items = await page.$$eval('.product-description ul li', nodes =>
        Array.from(nodes)
          .map(li => {
            const text = (li.textContent || '').trim()
            if (!text) return null

            const [labelPart, ...rest] = text.split(':')
            const label = (labelPart || '').trim()
            const value = rest.join(':').trim()

            if (label && value) {
              return { label, value }
            }

            // 콜론이 없는 경우 전체를 value 로 보고 label 은 비워둔다.
            return { label: '', value: text }
          })
          .filter((v): v is { label: string; value: string } => !!v),
      )

      return items.length > 0 ? items : undefined
    } catch {
      return undefined
    }
  }

  /**
   * 로그인 필요 여부
   * - 쿠팡 소싱은 로그인 없이도 가능하므로 기본적으로 false 반환
   */
  async checkLoginRequired(_page: Page): Promise<boolean> {
    return false
  }
}

export default CoupangScraper
