/*
  Seed department categories (HR, Engg, QA, Accounts) used as main vault folders.
  Subfolders are created at runtime by FolderService so they can attach to a real user.
  Safe to re-run: skips rows that already exist by Code.
*/
BEGIN TRY
BEGIN TRAN;

IF NOT EXISTS (SELECT 1 FROM [dbo].[FileCategories] WHERE [Code] = N'HR')
  INSERT INTO [dbo].[FileCategories] ([CategoryId], [Code], [Name], [SortOrder], [IsSystem])
  VALUES (NEWID(), N'HR', N'HR', 30, 1);

IF NOT EXISTS (SELECT 1 FROM [dbo].[FileCategories] WHERE [Code] = N'ENGG')
  INSERT INTO [dbo].[FileCategories] ([CategoryId], [Code], [Name], [SortOrder], [IsSystem])
  VALUES (NEWID(), N'ENGG', N'Engg', 40, 1);

UPDATE [dbo].[FileCategories]
SET [Name] = N'Engg'
WHERE [Code] = N'ENGG' AND [Name] <> N'Engg';

IF NOT EXISTS (SELECT 1 FROM [dbo].[FileCategories] WHERE [Code] = N'QA')
  INSERT INTO [dbo].[FileCategories] ([CategoryId], [Code], [Name], [SortOrder], [IsSystem])
  VALUES (NEWID(), N'QA', N'QA', 70, 1);

IF NOT EXISTS (SELECT 1 FROM [dbo].[FileCategories] WHERE [Code] = N'ACCOUNTS')
  INSERT INTO [dbo].[FileCategories] ([CategoryId], [Code], [Name], [SortOrder], [IsSystem])
  VALUES (NEWID(), N'ACCOUNTS', N'Accounts', 80, 1);

COMMIT TRAN;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRAN;
  THROW;
END CATCH;
