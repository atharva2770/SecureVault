/*
  Per-category file password policy (P0-04, findings F6/F7/F8).

  A per-file access password is now required only for categories that opt in.
  Everywhere else the folder ACL is the access control, and AccessPasswordHash
  is NULL.

  Additive and idempotent. No column is dropped or renamed, and existing Files
  rows keep the hash they already carry — scripts/repair-file-passwords.mjs
  clears those separately and deliberately, after this migration is deployed.

  EXEC() is required for the ALTER COLUMN: SQL Server resolves the whole batch
  up front, so an alter in the same batch as a column add must be deferred.
  Do not use GO — Prisma migrate sends this as one T-SQL batch.

  Rollback (run manually; this repo keeps no down migrations):

    UPDATE [dbo].[Files]
    SET [AccessPasswordHash] = N'LEGACY_REQUIRES_REUPLOAD'
    WHERE [AccessPasswordHash] IS NULL;

    EXEC(N'ALTER TABLE [dbo].[Files] ALTER COLUMN [AccessPasswordHash] NVARCHAR(500) NOT NULL');

    ALTER TABLE [dbo].[FileCategories] DROP CONSTRAINT [DF_FileCategories_RequiresFilePassword];
    ALTER TABLE [dbo].[FileCategories] DROP COLUMN [RequiresFilePassword];

  The backfill is mandatory before restoring NOT NULL. Note that reverting the
  application code alone is safe only while every row still has a non-null hash;
  once the repair script has run, the old always-verify code cannot open those
  files.
*/

BEGIN TRY
BEGIN TRAN;

IF COL_LENGTH(N'dbo.FileCategories', N'RequiresFilePassword') IS NULL
  ALTER TABLE [dbo].[FileCategories] ADD [RequiresFilePassword] BIT NOT NULL
    CONSTRAINT [DF_FileCategories_RequiresFilePassword] DEFAULT 0;

IF EXISTS (
  SELECT 1 FROM sys.columns
  WHERE [object_id] = OBJECT_ID(N'dbo.Files')
    AND [name] = N'AccessPasswordHash'
    AND [is_nullable] = 0
)
  EXEC(N'ALTER TABLE [dbo].[Files] ALTER COLUMN [AccessPasswordHash] NVARCHAR(500) NULL');

-- Opt-in categories. Operators may flip any category later with a plain UPDATE;
-- no migration is needed for that.
EXEC(N'
  UPDATE [dbo].[FileCategories]
  SET [RequiresFilePassword] = 1
  WHERE [Code] IN (N''DEFENCE_TENDER'', N''ACCOUNTS'')
    AND [RequiresFilePassword] = 0;
');

COMMIT TRAN;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRAN;
  THROW;
END CATCH;
