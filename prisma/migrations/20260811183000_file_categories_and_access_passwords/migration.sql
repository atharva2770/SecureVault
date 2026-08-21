/*
  File categories + per-file access password + category folders.
  Uses EXEC() for backfill so SQL Server can see newly added columns.
*/
BEGIN TRY
BEGIN TRAN;

IF OBJECT_ID(N'[dbo].[FileCategories]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[FileCategories] (
    [CategoryId] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [FileCategories_CategoryId_df] DEFAULT NEWSEQUENTIALID(),
    [Code] NVARCHAR(50) NOT NULL,
    [Name] NVARCHAR(100) NOT NULL,
    [SortOrder] INT NOT NULL CONSTRAINT [FileCategories_SortOrder_df] DEFAULT 0,
    [IsSystem] BIT NOT NULL CONSTRAINT [FileCategories_IsSystem_df] DEFAULT 1,
    [CreatedAt] DATETIME2 NOT NULL CONSTRAINT [FileCategories_CreatedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [FileCategories_pkey] PRIMARY KEY ([CategoryId]),
    CONSTRAINT [FileCategories_Code_key] UNIQUE ([Code])
  );
END;

IF COL_LENGTH('dbo.Folders', 'CategoryId') IS NULL
BEGIN
  ALTER TABLE [dbo].[Folders] ADD [CategoryId] UNIQUEIDENTIFIER NULL;
END;

IF COL_LENGTH('dbo.Folders', 'IsCategoryRoot') IS NULL
BEGIN
  ALTER TABLE [dbo].[Folders] ADD [IsCategoryRoot] BIT NOT NULL CONSTRAINT [Folders_IsCategoryRoot_df] DEFAULT 0;
END;

IF COL_LENGTH('dbo.Files', 'DisplayName') IS NULL
BEGIN
  ALTER TABLE [dbo].[Files] ADD [DisplayName] NVARCHAR(500) NULL;
END;

IF COL_LENGTH('dbo.Files', 'CategoryId') IS NULL
BEGIN
  ALTER TABLE [dbo].[Files] ADD [CategoryId] UNIQUEIDENTIFIER NULL;
END;

IF COL_LENGTH('dbo.Files', 'AccessPasswordHash') IS NULL
BEGIN
  ALTER TABLE [dbo].[Files] ADD [AccessPasswordHash] NVARCHAR(500) NULL;
END;

EXEC(N'
  UPDATE [dbo].[Files]
  SET [DisplayName] = [OriginalFileName]
  WHERE [DisplayName] IS NULL OR LTRIM(RTRIM([DisplayName])) = '''';
');

EXEC(N'
  UPDATE [dbo].[Files]
  SET [AccessPasswordHash] = ''LEGACY_REQUIRES_REUPLOAD''
  WHERE [AccessPasswordHash] IS NULL OR LTRIM(RTRIM([AccessPasswordHash])) = '''';
');

EXEC(N'ALTER TABLE [dbo].[Files] ALTER COLUMN [DisplayName] NVARCHAR(500) NOT NULL');
EXEC(N'ALTER TABLE [dbo].[Files] ALTER COLUMN [AccessPasswordHash] NVARCHAR(500) NOT NULL');

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes WHERE name = N'Files_CategoryId_idx' AND object_id = OBJECT_ID(N'dbo.Files')
)
BEGIN
  CREATE NONCLUSTERED INDEX [Files_CategoryId_idx] ON [dbo].[Files]([CategoryId]);
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes WHERE name = N'Folders_CategoryId_idx' AND object_id = OBJECT_ID(N'dbo.Folders')
)
BEGIN
  CREATE NONCLUSTERED INDEX [Folders_CategoryId_idx] ON [dbo].[Folders]([CategoryId]);
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.foreign_keys WHERE name = N'Folders_CategoryId_fkey'
)
BEGIN
  ALTER TABLE [dbo].[Folders]
    ADD CONSTRAINT [Folders_CategoryId_fkey]
    FOREIGN KEY ([CategoryId]) REFERENCES [dbo].[FileCategories]([CategoryId])
    ON DELETE NO ACTION ON UPDATE NO ACTION;
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.foreign_keys WHERE name = N'Files_CategoryId_fkey'
)
BEGIN
  ALTER TABLE [dbo].[Files]
    ADD CONSTRAINT [Files_CategoryId_fkey]
    FOREIGN KEY ([CategoryId]) REFERENCES [dbo].[FileCategories]([CategoryId])
    ON DELETE NO ACTION ON UPDATE NO ACTION;
END;

COMMIT TRAN;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRAN;
  THROW;
END CATCH;
