import * as _ from 'lodash'
import { fs } from 'mz'
import * as fp from 'path'
import { Parser, nodes as Nodes } from 'stylus'
import * as vscode from 'vscode'

import FileInfo from './FileInfo'
import { ExtensionLevelConfigurations, Language, Item, getSortingLogic, findFilesRoughly } from './global'

export interface StylusConfigurations {
	syntax: '@import' | '@require'
	fileExtension: boolean
	indexFile: boolean
	quoteCharacter: 'single' | 'double'
	semiColons: boolean
}

const SUPPORTED_LANGUAGE = /^stylus$/

export default class Stylus implements Language {
	private configs: StylusConfigurations
	private fileItemCache: Array<FileItem>

	constructor(extensionLevelConfigs: ExtensionLevelConfigurations) {
		this.configs = extensionLevelConfigs.stylus
	}

	async getItems(document: vscode.TextDocument) {
		if (SUPPORTED_LANGUAGE.test(document.languageId) === false) {
			return null
		}

		const documentFileInfo = new FileInfo(document.fileName)
		const rootPath = vscode.workspace.getWorkspaceFolder(document.uri).uri.fsPath

		if (!this.fileItemCache) {
			const fileLinks = await vscode.workspace.findFiles('**/*.{styl,css,jpg,jpeg,png,gif,svg,otf,ttf,woff,woff2,eot}')

			this.fileItemCache = _.chain(fileLinks)
				.map(fileLink => new FileItem(new FileInfo(fileLink.fsPath), rootPath, this.configs))
				.sortBy(getSortingLogic(rootPath))
				.value()
		}

		const filteredFileItems = _.reject(this.fileItemCache, item => item.fileInfo.fullPath === documentFileInfo.fullPath)

		return filteredFileItems
	}

	addItem(filePath: string) {
		if (this.fileItemCache) {
			const fileInfo = new FileInfo(filePath)
			const rootPath = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath)).uri.fsPath
			this.fileItemCache.push(new FileItem(fileInfo, rootPath, this.configs))
		}
	}

	cutItem(filePath: string) {
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
					const item = new FileItem(new FileInfo(matchingFullPaths[0]), rootPath, this.configs)
					worker.replace(getEditableRange(node), item.getRelativePath(documentFileInfo.directoryPath))
				})

			} else {
				const candidateItems = matchingFullPaths.map(path => new FileItem(new FileInfo(path), rootPath, this.configs))
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

	reset() {
		this.fileItemCache = null
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
	private options: StylusConfigurations
	readonly label: string;
	readonly description: string;
	readonly fileInfo: FileInfo

	constructor(fileInfo: FileInfo, rootPath: string, options: StylusConfigurations) {
		this.options = options
		this.fileInfo = fileInfo

		this.description = _.trim(fp.dirname(this.fileInfo.fullPath.substring(rootPath.length)), fp.sep)

		if (this.options.indexFile === false && this.fileInfo.fileNameWithExtension === 'index.styl') {
			this.label = this.fileInfo.directoryName
			this.description = _.trim(this.fileInfo.fullPath.substring(rootPath.length), fp.sep)

		} else if (this.options.fileExtension === false && this.fileInfo.fileExtensionWithoutLeadingDot === 'styl') {
			this.label = this.fileInfo.fileNameWithoutExtension

		} else {
			this.label = this.fileInfo.fileNameWithExtension
		}
	}

	getRelativePath(directoryPathOfWorkingDocument: string) {
		let path = this.fileInfo.getRelativePath(directoryPathOfWorkingDocument)

		if (this.options.indexFile === false && this.fileInfo.fileNameWithExtension === 'index.styl') {
			path = fp.dirname(path)

		} else if (this.options.fileExtension === false && this.fileInfo.fileExtensionWithoutLeadingDot === 'styl') {
			path = path.replace(/\.styl$/i, '')
		}

		return path
	}

	async addImport(editor: vscode.TextEditor) {
		const document = editor.document

		const directoryPathOfWorkingDocument = new FileInfo(document.fileName).directoryPath

		const quote = this.options.quoteCharacter === 'single' ? '\'' : '"'

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

			const snippet = `@${this.options.syntax ? 'import' : 'require'} ${quote}${path}${quote}${this.options.semiColons ? ';' : ''}${document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n'}`

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

	} else if (_.isObject(node)) {
		const results = []
		for (const prop in node) {
			if (_.isObject(node[prop])) {
				results.push(...getExistingImportsAndUrls(node[prop], visitedNodes))
			}
		}

		return results

	} else {
		return []
	}
}
