BEGIN TRY

BEGIN TRAN;

-- CreateSchema
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = N'dbo') EXEC sp_executesql N'CREATE SCHEMA [dbo];';

-- CreateTable
CREATE TABLE [dbo].[AuditLogs] (
    [LogId] BIGINT NOT NULL IDENTITY(1,1),
    [UserId] UNIQUEIDENTIFIER,
    [FileId] UNIQUEIDENTIFIER,
    [Action] NVARCHAR(100) NOT NULL,
    [Details] NVARCHAR(max),
    [IPOrDevice] NVARCHAR(200),
    [Timestamp] DATETIME2 CONSTRAINT [DF__AuditLogs__Times__5165187F] DEFAULT sysutcdatetime(),
    CONSTRAINT [PK__AuditLog__5E54864880DB8527] PRIMARY KEY CLUSTERED ([LogId] ASC)
);

-- CreateTable
CREATE TABLE [dbo].[Devices] (
    [DeviceId] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF__Devices__DeviceI__619B8048] DEFAULT newid(),
    [UserId] UNIQUEIDENTIFIER NOT NULL,
    [DeviceName] NVARCHAR(150),
    [OS] NVARCHAR(50),
    [LastSeenAt] DATETIME2 CONSTRAINT [DF__Devices__LastSee__6383C8BA] DEFAULT sysutcdatetime(),
    CONSTRAINT [PK__Devices__49E123110301DBEB] PRIMARY KEY CLUSTERED ([DeviceId] ASC)
);

-- CreateTable
CREATE TABLE [dbo].[FilePermissions] (
    [FileId] UNIQUEIDENTIFIER NOT NULL,
    [UserId] UNIQUEIDENTIFIER NOT NULL,
    [AccessLevel] NVARCHAR(20) NOT NULL CONSTRAINT [DF__FilePermi__Acces__4E88ABD4] DEFAULT 'read',
    CONSTRAINT [PK__FilePerm__BE77147B00CFA2FF] PRIMARY KEY CLUSTERED ([FileId] ASC,[UserId] ASC)
);

-- CreateTable
CREATE TABLE [dbo].[Files] (
    [FileId] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF__Files__FileId__4316F928] DEFAULT newid(),
    [UserId] UNIQUEIDENTIFIER NOT NULL,
    [FolderId] UNIQUEIDENTIFIER,
    [OriginalFileName] NVARCHAR(500) NOT NULL,
    [StoredBlobPath] NVARCHAR(1000) NOT NULL,
    [MimeType] NVARCHAR(150),
    [SizeBytes] BIGINT NOT NULL,
    [Checksum] CHAR(64) NOT NULL,
    [WrappedDEK] VARBINARY(512) NOT NULL,
    [IV] VARBINARY(32) NOT NULL,
    [AuthTag] VARBINARY(32) NOT NULL,
    [Source] NVARCHAR(50) CONSTRAINT [DF__Files__Source__45F365D3] DEFAULT 'upload',
    [BatchId] UNIQUEIDENTIFIER,
    [Version] INT CONSTRAINT [DF__Files__Version__46E78A0C] DEFAULT 1,
    [CreatedAt] DATETIME2 CONSTRAINT [DF__Files__CreatedAt__47DBAE45] DEFAULT sysutcdatetime(),
    [UpdatedAt] DATETIME2 CONSTRAINT [DF__Files__UpdatedAt__48CFD27E] DEFAULT sysutcdatetime(),
    [IsDeleted] BIT CONSTRAINT [DF__Files__IsDeleted__49C3F6B7] DEFAULT 0,
    [DeletedAt] DATETIME2,
    CONSTRAINT [PK__Files__6F0F98BF87CDF5EA] PRIMARY KEY CLUSTERED ([FileId] ASC)
);

-- CreateTable
CREATE TABLE [dbo].[FileTags] (
    [FileId] UNIQUEIDENTIFIER NOT NULL,
    [TagId] UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT [PK__FileTags__B95857252BE81E34] PRIMARY KEY CLUSTERED ([FileId] ASC,[TagId] ASC)
);

-- CreateTable
CREATE TABLE [dbo].[FileVersions] (
    [VersionId] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF__FileVersi__Versi__5CD6CB2B] DEFAULT newid(),
    [FileId] UNIQUEIDENTIFIER NOT NULL,
    [VersionNumber] INT NOT NULL,
    [StoredBlobPath] NVARCHAR(1000) NOT NULL,
    [WrappedDEK] VARBINARY(512) NOT NULL,
    [IV] VARBINARY(32) NOT NULL,
    [AuthTag] VARBINARY(32) NOT NULL,
    [CreatedAt] DATETIME2 CONSTRAINT [DF__FileVersi__Creat__5EBF139D] DEFAULT sysutcdatetime(),
    CONSTRAINT [PK__FileVers__16C6400F8EC720A7] PRIMARY KEY CLUSTERED ([VersionId] ASC)
);

