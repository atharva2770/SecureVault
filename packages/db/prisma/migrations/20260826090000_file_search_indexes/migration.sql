/*
  Search indexes for DOCMAN.

  1) B-tree (folder / module scoped search)
     IX_Files_FolderId_DisplayName
       Seek: FolderId = @id AND DisplayName LIKE @prefix + '%'
       Expected: Index Seek, not a clustered scan of Files.
     IX_Files_CategoryId_FolderId_DisplayName
       Seek: CategoryId = @module AND FolderId IN (...) AND DisplayName LIKE @prefix + '%'

  2) Full-text (global vault search)
     Catalog FTC_SecureVault, index on DisplayName + OriginalFileName.
     Queried via CONTAINSTABLE (RANK) — never LIKE '%term%'.
     Requires SQL Server Full-Text Search. If the feature is not installed,
     FTS creation is skipped; B-tree indexes are still applied.

  Do not use GO — Prisma migrate sends this as one T-SQL batch.
*/

BEGIN TRY
BEGIN TRAN;

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'IX_Files_FolderId_DisplayName' AND object_id = OBJECT_ID(N'dbo.Files')
)
  CREATE NONCLUSTERED INDEX [IX_Files_FolderId_DisplayName]
    ON [dbo].[Files] ([FolderId], [DisplayName])
    WHERE [IsDeleted] = 0;

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'IX_Files_CategoryId_FolderId_DisplayName' AND object_id = OBJECT_ID(N'dbo.Files')
)
  CREATE NONCLUSTERED INDEX [IX_Files_CategoryId_FolderId_DisplayName]
    ON [dbo].[Files] ([CategoryId], [FolderId], [DisplayName])
    WHERE [IsDeleted] = 0;

COMMIT TRAN;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRAN;
  THROW;
END CATCH;

IF FULLTEXTSERVICEPROPERTY('IsFullTextInstalled') = 1
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sys.fulltext_catalogs WHERE name = N'FTC_SecureVault')
    CREATE FULLTEXT CATALOG [FTC_SecureVault] AS DEFAULT;

  IF NOT EXISTS (
    SELECT 1 FROM sys.fulltext_indexes WHERE object_id = OBJECT_ID(N'dbo.Files')
  )
  BEGIN
    DECLARE @pk sysname;
    SELECT @pk = kc.name
    FROM sys.key_constraints kc
    WHERE kc.parent_object_id = OBJECT_ID(N'dbo.Files') AND kc.[type] = 'PK';

    IF @pk IS NOT NULL
    BEGIN
      DECLARE @sql nvarchar(max) = N'
        CREATE FULLTEXT INDEX ON [dbo].[Files] (
          [DisplayName] LANGUAGE 1033,
          [OriginalFileName] LANGUAGE 1033
        )
        KEY INDEX ' + QUOTENAME(@pk) + N'
        ON [FTC_SecureVault]
        WITH CHANGE_TRACKING AUTO;';
      EXEC sys.sp_executesql @sql;
    END
  END
END;
