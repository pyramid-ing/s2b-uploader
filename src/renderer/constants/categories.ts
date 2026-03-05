export interface CategoryOption {
  label: string
  value: string
  children?: CategoryOption[]
  g2bRequired?: boolean
}

/**
 * 평면 구조의 카테고리 데이터를 Cascader용 트리 구조로 변환하는 함수
 */
export const buildCategoryTree = (rows: any[]): CategoryOption[] => {
  const tree: CategoryOption[] = []

  rows.forEach(row => {
    const c1 = row['1차 카테고리'] || row['1차카테고리'] || row['카테고리1']
    const c2 = row['2차 카테고리'] || row['2차카테고리'] || row['카테고리2']
    const c3 = row['3차 카테고리'] || row['3차카테고리'] || row['카테고리3']
    const g2bValue = row['G2B'] || row['g2b']

    if (!c1) return

    let node1 = tree.find(n => n.value === c1)
    if (!node1) {
      node1 = { label: c1, value: c1, children: [] }
      tree.push(node1)
    }

    if (!c2) return
    let node2 = node1.children!.find(n => n.value === c2)
    if (!node2) {
      node2 = { label: c2, value: c2, children: [] }
      node1.children!.push(node2)
    }

    if (!c3) return
    let node3 = node2.children!.find(n => n.value === c3)
    if (!node3) {
      const g2bRequired = g2bValue !== undefined && g2bValue !== null && String(g2bValue).trim() !== ''
      node3 = { label: c3, value: c3, g2bRequired }
      node2.children!.push(node3)
    }
  })

  return tree
}
