-- Phase 0–1 RBAC: Permissions, Roles, UserRoles, FolderAcls + bootstrap

-- Users.IsDisabled
IF COL_LENGTH('dbo.Users', 'IsDisabled') IS NULL
BEGIN
  ALTER TABLE [dbo].[Users] ADD [IsDisabled] BIT NOT NULL CONSTRAINT [DF_Users_IsDisabled] DEFAULT 0;
END;

IF OBJECT_ID(N'[dbo].[Permissions]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[Permissions] (
    [PermissionId] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [PK_Permissions] PRIMARY KEY,
    [Code] NVARCHAR(50) NOT NULL,
    [Name] NVARCHAR(100) NOT NULL,
    [Description] NVARCHAR(300) NULL,
    CONSTRAINT [UQ_Permissions_Code] UNIQUE ([Code])
  );
END;

IF OBJECT_ID(N'[dbo].[Roles]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[Roles] (
    [RoleId] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [PK_Roles] PRIMARY KEY,
    [Code] NVARCHAR(50) NOT NULL,
    [Name] NVARCHAR(100) NOT NULL,
    [Description] NVARCHAR(300) NULL,
    [IsSystem] BIT NOT NULL CONSTRAINT [DF_Roles_IsSystem] DEFAULT 1,
    [CreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_Roles_CreatedAt] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [UQ_Roles_Code] UNIQUE ([Code])
  );
END;

IF OBJECT_ID(N'[dbo].[RolePermissions]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[RolePermissions] (
    [RoleId] UNIQUEIDENTIFIER NOT NULL,
    [PermissionId] UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT [PK_RolePermissions] PRIMARY KEY ([RoleId], [PermissionId]),
    CONSTRAINT [FK_RolePermissions_Roles] FOREIGN KEY ([RoleId]) REFERENCES [dbo].[Roles]([RoleId]),
    CONSTRAINT [FK_RolePermissions_Permissions] FOREIGN KEY ([PermissionId]) REFERENCES [dbo].[Permissions]([PermissionId])
  );
END;

IF OBJECT_ID(N'[dbo].[UserRoles]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[UserRoles] (
    [UserId] UNIQUEIDENTIFIER NOT NULL,
    [RoleId] UNIQUEIDENTIFIER NOT NULL,
    [AssignedAt] DATETIME2 NOT NULL CONSTRAINT [DF_UserRoles_AssignedAt] DEFAULT CURRENT_TIMESTAMP,
    [AssignedBy] UNIQUEIDENTIFIER NULL,
    CONSTRAINT [PK_UserRoles] PRIMARY KEY ([UserId], [RoleId]),
    CONSTRAINT [FK_UserRoles_Users] FOREIGN KEY ([UserId]) REFERENCES [dbo].[Users]([UserId]),
    CONSTRAINT [FK_UserRoles_Roles] FOREIGN KEY ([RoleId]) REFERENCES [dbo].[Roles]([RoleId])
  );
  CREATE INDEX [IX_UserRoles_RoleId] ON [dbo].[UserRoles]([RoleId]);
END;

IF OBJECT_ID(N'[dbo].[FolderAcls]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[FolderAcls] (
    [FolderAclId] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [PK_FolderAcls] PRIMARY KEY,
    [FolderId] UNIQUEIDENTIFIER NOT NULL,
    [PrincipalType] NVARCHAR(10) NOT NULL,
    [PrincipalId] UNIQUEIDENTIFIER NOT NULL,
    [CanView] BIT NOT NULL CONSTRAINT [DF_FolderAcls_CanView] DEFAULT 1,
    [CanEdit] BIT NOT NULL CONSTRAINT [DF_FolderAcls_CanEdit] DEFAULT 0,
    [CanCopy] BIT NOT NULL CONSTRAINT [DF_FolderAcls_CanCopy] DEFAULT 0,
    [CanDelete] BIT NOT NULL CONSTRAINT [DF_FolderAcls_CanDelete] DEFAULT 0,
    [Inherit] BIT NOT NULL CONSTRAINT [DF_FolderAcls_Inherit] DEFAULT 1,
    [GrantedBy] UNIQUEIDENTIFIER NULL,
    [GrantedAt] DATETIME2 NOT NULL CONSTRAINT [DF_FolderAcls_GrantedAt] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [UQ_FolderAcls_Folder_Principal] UNIQUE ([FolderId], [PrincipalType], [PrincipalId]),
    CONSTRAINT [FK_FolderAcls_Folders] FOREIGN KEY ([FolderId]) REFERENCES [dbo].[Folders]([FolderId]),
    CONSTRAINT [FK_FolderAcls_GrantedBy] FOREIGN KEY ([GrantedBy]) REFERENCES [dbo].[Users]([UserId])
  );
  CREATE INDEX [IX_FolderAcls_Principal] ON [dbo].[FolderAcls]([PrincipalType], [PrincipalId]);
  CREATE INDEX [IX_FolderAcls_FolderId] ON [dbo].[FolderAcls]([FolderId]);
