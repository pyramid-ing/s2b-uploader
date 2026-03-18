import type { Page } from 'patchright'
import path from 'node:path'
import * as fsSync from 'fs'
import dayjs from 'dayjs'
import { VendorConfig, VendorKey, normalizeUrl } from '../sourcing-config'
import type { ExtractedBasicInfo } from './BaseScraper'
import { BaseScraper } from './BaseScraper'
import { envConfig } from '../envConfig'

export class OwnerClanScraper extends BaseScraper {
  public vendorKey: VendorKey = VendorKey.오너클랜

  async collectList(
    page: Page,
    vendor: VendorConfig,
  ): Promise<{ name: string; url: string; price?: number; listThumbnail?: string; vendor?: string }[]> {
    const items = await page.evaluate(
      (params: { listXpath: string; nameXpath: string; priceXpath: string; thumbXpath: string; vendorKey: string }) => {
        const results: any[] = []
        const iterator = document.evaluate(
          params.listXpath,
          document,
          null,
          XPathResult.ORDERED_NODE_ITERATOR_TYPE,
          null,
        )
        let node = iterator.iterateNext() as Element
        while (node) {
          const nameEl = document.evaluate(params.nameXpath, node, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
            .singleNodeValue as HTMLAnchorElement | null
          const priceEl = document.evaluate(params.priceXpath, node, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
            .singleNodeValue as Element | null
          const thumbEl = document.evaluate(params.thumbXpath, node, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
            .singleNodeValue as HTMLImageElement | null

          if (nameEl && nameEl.href) {
            results.push({
              name: nameEl.textContent?.trim() || '',
              url: nameEl.href,
              priceText: priceEl?.textContent?.trim() || null,
              listThumbnail: thumbEl?.src || undefined,
              vendor: params.vendorKey,
            })
          }
          node = iterator.iterateNext() as Element
        }
        return results
      },
      {
        listXpath: vendor.product_list_xpath,
        nameXpath: vendor.product_name_list_xpath,
        priceXpath: vendor.product_price_list_xpath || '',
        thumbXpath: vendor.product_thumbnail_list_xpath || '',
        vendorKey: this.vendorKey,
      },
    )

    return items.map(item => ({
      ...item,
      url: normalizeUrl(item.url, vendor),
      price: this._parsePrice(item.priceText),
    }))
  }

  async extractBasicInfo(page: Page, vendorKey: VendorKey, vendor: VendorConfig): Promise<ExtractedBasicInfo> {
    const name = await this._textByXPath(page, vendor.product_name_xpath)

    const productCodeText = vendor.product_code_xpath ? await this._textByXPath(page, vendor.product_code_xpath) : null
    // "상품코드 WB97FE9" -> "WB97FE9"
    const productCode = productCodeText ? productCodeText.replace('상품코드', '').trim() : null

    const priceText = vendor.price_xpath ? await this._textByXPath(page, vendor.price_xpath) : null
    const price = this._parsePrice(priceText)

    // Shipping fee handling (OwnerClan has an input field with the value)
    let shippingFee: string | null = null
    if (vendor.shipping_fee_xpath) {
      shippingFee = await page.evaluate((xpath: string) => {
        const el = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
          .singleNodeValue as HTMLInputElement | null
        if (el) {
          if (el.tagName.toLowerCase() === 'input') return el.value
          return el.textContent?.trim() || null
        }
        return null
      }, vendor.shipping_fee_xpath)
    }

    const categories: string[] = []
    const categoryXpaths = [
      vendor.category_1_xpath,
      vendor.category_2_xpath,
      vendor.category_3_xpath,
      vendor.category_4_xpath,
    ]
    for (const cx of categoryXpaths) {
      if (!cx) continue
      const val = await this._textByXPath(page, cx)
      if (val) {
        // Remove triangle "▷" if present
        categories.push(val.replace('▷', '').trim())
      }
    }

    const origin = vendor.origin_xpath ? await this._textByXPath(page, vendor.origin_xpath) : '상세페이지 참조'
    let manufacturer = vendor.manufacturer_xpath
      ? await this._textByXPath(page, vendor.manufacturer_xpath)
      : '상세페이지 참조'
    if (!manufacturer && vendor.fallback_manufacturer) {
      manufacturer = vendor.fallback_manufacturer
    }

    // Options
    let options: { name: string; price?: number; qty?: number }[][] | undefined
    if (vendor.option_xpath && vendor.option_xpath.length > 0) {
      options = await this._collectOptionsByXpaths(page, vendor.option_xpath)
    }

    return {
      name,
      productCode,
      price,
      shippingFee,
      origin,
      manufacturer,
      categories,
      options,
    }
  }

  async collectThumbnails(page: Page, vendor: VendorConfig, productDir?: string): Promise<string[]> {
    const mainImageUrls: string[] = vendor.main_image_xpath
      ? await page.$$eval(`xpath=${vendor.main_image_xpath}`, nodes =>
          Array.from(nodes)
            .map(n => (n as HTMLImageElement).src || '')
            .filter(Boolean),
        )
      : []

    const targetDir = productDir || path.join(envConfig.downloadsPath, dayjs().format('YYYYMMDD'))
    if (!fsSync.existsSync(targetDir)) fsSync.mkdirSync(targetDir, { recursive: true })

    const savedMainImages: string[] = []
    const thumbnailNames = ['기본이미지1.jpg', '기본이미지2.jpg', '추가이미지1.jpg', '추가이미지2.jpg']
    for (let i = 0; i < Math.min(4, mainImageUrls.length); i++) {
      const buf = await this.downloadToBuffer(mainImageUrls[i])
      if (!buf) continue
      const outPath = path.join(targetDir, thumbnailNames[i])
      await this.saveJpg(buf, outPath, 90)
      savedMainImages.push(outPath)
    }

    return savedMainImages
  }

  async collectDetailImage(page: Page, vendor: VendorConfig, productDir?: string): Promise<string | null> {
    const detailSelector = vendor.detail_image_xpath || '.detail-content-wrapper'

    const targetDir = productDir || path.join(envConfig.downloadsPath, dayjs().format('YYYYMMDD'))
    if (!fsSync.existsSync(targetDir)) fsSync.mkdirSync(targetDir, { recursive: true })

    const outPath = path.join(targetDir, `상세이미지.jpg`)

    // 상세정보 펼쳐보기 버튼이 있으면 클릭
    try {
      const toggleBtn = page.locator('button.detail-toggle-btn').first()
      if (await toggleBtn.isVisible({ timeout: 2000 })) {
        const text = await toggleBtn.textContent()
        if (text && text.includes('펼쳐보기')) {
          await toggleBtn.click()
          // 펼쳐지는 애니메이션 대기
          await page.waitForTimeout(1000)
        }
      }
    } catch (e) {
      // 버튼이 없거나 클릭 실패해도 무시하고 진행
    }

    // Wait for images in detail section to load
    await page.waitForTimeout(2000)

    const isXpath = detailSelector.startsWith('//') || detailSelector.startsWith('xpath=')
    let locator = page
      .locator(isXpath && !detailSelector.startsWith('xpath=') ? `xpath=${detailSelector}` : detailSelector)
      .first()
    let count = await locator.count()

    if (count === 0 && !isXpath) {
      // Fallback or try different common selectors if needed
      // But for now, just ensure the primary one works
    }

    if (count > 0) {
      // 이미지들이 모두 로드될 때까지 스크롤하며 대기 (상세 펼치기 후 지연 로딩되는 이미지 처리)
      await page.evaluate(
        async (params: { selector: string; isXpath: boolean }) => {
          const wrapper = params.isXpath
            ? (document.evaluate(params.selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
                .singleNodeValue as HTMLElement)
            : (document.querySelector(params.selector) as HTMLElement)

          if (!wrapper) return

          const images = Array.from(wrapper.querySelectorAll('img'))

          // 간단한 스크롤 함수 (지연 로딩 트리거)
          const scrollDown = async () => {
            let currentScroll = window.scrollY
            const maxScroll = document.body.scrollHeight
            while (currentScroll < maxScroll) {
              window.scrollBy(0, 800)
              currentScroll += 800
              await new Promise(r => setTimeout(r, 100))
            }
            window.scrollTo(0, 0) // 다시 위로
          }

          await scrollDown()

          const loadPromises = images.map(img => {
            if (img.complete && img.naturalHeight !== 0) return Promise.resolve()
            return new Promise<void>(resolve => {
              const timeout = setTimeout(resolve, 3000) // 최대 3초 대기
              img.onload = () => {
                clearTimeout(timeout)
                resolve()
              }
              img.onerror = () => {
                clearTimeout(timeout)
                resolve()
              }
            })
          })

          await Promise.all(loadPromises)

          // 캡처 전에 불필요한 그래디언트 오버레이 토글 등 제거
          const gradients = document.querySelectorAll('.detail-gradient')
          gradients.forEach(el => {
            ;(el as HTMLElement).style.display = 'none'
          })

          // 안내문구 숨김
          const paragraphs = document.querySelectorAll('p')
          paragraphs.forEach(p => {
            if (p.textContent && p.textContent.includes('본 제품을 구매하시면 원활한 배송을 위해')) {
              ;(p as HTMLElement).style.display = 'none'
            }
          })
        },
        { selector: detailSelector, isXpath },
      )

      await page.waitForTimeout(1000) // 로드 후 렌더링 안정화 추가 대기

      await this.screenshotLongElement(page, locator, outPath, 4000)
      return outPath
    } else {
      // Fallback: try capturing the whole page if detail element not found
      // or try a common fallback ID for OwnerClan detail area
      const fallbackSelector = 'div.detail-content-wrapper, div.detail-content, div#sub_wrap' // Broader container
      const fallbackLocator = page.locator(fallbackSelector).first()
      if ((await fallbackLocator.count()) > 0) {
        await this.screenshotLongElement(page, fallbackLocator, outPath, 4000)
        return outPath
      }
    }

    return null
  }

  async collectAdditionalInfo(
    page: Page,
    vendor: VendorConfig,
  ): Promise<{ label: string; value: string }[] | undefined> {
    // OwnerClan doesn't have a simple key-value table like Domeggook in the provided DOM,
    // but we can extract common info if needed.
    return undefined
  }

  async checkLoginRequired(page: Page): Promise<boolean> {
    const currentUrl = page.url()
    return currentUrl.includes('loginform.php')
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
      return text || null
    } catch {
      return null
    }
  }

  private _parsePrice(text: string | null): number | null {
    if (!text) return null
    const digits = text.replace(/[^0-9]/g, '')
    return digits ? Number(digits) : null
  }

  private async _collectOptionsByXpaths(
    page: Page,
    xpaths: string[],
  ): Promise<{ name: string; price?: number; qty?: number }[][]> {
    const levels: { name: string; price?: number; qty?: number }[][] = []
    for (const xp of xpaths) {
      try {
        const items: { name: string; price?: number; qty?: number }[] = await page.evaluate((xpath: string) => {
          const result: any[] = []
          const iterator = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null)
          let node = iterator.iterateNext() as Element
          while (node) {
            const name = node.textContent?.trim() || ''
            if (name && !/선택|품절/i.test(name)) {
              // Try to extract price delta if present, e.g. "Red (+1,000원)"
              let price = 0
              const priceMatch = name.match(/\(([+-]?\s*[0-9,]+)원?\)/)
              if (priceMatch) {
                price = Number(priceMatch[1].replace(/[^0-9-]/g, ''))
              }
              result.push({ name, price, qty: 999 })
            }
            node = iterator.iterateNext() as Element
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
}

export default OwnerClanScraper
