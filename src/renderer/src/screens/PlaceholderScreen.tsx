import { useNavListener } from '../input/useNavListener'
import { useNavigationStore } from '../state/navigationStore'

interface PlaceholderScreenProps {
  title: string
  subtitle: string
}

export function PlaceholderScreen({ title, subtitle }: PlaceholderScreenProps): JSX.Element {
  const goHome = useNavigationStore((s) => s.goHome)

  useNavListener((action) => {
    if (action === 'back' || action === 'menu' || action === 'confirm') goHome()
  })

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-bg px-10 text-center">
      <h1 className="text-3xl font-bold">{title}</h1>
      <p className="max-w-md text-muted">{subtitle}</p>
      <p className="text-sm text-muted">Press confirm or back to return home</p>
    </div>
  )
}
