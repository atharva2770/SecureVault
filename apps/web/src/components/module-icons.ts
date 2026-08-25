import {
  CheckCircle2,
  Folder,
  Layers,
  Lightbulb,
  ShieldHalf,
  Train,
  Users,
  Wallet,
  Wrench,
  type LucideIcon
} from 'lucide-react'

export const MODULE_ICONS: Record<string, LucideIcon> = {
  accounts: Wallet,
  defence: ShieldHalf,
  engineering: Wrench,
  hr: Users,
  npd: Lightbulb,
  other: Layers,
  qa: CheckCircle2,
  railway: Train
}

export function moduleIcon(moduleId: string): LucideIcon {
  return MODULE_ICONS[moduleId] ?? Folder
}
