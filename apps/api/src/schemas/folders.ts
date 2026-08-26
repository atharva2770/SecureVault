import { z } from 'zod'

import {
  categoryCodeSchema,
  categoryNameSchema,
  folderNameSchema,
  idSchema
} from './primitives'

export const folderIdParamsSchema = z.strictObject({
  folderId: idSchema
})

export const createFolderBodySchema = z.strictObject({
  name: folderNameSchema,
  parentFolderId: idSchema
})

export const createCategoryBodySchema = z.strictObject({
  name: categoryNameSchema,
  code: categoryCodeSchema.optional()
})
