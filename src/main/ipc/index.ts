import { registerAdminIpc } from './admin.ipc'
import { registerAuthIpc } from './auth.ipc'
import { registerFilesIpc } from './files.ipc'
import { registerFoldersIpc } from './folders.ipc'

/**
 * Registers all main-process IPC handlers once at app start.
 */
export function registerAllIpc(): void {
  registerAuthIpc()
  registerFilesIpc()
  registerFoldersIpc()
  registerAdminIpc()
}
