import { z } from 'zod'

/** UUID-shaped ids (MSSQL uniqueidentifier is hex-hyphenated, not always RFC variant). */
export const idSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Invalid id.')

export const usernameSchema = z.string().trim().min(3).max(100)
export const loginUsernameSchema = z.string().trim().min(1).max(100)
export const passwordSchema = z.string().min(1).max(4096)
export const folderNameSchema = z.string().trim().min(1).max(255)
export const displayNameSchema = z.string().trim().min(1).max(500)
export const categoryNameSchema = z.string().trim().min(1).max(100)
export const categoryCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9_]{1,50}$/)

export const roleCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .pipe(z.enum(['ADMIN', 'MANAGER', 'MEMBER', 'VIEWER']))

export const folderGrantSchema = z.strictObject({
  folderId: idSchema,
  canView: z.boolean(),
  canEdit: z.boolean(),
  canCopy: z.boolean(),
  canDelete: z.boolean(),
  inherit: z.boolean().optional()
})
