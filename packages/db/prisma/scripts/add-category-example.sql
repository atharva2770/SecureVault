-- Run in SSMS against SecureVault database to add a custom category.
-- After insert, restart the app or lock/unlock — sidebar will pick it up automatically.

INSERT INTO [dbo].[FileCategories] ([CategoryId], [Code], [Name], [SortOrder], [IsSystem])
VALUES (NEWID(), N'LEGAL', N'Legal', 90, 0);

-- Verify:
SELECT [CategoryId], [Code], [Name], [SortOrder], [IsSystem], [CreatedAt]
FROM [dbo].[FileCategories]
ORDER BY [SortOrder];
