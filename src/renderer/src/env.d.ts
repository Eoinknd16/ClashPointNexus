import type { WebviewTag } from 'electron'
import type { DetailedHTMLProps, HTMLAttributes } from 'react'
import type { LauncherApi } from '@shared/api'

declare global {
  interface Window {
    api: LauncherApi
  }

  namespace JSX {
    interface IntrinsicElements {
      // Electron's <webview> isn't part of React's standard DOM typings.
      webview: DetailedHTMLProps<HTMLAttributes<WebviewTag>, WebviewTag> & {
        src?: string
        allowpopups?: boolean
        partition?: string
      }
    }
  }
}

export {}
