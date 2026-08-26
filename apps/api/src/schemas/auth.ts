import { z } from 'zod'

import { loginUsernameSchema, passwordSchema, usernameSchema } from './primitives'

export const registerBodySchema = z.strictObject({
  username: usernameSchema,
  password: passwordSchema
})

export const loginBodySchema = z.strictObject({
  username: loginUsernameSchema,
  password: passwordSchema
})

export const changePasswordBodySchema = z.strictObject({
  currentPassword: passwordSchema,
  newPassword: passwordSchema
})
