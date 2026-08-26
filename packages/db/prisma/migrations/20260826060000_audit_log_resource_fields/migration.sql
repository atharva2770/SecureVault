/*
  AuditLogs schema expansion: structured resource ids + separate IP / UA.
  Existing rows keep IPOrDevice; new writes populate Ip + UserAgent.
*/
BEGIN TRY
BEGIN TRAN;

IF COL_LENGTH('dbo.AuditLogs', 'FolderId') IS NULL
  ALTER TABLE [dbo].[AuditLogs] ADD [FolderId] UNIQUEIDENTIFIER NULL;

IF COL_LENGTH('dbo.AuditLogs', 'CategoryId') IS NULL
  ALTER TABLE [dbo].[AuditLogs] ADD [CategoryId] UNIQUEIDENTIFIER NULL;

IF COL_LENGTH('dbo.AuditLogs', 'Ip') IS NULL
  ALTER TABLE [dbo].[AuditLogs] ADD [Ip] NVARCHAR(64) NULL;

IF COL_LENGTH('dbo.AuditLogs', 'UserAgent') IS NULL
  ALTER TABLE [dbo].[AuditLogs] ADD [UserAgent] NVARCHAR(300) NULL;

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes WHERE name = N'IX_AuditLogs_UserId_Timestamp' AND object_id = OBJECT_ID(N'dbo.AuditLogs')
)
  CREATE NONCLUSTERED INDEX [IX_AuditLogs_UserId_Timestamp]
    ON [dbo].[AuditLogs] ([UserId], [Timestamp] DESC);

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes WHERE name = N'IX_AuditLogs_CategoryId_Timestamp' AND object_id = OBJECT_ID(N'dbo.AuditLogs')
)
  CREATE NONCLUSTERED INDEX [IX_AuditLogs_CategoryId_Timestamp]
    ON [dbo].[AuditLogs] ([CategoryId], [Timestamp] DESC);

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes WHERE name = N'IX_AuditLogs_Action_Timestamp' AND object_id = OBJECT_ID(N'dbo.AuditLogs')
)
  CREATE NONCLUSTERED INDEX [IX_AuditLogs_Action_Timestamp]
    ON [dbo].[AuditLogs] ([Action], [Timestamp] DESC);

COMMIT TRAN;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRAN;
  THROW;
END CATCH;
