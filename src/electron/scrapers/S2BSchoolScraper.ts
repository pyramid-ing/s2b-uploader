import type { Page } from 'patchright'
import path from 'node:path'
import * as fsSync from 'fs'
import dayjs from 'dayjs'
import { VendorConfig, VendorKey } from '../sourcing-config'
import type { ExtractedBasicInfo } from './BaseScraper'
import { BaseScraper } from './BaseScraper'
import { envConfig } from '../envConfig'

/**
 * 학교장터(S2B) Scraper
 * - 목록 페이지: `.nutresult` 테이블 기반으로 목록 수집
 * - 상세 페이지: 제공된 DOM 구조(상품명/카테고리/제조사/원산지/배송비/상세 탭 등) 기반으로 추출
 *
 * 주의:
 * - 목록에서 상세 이동은 `javascript:goViewPage('상품ID')` 형태가 많아,
 *   목록 수집 시 URL을 "검색페이지#goodsId=..." 형태로 만들어 `S2BSourcing._navigateToUrl`에서 처리한다.
 */
export class S2BSchoolScraper extends BaseScraper {
  public vendorKey: VendorKey = VendorKey.학교장터

  private static readonly ORIGIN = 'https://www.s2b.kr'
  private static readonly SEARCH_URL =
    'https://www.s2b.kr/S2BNCustomer/S2B/scrweb/remu/rema/searchengine/s2bCustomerSearch.jsp'

  private _normalizeS2bUrl(url: string): string {
    if (!url) return url
    if (url.startsWith('//')) return `https:${url}`
    if (url.startsWith('/')) return `${S2BSchoolScraper.ORIGIN}${url}`
    return url
  }

  private _buildItemUrl(goodsId: string): string {
    return `${S2BSchoolScraper.SEARCH_URL}#goodsId=${encodeURIComponent(goodsId)}`
  }

  async collectList(
    page: Page,
    _vendor: VendorConfig,
  ): Promise<{ name: string; url: string; price?: number; listThumbnail?: string; vendor?: string }[]> {
    // 검색 결과가 없는 경우도 있으므로 selector 대기는 짧게
    await page.waitForTimeout(300)

    const items = await page.evaluate(
      ({ origin, searchUrl }: { origin: string; searchUrl: string }) => {
        const normalize = (u: string) => {
          if (!u) return u
          if (u.startsWith('//')) return `https:${u}`
          if (u.startsWith('/')) return `${origin}${u}`
          return u
        }

        const parsePrice = (text: string) => {
          const m = (text || '').match(/([0-9]{1,3}(?:,[0-9]{3})+)\s*원/)
          if (!m) return undefined
          const digits = m[1].replace(/[^\d]/g, '')
          const n = digits ? Number(digits) : NaN
          return Number.isFinite(n) ? n : undefined
        }

        const out: {
          name: string
          url: string
          price?: number
          listThumbnail?: string
          vendor?: string
        }[] = []

        const table = document.querySelector('.nutresult table') as HTMLTableElement | null
        if (!table) return out

        const rows = Array.from(table.querySelectorAll('tbody tr')) as HTMLTableRowElement[]
        for (const tr of rows) {
          // 헤더/빈행 제외
          if (tr.classList.contains('thead')) continue
          if (tr.querySelector('th')) continue

          const idInput = tr.querySelector('input[name="checkFlag"]') as HTMLInputElement | null
          const goodsId = (idInput?.value || '').trim()
          if (!goodsId) continue

          const nameAnchor = tr.querySelector('ul.obj_name li.l01 a') as HTMLAnchorElement | null
          let name = ''
          if (nameAnchor) {
            // a 텍스트는 "상품명 + <span>모델/규격</span>" 구조가 많아, 첫 텍스트 노드만 우선 사용
            const firstTextNode = Array.from(nameAnchor.childNodes).find(n => n.nodeType === Node.TEXT_NODE)
            name = (firstTextNode?.textContent || nameAnchor.textContent || '').trim()
          }
          if (!name) continue

          const priceLi = tr.querySelector('td.lt_mulpumprice li') as HTMLElement | null
          const price = parsePrice((priceLi?.textContent || '').trim())

          const img = tr.querySelector('img.detail_img') as HTMLImageElement | null
          const listThumbnail = img?.getAttribute('src') ? normalize(img.getAttribute('src') || '') : undefined

          out.push({
            name,
            url: `${searchUrl}#goodsId=${encodeURIComponent(goodsId)}`,
            price,
            listThumbnail: listThumbnail || undefined,
            vendor: '학교장터',
          })
        }

        return out
      },
      { origin: S2BSchoolScraper.ORIGIN, searchUrl: S2BSchoolScraper.SEARCH_URL },
    )

    return items
  }

