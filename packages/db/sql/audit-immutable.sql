/*
  Application-layer immutability for AuditLogs.

  UPDATE is always rejected. DELETE is rejected unless the session has
  CONTEXT sv_audit_prune = 1 (used only by the retention job in
  audit-retention.sql).

  Run once against the SecureVault database as a DBA.
*/

IF OBJECT_ID(N'dbo.TR_AuditLogs_Immutable', N'TR') IS NOT NULL
  DROP TRIGGER [dbo].[TR_AuditLogs_Immutable];
GO

CREATE TRIGGER [dbo].[TR_AuditLogs_Immutable]
ON [dbo].[AuditLogs]
AFTER UPDATE, DELETE
AS
BEGIN
  SET NOCOUNT ON;
  IF CONVERT(int, SESSION_CONTEXT(N'sv_audit_prune')) = 1
    RETURN;

  RAISERROR(N'AuditLogs are append-only. Only the retention job may prune rows.', 16, 1);
  ROLLBACK TRANSACTION;
END;
GO
