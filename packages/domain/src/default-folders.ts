/**
 * Default department folder tree for the document vault.
 * Category codes are stable identifiers. Names are create-if-missing only —
 * operator edits in the database are not overwritten at runtime.
 */
export interface DefaultFolderChild {
  name: string
  sortOrder: number
  /** Legacy names that should be renamed to `name` instead of creating a duplicate. */
  aliases?: readonly string[]
}

export interface DefaultFolderTreeNode {
  code: string
  name: string
  sortOrder: number
  children: readonly DefaultFolderChild[]
}

export const DEFAULT_VAULT_FOLDER_TREE: readonly DefaultFolderTreeNode[] = [
  {
    code: 'HR',
    name: 'HR',
    sortOrder: 30,
    children: [
      { name: 'Personnel file', sortOrder: 10 },
      { name: 'Bonus data', sortOrder: 20 },
      { name: 'Increment day', sortOrder: 30 },
      { name: 'Actions', sortOrder: 40 },
      { name: 'Punishment', sortOrder: 50 }
    ]
  },
  {
    code: 'ENGG',
    name: 'Engineering',
    sortOrder: 40,
    children: [
      { name: 'Customer Drawing', sortOrder: 10, aliases: ['Customer drawings'] },
      { name: 'Forging Drawing', sortOrder: 20 },
      { name: 'Process Sheet', sortOrder: 30, aliases: ['Process sheets'] },
      { name: 'Control Plan', sortOrder: 40, aliases: ['Control plan'] },
      { name: 'FMEA', sortOrder: 50 },
      {
        name: 'Gauges/POKA',
        sortOrder: 60,
        aliases: ['Gauge / Poka', 'Gauges / POKA', 'Gauge / Poka-yoke']
      },
      { name: 'Inward Quality Plan', sortOrder: 70 },
      { name: 'Final Quality Plan', sortOrder: 80 }
    ]
  },
  {
    code: 'QA',
    name: 'QA',
    sortOrder: 70,
    children: [
      { name: 'Due', sortOrder: 10 },
      { name: 'Action plan', sortOrder: 20 },
      { name: 'Gauge list', sortOrder: 30 }
    ]
  },
  {
    code: 'ACCOUNTS',
    name: 'Accounts',
    sortOrder: 80,
    children: [
      { name: 'Balance sheet', sortOrder: 10 },
      { name: 'MSEB Bill', sortOrder: 20 },
      { name: 'GST Challan', sortOrder: 30 },
      { name: 'Income tax', sortOrder: 40 }
    ]
  }
]
