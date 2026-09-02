import { Shield } from 'lucide-react'

import PageShell from '@/layout/PageShell'

export default function HelpPage(): React.JSX.Element {
  return (
    <PageShell title="Help" subtitle="How SecureVault protects files in the web app.">
      <div className="space-y-4">
        <section className="rounded-[var(--sv-radius)] border border-sv-border bg-sv-surface p-5">
          <div className="mb-2 flex items-center gap-2">
            <Shield className="size-4 text-sv-accent" />
            <h2 className="text-sm font-semibold text-sv-text">Sign in</h2>
          </div>
          <p className="text-sm leading-6 text-sv-text-muted">
            Unlock uses your username and master password. The API verifies credentials and sets an
            httpOnly session cookie. Your password is not stored in the browser.
          </p>
        </section>
        <section className="rounded-[var(--sv-radius)] border border-sv-border bg-sv-surface p-5">
          <h2 className="mb-2 text-sm font-semibold text-sv-text">File password</h2>
          <p className="text-sm leading-6 text-sv-text-muted">
            Most modules need no file password — your folder permissions decide what you can open.
            Modules that hold sensitive records, such as Accounts, ask for a password that is set when
            the document is uploaded. That password is chosen by the uploader; it is never the file
            name, and it cannot be recovered if lost. Download, print, and save are disabled. Encryption and decryption happen on the server; the browser never
            receives keys. Files must be uploaded through this web app — files left over from the old
            desktop app cannot be opened and should be uploaded again.
          </p>
        </section>
        <section className="rounded-[var(--sv-radius)] border border-sv-border bg-sv-surface p-5">
          <h2 className="mb-2 text-sm font-semibold text-sv-text">Roles and folders</h2>
          <p className="text-sm leading-6 text-sv-text-muted">
            Admins open People & folders from the profile menu. For each folder, set View, Edit,
            Copy, Delete, and whether those rights inherit to subfolders. Those flags are stored in
            FolderAcls and enforced when the person opens the vault. Admins can open every folder
            automatically. Idle time locks the vault.
          </p>
        </section>
      </div>
    </PageShell>
  )
}
