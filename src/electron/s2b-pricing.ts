import { S2BBase } from './s2b-base'
import dayjs from 'dayjs'

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export type RoundingBase = 1 | 10 | 100 | 1000 | 10000
export type RoundingMode = 'ceil' | 'floor' | 'round' | 'halfDown' // 올림, 내림, 반올림, 반내림

export interface PricingRoundOptions {
  base: RoundingBase
  mode: RoundingMode
}

export class S2BPricing extends S2BBase {
  constructor(
    _baseImagePath: string, // 가격 수정 기능은 이미지 경로 사용하지 않음
    logCallback: (message: string, level?: 'info' | 'warning' | 'error') => void,
    headless: boolean = false,
    _settings?: any,
  ) {
    super(logCallback, headless)
  }

  public async updatePricingForRange(
    registrationStatus: string = '',
    searchQuery: string = '',
    priceChangePercent: number = 0,
    startDate?: string,
    endDate?: string,
    roundOptions: PricingRoundOptions = { base: 10, mode: 'round' },
    statusDateRange?: { start: string; end: string },
  ): Promise<void> {
    if (!this.page) throw new Error('브라우저가 초기화되지 않았습니다.')

    const clampedPercent = Math.max(-10, Math.min(10, priceChangePercent))
    const hasDateRange = Boolean(startDate && endDate)
    const finalStartDate = hasDateRange ? startDate : undefined
    const finalEndDate = hasDateRange ? endDate : undefined
    await this._gotoAndSearchListPageByRange(finalStartDate, finalEndDate, registrationStatus, searchQuery)
    let products = await this._collectAllProductLinks(true)

    if (statusDateRange) {
      const beforeCount = products.length
      products = this._filterByStatusDateRange(products, statusDateRange.start, statusDateRange.end)
      this._log(
        `상태일자 필터 적용: ${beforeCount}개 → ${products.length}개 (${statusDateRange.start} ~ ${statusDateRange.end})`,
        'info',
      )
      if (products.length === 0 && beforeCount > 0) {
        this._log('상태일자 컬럼을 찾지 못했거나 해당 기간에 일치하는 상품이 없습니다.', 'warning')
      }
    }

    await this._processUpdateProducts(products, clampedPercent, roundOptions)
  }

  private async _gotoAndSearchListPageByRange(
    startDate?: string,
    endDate?: string,
    registrationStatus: string = '',
    searchQuery: string = '',
  ): Promise<void> {
    await this.page!.goto('https://www.s2b.kr/S2BNVendor/S2B/srcweb/remu/rema/rema100_list_new.jsp', {
      waitUntil: 'domcontentloaded',
    })
    await this.page!.waitForLoadState('domcontentloaded')
    await this.page!.evaluate(() => {
      ;(document.querySelector('#rowCount') as HTMLSelectElement).value = '10'
      const setRowCountButton = document.querySelector('a[href^="javascript:setRowCount2()"]') as HTMLElement
      if (setRowCountButton) setRowCountButton.click()
    })
    await this.page!.waitForLoadState('domcontentloaded')

    if (startDate && endDate) {
      await this.page!.selectOption('#search_date', 'LIMIT_DATE')
      await this.page!.fill('#search_date_start', startDate)
      await this.page!.fill('#search_date_end', endDate)
    }
    if (registrationStatus) {
      await this.page!.check(`input[name="tgruStatus"][value="${registrationStatus}"]`)
    }
    if (searchQuery) {
      await this.page!.fill('#search_query', searchQuery)
    }
    await this.page!.click('[href^="javascript:search()"]')
    await this.page!.waitForLoadState('domcontentloaded')
  }

  private async _getStatusDateColumnIndex(): Promise<number> {
    const idx = await this.page!.evaluate(() => {
      const firstRow = document.querySelector('#listTable tbody tr')
      if (!firstRow) return -1
      const cells = firstRow.querySelectorAll('td, th')
      for (let i = 0; i < cells.length; i++) {
        if ((cells[i].textContent ?? '').trim() === '상태일자') return i
      }
      return -1
    })
    return idx
  }

  private _filterByStatusDateRange(
    products: { name: string; link: string; statusDate?: string }[],
    startStr: string,
    endStr: string,
  ): { name: string; link: string; statusDate?: string }[] {
    const start = dayjs(startStr.replace(/-/g, ''), 'YYYYMMDD')
    const end = dayjs(endStr.replace(/-/g, ''), 'YYYYMMDD')
    return products.filter(p => {
      if (!p.statusDate) return false
      const d = dayjs(p.statusDate.replace(/[^0-9]/g, '').slice(0, 8), 'YYYYMMDD')
      return d.isValid() && !d.isBefore(start) && !d.isAfter(end)
    })
  }

