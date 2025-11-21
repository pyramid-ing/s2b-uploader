import type { Page } from 'patchright'
import path from 'node:path'
import * as fsSync from 'fs'
import dayjs from 'dayjs'
import { VendorConfig, VendorKey, normalizeUrl } from '../sourcing-config'
import type { ExtractedBasicInfo } from './BaseScraper'
import { BaseScraper } from './BaseScraper'
import { envConfig } from '../envConfig'

export class DomesinScraper extends BaseScraper {
  public vendorKey: VendorKey = VendorKey.도매의신

  async collectList(
    page: Page,
    vendor: VendorConfig,
  ): Promise<{ name: string; url: string; price?: number; listThumbnail?: string; vendor?: string }[]> {
    const hrefs: string[] = await page.evaluate((xpath: string) => {
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

    const names: string[] = await page.evaluate((xpath: string) => {
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

    let thumbnails: (string | null)[] = []
    if (vendor.product_thumbnail_list_xpath) {
      thumbnails = await page.evaluate((xpath: string) => {
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

    let priceTexts: string[] = []
    if (vendor.product_price_list_xpath) {
      priceTexts = await page.evaluate((xpath: string) => {
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
    }

    const items = hrefs.map((href, idx) => {
      const url = normalizeUrl(href, vendor)
      const name = names[idx] || ''
      const listThumbnail = thumbnails[idx] || undefined
      const price = this._parsePrice(priceTexts[idx] || null)
      return { name, url, price: price ?? undefined, listThumbnail, vendor: this.vendorKey }
    })

    return items
  }

  async extractBasicInfo(page: Page, vendorKey: VendorKey, vendor: VendorConfig): Promise<ExtractedBasicInfo> {
    const name = await this._textByXPath(page, vendor.product_name_xpath)

    const productCodeText = vendor.product_code_xpath ? await this._textByXPath(page, vendor.product_code_xpath) : null
    const productCode = productCodeText ? productCodeText.replace(/[^0-9]/g, '') : null

    let price: number | null = null
    if (vendor.price_xpath) {
      const priceText = await this._textByXPath(page, vendor.price_xpath)
      price = this._parsePrice(priceText)
    }

    const shippingFee = vendor.shipping_fee_xpath ? await this._textByXPath(page, vendor.shipping_fee_xpath) : null

    let minPurchase: number | undefined
    if (vendor.min_purchase_xpath) {
      const mp = await this._textByXPath(page, vendor.min_purchase_xpath)
      if (mp) {
        const digits = mp.replace(/[^0-9]/g, '')
        if (digits) minPurchase = Number(digits)
      }
    }

    let imageUsage: string | undefined
    if (vendor.image_usage_xpath) {
      const usage = await this._textByXPath(page, vendor.image_usage_xpath)
      if (usage) imageUsage = usage.trim()
    }

    // 먼저 특성 데이터를 수집
    const additionalInfo = await this.collectAdditionalInfo(page, vendor)

    // 인증정보는 additional info에서 단순히 값을 사용 (파싱/폴백 제거)
    let certifications: { type: string; number: string }[] | undefined
    if (additionalInfo) {
      const cert = additionalInfo.find(item => item.label === '인증정보' && item.value && item.value !== '인증대상아님')
      if (cert) {
        certifications = [{ type: cert.value.trim(), number: '' }]
      }
    }

    // 특성에서 제조사와 원산지 추출
    let origin: string | null = null
    let manufacturer: string | null = null

    if (additionalInfo) {
      for (const item of additionalInfo) {
        if (item.label === '제조사' && item.value && item.value !== '인증대상아님') {
          manufacturer = item.value.trim()
        }
        if (item.label === '브랜드' && item.value && item.value.trim()) {
          // 브랜드가 있고 제조사가 없거나 "인증대상아님"인 경우 브랜드를 제조사로 사용
          if (!manufacturer || manufacturer === '인증대상아님') {
            manufacturer = item.value.trim()
          }
        }
        if (item.label === '원산지' && item.value) {
          origin = item.value.trim()
          // "해외|아시아|중국" 형태에서 실제 원산지만 추출
          if (origin.includes('|')) {
            const parts = origin.split('|')
            if (parts.length >= 3) {
              origin = parts[2].trim() // 마지막 부분이 실제 원산지
            }
          }
        }
      }
    }

    // 특성에서 찾지 못한 경우 기존 XPath로 시도
    if (!origin && vendor.origin_xpath) {
      origin = await this._textByXPath(page, vendor.origin_xpath)
    }
    if (!manufacturer && vendor.manufacturer_xpath) {
      manufacturer = await this._textByXPath(page, vendor.manufacturer_xpath)
    }

    // 여전히 제조사가 없으면 fallback 사용
    if ((!manufacturer || !manufacturer.trim()) && vendor.fallback_manufacturer) {
      manufacturer = vendor.fallback_manufacturer
    }

    const categories: string[] = []
    for (const cx of [
      vendor.category_1_xpath,
      vendor.category_2_xpath,
      vendor.category_3_xpath,
      vendor.category_4_xpath,
    ]) {
      if (!cx) continue
      const val = await this._textByXPath(page, cx)
      if (val) categories.push(val)
    }

    let options: { name: string; price?: number; qty?: number }[][] | undefined
    if (vendor.option_xpath && vendor.option_xpath.length > 0) {
      options = await this._collectOptionsByXpaths(page, vendor.option_xpath)
    } else {
      const xpaths: string[] = []
      if (vendor.option1_item_xpaths) xpaths.push(vendor.option1_item_xpaths)
      if (vendor.option2_item_xpaths) xpaths.push(vendor.option2_item_xpaths)
      if (xpaths.length > 0) options = await this._collectOptionsByXpaths(page, xpaths)
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

  async collectThumbnails(page: Page, vendor: VendorConfig, productDir?: string): Promise<string[]> {
    // 메인 이미지와 썸네일 이미지들을 모두 수집
    const mainImageUrls: string[] = []

    // 메인 이미지 수집 - 새로운 구조에 맞게 수정
    if (vendor.main_image_xpath) {
      const mainImages = await page.$$eval(`xpath=${vendor.main_image_xpath}`, nodes =>
        Array.from(nodes)
          .map(n => (n as HTMLImageElement).src || (n as HTMLSourceElement).getAttribute('srcset') || '')
          .filter(Boolean),
      )
      mainImageUrls.push(...mainImages)
    }

    // 썸네일 이미지들도 수집 (도매의신의 경우 썸네일이 추가 이미지일 수 있음)
    const thumbnailImages = await page.$$eval('//td[contains(@style, "cursor:pointer")]//img', nodes =>
      Array.from(nodes)
        .map(n => (n as HTMLImageElement).src || '')
        .filter(Boolean),
    )
    mainImageUrls.push(...thumbnailImages)

    // 추가로 상품 상세 이미지들도 수집
    const detailImages = await page.$$eval('//div[@id="alink1"]//img | //div[contains(@class, "detail")]//img', nodes =>
      Array.from(nodes)
        .map(n => (n as HTMLImageElement).src || '')
        .filter(Boolean),
    )
    mainImageUrls.push(...detailImages)

    // 중복 제거 및 URL 정규화
    const uniqueUrls = [...new Set(mainImageUrls)]
      .map(url => {
        if (url.startsWith('//')) return `https:${url}`
        if (url.startsWith('/')) return `https://www.domesin.com${url}`
        return url
      })
      .filter(Boolean)

    const targetDir = productDir || path.join(envConfig.downloadsPath, dayjs().format('YYYYMMDD'))
    if (!fsSync.existsSync(targetDir)) fsSync.mkdirSync(targetDir, { recursive: true })

    const savedMainImages: string[] = []
    const thumbnailNames = ['기본이미지1.jpg', '기본이미지2.jpg', '추가이미지1.jpg', '추가이미지2.jpg']
    for (let i = 0; i < Math.min(4, uniqueUrls.length); i++) {
      const buf = await this.downloadToBuffer(uniqueUrls[i])
      if (!buf) continue
      const outPath = path.join(targetDir, thumbnailNames[i])
      await this.saveJpg(buf, outPath, 90)
      savedMainImages.push(outPath)
    }

    return savedMainImages
  }

  async collectDetailImage(page: Page, vendor: VendorConfig, productDir?: string): Promise<string | null> {
    if (!vendor.detail_image_xpath) return null

    try {
      const targetDir = productDir || path.join(envConfig.downloadsPath, dayjs().format('YYYYMMDD'))
      if (!fsSync.existsSync(targetDir)) fsSync.mkdirSync(targetDir, { recursive: true })

      const outPath = path.join(targetDir, `상세이미지.jpg`)
      const locator = page.locator(`xpath=${vendor.detail_image_xpath}`)

      // 공통 함수를 사용하여 fixed 요소들을 숨기고 캡처
      await this.screenshotWithHiddenFixedElements(page, locator.first(), { path: outPath })
      return outPath
    } catch {
      return null
    }
  }

  async collectAdditionalInfo(
    page: Page,
    vendor: VendorConfig,
  ): Promise<{ label: string; value: string }[] | undefined> {
    if (!vendor.additional_info_pairs || vendor.additional_info_pairs.length === 0) return undefined

    const collected: { label: string; value: string }[] = []
    for (const pair of vendor.additional_info_pairs) {
      try {
        const labels: string[] = pair.label_xpath
          ? await page.$$eval(`xpath=${pair.label_xpath}`, nodes =>
              Array.from(nodes)
                .map(n => ((n as Element).textContent || '').trim())
                .filter(Boolean),
            )
          : []
        const values: string[] = pair.value_xpath
          ? await page.$$eval(`xpath=${pair.value_xpath}`, nodes =>
              Array.from(nodes)
                .map(n => ((n as Element).textContent || '').trim())
                .filter(Boolean),
            )
          : []
        const len = Math.min(labels.length, values.length)
        for (let i = 0; i < len; i++) {
          // 데이터 정리: 탭, 줄바꿈, ": " 접두사 제거
          let cleanLabel = labels[i]
            .replace(/[\t\n\r]/g, ' ') // 탭, 줄바꿈을 공백으로 변환
            .replace(/\s+/g, ' ') // 연속된 공백을 하나로 변환
            .replace(/^:\s*/, '') // ": " 접두사 제거
            .trim()

          let cleanValue = values[i]
            .replace(/[\t\n\r]/g, ' ') // 탭, 줄바꿈을 공백으로 변환
            .replace(/\s+/g, ' ') // 연속된 공백을 하나로 변환
            .replace(/^:\s*/, '') // ": " 접두사 제거
            .trim()

          // 의미있는 데이터만 수집 (빈 값이나 CSS 코드 제외)
          if (
            cleanLabel &&
            cleanValue &&
            !cleanLabel.includes('{') &&
            !cleanLabel.includes('position:') &&
            !cleanLabel.includes('display:') &&
            !cleanLabel.includes('공급사코드') && // 공급사코드 관련 버튼 제외
            !cleanLabel.includes('공급사등급') &&
            !cleanLabel.includes('상품수') &&
            !cleanLabel.includes('출고속도') &&
            !cleanLabel.includes('주문이행률') &&
            !cleanLabel.includes('문의응답률') &&
            !cleanLabel.includes('배송정책') &&
            !cleanLabel.includes('배송일정') &&
            !cleanLabel.includes('배송불가일') &&
            cleanLabel.length < 100
          ) {
            // 너무 긴 라벨 제외
            collected.push({ label: cleanLabel, value: cleanValue })
          }
        }
      } catch {}
    }
    return collected.length > 0 ? collected : undefined
  }

  private async _textByXPath(page: Page, xpath: string | undefined): Promise<string | null> {
    if (!xpath) return null
    try {
      const text = await page.evaluate((xp: string) => {
        try {
          const res = document.evaluate(xp, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
          const node = res.singleNodeValue as Element | null
          return node ? (node.textContent || '').trim() : null
        } catch {
          return null
        }
      }, xpath)

      if (!text) return null

      // 데이터 정리: 탭, 줄바꿈, ": " 접두사 제거
      return text
        .replace(/[\t\n\r]/g, ' ') // 탭, 줄바꿈을 공백으로 변환
        .replace(/\s+/g, ' ') // 연속된 공백을 하나로 변환
        .replace(/^:\s*/, '') // ": " 접두사 제거
        .trim()
    } catch {
      return null
    }
  }

  private _parsePrice(text: string | null): number | null {
    if (!text) return null
    const cleanText = text.trim()

    // 도매의신 특화: "18,040원" 형태의 가격 처리
    const priceMatch = cleanText.match(/([0-9,]+)\s*원/)
    if (priceMatch) {
      const digits = priceMatch[1].replace(/[^0-9]/g, '')
      if (digits) return Number(digits)
    }

    // 범위 가격 처리: "1,000원 ~ 2,000원"
    const rangeMatch = cleanText.match(/([0-9,]+)\s*원?\s*~\s*([0-9,]+)\s*원?/)
    if (rangeMatch) {
      const minPrice = rangeMatch[1].replace(/[^0-9]/g, '')
      if (minPrice) return Number(minPrice)
    }

    // 첫 번째 가격 패턴
    const firstPriceMatch = cleanText.match(/([0-9,]+)\s*원?/)
    if (firstPriceMatch) {
      const digits = firstPriceMatch[1].replace(/[^0-9]/g, '')
      if (digits) return Number(digits)
    }

    // 숫자만 추출
    const digits = cleanText.replace(/[^0-9]/g, '')
    if (!digits) return null
    return Number(digits)
  }

  private async _collectOptionsByXpaths(
    page: Page,
    xpaths: string[],
  ): Promise<{ name: string; price?: number; qty?: number }[][]> {
    const levels: { name: string; price?: number; qty?: number }[][] = []

    for (let i = 0; i < xpaths.length; i++) {
      const xp = xpaths[i]
      try {
        // 중첩 옵션 처리: 첫 번째 옵션을 선택해야 두 번째 옵션이 활성화됨
        if (i > 0) {
          // 이전 옵션의 첫 번째 값을 선택하여 다음 옵션을 활성화
          const previousXpath = xpaths[i - 1]
          const firstOption = await page.$(`xpath=${previousXpath}[1]`)
          if (firstOption) {
            try {
              await firstOption.click()
              // 옵션 변경 후 AJAX 로딩 대기
              await page.waitForTimeout(2000)
            } catch (error) {
              console.warn('이전 옵션 선택 실패:', error)
            }
          }
        }

        const items: { name: string; price?: number; qty?: number }[] = await page.evaluate((xpath: string) => {
          const result: { name: string; price?: number; qty?: number }[] = []
          const iterator = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null)
          let node = iterator.iterateNext() as any
          while (node) {
            const el = node as Element
            let nameText = ''
            const isOption = el.tagName.toLowerCase() === 'option'
            if (isOption) {
              const opt = el as HTMLOptionElement
              nameText = (opt.textContent || opt.value || '').trim()
              const name = nameText.replace(/\s+/g, ' ').trim()

              // data-option 속성에서 가격 정보 추출
              let price = 0
              let qty = 9999
              const dataOption = opt.getAttribute('data-option')
              if (dataOption) {
                try {
                  const optionData = JSON.parse(dataOption)
                  if (optionData.price) {
                    price = optionData.price
                  }
                  if (optionData.total_amount) {
                    price = optionData.total_amount - (optionData.base_amount || 0)
                  }
                } catch (e) {
                  console.warn('옵션 데이터 파싱 실패:', e)
                }
              }

              if (
                name &&
                !/선택|옵션|선택하세요|옵션선택|1차 옵션을 선택하세요|2차 옵션 선택|색상 선택|두께 선택|사이즈 선택/i.test(
                  name,
                )
              ) {
                result.push({ name, price, qty })
              }
            } else {
              // 버튼/라벨 기반 UI
              nameText = (el.textContent || '').trim()
              const labels = Array.from(el.querySelectorAll('label')).map(l => (l.textContent || '').trim())
              for (const lbl of labels) nameText = nameText.replace(lbl, '')
              nameText = nameText.replace(/\s+/g, ' ').trim()

              // price delta: (+200원)
              let delta: number | undefined
              const priceLabel = labels.find(v => /\([+\-]?\d{1,3}(?:,\d{3})*원\)/.test(v))
              if (priceLabel) {
                const sign = priceLabel.includes('-') ? -1 : 1
                const digits = priceLabel.replace(/[^0-9]/g, '')
                if (digits) delta = sign * Number(digits)
              }

              // qty: (495개)
              let qty: number | undefined
              const qtyLabel = labels.find(v => /\([0-9,]+개\)/.test(v))
              if (qtyLabel) {
                const q = qtyLabel.replace(/[^0-9]/g, '')
                if (q) qty = Number(q)
              }

              const isDisabled = (el as any).disabled === true || el.getAttribute('disabled') !== null
              if (nameText && !isDisabled && !/선택|옵션|선택하세요|옵션선택/i.test(nameText)) {
                result.push({ name: nameText, price: typeof delta === 'number' ? delta : 0, qty: qty ?? 9999 })
              }
            }
            node = iterator.iterateNext() as any
          }
          return result
        }, xp)
        levels.push(items)
      } catch (error) {
        console.warn(`옵션 수집 실패 (레벨 ${i}):`, error)
        levels.push([])
      }
    }
    return levels
  }

  async checkLoginRequired(page: Page): Promise<boolean> {
    try {
      const currentUrl = page.url()

      // 도매의신 로그인 페이지 체크
      if (currentUrl.includes('domesin.com') && currentUrl.includes('member/login_form.html')) {
        return true
      }

      // 기타 로그인 관련 URL 패턴 체크
      if (currentUrl.includes('login') || currentUrl.includes('signin') || currentUrl.includes('auth')) {
        // 로그인 폼이 있는지 확인
        const loginForm = await page.$('form[action*="login"], form[action*="signin"], input[type="password"]')
        if (loginForm) {
          return true
        }
      }

      return false
    } catch (error) {
      console.warn('로그인 체크 중 오류:', error)
      return false
    }
  }
}

export default DomesinScraper
