export type UpdateState =
  | 'idle'
  | 'checking'
  | 'downloading'
  | 'downloaded'
  | 'not-available'
  | 'error'
  | 'unsupported'

export interface UpdateStatus {
  state: UpdateState
  version: string | null
  error: string | null
  progressPercent: number | null
}
