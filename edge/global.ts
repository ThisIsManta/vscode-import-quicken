import uniq from 'lodash/uniq'
import * as fp from 'path'
import * as vscode from 'vscode'

import * as JavaScript from './JavaScript'
import { isFile, isDirectory } from './utility'

export interface ExtensionConfiguration {
	autoCopy: boolean
	javascript: JavaScript.JavaScriptConfiguration
	typescript: JavaScript.JavaScriptConfiguration
}

export interface Language extends vscode.Disposable {
	setUserConfiguration(config: ExtensionConfiguration): void
	setItems(): Promise<void>
	getItems(document: vscode.TextDocument): Promise<Array<Item> | null>
	addItem(filePath: string): Promise<void>
	cutItem(filePath: string): Promise<void>
	fixImport?(editor: vscode.TextEditor, document: vscode.TextDocument, cancellationToken: vscode.CancellationToken): Promise<boolean | null>
	convertImport?(editor: vscode.TextEditor): Promise<boolean | null>
}

export interface Item extends vscode.QuickPickItem {
	readonly id: string
	addImport(editor: vscode.TextEditor, language: Language): Promise<void>
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

export async function tryGetFullPath(pathList: Array<string>, preferredExtension: string, defaultExtensions = ['tsx', 'ts', 'jsx', 'js'], fullPathCache?: { [fullPath: string]: boolean }): Promise<string> {
	const fullPath = fp.resolve(...pathList)
	const possibleExtensions = uniq(
		[preferredExtension.toLowerCase(), ...defaultExtensions]
			.map(extension => extension.replace(/^\./, ''))
	)

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

	if (fp.extname(fullPath) && await isFile(fullPath)) {
		return fullPath
	}

	for (const extension of possibleExtensions) {
		const fullPathWithExtension = fullPath + '.' + extension
		if (await isFile(fullPathWithExtension)) {
			return fullPathWithExtension
		}
	}

	if (await isDirectory(fullPath)) {
		const indexPath = await tryGetFullPath([...pathList, 'index'], preferredExtension, defaultExtensions)
		if (indexPath !== undefined) {
			return indexPath
		}
	}
}