END;

-- Stable system IDs
-- Permissions
DECLARE @P_VIEW UNIQUEIDENTIFIER = '11111111-1111-1111-1111-111111111001';
DECLARE @P_EDIT UNIQUEIDENTIFIER = '11111111-1111-1111-1111-111111111002';
DECLARE @P_COPY UNIQUEIDENTIFIER = '11111111-1111-1111-1111-111111111003';
DECLARE @P_DELETE UNIQUEIDENTIFIER = '11111111-1111-1111-1111-111111111004';
DECLARE @P_ADMIN_USERS UNIQUEIDENTIFIER = '11111111-1111-1111-1111-111111111005';
DECLARE @P_ADMIN_ACL UNIQUEIDENTIFIER = '11111111-1111-1111-1111-111111111006';

-- Roles
DECLARE @R_ADMIN UNIQUEIDENTIFIER = '22222222-2222-2222-2222-222222222001';
DECLARE @R_MANAGER UNIQUEIDENTIFIER = '22222222-2222-2222-2222-222222222002';
DECLARE @R_MEMBER UNIQUEIDENTIFIER = '22222222-2222-2222-2222-222222222003';
DECLARE @R_VIEWER UNIQUEIDENTIFIER = '22222222-2222-2222-2222-222222222004';

IF NOT EXISTS (SELECT 1 FROM [dbo].[Permissions] WHERE [Code] = N'VIEW')
  INSERT INTO [dbo].[Permissions] ([PermissionId],[Code],[Name],[Description])
  VALUES (@P_VIEW, N'VIEW', N'View', N'List folders and open files');
IF NOT EXISTS (SELECT 1 FROM [dbo].[Permissions] WHERE [Code] = N'EDIT')
  INSERT INTO [dbo].[Permissions] ([PermissionId],[Code],[Name],[Description])
  VALUES (@P_EDIT, N'EDIT', N'Edit', N'Upload, create folders, move into');
IF NOT EXISTS (SELECT 1 FROM [dbo].[Permissions] WHERE [Code] = N'COPY')
  INSERT INTO [dbo].[Permissions] ([PermissionId],[Code],[Name],[Description])
  VALUES (@P_COPY, N'COPY', N'Copy', N'Copy and download files');
IF NOT EXISTS (SELECT 1 FROM [dbo].[Permissions] WHERE [Code] = N'DELETE')
  INSERT INTO [dbo].[Permissions] ([PermissionId],[Code],[Name],[Description])
  VALUES (@P_DELETE, N'DELETE', N'Delete', N'Delete files/folders and cut out');
IF NOT EXISTS (SELECT 1 FROM [dbo].[Permissions] WHERE [Code] = N'ADMIN_USERS')
  INSERT INTO [dbo].[Permissions] ([PermissionId],[Code],[Name],[Description])
  VALUES (@P_ADMIN_USERS, N'ADMIN_USERS', N'Admin Users', N'Manage users and roles');
IF NOT EXISTS (SELECT 1 FROM [dbo].[Permissions] WHERE [Code] = N'ADMIN_ACL')
  INSERT INTO [dbo].[Permissions] ([PermissionId],[Code],[Name],[Description])
  VALUES (@P_ADMIN_ACL, N'ADMIN_ACL', N'Admin ACL', N'Grant folder permissions');

