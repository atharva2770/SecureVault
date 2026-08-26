# SecureVault

SecureVault is an **encrypted document vault** for teams. Files are encrypted at rest with **AES-256-GCM**, metadata and permissions live in **Microsoft SQL Server**, and cryptographic operations never run in the UI.

This repository is an **npm workspace**. The local HTTP API (port 4000) handles auth, RBAC, and encrypted file blobs. The React web UI on port 5173 is the only client.

---

## Features

- **Encrypted file vault** — streaming AES-256-GCM encryption with per-file Data Encryption Keys (DEKs)
- **Master vault unlock** — Argon2id key derivation; master key (KEK) held in memory only while unlocked
- **Per-file access password** — additional gate before open or download
- **Category-based organization** — HR, Engg, QA, Accounts (with standard subfolders), plus any extra categories you add
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
| HTTP API | Fastify (`apps/api`) on port 4000 |
| Shared domain | `@securevault/domain` — DTOs, RBAC, access-policy |
| Shared core | `@securevault/core` — authz, folders, admin, crypto, blobs |
| Database | `@securevault/db` — Prisma + SQL Server |
| Encrypted blobs | Local disk (`data/vault-blobs`) + AES-256-GCM DEK wrapping (`VAULT_KMS_WRAP_KEY`) |
| UI | React 19, TypeScript, Tailwind CSS v4, TanStack React Query (`apps/web`) |
| Cryptography | Argon2id, AES-256-GCM, SHA-256 checksums |

---

## Architecture

```
┌──────────────────────────┐
│ apps/web (Vite :5173)    │
│ React UI ──HTTP cookie───┤
└──────────────────────────┘
                           │
                           ▼
                 apps/api (Fastify :4000)
                 cookie session + encrypted blobs
                           │
                           ▼
              @securevault/core  (ACL, folders, admin, crypto)
                           │
              @securevault/domain   @securevault/db (SQL Server)
                           │
              data/vault-blobs + VAULT_KMS_WRAP_KEY
```

**Security rules**

- The browser UI never receives KEK/DEK material.
- ACL and permission checks are enforced in `@securevault/core` (`AccessControlService`).
- Encrypted file blobs stay on disk (or later object storage); only metadata and wrapped keys are in the database.
- Web-uploaded DEKs are wrapped with `VAULT_KMS_WRAP_KEY` (local KMS stand-in; swap for Azure Key Vault / AWS KMS later).
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

### 5. Start the web app

```bash
npm run dev
```

This starts the API and the UI together, then opens **http://localhost:5173**. The **first registered user** automatically receives the **Admin** role. Use the **profile avatar** (top right) for account, password, folder access, appearance, and (admins) user rights.

---

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the app (API + UI, opens the browser) |
| `npm run build` | Typecheck and build the web app |
| `npm run typecheck` | Typecheck all workspaces |
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
│   ├── api/                     # HTTP API — session auth + encrypted blob streaming
│   └── web/                     # React web UI (Vite) on port 5173
├── packages/
│   ├── domain/                  # DTOs, RBAC, access-policy
│   ├── db/                      # Prisma schema, migrations, DBService
│   └── core/                    # Authz, folders, admin, crypto, local blob/KMS
├── data/vault-blobs/            # Local ciphertext (gitignored)
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
- Keep dependencies updated (`npm audit`).
- Treat `VAULT_KMS_WRAP_KEY` as a secret. Losing it makes web-uploaded files unrecoverable.

---

## Design Tokens

The UI is themed entirely through CSS custom properties in `apps/web/src/assets/globals.css`. Tailwind v4 configures itself in CSS via `@theme inline`, so there is no `tailwind.config.js`. Themes are toggled by `ThemeProvider` (`.dark` / `.light` on `<html>`); light overrides also match `[data-theme='light']`, so either convention resolves. Because every theme value is consumed through `@theme inline`, utilities such as `bg-sv-surface`, `text-sv-text-faint`, `shadow-card`, and `font-mono` resolve live per theme.

### Surface / text / border ramp

| Token | Dark | Light | Tailwind utility | Use |
| --- | --- | --- | --- | --- |
| `--bg-base` | `#0F1115` | `#EDEFF3` | `bg-sv-bg` | App background |
| `--bg-surface` | `#171A21` | `#FFFFFF` | `bg-sv-surface` | Cards, panels, sidebar |
| `--bg-elevated` | `#1F232C` | `#E3E6ED` | `bg-sv-surface-2` | Modals, dropdowns, inputs |
| `--border` | `#2A2E37` | `#D7DBE3` | `border-sv-border` | Default dividers |
| `--border-2` | `#363C48` | `#C2C8D4` | `border-sv-border-2` | Stronger dividers / focus rails |
| `--text-primary` | `#F3F4F6` | `#14171F` | `text-sv-text` | Headings, file names |
| `--text-secondary` | `#9AA1AE` | `#565D6B` | `text-sv-text-dim` | Metadata, muted text |
| `--text-faint` | `#828A99` | `#6B7280` | `text-sv-text-faint` | Placeholders, hints |
| `--accent-primary` | `#6366F1` | `#4F46E5` | `text-sv-accent` | Buttons, active tabs, links |
| `--accent-success` | `#22C55E` | `#15803D` | `text-sv-success` | Encrypted / unlocked states |
| `--accent-warning` | `#F59E0B` | `#B45309` | `text-sv-warning` | Warnings |
| `--accent-danger` | `#EF4444` | `#DC2626` | `text-sv-danger` | Delete / lock errors |

