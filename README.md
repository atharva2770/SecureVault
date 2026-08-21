# SecureVault

SecureVault is an **encrypted document vault** for teams. Files are encrypted at rest with **AES-256-GCM**, metadata and permissions live in **Microsoft SQL Server**, and cryptographic operations never run in the UI.

This repository is an **npm workspace**. The desktop Electron app still talks over IPC. The local HTTP API (port 4000) shares Prisma, RBAC, and file encryption services, and can stream encrypted blobs. The React web UI is Phase 4.

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
| Workspace | npm workspaces (`apps/*`, `packages/*`) |
| Desktop shell | Electron + electron-vite (`apps/desktop`) |
| HTTP API | Fastify (`apps/api`) on port 4000 |
| Shared domain | `@securevault/domain` — DTOs, RBAC, access-policy |
| Shared core | `@securevault/core` — authz, folders, admin, crypto, web blobs |
| Database | `@securevault/db` — Prisma + SQL Server |
| Web blobs | Local disk (`data/vault-blobs`) + AES-256-GCM DEK wrapping (`VAULT_KMS_WRAP_KEY`) |
| UI | React 19, TypeScript, Tailwind CSS v4, TanStack React Query |
| Desktop backend | Electron main process (Auth, Crypto, Files, Folders, RBAC, Audit) |
| Cryptography | Argon2id, AES-256-GCM, SHA-256 checksums |
| Packaging | electron-builder (Windows, macOS, Linux) |

---

## Architecture

```
┌──────────────────────────┐     ┌──────────────────────────────┐
│ apps/desktop (Electron)  │     │ apps/api (Fastify :4000)     │
│ React UI ──IPC── Main    │     │ cookie session + multipart   │
└────────────┬─────────────┘     └──────────────┬───────────────┘
             │                                  │
             ▼                                  ▼
      @securevault/core  (ACL, folders, admin, crypto, VaultFileService)
             │
             ├── @securevault/domain   @securevault/db (SQL Server)
             │
             ├── Desktop blobs: Electron userData + user KEK wrap
             └── Web blobs: data/vault-blobs + local KMS wrap key
```

**Security rules**

- The renderer and future browser UI never receive KEK/DEK material.
- ACL and permission checks are enforced in `@securevault/core` (`AccessControlService`).
- Encrypted file blobs stay on disk (or later object storage); only metadata and wrapped keys are in the database.
- The web API does **not** keep a user KEK in RAM. Web DEKs are wrapped with `VAULT_KMS_WRAP_KEY` (local KMS stand-in; swap for Azure Key Vault / AWS KMS later).
- Per-file access passwords are verified server-side before decrypt.

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

Apply Prisma migrations (from the repo root) to create all tables, seed roles, and default file categories:

```bash
npm run db:deploy
```

For development, you can also use:

```bash
npm run db:migrate
```

Generate the Prisma client after schema changes (`npm install` already does this):

```bash
npm run db:generate
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
| `npm run dev` | Start the desktop app (Electron) with hot reload |
| `npm run dev:api` | Start the local web API on http://127.0.0.1:4000 |
| `npm run build` | Typecheck and build the desktop app |
| `npm run start` | Preview the production desktop build |
| `npm run build:win` | Build Windows installer (NSIS) |
| `npm run build:mac` | Build macOS DMG |
| `npm run build:linux` | Build Linux AppImage / deb |
| `npm run typecheck` | Typecheck all workspaces |
| `npm run lint` | Lint the desktop app |
| `npm run format` | Format the repo with Prettier |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:migrate` | Create/apply a development migration |
| `npm run db:deploy` | Apply existing migrations |
| `npm run db:studio` | Open Prisma Studio |

---

## Project Structure

```
securevault/
├── apps/
│   ├── desktop/                 # Electron desktop client (IPC)
│   └── api/                     # HTTP API — session auth + encrypted blob streaming
├── packages/
│   ├── domain/                  # DTOs, RBAC, access-policy
│   ├── db/                      # Prisma schema, migrations, DBService
│   └── core/                    # Authz, folders, admin, crypto, local blob/KMS
├── data/vault-blobs/            # Local web ciphertext (gitignored)
├── .env.example
└── package.json
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
- Treat `VAULT_KMS_WRAP_KEY` as a secret. Losing it makes web-uploaded files unrecoverable.

---

## Roadmap

- **Phase 0 (done)** — npm workspace; Prisma + domain packages; desktop still uses IPC
- **Phase 1 (done)** — single authz engine (`resolveFolderRightsPure`); services take `userId` / actor; desktop IPC still reads `VaultSession`
- **Phase 2 (done)** — local Fastify API on port 4000; session cookie auth; folders/files list/admin ACL JSON; same SQL Server
- **Phase 3 (done)** — encrypted blobs + local KMS wrapping; streaming upload/download; per-file password verified on the API
- **Phase 4** — web UI (Unlock, VaultBrowser, Admin) over HTTP
- **Phase 5** — optional: desktop talks to the same API

---

## Troubleshooting

| Issue | What to check |
| --- | --- |
| `Missing DATABASE_URL` | Create `.env` from `.env.example` and set the connection string |
| `VAULT_KMS_WRAP_KEY must be 64 hex characters` | Set a 32-byte wrap key in `.env` (see `.env.example`) |
| Migration fails | Database exists, SQL Server is running, credentials are correct |
| `Preload bridge unavailable` | Fully quit the app and run `npm run dev` again |
| Move/Copy unavailable | Restart dev mode so the preload script reloads |
| Login works but no folders | Run migrations; ensure category seed migration applied |

---

## Contributing

1. Fork the repository and create a feature branch.
2. Run `npm run typecheck` and `npm run lint` before opening a pull request.
3. Do not commit `.env`, build output (`out/`, `release/`), or `node_modules/`.
4. Keep security-sensitive logic in `packages/core` and `apps/api` — never in a renderer or browser UI.
5. Put shared contracts in `packages/domain` and schema/migrations only in `packages/db`.

---

## License

Proprietary — all rights reserved unless otherwise specified by the repository owner.

---

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) with [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) and [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)
