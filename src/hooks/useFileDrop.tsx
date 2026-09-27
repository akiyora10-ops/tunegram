import { useEffect, useState } from 'react'
import { FolderInput } from 'lucide-react'
import { libraryStore } from '../state/libraryStore'
import { notifyStore } from '../state/notifyStore'
import { formatCount } from '../lib/format'

/**
 * Lets people drop a folder (or loose files) from Explorer onto the window to
 * add it to the library. Electron's renderer only sees a `File` object, so the
 * real paths come from `webUtils.getPathForFile` exposed by the preload.
 */
export function useFileDrop(): { dragging: boolean } {
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    let depth = 0

    const onDragEnter = (event: DragEvent): void => {
      if (!event.dataTransfer?.types.includes('Files')) return
      depth++
      setDragging(true)
    }
    const onDragOver = (event: DragEvent): void => {
      if (event.dataTransfer?.types.includes('Files')) event.preventDefault()
    }
    const onDragLeave = (): void => {
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const onDrop = (event: DragEvent): void => {
      if (!event.dataTransfer?.types.includes('Files')) return
      event.preventDefault()
      depth = 0
      setDragging(false)

      const paths: string[] = []
      for (const file of Array.from(event.dataTransfer.files)) {
        const path = window.tunegram.getPathForFile(file)
        if (path) paths.push(path)
      }
      if (paths.length === 0) {
        notifyStore.push('Could not read the dropped files', 'warning')
        return
      }
      notifyStore.push('Adding to your library…', 'info')
      void window.tunegram.library
        .addDroppedPaths(paths)
        .then((result) => {
          if (!result) return
          libraryStore.applyScan(result)
          notifyStore.push(`Added ${formatCount(result.stats.audioFiles, 'track')}`, 'success')
        })
        .catch((error: unknown) => {
          notifyStore.push(`Could not add files: ${error instanceof Error ? error.message : String(error)}`, 'error')
        })
    }

    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [])

  return { dragging }
}

export function DropOverlay({ visible }: { visible: boolean }): React.JSX.Element | null {
  if (!visible) return null
  return (
    <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-accent px-12 py-10">
        <FolderInput size={34} className="text-accent" />
        <p className="text-[15px] font-semibold text-ink">Drop to add to your library</p>
      </div>
    </div>
  )
}
