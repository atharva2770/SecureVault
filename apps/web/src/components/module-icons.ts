import {
  Banknote,
  Boxes,
  ClipboardCheck,
  Cog,
  Folder,
  Lightbulb,
  ShieldCheck,
  Train,
  Users,
  type LucideIcon
} from 'lucide-react'

export const MODULE_ICONS: Record<string, LucideIcon> = {
  accounts: Banknote,
  defence: ShieldCheck,
  engineering: Cog,
  hr: Users,
  npd: Lightbulb,
  other: Boxes,
  qa: ClipboardCheck,
  railway: Train
}

export function moduleIcon(moduleId: string): LucideIcon {
  return MODULE_ICONS[moduleId] ?? Folder
}
