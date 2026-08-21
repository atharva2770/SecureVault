# SecureVault

SecureVault is a cross-platform desktop application for **encrypted document storage and team access control**. Files are encrypted at rest with **AES-256-GCM**, metadata and permissions live in **Microsoft SQL Server**, and sensitive cryptographic operations run only in the Electron **main process** — never in the browser UI.

Built with **Electron**, **React**, **TypeScript**, and **Prisma**.

---

## Features

- **Encrypted file vault** — streaming AES-256-GCM encryption with per-file Data Encryption Keys (DEKs)
- **Master vault unlock** — Argon2id key derivation; master key (KEK) held in memory only while unlocked
- **Per-file access password** — additional gate before open or download
- **Category-based organization** — Railway Tender, Defence Tender, HR, Engineering, NPD, and custom categories
- **Folder hierarchy** — nested folders with breadcrumb navigation, search, drag-and-drop upload
- **RBAC & folder ACLs** — Admin, Manager, Member, and Viewer roles with view / edit / copy / delete rights
- **Admin panel** — user provisioning, role assignment, folder ACL management
- **Audit logging** — login, file access, ACL changes, and denied actions recorded in SQL Server
- **Idle auto-lock** — vault locks automatically after inactivity

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| Desktop shell | Electron + electron-vite |
| UI | React 19, TypeScript, Tailwind CSS v4, TanStack React Query |
| Backend (main process) | Node.js services (Auth, Crypto, Files, Folders, RBAC, Audit) |
| Database | Microsoft SQL Server via Prisma ORM |
| Cryptography | Argon2id, AES-256-GCM, SHA-256 checksums |
| Packaging | electron-builder (Windows, macOS, Linux) |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Electron App                         │
│  ┌──────────────┐   IPC (preload)   ┌─────────────────┐ │
│  │   Renderer   │ ◄──────────────► │  Main Process    │ │
│  │  React UI    │                   │  Services + Crypto│ │
│  └──────────────┘                   └────────┬─────────┘ │
└─────────────────────────────────────────────┼───────────┘
                                              │
                              ┌───────────────┴───────────────┐
                              ▼                               ▼
                     SQL Server (metadata)          Encrypted blobs (local disk)
