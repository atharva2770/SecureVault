import { z } from 'zod'

import { displayNameSchema, idSchema } from './primitives'

export const fileIdParamsSchema = z.strictObject({
  fileId: idSchema
})

export const listFilesQuerySchema = z.strictObject({
  folderId: idSchema.optional(),
  categoryId: idSchema.optional()
})

export const searchQuerySchema = z.strictObject({
  q: z.string().trim().min(1).max(200)
})

export const downloadFileBodySchema = z.strictObject({
  password: z.string().min(1).max(1000),
  intent: z.enum(['view', 'copy', 'open', 'download']).optional()
})

export const moveOrCopyBodySchema = z.strictObject({
  targetFolderId: idSchema
})

export const renameFileBodySchema = z.strictObject({
  displayName: displayNameSchema
})

export const uploadFieldsSchema = z.strictObject({
  displayName: displayNameSchema,
  categoryId: idSchema,
  folderId: idSchema.optional()
})