  async extractBasicInfo(page: Page, _vendorKey: VendorKey, _vendor: VendorConfig): Promise<ExtractedBasicInfo> {
    // DOM 기반 수집 (S2B 상세 페이지 구조) - "정보노출" 테이블(폭 476) 기준으로 정확 파싱
    const data = await page.evaluate(() => {
      const clean = (s: string) =>
        (s || '')
          .replace(/\u00A0/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      const text = (el: Element | null | undefined) => clean(((el as any)?.textContent || '').toString())

      // 상품명: 상단 타이틀(좌측) 영역
      const titleFont =
        (document.querySelector('td[width="470"] font.f12_b_black') as HTMLElement | null) ||
        (document.querySelector('font.f12_b_black') as HTMLElement | null)
      const name = text(titleFont) || null

      // 상품ID(상품코드): 상단 우측 숫자(대부분 12~15자리)
      let goodsId: string | null = null
      const rightFont = document.querySelector('td.ali_r font.f12_b_black') as HTMLElement | null
      const rightText = clean(rightFont?.textContent || '')
      if (/^\d{8,}$/.test(rightText)) goodsId = rightText
      if (!goodsId) {
        const fonts = Array.from(document.querySelectorAll('font.f12_b_black')) as HTMLElement[]
        for (const f of fonts) {
          const t = clean(f.textContent || '')
          if (/^\d{8,}$/.test(t)) {
            goodsId = t
            break
          }
        }
      }

      // 카테고리: icon_navi_view.gif 옆 텍스트 "A > B > C"
      const naviImg = document.querySelector('img[src*="icon_navi_view"]') as HTMLImageElement | null
      const naviTd = naviImg?.closest('td') || null
      const naviText = text(naviTd)
      const categories = (naviText || '')
        .split('>')
        .map(v => clean(v))
        .filter(Boolean)

      // 정보노출 테이블(폭 476)에서 3열(label/dot/value) 구조 파싱
      const infoTable = document.querySelector('table[width="476"]') as HTMLTableElement | null
      const infoMap: Record<string, string> = {}
      if (infoTable) {
        const rows = Array.from(infoTable.querySelectorAll('tbody tr')) as HTMLTableRowElement[]
        for (const tr of rows) {
          const tds = Array.from(tr.querySelectorAll('td')) as HTMLTableCellElement[]
          if (tds.length < 3) continue
          const label = clean(tds[0].textContent || '')
          const value = clean(tds[2].textContent || '')
          if (!value) continue

          // label이 비어있는 줄(제주/도서산간 추가배송비) 처리: "제주/도서산간 추가배송비 : 5,000 원"
          if (!label) {
            const m = value.split(':')
            if (m.length >= 2) {
              const l = clean(m[0])
              const v = clean(m.slice(1).join(':'))
              if (l && v) infoMap[l] = v
            }
            continue
          }

          infoMap[label] = value
        }
      }

      const shippingFee = infoMap['배송비'] || null

      // 제조사/원산지
      const manuOrigin = infoMap['제조사 / 원산지'] || ''
      let manufacturer: string | null = null
      let origin: string | null = null
      if (manuOrigin) {
        const parts = manuOrigin.split('/').map(v => clean(v))
        if (parts[0]) manufacturer = parts[0]
        if (parts[1]) origin = parts[1]
      }

      // 모델명/규격
      const modelSpec = infoMap['모델명 / 규격'] || ''
      const msParts = modelSpec
        .split('/')
        .map(v => clean(v))
        .filter(Boolean)
      const modelName = msParts.length > 0 ? msParts[0] : null
      const spec = msParts.length > 1 ? clean(msParts.slice(1).join('/')) : null

      // 가격: 상세페이지 내에 확실한 가격 DOM이 없을 수 있어, 목록에서 넘어온 price를 우선 사용(여기서는 null)
      const price: number | null = null

      return {
        name,
        goodsId,
        price,
        shippingFee,
        origin,
        manufacturer,
        categories,
        modelName,
        spec,
        tax: infoMap['과세유무'] || null,
        material: infoMap['소재 / 재질'] || null,
      }
    })

    return {
      name: data.name,
      // productCode는 폴더명/참고용으로 상품ID를 유지
      productCode: data.goodsId,
      price: typeof data.price === 'number' ? data.price : null,
      shippingFee: data.shippingFee,
      minPurchase: 1,
      imageUsage: undefined,
      certifications: undefined,
      origin: data.origin,
      manufacturer: data.manufacturer,
      categories: Array.isArray(data.categories) ? data.categories : [],
      options: undefined,
    }
  }

  async collectThumbnails(page: Page, _vendor: VendorConfig, productDir?: string): Promise<string[]> {
    const urls: string[] = await page
      .evaluate(() => {
        const out: string[] = []
        const big = document.querySelector('#bigImage') as HTMLImageElement | null
        if (big?.src) out.push(big.src)

        const thumbs = Array.from(document.querySelectorAll('td.detail_img img')) as HTMLImageElement[]
        for (const img of thumbs) {
          const src = img?.getAttribute('src') || img?.src || ''
          if (!src) continue
          // placeholder 제외
          if (src.includes('none_img')) continue
          out.push(src)
        }

        // 중복 제거
        return Array.from(new Set(out)).filter(Boolean)
      })
      .catch(() => [])

    const normalized = urls.map(u => this._normalizeS2bUrl(u)).filter(Boolean)

    const targetDir = productDir || path.join(envConfig.downloadsPath, dayjs().format('YYYYMMDD'))
    if (!fsSync.existsSync(targetDir)) fsSync.mkdirSync(targetDir, { recursive: true })

    const saved: string[] = []
    const names = ['기본이미지1.jpg', '기본이미지2.jpg', '추가이미지1.jpg', '추가이미지2.jpg']
    for (let i = 0; i < Math.min(4, normalized.length); i++) {
      const buf = await this.downloadToBuffer(normalized[i])
      if (!buf) continue
      const outPath = path.join(targetDir, names[i])
      await this.saveJpg(buf, outPath, 90)
      saved.push(outPath)
    }

    return saved
  }

  async collectDetailImage(page: Page, _vendor: VendorConfig, productDir?: string): Promise<string | null> {
    const targetDir = productDir || path.join(envConfig.downloadsPath, dayjs().format('YYYYMMDD'))
    if (!fsSync.existsSync(targetDir)) fsSync.mkdirSync(targetDir, { recursive: true })
    const outPath = path.join(targetDir, `상세이미지.jpg`)

    // 상세정보 탭으로 이동 시도
    try {
      await page.evaluate(() => {
        // 해시 이동(탭 UI가 해시에 반응하는 경우가 많음)
        location.hash = 'group_dtail02'
        const a = document.querySelector('a[href="#group_dtail02"]') as HTMLAnchorElement | null
        a?.click()
      })
      await page.waitForTimeout(800)
    } catch {}

    // 상세정보 영역 캡처 (group_dtail02)
    const locator = page.locator('#group_dtail02 .detail_c01')
    const count = await locator.count()
    if (!count) return null

    await this.screenshotLongElement(page, locator.first(), outPath, 4000)
    return outPath
  }

  async collectAdditionalInfo(
    page: Page,
    _vendor: VendorConfig,
  ): Promise<{ label: string; value: string }[] | undefined> {
    // 부가정보 탭이 다른 탭으로 열려있는 경우가 있어, 항상 group_dtail01로 전환 후 파싱한다.
    try {
      await page.evaluate(() => {
        try {
          location.hash = 'group_dtail01'
          const a = document.querySelector('a[href="#group_dtail01"]') as HTMLAnchorElement | null
          a?.click()
        } catch {}
      })
      await page.waitForTimeout(400)
    } catch {}

    const pairs = await page
      .evaluate(() => {
        const clean = (s: string) =>
          (s || '')
            .replace(/\u00A0/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
        const out: { label: string; value: string }[] = []

        const cleanCertValue = (td: HTMLTableCellElement): string => {
          // 인증정보/부가정보는 내부에 중첩 테이블 + 안내문구가 포함되어 있어,
          // "핵심 텍스트(비대상/인증번호...)"만 남기도록 정리한다.
          const raw = clean(td.textContent || '')
          if (!raw) return ''

          // 안내 문구 제거
          const withoutNotice = raw
            .replace(/\*\s*해당\s*인증정보는[\s\S]*?판매자에게\s*있습니다\.?/g, '')
            .replace(/\*\s*해당\s*인증정보는[\s\S]*?있습니다/g, '')
            .trim()

          // "인증정보보기" 같은 문구 제거
          const simplified = withoutNotice.replace(/인증정보보기/g, '').trim()

          // "인증번호 [R-R-...]"가 있는 경우 그 라인을 우선
          const bracket = simplified.match(/\[([A-Za-z0-9-]{6,})\]/)
          if (bracket?.[1]) {
            // 인증번호만 반환해도 되고, 원문을 반환해도 됨. (후처리에서 인증번호 추출)
            return `인증번호 [${bracket[1]}]`
          }

          // 그 외는 첫 유의미 토큰(대개 '비대상', '없음', '미등록' 등) 위주로 반환
          const tokens = simplified
            .split(/[\n\r]+/)
            .map(v => clean(v))
            .filter(Boolean)
          if (tokens.length === 0) return simplified
          return tokens[0]
        }

        // 1) 정보노출 테이블(폭 476) - 배송/과세/모델/규격 등
        const infoTable = document.querySelector('table[width="476"]') as HTMLTableElement | null
        if (infoTable) {
          const rows = Array.from(infoTable.querySelectorAll('tbody tr')) as HTMLTableRowElement[]
          for (const tr of rows) {
            const tds = Array.from(tr.querySelectorAll('td')) as HTMLTableCellElement[]
            if (tds.length < 3) continue
            const rawLabel = clean(tds[0].textContent || '')
            const rawValue = clean(tds[2].textContent || '')
            if (!rawValue) continue

            if (!rawLabel) {
              // "제주/도서산간 추가배송비 : 5,000 원" 같이 라벨이 비어있는 행
              const m = rawValue.split(':')
              if (m.length >= 2) {
                const l = clean(m[0])
                const v = clean(m.slice(1).join(':'))
                if (l && v) out.push({ label: l, value: v })
              }
              continue
            }

            out.push({ label: rawLabel, value: rawValue })

            // 모델명/규격은 별도 분리 저장 (요청사항)
            if (rawLabel === '모델명 / 규격') {
              const parts = rawValue
                .split('/')
                .map(v => clean(v))
                .filter(Boolean)
              const modelName = parts.length > 0 ? parts[0] : ''
              const spec = parts.length > 1 ? clean(parts.slice(1).join('/')) : ''
              if (modelName) out.push({ label: '모델명', value: modelName })
              if (spec) out.push({ label: '규격', value: spec })
            }
          }
        }

        // 2) 부가정보 탭(group_dtail01) 테이블 - 인증/스펙 등 2열(label/value)
        const root = document.querySelector('#group_dtail01 .detail_c01') as HTMLElement | null
        if (root) {
          const rows = Array.from(root.querySelectorAll('table tr')) as HTMLTableRowElement[]
          for (const tr of rows) {
            const tds = Array.from(tr.querySelectorAll('td')) as HTMLTableCellElement[]
            if (tds.length < 2) continue
            const label = clean(tds[0].textContent || '')
            const value = cleanCertValue(tds[1])
            if (!label) continue
            if (!value) continue
            out.push({ label, value })
          }
        }

        // 3) 중복 제거
        const uniq: { label: string; value: string }[] = []
        const seen = new Set<string>()
        for (const p of out) {
          const k = `${p.label}::${p.value}`
          if (seen.has(k)) continue
          seen.add(k)
          uniq.push(p)
        }
        return uniq
      })
      .catch(() => [])

    return pairs.length > 0 ? pairs : undefined
  }

  async checkLoginRequired(page: Page): Promise<boolean> {
    try {
      const currentUrl = page.url()
      if (currentUrl.includes('/Login.do')) return true
      if (currentUrl.toLowerCase().includes('login')) return true
      const hasPw = await page.$('input[type="password"]')
      return !!hasPw
    } catch {
      return false
    }
  }
}

export default S2BSchoolScraper
