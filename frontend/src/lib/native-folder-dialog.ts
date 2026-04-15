type NativeFolderPickerAPI = {
    pickFolder?: () => Promise<string | null> | string | null
}

type TauriDialogAPI = {
    open: (options?: Record<string, unknown>) => Promise<string | null> | string | null
}

declare global {
    interface Window {
        electronAPI?: NativeFolderPickerAPI
        papermindAPI?: NativeFolderPickerAPI
        __TAURI__?: {
            dialog?: TauriDialogAPI
        }
    }
}

function isAbsolutePath(candidate: string): boolean {
    const normalized = candidate.trim()
    return (
        /^\//.test(normalized) ||
        /^[A-Za-z]:[\\/]/.test(normalized) ||
        /^\\\\/.test(normalized)
    )
}

export async function pickNativeFolderPath(): Promise<string | null> {
    if (typeof window === 'undefined') {
        return null
    }

    const injectedPicker = window.papermindAPI?.pickFolder ?? window.electronAPI?.pickFolder
    if (injectedPicker) {
        const result = await injectedPicker()
        if (typeof result === 'string' && isAbsolutePath(result)) {
            return result.trim()
        }
        return null
    }

    const tauriDialog = window.__TAURI__?.dialog?.open
    if (tauriDialog) {
        const result = await tauriDialog({
            directory: true,
            multiple: false,
            title: 'Select a watched folder',
        })
        if (typeof result === 'string' && isAbsolutePath(result)) {
            return result.trim()
        }
    }

    return null
}
