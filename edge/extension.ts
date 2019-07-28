import { fs } from 'mz'
import * as _ from 'lodash'
import * as vscode from 'vscode'

import { ExtensionLevelConfigurations, Language, Item } from './global'
import { createFileChangeQueue } from './FileChangeQueue'
import JavaScript from './JavaScript'
import TypeScript from './TypeScript'
import Stylus from './Stylus'

let languages: Array<Language>

export function activate(context: vscode.ExtensionContext) {
    const fileWatch = vscode.workspace.createFileSystemWatcher('**/*')
    context.subscriptions.push(fileWatch)

    const fileChanges = createFileChangeQueue(async ({ filePath, removed }) => {
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

    context.subscriptions.push(fileWatch.onDidCreate(e => {
        fileChanges.add(e.fsPath)
    }))
    context.subscriptions.push(fileWatch.onDidDelete(e => {
        fileChanges.remove(e.fsPath)
    }))
    context.subscriptions.push(fileWatch.onDidChange(e => {
        if (vscode.window.activeTextEditor && e.fsPath === vscode.window.activeTextEditor.document.uri.fsPath) {
            return
        }

        fileChanges.add(e.fsPath)
    }))
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => {
        if (vscode.window.activeTextEditor) {
            fileChanges.add(vscode.window.activeTextEditor.document.uri.fsPath)
            fileChanges.process()
        }
    }))

    let config: ExtensionLevelConfigurations
    let extensionIsInitializing = true
    function initialize() {
        extensionIsInitializing = true

        config = vscode.workspace.getConfiguration().get<ExtensionLevelConfigurations>('importQuicken')

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

        extensionIsInitializing = false
    }
    initialize()

    vscode.window.withProgress({ title: 'Import Quicken is preparing files...', location: vscode.ProgressLocation.Window }, () =>
        Promise.all(_.compact(languages.map(language =>
            language.setItems
                ? language.setItems()
                : null
        )))
    )

    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(() => {
        if (!extensionIsInitializing) {
            initialize()
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
        let progressIsVisible = !extensionIsInitializing
        let hideProgress = () => { progressIsVisible = false }
        setTimeout(() => {
            if (!progressIsVisible) {
                return
            }
            vscode.window.withProgress({ title: 'Import Quicken is populating files...', location: vscode.ProgressLocation.Window }, async () => {
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

        await vscode.window.withProgress({ title: 'Fixing invalid import/require statements', location: vscode.ProgressLocation.Window }, async () => {
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
