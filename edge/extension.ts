import * as _ from 'lodash'
import * as vscode from 'vscode'

import FileChangeQueue from './FileChangeQueue'
import { ExtensionLevelConfigurations, Language, Item } from './global'
import JavaScript from './JavaScript'
import Stylus from './Stylus'
import TypeScript from './TypeScript'

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

	const fileChanges = new FileChangeQueue(async ({ filePath, removed }) => {
		await Promise.all(languages.map(async language => {
			await language.cutItem(filePath)

			if (!removed) {
				await language.addItem(filePath)
			}
		}))
	})
	context.subscriptions.push(fileChanges)

	const initializationPromise = vscode.window.withProgress({
		title: 'Scanning Files (Import Quicken)',
		location: vscode.ProgressLocation.Window,
	}, async () => {
		await Promise.all(languages.map(language => language.setItems()))

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

	context.subscriptions.push(vscode.commands.registerCommand('importQuicken.addImport', async () => {
		const editor = vscode.window.activeTextEditor
		const document = editor && editor.document

		// Stop processing if the VS Code is not working with folder, or the current document is untitled
		if (editor === undefined || document.isUntitled || vscode.workspace.getWorkspaceFolder(document.uri) === undefined) {
			return null
		}

		for (const language of languages) {
			const items = await language.getItems(document)
			if (!items) {
				continue
			}

			// Stop processing if the active editor has been changed
			if (editor !== vscode.window.activeTextEditor) {
				return null
			}

			const picker = vscode.window.createQuickPick<Item>()
			picker.busy = initializing
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

			if (initializing) {
				initializationPromise.then(async () => {
					picker.busy = false
					picker.items = await language.getItems(document)
				})
			}

			break
		}
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

		await vscode.window.withProgress({
			title: 'Fixing invalid import/require statements...',
			location: vscode.ProgressLocation.Notification,
		}, async () => {
			for (const lang of languages) {
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
