import type { Page } from 'playwright-core'
import path from 'node:path'
import * as fsSync from 'fs'
import dayjs from 'dayjs'
import { VendorConfig, VendorKey, normalizeUrl } from '../sourcing-config'
import type { ExtractedBasicInfo, ImageCollectResult } from './BaseScraper'
import { BaseScraper } from './BaseScraper'

export class DomeggookScraper extends BaseScraper {
  public vendorKey: VendorKey = VendorKey.도매꾹

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
    price = await this._extractDomeggookPrice(page)

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

    let certifications: { type: string; number: string }[] | undefined
    if (vendor.certification_xpath) {
      const certItems = await page.$$eval(`xpath=${vendor.certification_xpath}`, nodes => {
        return Array.from(nodes)
          .map(li => {
            const titleEl = (li as Element).querySelector('.lCertTitle') as HTMLElement | null
            const numEl = (li as Element).querySelector('.lCertNum') as HTMLElement | null
            const type = titleEl ? titleEl.textContent?.trim() || '' : ''
            const number = numEl ? numEl.textContent?.replace(/자세히보기.*/, '').trim() || '' : ''
            return { type, number }
          })
          .filter(cert => (cert as any).type && (cert as any).number)
      })
      if (certItems.length > 0) certifications = certItems as { type: string; number: string }[]
    }

    const origin = vendor.origin_xpath ? await this._textByXPath(page, vendor.origin_xpath) : null
    let manufacturer = vendor.manufacturer_xpath ? await this._textByXPath(page, vendor.manufacturer_xpath) : null
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

  async collectImages(page: Page, vendor: VendorConfig, productDir?: string): Promise<ImageCollectResult> {
    const mainImageUrls: string[] = vendor.main_image_xpath
      ? await page.$$eval(`xpath=${vendor.main_image_xpath}`, nodes =>
          Array.from(nodes)
            .map(n => (n as HTMLImageElement).src || (n as HTMLSourceElement).getAttribute('srcset') || '')
            .filter(Boolean),
        )
      : []

    const targetDir = productDir || path.join(process.cwd(), 'downloads', dayjs().format('YYYYMMDD'))
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

    let detailCapturePath: string | null = null
    if (vendor.detail_image_xpath) {
      try {
        const outPath = path.join(targetDir, `상세이미지.jpg`)
        const locator = page.locator(`xpath=${vendor.detail_image_xpath}`)
        await locator.first().screenshot({ path: outPath })
        detailCapturePath = outPath
      } catch {}
    }

    return { savedMainImages, detailCapturePath }
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
          collected.push({ label: labels[i], value: values[i] })
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
      return text || null
    } catch {
      return null
    }
  }

  private async _extractDomeggookPrice(page: Page): Promise<number | null> {
    try {
      const priceResult = await page.evaluate(() => {
        const lowestPriceEl = document.querySelector('tr.lInfoAmt .lItemPrice')
        if (lowestPriceEl) {
          const text = lowestPriceEl.textContent?.trim() || ''
          const match = text.match(/([0-9,]+)/)
          if (match) {
            const digits = match[1].replace(/[^0-9]/g, '')
            if (digits) return { type: 'lowest', price: Number(digits) }
          }
        }

        const discountEl = document.querySelector('tr.lInfoAmt .lDiscountAmt b:first-child')
        if (discountEl) {
          const text = discountEl.textContent?.trim() || ''
          const match = text.match(/([0-9,]+)/)
          if (match) {
            const digits = match[1].replace(/[^0-9]/g, '')
            if (digits) return { type: 'discount', price: Number(digits) }
          }
        }

        const discountRangeEl = document.querySelector('tr.lInfoAmt .lDiscountAmt')
        if (discountRangeEl) {
          const text = discountRangeEl.textContent?.trim() || ''
          const rangeMatch = text.match(/([0-9,]+)\s*원?\s*~\s*([0-9,]+)\s*원?/)
          if (rangeMatch) {
            const minPrice = rangeMatch[1].replace(/[^0-9]/g, '')
            if (minPrice) return { type: 'discount_range', price: Number(minPrice) }
          }
        }

        const quantityTable = document.querySelector('tr.lInfoAmt table#lAmtSectionTbl')
        if (quantityTable) {
          const firstPriceCell = quantityTable.querySelector(
            'tbody tr:nth-child(2) td.lSelected, tbody tr:nth-child(2) td:first-child',
          )
          if (firstPriceCell) {
            const text = firstPriceCell.textContent?.trim() || ''
            const match = text.match(/([0-9,]+)/)
            if (match) {
              const digits = match[1].replace(/[^0-9]/g, '')
              if (digits) return { type: 'quantity', price: Number(digits) }
            }
          }
        }

        const regularPriceEl = document.querySelector('tr.lInfoAmt .lNotDiscountAmt b')
        if (regularPriceEl) {
          const text = regularPriceEl.textContent?.trim() || ''
          const match = text.match(/([0-9,]+)/)
          if (match) {
            const digits = match[1].replace(/[^0-9]/g, '')
            if (digits) return { type: 'regular', price: Number(digits) }
          }
        }

        return null
      })

      return (priceResult as any)?.price || null
    } catch {
      return null
    }
  }

  private _parsePrice(text: string | null): number | null {
    if (!text) return null
    const cleanText = text.trim()
    const rangeMatch = cleanText.match(/([0-9,]+)\s*원?\s*~\s*([0-9,]+)\s*원?/)
    if (rangeMatch) {
      const minPrice = rangeMatch[1].replace(/[^0-9]/g, '')
      if (minPrice) return Number(minPrice)
    }
    const firstPriceMatch = cleanText.match(/([0-9,]+)\s*원?/)
    if (firstPriceMatch) {
      const digits = firstPriceMatch[1].replace(/[^0-9]/g, '')
      if (digits) return Number(digits)
    }
    const digits = cleanText.replace(/[^0-9]/g, '')
    if (!digits) return null
    return Number(digits)
  }

  private async _collectOptionsByXpaths(
    page: Page,
    xpaths: string[],
  ): Promise<{ name: string; price?: number; qty?: number }[][]> {
    const levels: { name: string; price?: number; qty?: number }[][] = []
    for (const xp of xpaths) {
      try {
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
              if (name && !/선택|옵션|선택하세요|옵션선택/i.test(name)) {
                result.push({ name, price: 0, qty: 9999 })
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
      } catch {
        levels.push([])
      }
    }
    return levels
  }

  async checkLoginRequired(page: Page): Promise<boolean> {
    try {
      const currentUrl = page.url()

      // 도매꾹 로그인 페이지 체크
      if (currentUrl.includes('domeggook.com') && currentUrl.includes('login')) {
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

export default DomeggookScraper