IF NOT EXISTS (SELECT 1 FROM [dbo].[Roles] WHERE [Code] = N'ADMIN')
  INSERT INTO [dbo].[Roles] ([RoleId],[Code],[Name],[Description],[IsSystem])
  VALUES (@R_ADMIN, N'ADMIN', N'Admin', N'Full vault administration', 1);
IF NOT EXISTS (SELECT 1 FROM [dbo].[Roles] WHERE [Code] = N'MANAGER')
  INSERT INTO [dbo].[Roles] ([RoleId],[Code],[Name],[Description],[IsSystem])
  VALUES (@R_MANAGER, N'MANAGER', N'Manager', N'Grant folder ACLs', 1);
IF NOT EXISTS (SELECT 1 FROM [dbo].[Roles] WHERE [Code] = N'MEMBER')
  INSERT INTO [dbo].[Roles] ([RoleId],[Code],[Name],[Description],[IsSystem])
  VALUES (@R_MEMBER, N'MEMBER', N'Member', N'Standard vault worker', 1);
IF NOT EXISTS (SELECT 1 FROM [dbo].[Roles] WHERE [Code] = N'VIEWER')
  INSERT INTO [dbo].[Roles] ([RoleId],[Code],[Name],[Description],[IsSystem])
  VALUES (@R_VIEWER, N'VIEWER', N'Viewer', N'Read-only capped role', 1);

-- Role → permission map
-- Admin: all
INSERT INTO [dbo].[RolePermissions] ([RoleId],[PermissionId])
SELECT @R_ADMIN, p.[PermissionId]
FROM [dbo].[Permissions] p
WHERE NOT EXISTS (
  SELECT 1 FROM [dbo].[RolePermissions] rp
  WHERE rp.[RoleId] = @R_ADMIN AND rp.[PermissionId] = p.[PermissionId]
);

-- Manager: VIEW EDIT COPY DELETE ADMIN_ACL
INSERT INTO [dbo].[RolePermissions] ([RoleId],[PermissionId])
SELECT @R_MANAGER, p.[PermissionId]
FROM [dbo].[Permissions] p
WHERE p.[Code] IN (N'VIEW', N'EDIT', N'COPY', N'DELETE', N'ADMIN_ACL')
  AND NOT EXISTS (
    SELECT 1 FROM [dbo].[RolePermissions] rp
    WHERE rp.[RoleId] = @R_MANAGER AND rp.[PermissionId] = p.[PermissionId]
  );

-- Member: VIEW EDIT COPY DELETE (folder ACL still required)
INSERT INTO [dbo].[RolePermissions] ([RoleId],[PermissionId])
SELECT @R_MEMBER, p.[PermissionId]
FROM [dbo].[Permissions] p
WHERE p.[Code] IN (N'VIEW', N'EDIT', N'COPY', N'DELETE')
  AND NOT EXISTS (
    SELECT 1 FROM [dbo].[RolePermissions] rp
    WHERE rp.[RoleId] = @R_MEMBER AND rp.[PermissionId] = p.[PermissionId]
  );

-- Viewer: VIEW only
INSERT INTO [dbo].[RolePermissions] ([RoleId],[PermissionId])
SELECT @R_VIEWER, p.[PermissionId]
FROM [dbo].[Permissions] p
WHERE p.[Code] = N'VIEW'
  AND NOT EXISTS (
    SELECT 1 FROM [dbo].[RolePermissions] rp
    WHERE rp.[RoleId] = @R_VIEWER AND rp.[PermissionId] = p.[PermissionId]
  );

-- Backfill UserRoles from legacy Users.Role
INSERT INTO [dbo].[UserRoles] ([UserId], [RoleId], [AssignedAt])
SELECT u.[UserId],
  CASE
    WHEN LOWER(u.[Role]) IN (N'admin', N'administrator') THEN @R_ADMIN
    WHEN LOWER(u.[Role]) = N'manager' THEN @R_MANAGER
    WHEN LOWER(u.[Role]) = N'viewer' THEN @R_VIEWER
    ELSE @R_MEMBER
  END,
  SYSUTCDATETIME()
FROM [dbo].[Users] u
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[UserRoles] ur WHERE ur.[UserId] = u.[UserId]);

