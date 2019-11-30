import * as _ from 'lodash'
import * as vscode from 'vscode'

import { ExtensionLevelConfigurations, Language, Item } from './global'
import FileChangeQueue from './FileChangeQueue'
import JavaScript from './JavaScript'
import TypeScript from './TypeScript'
import Stylus from './Stylus'

let languages: Array<Language>

function initialize() {
    const config = vscode.workspace.getConfiguration().get<ExtensionLevelConfigurations>('importQuicken')

    if (languages) {
        for (const language of languages) {
            language.reset()
        }
    }

    languages = [
        // Add new supported languages here
        new TypeScript(config),
        new JavaScript(config),
        new Stylus(config),
    ]
}

// Do not `await` in this function body as all the commands must be registered quickly
export function activate(context: vscode.ExtensionContext) {
    initialize()

    let initializing = true

    vscode.window.withProgress({ title: 'Preparing Import Quicken', location: vscode.ProgressLocation.Window }, async () => {
        await Promise.all(_.compact(languages.map(language =>
            language.setItems
                ? language.setItems()
                : null
        )))

        initializing = false

        fileChanges.processImmediately()
    })

    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(() => {
        if (initializing) {
            return
        }
        
        initialize()
    }))

    const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*')
    context.subscriptions.push(fileWatcher)

    const fileChanges = new FileChangeQueue(async ({ filePath, removed }) => {
        await Promise.all(languages.map(async language => {
            if (language.cutItem) {
                await language.cutItem(filePath)
            }

            if (!removed && language.addItem) {
                await language.addItem(filePath)
            }

            if (!language.cutItem && !language.addItem) {
                await language.reset()
            }
        }))
    })
    context.subscriptions.push(fileChanges)

    context.subscriptions.push(fileWatcher.onDidCreate(e => {
        fileChanges.add(e.fsPath)
        if (initializing === false) {
            fileChanges.processLazily()
        }
    }))
    context.subscriptions.push(fileWatcher.onDidDelete(e => {
        fileChanges.remove(e.fsPath)
        if (initializing === false) {
            fileChanges.processLazily()
        }
    }))
    const recentlyChangedActiveFileList = new Set<string>()
    context.subscriptions.push(fileWatcher.onDidChange(e => {
        if (vscode.window.activeTextEditor && e.fsPath === vscode.window.activeTextEditor.document.uri.fsPath) {
            recentlyChangedActiveFileList.add(e.fsPath)
            return
        }

        fileChanges.add(e.fsPath)
        if (initializing === false) {
            fileChanges.processLazily()
        }
    }))
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => {
        if (recentlyChangedActiveFileList.size > 0) {
            for (const filePath of recentlyChangedActiveFileList) {
                fileChanges.add(filePath)
            }
            recentlyChangedActiveFileList.clear()
            fileChanges.processImmediately()
        }
    }))

    context.subscriptions.push(vscode.commands.registerCommand('importQuicken.addImport', async function () {
        const editor = vscode.window.activeTextEditor
        const document = editor && editor.document

        // Stop processing if the VS Code is not working with folder, or the current document is untitled
        if (editor === undefined || document.isUntitled || vscode.workspace.getWorkspaceFolder(document.uri) === undefined) {
            return null
        }

        // Show the progress bar if the operation takes too long
        let progressIsVisible = !initializing
        let hideProgress = () => { progressIsVisible = false }
        setTimeout(() => {
            if (progressIsVisible === false) {
                return
            }
            vscode.window.withProgress({ title: 'Scanning files...', location: vscode.ProgressLocation.Notification }, async () => {
                await new Promise(resolve => {
                    hideProgress = resolve
                })
            })
        }, 1500)

        for (let language of languages) {
            const items = await language.getItems(document)
            if (!items) {
                continue
            }

            // Stop processing if the active editor has been changed
            if (editor !== vscode.window.activeTextEditor) {
                hideProgress()
                return null
            }

            hideProgress()

            const picker = vscode.window.createQuickPick<Item>()
            picker.placeholder = 'Type a file path or node module name'
            picker.items = items
            picker.matchOnDescription = true
            picker.onDidAccept(() => {
                const [selectedItem] = picker.selectedItems
                if (!selectedItem) {
                    return null
                }

                picker.dispose()

                _.defer(() => {
                    // Insert the snippet
                    selectedItem.addImport(editor, language)
                })
            })
            picker.show()

            break
        }

        hideProgress()
    }))

    context.subscriptions.push(vscode.commands.registerCommand('importQuicken.fixImport', async () => {
        if (initializing) {
            return
        }

        const editor = vscode.window.activeTextEditor
        const document = editor.document

        // Stop processing if the VS Code is not working with folder, or the current document is untitled
        if (editor === undefined || document.isUntitled || vscode.workspace.getWorkspaceFolder(document.uri) === undefined) {
            return null
        }

        const cancellationEvent = new vscode.CancellationTokenSource()
        const editorChangeEvent = vscode.window.onDidChangeActiveTextEditor(() => {
            cancellationEvent.cancel()
        })
        const documentCloseEvent = vscode.workspace.onDidCloseTextDocument((closingDocument) => {
            if (document === closingDocument) {
                cancellationEvent.cancel()
            }
        })

        await vscode.window.withProgress({ title: 'Fixing invalid import/require statements...', location: vscode.ProgressLocation.Notification }, async () => {
            for (let lang of languages) {
                if (lang.fixImport === undefined) {
                    continue
                }

                const workingDocumentHasBeenFixed = await lang.fixImport(editor, document, cancellationEvent.token)

                // Stop processing if it is handled or cancelled
                if (workingDocumentHasBeenFixed === true || workingDocumentHasBeenFixed === null) {
                    return null
                }
            }

            // Show the error message if no languages can fix the imports
            vscode.window.showErrorMessage('The current language was not supported.')
        })

        editorChangeEvent.dispose()
        documentCloseEvent.dispose()
        cancellationEvent.dispose()
    }))

    context.subscriptions.push(vscode.commands.registerCommand('importQuicken.convertImport', async () => {
        if (initializing) {
            return
        }

        const editor = vscode.window.activeTextEditor

        if (editor === undefined) {
            return null
        }

        for (const language of languages) {
            if (language.convertImport && await language.convertImport(editor)) {
                return null
            }
        }
    }))
}

export function deactivate() {
    for (const language of languages) {
        language.reset()
    }
}
