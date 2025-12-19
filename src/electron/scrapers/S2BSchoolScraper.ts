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
 * - 상세 진입은 "실제 URL 이동"이 아니라,
 *   검색페이지에서 "S2B물품번호"로 물품번호 검색 후 첫 결과를 클릭하는 흐름으로 처리한다.
 */
export class S2BSchoolScraper extends BaseScraper {
  public vendorKey: VendorKey = VendorKey.학교장터

  private static readonly ORIGIN = 'https://www.s2b.kr'
  private static readonly SEARCH_URL =
    'https://www.s2b.kr/S2BNCustomer/S2B/scrweb/remu/rema/searchengine/s2bCustomerSearch.jsp'

  public async navigateToDetail(page: Page, _vendor: VendorConfig, urlOrId: string): Promise<void> {
    const goodsId = this._extractGoodsId(urlOrId)
    if (!goodsId) throw new Error('학교장터 물품번호를 찾을 수 없습니다.')

    await page.goto(S2BSchoolScraper.SEARCH_URL, { waitUntil: 'domcontentloaded' })
    await this._openFirstResultByGoodsId(page, goodsId)
  }

  public async collectFilteredList(
    page: Page,
    vendor: VendorConfig,
    params: {
      keyword: string
      minPrice?: number
      maxPrice?: number
      maxCount?: number
      sortCode?: 'RANK' | 'PCAC' | 'CERT' | 'TRUST' | 'DATE' | 'PCDC' | 'REVIEW_COUNT'
      viewCount?: 10 | 20 | 30 | 40 | 50
      pageDelayMs?: number
    },
    log?: (message: string, level?: 'info' | 'warning' | 'error') => void,
  ): Promise<{ name: string; url: string; price?: number; listThumbnail?: string; vendor?: string }[]> {
    const _log = (m: string, lv: 'info' | 'warning' | 'error' = 'info') => {
      try {
        log?.(m, lv)
      } catch {}
    }

    const maxCount = Math.max(1, Math.min(Number(params.maxCount || 100), 5000))
    const minPrice = typeof params.minPrice === 'number' ? params.minPrice : undefined
    const maxPrice = typeof params.maxPrice === 'number' ? params.maxPrice : undefined
    const pageDelayMs = Math.max(0, Math.min(Number(params.pageDelayMs ?? 1000), 60_000))

    const keyword = (params.keyword || '').toString().trim()
    if (!keyword) throw new Error('학교장터 검색어는 필수입니다.')

    // 0) 검색페이지로 이동
    if (!page.url().includes('/S2B/scrweb/remu/rema/searchengine/s2bCustomerSearch.jsp')) {
      await page.goto(S2BSchoolScraper.SEARCH_URL, { waitUntil: 'domcontentloaded' })
    }

    _log(`학교장터 필터검색 시작: "${keyword}"`, 'info')
    await this._runSearch(page, keyword)

    // 페이지당(기본 50)
    await this._setViewCount(page, params.viewCount || 50)

    // 정렬(기본 정확도순)
    await this._applySort(page, params.sortCode || 'RANK')

    // meta
    const { itemsPerPage, totalResults } = await this._readPagingMeta(page)
    const totalPages = Math.max(1, Math.ceil(totalResults / itemsPerPage))
    _log(`학교장터 검색결과: 총 ${totalResults.toLocaleString('ko-KR')}건, 페이지당 ${itemsPerPage}개`, 'info')

    const collected: { name: string; url: string; price?: number; listThumbnail?: string; vendor?: string }[] = []
    const seen = new Set<string>()

    const inRange = (price?: number): boolean => {
      if (typeof price !== 'number' || !Number.isFinite(price)) return false
      if (typeof minPrice === 'number' && price < minPrice) return false
      if (typeof maxPrice === 'number' && price > maxPrice) return false
      return true
    }

    for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
      if (collected.length >= maxCount) break

      if (pageIndex > 0) {
        const offset = pageIndex * itemsPerPage
        await this._movePage(page, offset)
      }

      const list = await this.collectList(page, vendor)
      const pageMinPrice = list.map(v => v.price).find(v => typeof v === 'number' && Number.isFinite(v)) as
        | number
        | undefined

      for (const it of list) {
        if (!it?.url || seen.has(it.url)) continue
        if (!inRange(it.price)) continue
        seen.add(it.url)
        collected.push(it)
        if (collected.length >= maxCount) break
      }

      if (typeof maxPrice === 'number' && typeof pageMinPrice === 'number' && pageMinPrice > maxPrice) {
        _log(`학교장터 필터검색 조기 종료: 페이지 최저가(${pageMinPrice})가 maxPrice(${maxPrice}) 초과`, 'info')
        break
      }

      _log(
        `학교장터 필터검색 진행: ${pageIndex + 1}/${totalPages}페이지, 조건 일치 ${collected.length}/${maxCount}개`,
        'info',
      )

      if (pageDelayMs > 0 && pageIndex < totalPages - 1 && collected.length < maxCount) {
        await page.waitForTimeout(pageDelayMs)
      }
    }

