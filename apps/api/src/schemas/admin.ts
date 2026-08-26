import { z } from 'zod'

import { folderGrantSchema, idSchema, passwordSchema, roleCodeSchema, usernameSchema } from './primitives'

export const userIdParamsSchema = z.strictObject({
  userId: idSchema
})

export const folderIdParamsSchema = z.strictObject({
  folderId: idSchema
})

export const folderAclIdParamsSchema = z.strictObject({
  folderAclId: idSchema
})

export const createUserBodySchema = z.strictObject({
  username: usernameSchema,
  password: passwordSchema,
  roleCode: roleCodeSchema.optional(),
  grantAllCategoryRoots: z.boolean().optional(),
  folderIds: z.array(idSchema).max(500).optional(),
  folderGrants: z.array(folderGrantSchema).max(500).optional()
})

export const setUserRolesBodySchema = z.strictObject({
  roleCodes: z.array(roleCodeSchema).min(1).max(8)
})

export const setUserDisabledBodySchema = z.strictObject({
  isDisabled: z.boolean()
})

export const setUserFolderAccessBodySchema = z.strictObject({
  grants: z.array(folderGrantSchema).max(500).optional(),
  folderIds: z.array(idSchema).max(500).optional()
})

export const setFolderAclBodySchema = z.strictObject({
  principalType: z.enum(['USER', 'ROLE']).optional(),
  /** User UUID, or a role UUID / role code when principalType is ROLE. */
  principalId: z.string().trim().min(1).max(50),
  canView: z.boolean().optional(),
  canEdit: z.boolean().optional(),
  canCopy: z.boolean().optional(),
  canDelete: z.boolean().optional(),
  inherit: z.boolean().optional()
})
