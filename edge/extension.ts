import defer from 'lodash/defer'
import sortBy from 'lodash/sortBy'
import * as vscode from 'vscode'

import FileChangeQueue from './FileChangeQueue'
import { ExtensionConfiguration, Language, Item } from './global'
import JavaScript from './JavaScript'
import Stylus from './Stylus'

// Do not `await` in this function body as all the commands must be registered as soon as possible to avoid a command-not-found error
export function activate(context: vscode.ExtensionContext) {
	let initializing = false

	const languages: Array<Language> = [
		// Add supported languages here
		new JavaScript(),
		new Stylus(),
	]
	context.subscriptions.push(...languages)

	const fileChanges = new FileChangeQueue(async ({ filePath, removed }) => {
		await Promise.all(languages.map(async language => {
			await language.cutItem(filePath)

			if (!removed) {
				await language.addItem(filePath)
			}
		}))
	})
	context.subscriptions.push(fileChanges)

	const initializationPromise = (async () => {
		initializing = true

		const config = vscode.workspace.getConfiguration().get<ExtensionConfiguration>('importQuicken')
		for (const language of languages) {
			language.setUserConfiguration(config)
		}

		await vscode.window.withProgress({
			title: 'Scanning Files (Import Quicken)',
			location: vscode.ProgressLocation.Window,
		}, async () => {
			await Promise.all(languages.map(async language => {
				await language.setItems()
			}))

			initializing = false

			fileChanges.processImmediately()
		})
	})()

	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(() => {
		const config = vscode.workspace.getConfiguration().get<ExtensionConfiguration>('importQuicken')
		for (const language of languages) {
			language.setUserConfiguration(config)
		}
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

	const recentlyUsedIds = new Map<Language, Array<Item['id']>>()
	for (const language of languages) {
		recentlyUsedIds.set(language, context.workspaceState.get('recentlyUsedIds::' + language.constructor.name, []))
	}

	context.subscriptions.push(vscode.commands.registerCommand('importQuicken.addImport', async () => {
		const editor = vscode.window.activeTextEditor
		const document = editor && editor.document

		// Stop processing if the VS Code is not working with folder, or the current document is untitled
		if (editor === undefined || document.isUntitled || vscode.workspace.getWorkspaceFolder(document.uri) === undefined) {
			return null
		}

		for (const language of languages) {
			const getItems = async () => {
				let items = await language.getItems(document)
				if (items) {
					// Sort items by recently used first
					const usedIds = recentlyUsedIds.get(language)
					if (usedIds.length > 0) {
						const hash: { [id: string]: number } = usedIds.reduce((hash, id, rank) => {
							hash[id] = rank
							return hash
						}, {})
						items = sortBy(items, item => hash[item.id] ?? Infinity)
					}
				}

				return items
			}

			const items = await getItems()
			if (!items) {
				continue
			}

			// Stop processing if the active editor has been changed
			if (editor !== vscode.window.activeTextEditor) {
				return null
			}

			const picker = vscode.window.createQuickPick<Item>()
			picker.busy = initializing
			picker.placeholder = 'Search files, identifiers or modules'
			picker.matchOnDescription = true
			picker.items = await getItems()

			let timerId: NodeJS.Timer
			if (initializing) {
				timerId = setInterval(async () => {
					picker.items = await getItems()
				}, 3000)

				initializationPromise.then(async () => {
					clearInterval(timerId)
					timerId = undefined

					picker.busy = false
					picker.items = await getItems()
				})
			}

			picker.onDidHide(() => {
				clearInterval(timerId)
			})
			picker.onDidAccept(() => {
				const [selectedItem] = picker.selectedItems
				if (!selectedItem) {
					return null
				}

				picker.dispose()

				defer(() => {
					// Insert the snippet
					selectedItem.addImport(editor, language)

					// Update item sorting order
					const usedIds = recentlyUsedIds.get(language)
					const rank = usedIds.indexOf(selectedItem.id)
					if (rank !== 0) {
						if (rank >= 1) {
							usedIds.splice(rank, 1)
						}

						usedIds.unshift(selectedItem.id)

						if (usedIds.length > 50) {
							usedIds.splice(50, usedIds.length - 50)
						}

						context.workspaceState.update('recentlyUsedIds::' + language.constructor.name, usedIds)
					}
				})
			})
			picker.show()

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