  private async _collectAllProductLinks(
    includeStatusDate: boolean = false,
  ): Promise<{ name: string; link: string; statusDate?: string }[]> {
    const products: { name: string; link: string; statusDate?: string }[] = []
    const waitForListReady = async () => {
      await this.page!.waitForLoadState('domcontentloaded')
      await this.page!.waitForSelector('#listTable tr td.td_graylist_l a', { state: 'attached' })
    }

    await waitForListReady()

    const itemsPerPage =
      (await this.page!.evaluate(() => {
        const select = document.querySelector('#rowCount') as HTMLSelectElement | null
        if (!select) return 0
        const selected =
          select.value ||
          (select.options[select.selectedIndex] ? select.options[select.selectedIndex].value : undefined)
        const parsed = selected ? parseInt(selected, 10) : NaN
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
      })) || 100

    const totalResults =
      (await this.page!.evaluate(() => {
        const totalSpan = Array.from(document.querySelectorAll('h1 span.t_r')).find(span =>
          (span.textContent ?? '').includes('총'),
        )
        if (!totalSpan?.textContent) return 0
        const match = totalSpan.textContent.replace(/,/g, '').match(/총\s*([\d]+)/)
        return match ? parseInt(match[1], 10) : 0
      })) ?? 0

    const totalPages = Math.max(1, Math.ceil(totalResults / itemsPerPage))
    const statusDateColIndex = includeStatusDate ? await this._getStatusDateColumnIndex() : -1

    for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
      if (pageIndex > 0) {
        const offset = pageIndex * itemsPerPage
        await Promise.all([
          this.page!.waitForNavigation({ waitUntil: 'domcontentloaded' }),
          this.page!.evaluate(offsetValue => {
            const movePageFn = (window as any).movePage
            if (typeof movePageFn === 'function') {
              movePageFn(String(offsetValue))
              return true
            }
            const fallback = Array.from(document.querySelectorAll('.paginate2 a')).find(anchor => {
              if (!(anchor instanceof HTMLAnchorElement)) return false
              const href = anchor.getAttribute('href') ?? ''
              return href.includes(`movePage('${offsetValue}')`)
            }) as HTMLElement | undefined
            if (!fallback) {
              throw new Error('movePage 함수를 찾을 수 없습니다.')
            }
            fallback.click()
            return true
          }, offset),
        ])
        await waitForListReady()
      }

      const pageProducts = await this.page!.$$eval(
        '#listTable tbody tr',
        (rows, colIdx) => {
          return Array.from(rows)
            .map(row => {
              const linkEl = row.querySelector('td.td_graylist_l a') as HTMLAnchorElement
              const nameEl = row.querySelector('td.td_graylist_l')
              if (!linkEl || !nameEl) return null
              let statusDate: string | undefined
              if (colIdx >= 0) {
                const td = row.querySelectorAll('td')[colIdx]
                const text = (td?.textContent ?? '').replace(/\s/g, ' ').trim()
                const match = text.match(/(\d{4})[-./]?(\d{1,2})[-./]?(\d{1,2})/) || text.match(/(\d{4})(\d{2})(\d{2})/)
                if (match) {
                  const [, y, m, d] = match
                  const pad = (n: string) => n.padStart(2, '0')
                  statusDate = `${y}-${pad(m!)}-${pad(d!)}`
                }
              }
              return { name: nameEl.textContent?.trim() || '', link: linkEl.href, statusDate }
            })
            .filter(Boolean)
        },
        statusDateColIndex,
      )
      products.push(...(pageProducts as any[]))
    }
    return products
  }

  private _parsePrice(value: string): number {
    const sanitized = value.replace(/[^\d]/g, '')
    const parsed = sanitized ? parseInt(sanitized, 10) : 0
    return Number.isFinite(parsed) ? parsed : 0
  }

  private _formatPrice(value: number): string {
    const rounded = Math.max(0, Math.round(value))
    return rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  }

  private _roundToUnit(value: number, base: RoundingBase, mode: RoundingMode): number {
    const unit = base
    const scaled = value / unit
    let rounded: number
    switch (mode) {
      case 'ceil':
        rounded = Math.ceil(scaled)
        break
      case 'floor':
        rounded = Math.floor(scaled)
        break
      case 'round':
        rounded = Math.round(scaled)
        break
      case 'halfDown': // 반내림: 0.5일 때 내림
        rounded = scaled % 1 === 0.5 ? Math.floor(scaled) : Math.round(scaled)
        break
      default:
        rounded = Math.round(scaled)
    }
    return Math.max(0, Math.round(rounded * unit))
  }

  private async _ensureEditMode(): Promise<void> {
    const estimateInput = this.page!.locator('input[name="f_estimate_amt"]')
    if ((await estimateInput.count()) > 0) return

    const editSelector = 'a[href^="javascript:fnRemainQntUpdate2"]'
    const editButton = this.page!.locator(editSelector)
    if ((await editButton.count()) > 0) {
      await editButton.first().click()
      await this.page!.waitForLoadState('domcontentloaded')
      await this.page!.waitForTimeout(300)
    }
  }

  private async _updateEstimateAmount(
    priceChangePercent: number,
    roundOptions: PricingRoundOptions,
  ): Promise<{
    before: number
    after: number
    changed: boolean
  } | null> {
    await this._ensureEditMode()
    const input = this.page!.locator('input[name="f_estimate_amt"]').first()
    try {
      await input.waitFor({ state: 'attached', timeout: 5000 })
    } catch {
      // ignore - handled by count check below
    }
    if ((await input.count()) === 0) {
      return null
    }

    const beforeValue = await input.inputValue()
    const before = this._parsePrice(beforeValue)
    const multiplier = 1 + priceChangePercent / 100
    const afterRaw = before * multiplier
    let after = this._roundToUnit(afterRaw, roundOptions.base, roundOptions.mode)
    const maxAllowed = before * 1.1
    const minAllowed = before * 0.9
    if (after > maxAllowed) {
      after = this._roundToUnit(maxAllowed, roundOptions.base, 'floor')
    } else if (after < minAllowed) {
      after = this._roundToUnit(minAllowed, roundOptions.base, 'ceil')
    }
    const clampedAfter = Math.max(0, after)
    const changed = clampedAfter !== before

    if (changed) {
      const formatted = this._formatPrice(clampedAfter)
      try {
        const isVisible = await input.isVisible()
        const isEnabled = await input.isEnabled()
        if (isVisible && isEnabled) {
          await input.fill(formatted)
        } else {
          await input.fill(formatted, { force: true })
        }
      } catch {
        await this.page!.evaluate(value => {
          const el = document.querySelector('input[name="f_estimate_amt"]') as HTMLInputElement | null
          if (!el) return
          el.value = value
          el.dispatchEvent(new Event('input', { bubbles: true }))
          el.dispatchEvent(new Event('change', { bubbles: true }))
        }, formatted)
      }
      await this.page!.evaluate(() => {
        const el = document.querySelector('input[name="f_estimate_amt"]') as HTMLInputElement | null
        if (!el) return
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
      })
    }

    return { before, after: clampedAfter, changed }
  }

  private async _saveProductChanges(): Promise<boolean> {
    let popup: any | null = null
    try {
      popup = await this._openPopupByClick(8000)
      if (!popup) {
        this._log('수정완료 팝업이 열리지 않았습니다.', 'warning')
        return false
      }

      await popup.waitForLoadState('domcontentloaded')
      await popup.bringToFront().catch(() => {})

      const ok = await this._confirmInPopupAndWaitSuccessAlert(popup, '4', 8000)
      return ok
    } catch (error: any) {
      this._log(`수정 확인 팝업 처리 실패: ${error?.message || String(error)}`, 'warning')
      return false
    } finally {
      if (popup) await popup.close().catch(() => {})
    }
  }

  private async _openPopupByClick(timeoutMs: number): Promise<any | null> {
    const ctx = this.page!.context()

    const beforePages = new Set(ctx.pages())

    const popupFromPagePromise = this.page!.waitForEvent('popup', { timeout: timeoutMs }).catch(() => null)
    const popupFromContextPromise = ctx.waitForEvent('page', { timeout: timeoutMs }).catch(() => null)

    const editButton = await this.page.$('a[href*="javascript:register(\'4\')"]')
    await editButton.click({ noWaitAfter: true })

    const raced = (await Promise.race([popupFromPagePromise, popupFromContextPromise])) as any | null
    if (raced) return raced

    const startedAt = Date.now()
    const urlPattern = /rema100_statusWaitPopup\.jsp/i

    while (Date.now() - startedAt < timeoutMs) {
      const pages = ctx.pages()

      const newlyCreated = pages.find(p => !beforePages.has(p))
      if (newlyCreated) {
        try {
          await newlyCreated.waitForLoadState('domcontentloaded', { timeout: 2000 }).catch(() => {})
        } catch {}
        if (urlPattern.test(newlyCreated.url())) return newlyCreated
      }

      const reusedOrExistingPopup = pages.find(p => p !== this.page && urlPattern.test(p.url()))
      if (reusedOrExistingPopup) return reusedOrExistingPopup

      await this.page!.waitForTimeout(200)
    }

    return null
  }

  private async _confirmInPopupAndWaitSuccessAlert(popup: any, reqStatus: '4', timeoutMs: number): Promise<boolean> {
    const dialogPromise = popup.waitForEvent('dialog', { timeout: timeoutMs }).catch(() => null)
    const confirmBtn = popup.locator(`img[onclick*="fnConfirm('${reqStatus}')"]`).first()

    if ((await confirmBtn.count()) > 0) {
      await confirmBtn.click()
    } else {
      const didCall = await popup.evaluate((status: string) => {
        const w = window as any
        if (typeof w.fnConfirm === 'function') {
          w.fnConfirm(status)
          return true
        }
        return false
      }, reqStatus)

      if (!didCall) {
        this._log(`팝업 내 fnConfirm(${reqStatus}) 실행 수단을 찾지 못했습니다.`, 'warning')
        return false
      }
    }

    await delay(3000)

    const dialog = await dialogPromise
    if (!dialog) {
      this._log('등록 완료 알림창이 뜨지 않았습니다.', 'warning')
      return false
    }

    const message = dialog.message()
    await dialog.accept()

    if (message.includes('등록하신 물품정보가 변경 되었습니다')) {
      return true
    }

    this._log(`등록 완료 메시지를 확인하지 못했습니다: ${message}`, 'warning')
    return false
  }

  private async _processUpdateProducts(
    products: {
      name: string
      link: string
      statusDate?: string
      status?: 'success' | 'fail'
      errorMessage?: string
      priceChanged?: boolean
    }[],
    priceChangePercent: number,
    roundOptions: PricingRoundOptions,
  ): Promise<typeof products> {
    for (const product of products) {
      try {
        await this.page!.goto(product.link, { waitUntil: 'domcontentloaded' })
        await this.page!.waitForLoadState('domcontentloaded')

        let priceUpdateInfo: { before: number; after: number; changed: boolean } | null = null
        if (priceChangePercent !== 0) {
          try {
            priceUpdateInfo = await this._updateEstimateAmount(priceChangePercent, roundOptions)
            if (!priceUpdateInfo) {
              this._log(`제시금액 입력란을 찾을 수 없습니다: ${product.name}`, 'warning')
            } else if (priceUpdateInfo.changed) {
              this._log(
                `제시금액 변경: ${product.name} (${priceUpdateInfo.before} -> ${priceUpdateInfo.after})`,
                'info',
              )
              await delay(3000)
              const saved = await this._saveProductChanges()
              if (!saved) {
                this._log(`수정/저장 버튼을 찾을 수 없습니다: ${product.name}`, 'warning')
              } else {
                await this.page!.waitForLoadState('domcontentloaded')
              }
              product.priceChanged = saved
            } else {
              product.priceChanged = false
            }
          } catch (error: any) {
            this._log(`제시금액 변경 오류 (${product.name}): ${error?.message || error}`, 'error')
          }
        }

        await delay(2000)
      } catch (error: any) {
        product.status = 'fail'
        product.errorMessage = error.message
        this._log(`상품 처리 중 오류가 발생했습니다 (${product.name}): ${error}`, 'error')
      }
    }

    const successProducts = products.filter(p => p.priceChanged)
    const failedProducts = products.filter(p => p.priceChanged === false)

    this._log(
      `가격 수정 처리 완료 - 총: ${products.length}개, 성공: ${successProducts.length}개, 실패: ${failedProducts.length}개`,
      successProducts.length === products.length ? 'info' : 'warning',
    )

    if (failedProducts.length > 0) {
      this._log('실패한 상품 목록:', 'error')
      failedProducts.forEach(product => {
        this._log(`- ${product.name}: ${product.errorMessage || '수정 실패'}`, 'error')
      })
    }
    return products
  }
}
