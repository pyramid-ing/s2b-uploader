import { S2BBase } from './s2b-base'

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

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
  ): Promise<void> {
    if (!this.page) throw new Error('브라우저가 초기화되지 않았습니다.')

    await this._gotoAndSearchListPage(registrationStatus, searchQuery)
    const products = await this._collectAllProductLinks()
    await this._processUpdateProducts(products, priceChangePercent)
  }

  private async _gotoAndSearchListPage(registrationStatus: string = '', searchQuery: string = ''): Promise<void> {
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

    if (registrationStatus) {
      await this.page!.check(`input[name="tgruStatus"][value="${registrationStatus}"]`)
    }
    if (searchQuery) {
      await this.page!.fill('#search_query', searchQuery)
    }
    await this.page!.click('[href^="javascript:search()"]')
    await this.page!.waitForLoadState('domcontentloaded')
  }

  private async _collectAllProductLinks(): Promise<{ name: string; link: string }[]> {
    const products: { name: string; link: string }[] = []
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

      const pageProducts = await this.page!.$$eval('#listTable tr', rows => {
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

  private _roundToTen(value: number): number {
    return Math.round(value / 10) * 10
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

  private async _updateEstimateAmount(priceChangePercent: number): Promise<{
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
    const after = this._roundToTen(afterRaw)
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
    const saveSelector = 'a[href*="javascript:register(\\\'4\\\')"]'
    const locator = this.page!.locator(saveSelector)
    if ((await locator.count()) > 0) {
      let popup: any | null = null
      try {
        const popupPromise = this.page!.waitForEvent('popup', { timeout: 5000 }).catch(() => null)
        await locator.first().click()
        popup = await popupPromise
      } catch (error) {
        this._log(`수정완료 버튼 클릭 실패: ${String(error)}`, 'warning')
      }

      if (popup) {
        try {
          await popup.waitForLoadState('domcontentloaded')
          await popup.bringToFront().catch(() => {})
          const confirmButton = popup.locator('img[onclick*="fnConfirm(\\\'4\\\')"]')
          if ((await confirmButton.count()) > 0) {
            await confirmButton.first().click()
            await popup.waitForTimeout(300)
            await popup.close().catch(() => {})
          } else {
            this._log('팝업 내 fnConfirm(4) 버튼을 찾지 못했습니다.', 'warning')
          }
        } catch (error) {
          this._log(`수정 확인 팝업 처리 실패: ${String(error)}`, 'warning')
        }
        return true
      }

      this._log('수정완료 팝업이 열리지 않았습니다.', 'warning')
      return false
    }
    return false
  }

  private async _processUpdateProducts(
    products: {
      name: string
      link: string
      status?: 'success' | 'fail'
      errorMessage?: string
      priceChanged?: boolean
    }[],
    priceChangePercent: number,
  ): Promise<typeof products> {
    for (const product of products) {
      try {
        await this.page!.goto(product.link, { waitUntil: 'domcontentloaded' })
        await this.page!.waitForLoadState('domcontentloaded')

        let priceUpdateInfo: { before: number; after: number; changed: boolean } | null = null
        if (priceChangePercent !== 0) {
          try {
            priceUpdateInfo = await this._updateEstimateAmount(priceChangePercent)
            if (!priceUpdateInfo) {
              this._log(`제시금액 입력란을 찾을 수 없습니다: ${product.name}`, 'warning')
            } else if (priceUpdateInfo.changed) {
              this._log(
                `제시금액 변경: ${product.name} (${priceUpdateInfo.before} -> ${priceUpdateInfo.after})`,
                'info',
              )
              let saved = false
              const handleSaveDialog = async (dialog: any) => {
                const message = dialog.message()
                if (dialog.type() === 'confirm') {
                  await dialog.accept()
                  return
                }
                if (dialog.type() === 'alert') {
                  if (message.includes('오류') || message.includes('실패') || message.includes('필수')) {
                    this._log(`제시금액 수정 실패 - ${message}`, 'error')
                  }
                  await dialog.accept()
                }
              }
              this.page!.on('dialog', handleSaveDialog)
              try {
                saved = await this._saveProductChanges()
                if (!saved) {
                  this._log(`수정/저장 버튼을 찾을 수 없습니다: ${product.name}`, 'warning')
                } else {
                  await this.page!.waitForLoadState('domcontentloaded')
                }
              } finally {
                this.page!.off('dialog', handleSaveDialog)
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
