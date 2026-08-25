/**
 * Default department folder tree for the document vault.
 * Category codes are stable; names and children can be shown in the sidebar.
 */
export interface DefaultFolderTreeNode {
  code: string
  name: string
  sortOrder: number
  children: readonly string[]
}

export const DEFAULT_VAULT_FOLDER_TREE: readonly DefaultFolderTreeNode[] = [
  {
    code: 'HR',
    name: 'HR',
    sortOrder: 30,
    children: ['Personnel file', 'Bonus data', 'Increment day', 'Actions', 'Punishment']
  },
  {
    code: 'ENGG',
    name: 'Engg',
    sortOrder: 40,
    children: [
      'Customer drawings',
      'Process sheets',
      'Control plan',
      'FMEA',
      'Gauge / Poka'
    ]
  },
  {
    code: 'QA',
    name: 'QA',
    sortOrder: 70,
    children: ['Due', 'Action plan', 'Gauge list']
  },
  {
    code: 'ACCOUNTS',
    name: 'Accounts',
    sortOrder: 80,
    children: ['Balance sheet', 'MSEB Bill', 'GST Challan', 'Income tax']
  }
]