**Why the light theme is not an inversion.** The background is a soft cool gray (`#EDEFF3`) rather than pure white, so white surfaces (`#FFFFFF` cards) lift off the page with a clear luminance step plus a border; `#E3E6ED` "elevated" sits below surface white but above the background for input/dropdown depth. The text ramp is tuned for contrast on white (the common case): `#14171F` ≈ 16.8:1 (AAA), `#565D6B` ≈ 7.0:1 (AAA), `#6B7280` ≈ 4.9:1 (AA) — all three also clear AA on the `#EDEFF3` background. Success and warning are darkened from their dark-theme values because the bright `#22C55E` / `#F59E0B` fail AA as text/icons on light surfaces.

### Paper surface (file-preview cards)

A document should always read like a page, so the "paper" tokens are **constant across both themes**: `--paper` `#F7F3EA` (warm off-white fill, `bg-sv-paper`), `--paper-2` `#EFE7D8`, `--paper-border` `#E4D9C3`, `--paper-text` `#23201A` (`text-sv-paper-text`), `--paper-text-dim` `#6B6456`.

### Module accents (8)

One color per document module, exposed as `bg-mod-*` / `text-mod-*` / `border-mod-*` (`accounts`, `defence`, `engineering`, `hr`, `npd`, `other`, `qa`, `railway`). The **variable names are identical across themes**; only the values shift. Dark uses bright ≈400-level hues for legibility on near-black; light uses a **deepened ≈600-level variant per accent** so badges/labels keep AA contrast on light surfaces.

| Module | Dark | Light |
| --- | --- | --- |
| Accounts | `#34D399` | `#059669` |
| Defence Tender | `#FB7185` | `#E11D48` |
| Engineering | `#FACC15` | `#CA8A04` |
| HR | `#F472B6` | `#DB2777` |
| NPD | `#A78BFA` | `#7C3AED` |
| Other | `#94A3B8` | `#475569` |
| QA | `#2DD4BF` | `#0D9488` |
| Railway Tender | `#60A5FA` | `#2563EB` |

The per-token darkened light values are preferred because they are deterministic. A CSS `filter: brightness(0.82) saturate(1.12)` under `[data-theme='light']` is documented in the stylesheet as a fallback for any one-off surface that cannot use the tokens directly.

### Elevation

Shadows differ meaningfully by theme via `shadow-card` and `shadow-modal`. Dark leans on a 1px light inset "edge" plus a tight ambient drop (big blurry shadows read as mud on near-black), and modals add an indigo glow. Light uses real layered soft shadows (ambient + key) for physical depth, matching a paper-like UI.

### Typography

Display and body text use the installed Outfit variable font (`@fontsource-variable/outfit`) via `--font-sans` / `--font-display` (`font-sans`). File names, timestamps, and IDs use the monospace stack `--font-mono` (`font-mono`, or the `data-mono` attribute) with tabular figures. The standard Tailwind `text-xs … text-7xl` scale is retained, with an added tighter `text-2xs` (11px) and `tracking-display` / `tracking-tightish` letter-spacing tokens for headings.

### Radius & spacing

The rounded "vault" aesthetic uses a `--radius` base of `0.75rem`, with `rounded-sm/md/lg/xl/2xl/3xl` and `rounded-pill` derived from it. Spacing follows Tailwind's 4px scale (`--spacing: 0.25rem`); semantic layout rhythm tokens `--sv-gap` (12px), `--sv-gutter` (16px), `--sv-section` (24px), and `--sv-page` (32px) are available via `var()`.

---

## Roadmap

- **Phase 5 (done)** — web-only client. `npm run dev` starts the API and the browser UI.

---

## Troubleshooting

| Issue | What to check |
| --- | --- |
| `Missing DATABASE_URL` | Create `.env` from `.env.example` and set the connection string |
| `VAULT_KMS_WRAP_KEY must be 64 hex characters` | Set a 32-byte wrap key in `.env` (see `.env.example`) |
| Migration fails | Database exists, SQL Server is running, credentials are correct |
| Cannot open old files | Files uploaded from the old desktop app must be uploaded again from the web vault |
| Login works but no folders | Run migrations; ensure category seed migration applied |

---

## Contributing

1. Fork the repository and create a feature branch.
2. Run `npm run typecheck` before opening a pull request.
3. Do not commit `.env`, build output (`out/`, `release/`), or `node_modules/`.
4. Keep security-sensitive logic in `packages/core` and `apps/api` — never in the browser UI.
5. Put shared contracts in `packages/domain` and schema/migrations only in `packages/db`.

---

## License

Proprietary — all rights reserved unless otherwise specified by the repository owner.

---

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) with [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) and [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)
