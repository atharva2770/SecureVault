/*
  Retention policy for AuditLogs (DBA-only).

  Application code has no delete/update endpoint. This script is the only
  supported prune path: it sets a session flag the immutability trigger honors.

  Default: keep 365 days. Adjust @KeepDays as needed, then run on a schedule
  (SQL Agent job recommended).
*/

DECLARE @KeepDays int = 365;

EXEC sys.sp_set_session_context @key = N'sv_audit_prune', @value = 1;

DELETE FROM [dbo].[AuditLogs]
WHERE [Timestamp] < DATEADD(day, -@KeepDays, SYSUTCDATETIME());

EXEC sys.sp_set_session_context @key = N'sv_audit_prune', @value = NULL;
