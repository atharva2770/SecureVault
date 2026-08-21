/**
 * Electron-only IPC channel names.
 * Keep secrets (KEK/DEK) out of these payloads — never send key material to the renderer.
 */
export const IpcChannels = {
  auth: {
    register: 'auth:register',
    login: 'auth:login',
    lock: 'auth:lock',
    session: 'auth:session',
    touch: 'auth:touch',
    changePassword: 'auth:changePassword'
  },
  files: {
    add: 'files:add',
    get: 'files:get',
    list: 'files:list',
    delete: 'files:delete',
    open: 'files:open',
    download: 'files:download',
    move: 'files:move',
    copy: 'files:copy'
  },
  folders: {
    list: 'folders:list',
    create: 'folders:create',
    delete: 'folders:delete'
  },
  categories: {
    list: 'categories:list',
    ensure: 'categories:ensure',
    create: 'categories:create'
  },
  admin: {
    listUsers: 'admin:listUsers',
    createUser: 'admin:createUser',
    setUserRoles: 'admin:setUserRoles',
    setUserDisabled: 'admin:setUserDisabled',
    listRoles: 'admin:listRoles',
    listAclFolders: 'admin:listAclFolders',
    listFolderAcls: 'admin:listFolderAcls',
    setFolderAcl: 'admin:setFolderAcl',
    revokeFolderAcl: 'admin:revokeFolderAcl',
    getMyAccess: 'admin:getMyAccess'
  },
  events: {
    vaultLocked: 'vault:locked'
  }
} as const
