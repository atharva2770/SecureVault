/*
  Seed default file categories into FileCategories (database source of truth).
  Safe to re-run: skips rows that already exist by Code.
*/
BEGIN TRY
BEGIN TRAN;

IF NOT EXISTS (SELECT 1 FROM [dbo].[FileCategories] WHERE [Code] = N'RAILWAY_TENDER')
  INSERT INTO [dbo].[FileCategories] ([CategoryId], [Code], [Name], [SortOrder], [IsSystem])
  VALUES (NEWID(), N'RAILWAY_TENDER', N'Railway Tender', 10, 1);

IF NOT EXISTS (SELECT 1 FROM [dbo].[FileCategories] WHERE [Code] = N'DEFENCE_TENDER')
  INSERT INTO [dbo].[FileCategories] ([CategoryId], [Code], [Name], [SortOrder], [IsSystem])
  VALUES (NEWID(), N'DEFENCE_TENDER', N'Defence Tender', 20, 1);

IF NOT EXISTS (SELECT 1 FROM [dbo].[FileCategories] WHERE [Code] = N'HR')
  INSERT INTO [dbo].[FileCategories] ([CategoryId], [Code], [Name], [SortOrder], [IsSystem])
  VALUES (NEWID(), N'HR', N'HR', 30, 1);

IF NOT EXISTS (SELECT 1 FROM [dbo].[FileCategories] WHERE [Code] = N'ENGG')
  INSERT INTO [dbo].[FileCategories] ([CategoryId], [Code], [Name], [SortOrder], [IsSystem])
  VALUES (NEWID(), N'ENGG', N'Engineering', 40, 1);

IF NOT EXISTS (SELECT 1 FROM [dbo].[FileCategories] WHERE [Code] = N'NPD')
  INSERT INTO [dbo].[FileCategories] ([CategoryId], [Code], [Name], [SortOrder], [IsSystem])
  VALUES (NEWID(), N'NPD', N'NPD', 50, 1);

IF NOT EXISTS (SELECT 1 FROM [dbo].[FileCategories] WHERE [Code] = N'OTHER')
  INSERT INTO [dbo].[FileCategories] ([CategoryId], [Code], [Name], [SortOrder], [IsSystem])
  VALUES (NEWID(), N'OTHER', N'Other', 60, 1);

COMMIT TRAN;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRAN;
  THROW;
END CATCH;
