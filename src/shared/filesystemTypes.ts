export interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  size: number
  modifiedAt: number
}

export interface DirectoryListing {
  path: string
  entries: FileEntry[]
  error: string | null
}
