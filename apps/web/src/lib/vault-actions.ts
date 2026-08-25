import type { FolderDto, FolderRights } from '@securevault/domain'
import { EMPTY_RIGHTS } from '@securevault/domain'

/** Effective ACL for a folder, or none if the folder is unknown. */
export function folderRightsOf(
  folders: FolderDto[],
  folderId: string | null | undefined
): FolderRights {
  if (!folderId) return EMPTY_RIGHTS
  return folders.find((f) => f.folderId === folderId)?.rights ?? EMPTY_RIGHTS
}

/**
 * Maps FolderAcls flags to vault UI actions.
 * Hide (do not disable) controls the user cannot use.
 */
export function vaultActions(rights: FolderRights) {
  return {
    view: rights.view,
    download: rights.copy,
    copy: rights.copy,
    rename: rights.edit,
    move: rights.edit,
    upload: rights.edit,
    newFolder: rights.edit,
    paste: rights.edit,
    cut: rights.delete,
    delete: rights.delete
  }
}

export type VaultActionFlags = ReturnType<typeof vaultActions>