    _log(`학교장터 필터검색 완료: ${collected.length}개 수집`, 'info')
    return collected
  }

  private _normalizeS2bUrl(url: string): string {
    if (!url) return url
    if (url.startsWith('//')) return `https:${url}`
    if (url.startsWith('/')) return `${S2BSchoolScraper.ORIGIN}${url}`
    return url
  }

  private _buildItemUrl(goodsId: string): string {
    return `${S2BSchoolScraper.SEARCH_URL}#goodsId=${encodeURIComponent(goodsId)}`
  }

  private _extractGoodsId(urlOrId: string): string | null {
    const raw = (urlOrId || '').toString().trim()
    if (!raw) return null
    const js = raw.match(/goViewPage\(\s*'([^']+)'\s*\)/i)
    if (js?.[1]) return js[1].trim()
    try {
      const u = new URL(raw)
      const hash = (u.hash || '').replace(/^#/, '')
      const params = new URLSearchParams(hash)
      const goodsId = params.get('goodsId')
      if (goodsId) return goodsId.trim()
      const q = u.searchParams.get('goodsId')
      if (q) return q.trim()
    } catch {
      // ignore
    }
    if (/^\d{8,}$/.test(raw)) return raw
    return null
  }

  private async _ensureSearchTypeS2BGoodsId(page: Page): Promise<void> {
    await page.waitForLoadState('domcontentloaded')
    const current = await page
      .evaluate(() => (document.querySelector('#selectName') as HTMLElement | null)?.textContent || '')
      .catch(() => '')
    if ((current || '').replace(/\s+/g, ' ').trim() === 'S2B물품번호') return

    await page.evaluate(() => {
      const box = document.querySelector('#selectName') as HTMLElement | null
      box?.click()
    })

    await page
      .waitForFunction(
        () => {
          const container = document.querySelector('#fieldSelector') as HTMLElement | null
          const visible = !!container && container.style.display !== 'none'
          const opt = document.querySelector('#fieldSelector a#GOODS_CODE') as HTMLAnchorElement | null
          return visible && !!opt
        },
        { timeout: 8000 },
      )
      .catch(() => undefined)

    await page.evaluate(() => {
      const opt = document.querySelector('#fieldSelector a#GOODS_CODE') as HTMLAnchorElement | null
      opt?.click()
    })
    await page.waitForTimeout(200)
  }

  private async _openFirstResultByGoodsId(page: Page, goodsId: string): Promise<void> {
    const id = (goodsId || '').trim()
    if (!id) throw new Error('학교장터 물품번호가 비어있습니다.')

    await this._ensureSearchTypeS2BGoodsId(page)

    const didSearch = await page
      .evaluate((q: string) => {
        const setValue = (input: HTMLInputElement, v: string) => {
          input.value = v
          input.dispatchEvent(new Event('input', { bubbles: true }))
          input.dispatchEvent(new Event('change', { bubbles: true }))
        }
        const input = document.querySelector('#searchQuery') as HTMLInputElement | null
        if (!input) return false
        setValue(input, q)
        const mainBtn = document.querySelector('#mainSearchButton') as HTMLElement | null
        if (mainBtn) mainBtn.click()
        else input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        return true
      }, id)
      .catch(() => false)

    if (!didSearch) throw new Error('학교장터 검색 입력 요소(#searchQuery)를 찾을 수 없습니다.')

    await page
      .waitForFunction(
        () => {
          const a = document.querySelector('.nutresult table tbody tr ul.obj_name li.l01 a') as HTMLAnchorElement | null
          return !!a
        },
        { timeout: 20000 },
      )
      .catch(() => undefined)

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => undefined),
      page.evaluate(() => {
        const first =
          (document.querySelector('.nutresult table tbody tr ul.obj_name li.l01 a') as HTMLAnchorElement | null) ||
          (document.querySelector('.nutresult table tbody tr a[href*="goViewPage"]') as HTMLAnchorElement | null)
        if (!first) throw new Error('학교장터 검색 결과(첫번째 항목)를 찾을 수 없습니다.')
        first.click()
      }),
    ])
  }

  private async _runSearch(page: Page, keyword: string): Promise<void> {
    await page.waitForLoadState('domcontentloaded')
    const ok = await page
      .evaluate((q: string) => {
        const setValue = (input: HTMLInputElement) => {
          input.value = q
          input.dispatchEvent(new Event('input', { bubbles: true }))
          input.dispatchEvent(new Event('change', { bubbles: true }))
        }
        const mainInput = document.querySelector('#searchQuery') as HTMLInputElement | null
        if (mainInput) {
          setValue(mainInput)
          const mainBtn = document.querySelector('#mainSearchButton') as HTMLElement | null
          if (mainBtn) mainBtn.click()
          else mainInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
          return true
        }
        const input = document.querySelector('#searchRequery') as HTMLInputElement | null
        const btn = document.querySelector('#requeryButton') as HTMLElement | null
        if (input && btn) {
          setValue(input)
          btn.click()
          return true
        }
        return false
      }, keyword)
      .catch(() => false)

    if (!ok) throw new Error('학교장터 검색 입력 요소를 찾을 수 없습니다. 검색 결과 페이지에서 다시 시도하세요.')
    await page.waitForTimeout(800)
  }

  private async _applySort(
    page: Page,
    sortCode: 'RANK' | 'PCAC' | 'CERT' | 'TRUST' | 'DATE' | 'PCDC' | 'REVIEW_COUNT',
  ): Promise<void> {
    await page.waitForLoadState('domcontentloaded')
    const prevFirst = await page
      .evaluate(() => (document.querySelector('input[name="checkFlag"]') as HTMLInputElement | null)?.value || '')
      .catch(() => '')

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => undefined),
      page.evaluate((code: string) => {
        const w = window as any
        if (typeof w.sorting === 'function') {
          try {
            w.sorting(code)
            return true
          } catch {}
        }
        const anchors = Array.from(document.querySelectorAll('.sort_area .sort_list a')) as HTMLAnchorElement[]
        const found = anchors.find(a => (a.getAttribute('onclick') || '').includes(`sorting('${code}')`))
        found?.click()
        return true
      }, sortCode),
    ])

    if (prevFirst) {
      await page
        .waitForFunction(
          (prev: string) => {
            const cur = (document.querySelector('input[name="checkFlag"]') as HTMLInputElement | null)?.value || ''
            return !!cur && cur !== prev
          },
          prevFirst,
          { timeout: 8000 },
        )
        .catch(() => undefined)
    } else {
      await page.waitForTimeout(600)
    }
  }

  private async _readPagingMeta(page: Page): Promise<{ itemsPerPage: number; totalResults: number }> {
    const meta = await page.evaluate(() => {
      const clean = (s: string) =>
        (s || '')
          .replace(/\u00A0/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      const parseNum = (s: string) => {
        const digits = (s || '').replace(/[^\d]/g, '')
        const n = digits ? Number(digits) : 0
        return Number.isFinite(n) ? n : 0
      }

      let itemsPerPage = 50
      const perPageSelect = document.querySelector('#viewCountSelector') as HTMLSelectElement | null
      if (perPageSelect) {
        const selected = perPageSelect.options[perPageSelect.selectedIndex]
        const txt = clean(selected?.textContent || selected?.value || '')
        const m = txt.match(/(\d+)\s*개씩보기/)
        if (m?.[1]) itemsPerPage = parseNum(m[1]) || itemsPerPage
      }

      let totalResults = 0
      const h1 = document.querySelector('.srchrst_area h1') as HTMLElement | null
      const h1Text = clean(h1?.textContent || '')
      const m = h1Text.match(/총\s*([0-9,]+)\s*건/)
      if (m?.[1]) totalResults = parseNum(m[1])

      return { itemsPerPage, totalResults }
    })

    return {
      itemsPerPage: Math.max(1, Math.min(meta.itemsPerPage || 50, 200)),
      totalResults: Math.max(0, meta.totalResults || 0),
    }
  }

  private async _movePage(page: Page, offset: number): Promise<void> {
    const prevFirst = await page
      .evaluate(() => (document.querySelector('input[name="checkFlag"]') as HTMLInputElement | null)?.value || '')
      .catch(() => '')

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => undefined),
      page.evaluate((off: number) => {
        const w = window as any
        if (typeof w.movePage === 'function') {
          try {
            w.movePage('delivery', String(off))
            return true
          } catch {}
        }
        const anchors = Array.from(document.querySelectorAll('.paginate2 a')) as HTMLAnchorElement[]
        const found = anchors.find(a => {
          const href = a.getAttribute('href') || ''
          return href.includes('movePage') && href.includes('delivery') && href.includes(String(off))
        })
        found?.click()
        return true
      }, offset),
    ])

    if (prevFirst) {
      await page
        .waitForFunction(
          (prev: string) => {
            const cur = (document.querySelector('input[name="checkFlag"]') as HTMLInputElement | null)?.value || ''
            return !!cur && cur !== prev
          },
          prevFirst,
          { timeout: 8000 },
        )
        .catch(() => undefined)
    } else {
      await page.waitForTimeout(600)
    }
  }

  private async _setViewCount(page: Page, viewCount: 10 | 20 | 30 | 40 | 50): Promise<void> {
    await page.waitForLoadState('domcontentloaded')
    const prevFirst = await page
      .evaluate(() => (document.querySelector('input[name="checkFlag"]') as HTMLInputElement | null)?.value || '')
      .catch(() => '')

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => undefined),
      page.evaluate((count: number) => {
        const sel = document.querySelector('#viewCountSelector') as HTMLSelectElement | null
        if (!sel) return false
        sel.value = String(count)
        sel.dispatchEvent(new Event('change', { bubbles: true }))
        const w = window as any
        const fnCandidates = ['setRowCount', 'setRowCount2', 'changeViewCount', 'viewCountChange']
        for (const name of fnCandidates) {
          try {
            if (typeof w[name] === 'function') w[name]()
          } catch {}
        }
        return true
      }, viewCount),
    ])

    if (prevFirst) {
      await page
        .waitForFunction(
          (prev: string) => {
            const cur = (document.querySelector('input[name="checkFlag"]') as HTMLInputElement | null)?.value || ''
            return !!cur && cur !== prev
          },
          prevFirst,
          { timeout: 8000 },
        )
        .catch(() => undefined)
    } else {
      await page.waitForTimeout(600)
    }
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
      const categories = (() => {
        const raw = clean(naviText || '')
        if (!raw) return []

        // S2B는 화면/브라우저/폰트에 따라 구분자가 달라질 수 있어(>, ›, ＞ 등)
        // 여러 케이스를 포괄하는 정규식으로 분리한다.
        const parts = raw
          .split(/\s*(?:>|›|»|＞)\s*/g)
          .map(v => clean(v))
          .filter(Boolean)

        // 혹시 앞쪽에 아이콘/불필요 텍스트가 섞였을 때를 대비해 과도하게 긴 값은 제거
        return parts.filter(v => v.length <= 100)
      })()

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
      // 물품목록번호(G2B 번호)
      // 예시: "43211503-25370757" -> 실제 사용은 뒤쪽 "25370757" 만
      const rawG2b = infoMap['물품목록번호'] || ''
      const g2bItemNo = (() => {
        const v = clean(rawG2b)
        if (!v) return null
        // 흔한 형태: 43211503-25370757 (하이픈 앞/뒤 모두 숫자)
        const m = v.match(/(\d+)\s*-\s*(\d+)/)
        if (m?.[2]) return m[2]
        // fallback: 하이픈이 있으면 마지막 세그먼트 사용
        const parts = v
          .split('-')
          .map(s => clean(s))
          .filter(Boolean)
        if (parts.length >= 2) return parts[parts.length - 1]
        // 마지막 fallback: 숫자만 남기기
        const digits = v.replace(/[^\d]/g, '')
        return digits || null
      })()

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

      // 가격은 리스트에서 크롤링된 값을 URL(listPrice)로 전달받아 사용한다. (상세엔 가격이 없는 케이스 존재)
      const price: number | null = null

      return {
        name,
        goodsId,
        g2bItemNo,
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
      g2bItemNo: data.g2bItemNo,
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
        // 요청사항: 상단 큰 이미지(#bigImage)는 중복/오류를 유발하므로 제외하고,
        // 아래 썸네일 목록에서만 순서대로 추출한다.
        const out: string[] = []
        const thumbs = Array.from(document.querySelectorAll('td.detail_img img')) as HTMLImageElement[]
        for (const img of thumbs) {
          const src = (img?.getAttribute('src') || img?.src || '').trim()
          if (!src) continue
          // placeholder 제외
          if (src.includes('none_img')) continue
          if (!out.includes(src)) out.push(src) // 순서 유지 + 중복 제거
        }
        return out
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

    // 상세정보 영역의 마지막 img 다운로드 (group_dtail02)
    const imgUrl = await page
      .evaluate(() => {
        const imgs = Array.from(document.querySelectorAll('#group_dtail02 .detail_c01 img')) as HTMLImageElement[]
        if (imgs.length === 0) return null
        const lastImg = imgs[imgs.length - 1]
        const src = (lastImg?.getAttribute('src') || lastImg?.src || '').trim()
        return src || null
      })
      .catch(() => null)

    if (!imgUrl) return null

    const normalizedUrl = this._normalizeS2bUrl(imgUrl)
    const buf = await this.downloadToBuffer(normalizedUrl)
    if (!buf) return null

    await this.saveJpg(buf, outPath, 90)
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
