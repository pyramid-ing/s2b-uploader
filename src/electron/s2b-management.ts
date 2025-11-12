import { S2BBase } from './s2b-base'

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export class S2BManagement extends S2BBase {
  constructor(
    _baseImagePath: string, // 관리 기능은 이미지 경로 사용하지 않음
    logCallback: (message: string, level?: 'info' | 'warning' | 'error') => void,
    headless: boolean = false,
    _settings?: any,
  ) {
    super(logCallback, headless)
  }

  public async extendManagementDateForRange(
    startDate: string,
    endDate: string,
    registrationStatus: string = '',
  ): Promise<void> {
    if (!this.page) throw new Error('브라우저가 초기화되지 않았습니다.')

    await this._gotoAndSearchListPageByRange(startDate, endDate, registrationStatus)
    const products = await this._collectAllProductLinks()
    await this._processExtendProducts(products)
  }

  private async _gotoAndSearchListPageByRange(
    startDate: string,
    endDate: string,
    registrationStatus: string = '',
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

    await this.page!.selectOption('#search_date', 'LIMIT_DATE')
    await this.page!.fill('#search_date_start', startDate)
    await this.page!.fill('#search_date_end', endDate)
    if (registrationStatus) {
      await this.page!.check(`input[name="tgruStatus"][value="${registrationStatus}"]`)
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

  private async _processExtendProducts(
    products: {
      name: string
      link: string
      status?: 'success' | 'fail'
      errorMessage?: string
      extendedDate?: string | null
    }[],
  ): Promise<typeof products> {
    for (const product of products) {
      try {
        await this.page!.goto(product.link, { waitUntil: 'domcontentloaded' })
        await this.page!.waitForLoadState('domcontentloaded')

        const extendButton = this.page!.locator('a[href^="javascript:fnLimitDateUpdate()"]')
        if ((await extendButton.count()) === 0) {
          product.status = 'fail'
          product.errorMessage = '관리일 연장 버튼을 찾을 수 없습니다'
          this._log(`관리일 연장 버튼을 찾을 수 없습니다: ${product.name}`, 'error')
          continue
        }

        let isSuccess: boolean | undefined = undefined
        let errorMessage = ''

        const handleExtensionDialog = async (dialog: any) => {
          const message = dialog.message()
          switch (dialog.type()) {
            case 'alert':
              if (message.match(/\d{4}년\s\d{1,2}월\s\d{1,2}일\s까지\s관리기간이\s연장되었습니다/)) {
                isSuccess = true
                const dateMatch = message.match(/(\d{4}년\s\d{1,2}월\s\d{1,2}일)/)
                product.extendedDate = dateMatch ? dateMatch[1] : null
                await dialog.accept()
              } else {
                isSuccess = false
                errorMessage = message
                this._log(`관리일 연장 실패 - ${message}`, 'error')
                await dialog.dismiss()
              }
              break
            case 'confirm':
              if (message.includes('최종관리일을 연장하시겠습니까?')) {
                await dialog.accept()
              }
              break
          }
        }

        this.page!.on('dialog', handleExtensionDialog)
        try {
          await extendButton.click()
          try {
            await Promise.race([
              new Promise((_, reject) => setTimeout(() => reject(new Error('연장 다이얼로그 대기 시간 초과')), 5000)),
              new Promise<void>(resolve => {
                const checkInterval = setInterval(() => {
                  if (isSuccess !== undefined) {
                    clearInterval(checkInterval)
                    this.page!.off('dialog', handleExtensionDialog)
                    resolve()
                  }
                }, 100)
              }),
            ])
          } catch (error) {
            this.page!.off('dialog', handleExtensionDialog)
            product.status = 'fail'
            product.errorMessage = '연장 처리 중 타임아웃이 발생했습니다.'
            this._log(`관리일 연장 실패 (타임아웃) - ${product.name}`, 'error')
            continue
          }

          if (isSuccess) {
            product.status = 'success'
            this._log(`관리일 연장 성공: ${product.name} (${product.extendedDate}까지)`, 'info')
          } else {
            product.status = 'fail'
            product.errorMessage = errorMessage
            this._log(`관리일 연장 실패: ${product.name}`, 'error')
          }
        } finally {
          this.page!.off('dialog', handleExtensionDialog)
        }

        await delay(2000)
      } catch (error: any) {
        product.status = 'fail'
        product.errorMessage = error.message
        this._log(`상품 처리 중 오류가 발생했습니다 (${product.name}): ${error}`, 'error')
      }
    }

    const successProducts = products.filter(p => p.status === 'success')
    const failedProducts = products.filter(p => p.status === 'fail')

    this._log(
      `관리일 연장 처리 완료 - 총: ${products.length}개, 성공: ${successProducts.length}개, 실패: ${failedProducts.length}개`,
      successProducts.length === products.length ? 'info' : 'warning',
    )

    if (failedProducts.length > 0) {
      this._log('실패한 상품 목록:', 'error')
      failedProducts.forEach(product => {
        this._log(`- ${product.name}: ${product.errorMessage}`, 'error')
      })
    }
    return products
  }
}