-- CreateTable
CREATE TABLE [dbo].[Folders] (
    [FolderId] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF__Folders__FolderI__3C69FB99] DEFAULT newid(),
    [UserId] UNIQUEIDENTIFIER NOT NULL,
    [ParentFolderId] UNIQUEIDENTIFIER,
    [Name] NVARCHAR(255) NOT NULL,
    [CreatedAt] DATETIME2 CONSTRAINT [DF__Folders__Created__3F466844] DEFAULT sysutcdatetime(),
    [IsDeleted] BIT CONSTRAINT [DF__Folders__IsDelet__403A8C7D] DEFAULT 0,
    CONSTRAINT [PK__Folders__ACD7107F48D80D1C] PRIMARY KEY CLUSTERED ([FolderId] ASC)
);

-- CreateTable
CREATE TABLE [dbo].[Tags] (
    [TagId] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF__Tags__TagId__5441852A] DEFAULT newid(),
    [UserId] UNIQUEIDENTIFIER NOT NULL,
    [Name] NVARCHAR(100) NOT NULL,
    [ColorHex] CHAR(7) CONSTRAINT [DF__Tags__ColorHex__5629CD9C] DEFAULT '#6366F1',
    CONSTRAINT [PK__Tags__657CF9AC4CCE3990] PRIMARY KEY CLUSTERED ([TagId] ASC)
);

-- CreateTable
CREATE TABLE [dbo].[Users] (
    [UserId] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF__Users__UserId__37A5467C] DEFAULT newid(),
    [Username] NVARCHAR(100) NOT NULL,
    [PasswordSalt] VARBINARY(64) NOT NULL,
    [Argon2Params] NVARCHAR(200) NOT NULL,
    [Role] NVARCHAR(50) NOT NULL CONSTRAINT [DF__Users__Role__38996AB5] DEFAULT 'member',
    [RecoveryKeyWrappedKEK] VARBINARY(256),
    [CreatedAt] DATETIME2 CONSTRAINT [DF__Users__CreatedAt__398D8EEE] DEFAULT sysutcdatetime(),
    [LastLoginAt] DATETIME2,
    CONSTRAINT [PK__Users__1788CC4C16214169] PRIMARY KEY CLUSTERED ([UserId] ASC),
    CONSTRAINT [UQ__Users__536C85E4066446FC] UNIQUE NONCLUSTERED ([Username] ASC)
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_AuditLogs_FileId] ON [dbo].[AuditLogs]([FileId] ASC);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_AuditLogs_Timestamp_UserId] ON [dbo].[AuditLogs]([Timestamp] ASC, [UserId] ASC);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_Files_BatchId] ON [dbo].[Files]([BatchId] ASC);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_Files_FolderId] ON [dbo].[Files]([FolderId] ASC);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_Files_IsDeleted] ON [dbo].[Files]([IsDeleted] ASC);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_Files_UserId] ON [dbo].[Files]([UserId] ASC);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_FileVersions_FileId] ON [dbo].[FileVersions]([FileId] ASC);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_Folders_ParentFolderId] ON [dbo].[Folders]([ParentFolderId] ASC);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_Folders_UserId] ON [dbo].[Folders]([UserId] ASC);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_Tags_UserId] ON [dbo].[Tags]([UserId] ASC);

-- AddForeignKey
ALTER TABLE [dbo].[Devices] ADD CONSTRAINT [FK__Devices__UserId__628FA481] FOREIGN KEY ([UserId]) REFERENCES [dbo].[Users]([UserId]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[FilePermissions] ADD CONSTRAINT [FK__FilePermi__FileI__4CA06362] FOREIGN KEY ([FileId]) REFERENCES [dbo].[Files]([FileId]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[FilePermissions] ADD CONSTRAINT [FK__FilePermi__UserI__4D94879B] FOREIGN KEY ([UserId]) REFERENCES [dbo].[Users]([UserId]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Files] ADD CONSTRAINT [FK__Files__FolderId__44FF419A] FOREIGN KEY ([FolderId]) REFERENCES [dbo].[Folders]([FolderId]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Files] ADD CONSTRAINT [FK__Files__UserId__440B1D61] FOREIGN KEY ([UserId]) REFERENCES [dbo].[Users]([UserId]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[FileTags] ADD CONSTRAINT [FK__FileTags__FileId__59063A47] FOREIGN KEY ([FileId]) REFERENCES [dbo].[Files]([FileId]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[FileTags] ADD CONSTRAINT [FK__FileTags__TagId__59FA5E80] FOREIGN KEY ([TagId]) REFERENCES [dbo].[Tags]([TagId]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[FileVersions] ADD CONSTRAINT [FK__FileVersi__FileI__5DCAEF64] FOREIGN KEY ([FileId]) REFERENCES [dbo].[Files]([FileId]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Folders] ADD CONSTRAINT [FK__Folders__ParentF__3E52440B] FOREIGN KEY ([ParentFolderId]) REFERENCES [dbo].[Folders]([FolderId]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Folders] ADD CONSTRAINT [FK__Folders__UserId__3D5E1FD2] FOREIGN KEY ([UserId]) REFERENCES [dbo].[Users]([UserId]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Tags] ADD CONSTRAINT [FK__Tags__UserId__5535A963] FOREIGN KEY ([UserId]) REFERENCES [dbo].[Users]([UserId]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

