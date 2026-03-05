import { atom } from 'recoil'
import { AtomEffect } from 'recoil'
import type { SourcingItem, SourcingSettings, SourcingConfigSet } from '../../electron/types/sourcingItems'

export type { SourcingItem, SourcingSettings, SourcingConfigSet }

// 소싱 아이템들을 저장하는 atom
export const sourcingItemsState = atom<SourcingItem[]>({
  key: 'sourcingItemsState',
  default: [],
})

// 선택된 소싱 아이템들의 키를 저장하는 atom
export const selectedSourcingKeysState = atom<React.Key[]>({
  key: 'selectedSourcingKeysState',
  default: [],
})

// 소싱 설정을 저장하는 atom
export const sourcingSettingsState = atom<SourcingSettings>({
  key: 'sourcingSettingsState',
  default: {
    marginRate: 20,
    detailHtmlTemplate: '<p>상세설명을 입력하세요.</p>',
    s2bMinDelaySec: 5, // 기본값: 5초
    s2bMaxDelaySec: 30, // 기본값: 30초
  },
})

// 설정값 세트들을 저장하는 atom
export const sourcingConfigSetsState = atom<SourcingConfigSet[]>({
  key: 'sourcingConfigSetsState',
  default: [],
})

// 현재 활성화된 설정값 세트 ID를 저장하는 atom
export const activeConfigSetIdState = atom<string | null>({
  key: 'activeConfigSetIdState',
  default: null,
})

// localStorage와 동기화하는 effect
const localStorageEffect: <T>(key: string) => AtomEffect<T> =
  key =>
  ({ setSelf, onSet }) => {
    const savedValue = localStorage.getItem(key)
    if (savedValue != null) {
      setSelf(JSON.parse(savedValue))
    }

    onSet((newValue, _, isReset) => {
      isReset ? localStorage.removeItem(key) : localStorage.setItem(key, JSON.stringify(newValue))
    })
  }

// 영상 collapse 상태를 저장하는 atom
export const videoCollapsedState = atom<boolean>({
  key: 'videoCollapsedState',
  default: false,
  effects: [localStorageEffect<boolean>('sourcing-video-collapsed')],
})