-- If only one user exists, promote to Admin
IF (SELECT COUNT(*) FROM [dbo].[Users]) = 1
BEGIN
  DECLARE @OnlyUser UNIQUEIDENTIFIER = (SELECT TOP 1 [UserId] FROM [dbo].[Users]);
  DELETE FROM [dbo].[UserRoles] WHERE [UserId] = @OnlyUser;
  INSERT INTO [dbo].[UserRoles] ([UserId], [RoleId], [AssignedAt])
  VALUES (@OnlyUser, @R_ADMIN, SYSUTCDATETIME());
  UPDATE [dbo].[Users] SET [Role] = N'admin' WHERE [UserId] = @OnlyUser;
END;

-- Remap files from duplicate category roots onto the oldest root, then soft-delete extras
;WITH ranked AS (
  SELECT
    [FolderId],
    [CategoryId],
    ROW_NUMBER() OVER (PARTITION BY [CategoryId] ORDER BY [CreatedAt] ASC) AS [rn]
  FROM [dbo].[Folders]
  WHERE [IsCategoryRoot] = 1 AND [IsDeleted] = 0 AND [CategoryId] IS NOT NULL
),
canonical AS (
  SELECT [FolderId], [CategoryId] FROM ranked WHERE [rn] = 1
),
dupes AS (
  SELECT r.[FolderId], r.[CategoryId], c.[FolderId] AS [KeepFolderId]
  FROM ranked r
  INNER JOIN canonical c ON c.[CategoryId] = r.[CategoryId]
  WHERE r.[rn] > 1
)
UPDATE f
SET f.[FolderId] = d.[KeepFolderId]
FROM [dbo].[Files] f
INNER JOIN dupes d ON d.[FolderId] = f.[FolderId];

;WITH ranked2 AS (
  SELECT
    [FolderId],
    ROW_NUMBER() OVER (PARTITION BY [CategoryId] ORDER BY [CreatedAt] ASC) AS [rn]
  FROM [dbo].[Folders]
  WHERE [IsCategoryRoot] = 1 AND [IsDeleted] = 0 AND [CategoryId] IS NOT NULL
)
UPDATE [dbo].[Folders]
SET [IsDeleted] = 1
WHERE [FolderId] IN (SELECT [FolderId] FROM ranked2 WHERE [rn] > 1);

-- Also remount orphan subfolders that pointed at deleted duplicate roots onto kept root
;WITH ranked3 AS (
  SELECT
    [FolderId],
    [CategoryId],
    ROW_NUMBER() OVER (PARTITION BY [CategoryId] ORDER BY [CreatedAt] ASC) AS [rn]
  FROM [dbo].[Folders]
  WHERE [IsCategoryRoot] = 1 AND [CategoryId] IS NOT NULL
),
canonical3 AS (
  SELECT [FolderId], [CategoryId] FROM ranked3 WHERE [rn] = 1
)
UPDATE child
SET child.[ParentFolderId] = c.[FolderId]
FROM [dbo].[Folders] child
INNER JOIN [dbo].[Folders] parent ON parent.[FolderId] = child.[ParentFolderId]
INNER JOIN canonical3 c ON c.[CategoryId] = parent.[CategoryId]
WHERE parent.[IsCategoryRoot] = 1
  AND parent.[IsDeleted] = 1
  AND child.[IsDeleted] = 0;

-- Compatibility: grant existing users full rights on all category roots (Inherit)
INSERT INTO [dbo].[FolderAcls]
  ([FolderAclId], [FolderId], [PrincipalType], [PrincipalId], [CanView], [CanEdit], [CanCopy], [CanDelete], [Inherit], [GrantedAt])
SELECT NEWID(), f.[FolderId], N'USER', u.[UserId], 1, 1, 1, 1, 1, SYSUTCDATETIME()
FROM [dbo].[Folders] f
CROSS JOIN [dbo].[Users] u
WHERE f.[IsCategoryRoot] = 1 AND f.[IsDeleted] = 0
  AND NOT EXISTS (
    SELECT 1 FROM [dbo].[FolderAcls] a
    WHERE a.[FolderId] = f.[FolderId]
      AND a.[PrincipalType] = N'USER'
      AND a.[PrincipalId] = u.[UserId]
  );
