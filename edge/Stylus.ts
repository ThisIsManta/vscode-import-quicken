import * as _ from 'lodash'
import { fs } from 'mz'
import * as fp from 'path'
import { Parser, nodes as Nodes } from 'stylus'
import * as vscode from 'vscode'

import FileInfo from './FileInfo'
import { Language, Item, findFilesRoughly, tryGetFullPath } from './global'

const SUPPORTED_LANGUAGE = /^stylus$/

let importSyntaxCount = 0
let requireSyntaxCount = 0
let singleQuoteCount = 0
let doubleQuoteCount = 0
let indexFileCount = 0
let fileExtensionCount = 0
let semiColonCount = 0

export default class Stylus implements Language {
	private fileItemCache: Array<FileItem> = []

	setUserConfiguration() { }

	async setItems() {
		const fileLinks = await vscode.workspace.findFiles('**/*.{styl,css,jpg,jpeg,png,gif,svg,otf,ttf,woff,woff2,eot}')

		for (const fileLink of fileLinks) {
			const rootPath = vscode.workspace.getWorkspaceFolder(fileLink).uri.fsPath
			this.fileItemCache.push(new FileItem(new FileInfo(fileLink.fsPath), rootPath))

			if (fp.extname(fileLink.fsPath) !== '.styl') {
				continue
			}

			const fileText = await fs.readFile(fileLink.fsPath, 'utf-8')

			const codeTree = Stylus.parse(fileText)
			if (!codeTree) {
				continue
			}

			const existingImports = getExistingImportsAndUrls(codeTree)
			const lines = fileText.split(/\r?\n/)
			for (const node of existingImports) {
				if (node instanceof Nodes.Import === false) {
					continue
				}

				const [, syntax, semiColon] = lines[node.lineno - 1].match(/@(import|require)\s+(?:'|").+?(?:'|")\s*(;?)/) || []

				if (syntax === 'import') {
					importSyntaxCount += 1

				} else {
					requireSyntaxCount += 1
				}

				if (node.path?.nodes[0]?.quote === '"') {
					doubleQuoteCount += 1

				} else {
					singleQuoteCount += 1
				}

				const relativePath = node.path.hash
				const fullPath = await tryGetFullPath([fp.dirname(fileLink.fsPath), relativePath], 'styl', [])
				if (fullPath) {
					if (fp.basename(fullPath) === 'index.styl') {
						if (/(^index|(\\|\/)index)(\.styl)?$/.test(relativePath)) {
							indexFileCount += 1
							fileExtensionCount += (relativePath.endsWith('.styl') ? 1 : -1)

						} else {
							indexFileCount -= 1
						}

					} else {
						fileExtensionCount += (relativePath.endsWith('.styl') ? 1 : -1)
					}
				}

				semiColonCount += (semiColon ? 1 : -1)
			}
		}
	}

	async getItems(document: vscode.TextDocument) {
		if (SUPPORTED_LANGUAGE.test(document.languageId) === false) {
			return null
		}

		const documentFileInfo = new FileInfo(document.fileName)

		const filteredFileItems = _.reject(this.fileItemCache, item => item.fileInfo.fullPath === documentFileInfo.fullPath)

		return filteredFileItems
	}

	async addItem(filePath: string) {
		if (this.fileItemCache) {
			const fileInfo = new FileInfo(filePath)
			const rootPath = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath))?.uri.fsPath
			if (rootPath) {
				this.fileItemCache.push(new FileItem(fileInfo, rootPath))
			}
		}
	}

	async cutItem(filePath: string) {
		if (this.fileItemCache) {
			const fileInfo = new FileInfo(filePath)
			const index = this.fileItemCache.findIndex(item => item.fileInfo.fullPath === fileInfo.fullPath)
			if (index >= 0) {
				this.fileItemCache.splice(index, 1)
			}
		}
	}

	async fixImport(editor: vscode.TextEditor, document: vscode.TextDocument, cancellationToken: vscode.CancellationToken) {
		if (SUPPORTED_LANGUAGE.test(document.languageId) === false) {
			return null
		}

		const codeTree = Stylus.parse(document.getText())
		if (!codeTree) {
			return false
		}

		const rootPath = vscode.workspace.getWorkspaceFolder(document.uri).uri.fsPath

		const existingImports = getExistingImportsAndUrls(codeTree)
		const brokenImports: Array<Nodes.String> = []
		for (const node of existingImports) {
			if (cancellationToken.isCancellationRequested) {
				return null
			}

			let path: string
			if (node instanceof Nodes.Import) {
				path = _.get(node, 'path.nodes.0')

			} else if (node instanceof Nodes.Call) {
				path = _.get(node, 'args.nodes.0.nodes.0')
			}

			if (path && await fs.exists(path) === false) {
				brokenImports.push(path)
			}
		}

		if (brokenImports.length === 0) {
			vscode.window.setStatusBarMessage('No broken import/require statements have been found.', 5000)
			return null
		}

		function getEditableRange(node: Nodes.String) {
			return new vscode.Range(
				new vscode.Position(node.lineno - 1, node.column),
				new vscode.Position(node.lineno - 1, node.column + node.val.length),
			)
		}

		const documentFileInfo = new FileInfo(document.fileName)

		const unsolvableImports: Array<Nodes.String> = []
		for (const node of brokenImports) {
			if (cancellationToken.isCancellationRequested) {
				return null
			}

			const matchingFullPaths = await findFilesRoughly(node.val, ['styl'])

			if (matchingFullPaths.length === 0) {
				unsolvableImports.push(node)

			} else if (matchingFullPaths.length === 1) {
				await editor.edit(worker => {
					const item = new FileItem(new FileInfo(matchingFullPaths[0]), rootPath)
					worker.replace(getEditableRange(node), item.getRelativePath(documentFileInfo.directoryPath))
				})

			} else {
				const candidateItems = matchingFullPaths.map(path => new FileItem(new FileInfo(path), rootPath))
				const selectedItem = await vscode.window.showQuickPick(candidateItems, { placeHolder: node.val })

				if (!selectedItem) {
					return null
				}

				if (cancellationToken.isCancellationRequested) {
					return null
				}

				await editor.edit(worker => {
					worker.replace(getEditableRange(node), selectedItem.getRelativePath(documentFileInfo.directoryPath))
				})
			}
		}

		if (unsolvableImports.length === 0) {
			vscode.window.setStatusBarMessage('All broken import/require statements have been fixed.', 5000)

		} else {
			vscode.window.showWarningMessage(`There ${unsolvableImports.length === 1 ? 'was' : 'were'} ${unsolvableImports.length} broken import/require statement${unsolvableImports.length === 1 ? '' : 's'} that had not been fixed.`)
		}

		return true
	}