```

**Security rules**

- The renderer never receives KEK/DEK material over IPC.
- ACL and permission checks are enforced in the main process (`AccessControlService`).
- Encrypted file blobs are stored on disk; only metadata and wrapped keys are in the database.

---

## Prerequisites

Before you begin, install:

1. **Node.js** 20+ (LTS recommended)
2. **Microsoft SQL Server** (Express, Developer, or full edition)
3. **npm** (comes with Node.js)

On Windows, ensure SQL Server accepts your chosen authentication mode (SQL login or Windows trusted connection).

---

## Getting Started

### 1. Clone and install

```bash
git clone <repository-url>
cd securevault
npm install
```

### 2. Configure environment

Copy the example env file and edit it with your SQL Server details:

```bash
copy .env.example .env
```

**SQL authentication (default)**

```env
DATABASE_URL="sqlserver://localhost:1433;database=SecureVault;user=sa;password=YOUR_PASSWORD;encrypt=true;trustServerCertificate=true"
```

**Windows Authentication**

```env
USE_TRUSTED_CONNECTION=true
DATABASE_URL_TRUSTED="sqlserver://localhost:1433;database=SecureVault;integratedSecurity=true;encrypt=true;trustServerCertificate=true"
```

Optional:

```env
VAULT_IDLE_TIMEOUT_MS=900000
```

> **Never commit `.env`** — it is listed in `.gitignore`. Only commit `.env.example`.

### 3. Create the database

Create an empty database named `SecureVault` (or the name you used in the connection string) in SQL Server Management Studio or via T-SQL:

```sql
CREATE DATABASE SecureVault;
```

### 4. Run migrations

Apply Prisma migrations to create all tables, seed roles, and default file categories:

```bash
npx prisma migrate deploy
```

For development, you can also use:

```bash
npx prisma migrate dev
```

Generate the Prisma client after schema changes:

```bash
npx prisma generate
```

### 5. Start development

```bash
npm run dev
```

The app opens with a frameless window. The **first registered user** automatically receives the **Admin** role.

---

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start Electron in development mode with hot reload |
| `npm run build` | Typecheck and build for production |
| `npm run start` | Preview the production build locally |
| `npm run build:win` | Build Windows installer (NSIS) |
| `npm run build:mac` | Build macOS DMG |
| `npm run build:linux` | Build Linux AppImage / deb |
| `npm run typecheck` | Run TypeScript checks (main + renderer) |
| `npm run lint` | Run ESLint |
| `npm run format` | Format code with Prettier |

---

## Project Structure

```
securevault/
├── prisma/
│   ├── schema.prisma          # Database models
│   └── migrations/            # SQL Server migration history
├── src/
│   ├── main/                  # Electron main process
│   │   ├── ipc/               # IPC handlers (auth, files, folders, admin)
│   │   ├── services/          # Business logic and crypto
│   │   └── session/           # In-memory vault session (KEK)
│   ├── preload/               # Secure contextBridge API (window.api)
│   ├── renderer/              # React UI
│   │   └── src/components/    # VaultBrowser, AdminPanel, modals, etc.
│   └── shared/                # DTOs, IPC channels, RBAC constants
├── resources/                 # App icons and static assets
├── electron-builder.yml       # Installer / packaging config
└── electron.vite.config.ts    # Vite build config
```

---

## Usage Guide

### First launch

1. Open the app and choose **Create vault account**.
2. Register a username and master password — this becomes your vault unlock credential.
3. After unlock, use the sidebar categories to browse folders and upload files.

### Uploading files

- Click **Upload** or drag files into the vault area.
- Set a **display name** (this is also the per-file access password in v1).
- Choose a **file type / category** before encryption completes.

### Opening and downloading

- Select a file and choose **Open** or **Download**.
- Enter the file password when prompted.
- Open launches the decrypted file in the default OS application; Download saves it via a save dialog.

### Admin tasks

- Open **Settings → Admin** (Admin / Manager roles).
- Create users, assign roles, and grant folder ACLs (view, edit, copy, delete, inherit).

---

## Database Overview

Core tables include:

| Table | Purpose |
| --- | --- |
| `Users` | Accounts, Argon2 salt/params, disabled flag |
| `Files` | Encrypted file metadata, wrapped DEK, IV, auth tag, access password hash |
| `Folders` / `FileCategories` | Folder tree and document categories |
| `Roles`, `Permissions`, `UserRoles`, `FolderAcls` | RBAC and folder-level access control |
| `AuditLogs` | Security and activity audit trail |
| `FileVersions`, `Tags`, `Devices` | Versioning, tagging, and device tracking (schema ready) |

---

## Security Notes

- Treat the **master password** and **per-file passwords** as secrets; they are not recoverable if lost.
- Run SQL Server on a trusted network; for remote or internet-facing deployments, place a REST API in front of the database rather than embedding connection strings in a shipped client.
- Review `AuditLogs` regularly for access and ACL-denial events.
- Keep dependencies updated (`npm audit`, Electron security releases).

---

## Roadmap

- **Web application** — shared API, browser client, blob storage + KMS envelope encryption (see architecture notes in repo docs)
- Resumable large-file uploads
- File versioning UI
- Tag-based search and filters

---

## Troubleshooting

| Issue | What to check |
| --- | --- |
| `Missing DATABASE_URL` | Create `.env` from `.env.example` and set the connection string |
| Migration fails | Database exists, SQL Server is running, credentials are correct |
| `Preload bridge unavailable` | Fully quit the app and run `npm run dev` again |
| Move/Copy unavailable | Restart dev mode so the preload script reloads |
| Login works but no folders | Run migrations; ensure category seed migration applied |

---

## Contributing

1. Fork the repository and create a feature branch.
2. Run `npm run typecheck` and `npm run lint` before opening a pull request.
3. Do not commit `.env`, build output (`out/`, `release/`), or `node_modules/`.
4. Keep security-sensitive logic in `src/main/` — not in the renderer.

---

## License

Proprietary — all rights reserved unless otherwise specified by the repository owner.

---

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) with [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) and [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)
