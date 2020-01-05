import * as _ from 'lodash'
import { fs } from 'mz'
import * as fp from 'path'
import * as vscode from 'vscode'

import * as JavaScript from './JavaScript'

export interface ExtensionConfiguration {
	autoCopy: boolean
	javascript: JavaScript.JavaScriptConfiguration
	typescript: JavaScript.JavaScriptConfiguration
}

export interface Language extends vscode.Disposable {
	setConfiguration(config: ExtensionConfiguration): void
	setItems(): Promise<void>
	getItems(document: vscode.TextDocument): Promise<Array<Item> | null>
	addItem(filePath: string): Promise<void>
	cutItem(filePath: string): Promise<void>
	fixImport?(editor: vscode.TextEditor, document: vscode.TextDocument, cancellationToken: vscode.CancellationToken): Promise<boolean | null>
	convertImport?(editor: vscode.TextEditor): Promise<boolean | null>
}

export interface Item extends vscode.QuickPickItem {
	readonly id: string
	addImport(editor: vscode.TextEditor, language: Language): Promise<null | undefined | void>
}

export function setImportNameToClipboard(name: string) {
	const config = vscode.workspace.getConfiguration().get<ExtensionConfiguration>('importQuicken')
	if (config.autoCopy && name) {
		vscode.env.clipboard.writeText(name)
	}
}

export async function findFilesRoughly(filePath: string, fileExtensions?: Array<string>): Promise<Array<string>> {
	const fileName = fp.basename(filePath)

	let fileLinks = await vscode.workspace.findFiles('**/' + fileName)

	if (fileExtensions) {
		for (const fileExtension of fileExtensions) {
			if (fileName.toLowerCase().endsWith('.' + fileExtension)) {
				continue
			}

			fileLinks = fileLinks.concat(await vscode.workspace.findFiles('**/' + fileName + '.' + fileExtension))
			fileLinks = fileLinks.concat(await vscode.workspace.findFiles('**/' + fileName + '/index.' + fileExtension))
		}
	}

	const matchingPaths = fileLinks.map(item => item.fsPath)

	if (matchingPaths.length > 1) {
		// Given originalPath = '../../../abc/xyz.js'
		// Set originalPathList = ['abc', 'xyz.js']
		const originalPathList = filePath.split(/\\|\//).slice(0, -1).filter(pathUnit => pathUnit !== '.' && pathUnit !== '..')

		let count = 0
		while (++count <= originalPathList.length) {
			const refinedPaths = matchingPaths.filter(path => path.split(/\\|\//).slice(0, -1).slice(-count).join('|') === originalPathList.slice(-count).join('|'))
			if (refinedPaths.length === 1) {
				return refinedPaths
			}
		}
	}

	return matchingPaths
}

export function hasFileExtensionOf(document: vscode.TextDocument, extensions: Array<string>) {
	return extensions.indexOf(_.trimStart(fp.extname(document.fileName), '.').toLowerCase()) >= 0
}

export async function tryGetFullPath(pathList: Array<string>, preferredExtension: string, defaultExtensions = ['tsx', 'ts', 'jsx', 'js'], fullPathCache?: { [fullPath: string]: boolean }): Promise<string> {
	const fullPath = fp.resolve(...pathList)
	const possibleExtensions = _.uniq([preferredExtension.toLowerCase(), ...defaultExtensions])

	if (fullPathCache) {
		if (fp.extname(fullPath) && fullPathCache[fullPath]) {
			return fullPath
		}

		for (const extension of possibleExtensions) {
			const fullPathWithExtension = fullPath + '.' + extension
			if (fullPathCache[fullPathWithExtension]) {
				return fullPathWithExtension
			}
		}

		for (const extension of possibleExtensions) {
			const indexPathWithExtension = fp.join(fullPath, 'index.' + extension)
			if (fullPathCache[indexPathWithExtension]) {
				return indexPathWithExtension
			}
		}
	}

	if (fp.extname(fullPath) && await fs.exists(fullPath) && (await fs.lstat(fullPath)).isFile()) {
		return fullPath
	}

	for (const extension of possibleExtensions) {
		const fullPathWithExtension = fullPath + '.' + extension
		if (await fs.exists(fullPathWithExtension) && (await fs.lstat(fullPathWithExtension)).isFile()) {
			return fullPathWithExtension
		}
	}

	if (await fs.exists(fullPath) && (await fs.lstat(fullPath)).isDirectory()) {
		const indexPath = await tryGetFullPath([...pathList, 'index'], preferredExtension, defaultExtensions)
		if (indexPath !== undefined) {
			return indexPath
		}
	}
}
