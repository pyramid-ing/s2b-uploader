export const fetchCredits = async (s2bId: string | null | undefined): Promise<number | null> => {
  try {
    if (!s2bId) return null
    const { ipcRenderer } = (window as any).require('electron')
    const response = await ipcRenderer.invoke('get-credits', { s2bId })
    const balance = response?.balance
    return typeof balance === 'number' ? balance : null
  } catch (error) {
    console.error('크레딧 조회 실패:', error)
    return null
  }
}