	dispose() {
		this.fileItemCache = []
	}

	static parse(code: string) {
		try {
			return (new Parser(code) as any).parse()

		} catch (error) {
			console.error(error)
			return null
		}
	}
}

class FileItem implements Item {
	readonly id: string
	readonly label: string
	readonly description: string
	readonly fileInfo: FileInfo

	constructor(fileInfo: FileInfo, rootPath: string) {
		this.id = fileInfo.fullPath

		this.fileInfo = fileInfo

		this.description = _.trim(fp.dirname(this.fileInfo.fullPath.substring(rootPath.length)), fp.sep)

		if (indexFileCount < 0 && this.fileInfo.fileNameWithExtension === 'index.styl') {
			this.label = this.fileInfo.directoryName
			this.description = _.trim(this.fileInfo.fullPath.substring(rootPath.length), fp.sep)

		} else if (fileExtensionCount < 0 && this.fileInfo.fileExtensionWithoutLeadingDot === 'styl') {
			this.label = this.fileInfo.fileNameWithoutExtension

		} else {
			this.label = this.fileInfo.fileNameWithExtension
		}
	}

	getRelativePath(directoryPathOfWorkingDocument: string) {
		let path = this.fileInfo.getRelativePath(directoryPathOfWorkingDocument)

		if (indexFileCount < 0 && this.fileInfo.fileNameWithExtension === 'index.styl') {
			path = fp.dirname(path)

		} else if (fileExtensionCount < 0 && this.fileInfo.fileExtensionWithoutLeadingDot === 'styl') {
			path = path.replace(/\.styl$/i, '')
		}

		return path
	}

	async addImport(editor: vscode.TextEditor) {
		const document = editor.document

		const directoryPathOfWorkingDocument = new FileInfo(document.fileName).directoryPath

		const quote = singleQuoteCount > doubleQuoteCount ? '\'' : '"'

		if (/^(styl|css)$/i.test(this.fileInfo.fileExtensionWithoutLeadingDot)) {
			const path = this.getRelativePath(directoryPathOfWorkingDocument)

			let position = new vscode.Position(0, 0)
			const codeTree = Stylus.parse(document.getText())
			if (codeTree) {
				const topLevelImports = codeTree.nodes.filter(node => node instanceof Nodes.Import)
				if (topLevelImports.length > 0) {
					position = new vscode.Position(topLevelImports[0].lineno - 1, 0)

					const duplicateImport = topLevelImports.find(node => node.path && node.path.hash === path)
					if (duplicateImport) {
						vscode.window.showInformationMessage(`The module "${this.label}" has been already imported.`)
						const position = new vscode.Position(duplicateImport.lineno - 1, duplicateImport.column)
						editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenterIfOutsideViewport)
						return null
					}
				}
			}

			const snippet = `@${importSyntaxCount > requireSyntaxCount ? 'import' : 'require'} ${quote}${path}${quote}${semiColonCount >= 0 ? ';' : ''}${document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n'}`

			await editor.edit(worker => worker.insert(position, snippet))

		} else {
			const path = this.getRelativePath(directoryPathOfWorkingDocument)

			let snippet = `url(${quote}${path}${quote})`

			const position = editor.selection.active
			if (position.character > 1 && /\w/.test(document.getText(new vscode.Range(position.translate(0, -1), position)))) {
				snippet = ' ' + snippet
			}

			await editor.edit(worker => worker.insert(editor.selection.active, snippet))
		}
	}
}

function getExistingImportsAndUrls(node: any, visitedNodes = new Set()) {
	if (visitedNodes.has(node)) {
		return []
	}

	visitedNodes.add(node)

	if (node instanceof Nodes.Import || node instanceof Nodes.Call && node.name === 'url' && node.args && node.args.nodes.length === 1) {
		return [node]

	} else if (node.nodeName === 'hsla' || node.nodeName === 'rgba') { // Prevent infinite recursion
		return []

	} else if (_.isObject(node)) {
		const results = []
		for (const key in node) {
			if (key === 'first' || key === 'parent' || _.isFunction(node[key])) {
				continue
			}

			if (_.isObject(node[key])) {
				results.push(...getExistingImportsAndUrls(node[key], visitedNodes))
			}
		}

		return results
	}

	return []
}
