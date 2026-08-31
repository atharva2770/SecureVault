/*
  Add Folders.SortOrder and one-time Engg → Engineering rename.
  Subfolder rename/create/order is applied at runtime by FolderService
  (alias-aware) so existing rows are not duplicated.
  Do not use GO — Prisma migrate sends this as one T-SQL batch.
*/

BEGIN TRY
BEGIN TRAN;

IF COL_LENGTH(N'dbo.Folders', N'SortOrder') IS NULL
  ALTER TABLE [dbo].[Folders] ADD [SortOrder] INT NOT NULL
    CONSTRAINT [DF_Folders_SortOrder] DEFAULT 0;

UPDATE [dbo].[FileCategories]
SET [Name] = N'Engineering'
WHERE [Code] = N'ENGG' AND [Name] = N'Engg';

UPDATE f
SET f.[Name] = N'Engineering'
FROM [dbo].[Folders] AS f
INNER JOIN [dbo].[FileCategories] AS c ON c.[CategoryId] = f.[CategoryId]
WHERE f.[IsCategoryRoot] = 1
  AND f.[IsDeleted] = 0
  AND c.[Code] = N'ENGG'
  AND f.[Name] = N'Engg';

COMMIT TRAN;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRAN;
  THROW;
END CATCH;
