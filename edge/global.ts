import * as _ from 'lodash'
import { fs } from 'mz'
import * as fp from 'path'
import * as vscode from 'vscode'

import * as JavaScript from './JavaScript'
import * as Stylus from './Stylus'

export interface ExtensionLevelConfigurations {
	history: number
	javascript: JavaScript.JavaScriptConfigurations
	typescript: JavaScript.JavaScriptConfigurations
	stylus: Stylus.StylusConfigurations
}

export interface Language {
	setItems(): Promise<void>
	getItems(document: vscode.TextDocument): Promise<Array<Item> | null>
	addItem(filePath: string): Promise<void>
	cutItem(filePath: string): Promise<void>
	fixImport?(editor: vscode.TextEditor, document: vscode.TextDocument, cancellationToken: vscode.CancellationToken): Promise<boolean | null>
	convertImport?(editor: vscode.TextEditor): Promise<boolean | null>
	reset(): void
}

export interface Item extends vscode.QuickPickItem {
	addImport(editor: vscode.TextEditor, language: Language): Promise<null | undefined | void>
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

export async function tryGetFullPath(pathList: Array<string>, preferredExtension: string, defaultExtension = ['tsx', 'ts', 'jsx', 'js']): Promise<string> {
	const fullPath = fp.resolve(...pathList)

	if (await fs.exists(fullPath)) {
		const fileStat = await fs.lstat(fullPath)
		if (fileStat.isFile()) {
			return fullPath

		} else if (fileStat.isDirectory()) {
			const indexPath = await tryGetFullPath([...pathList, 'index'], preferredExtension)
			if (indexPath !== undefined) {
				return indexPath
			}
		}
	}

	const possibleExtensions = _.uniq([preferredExtension.toLowerCase(), ...defaultExtension])
	for (const extension of possibleExtensions) {
		const fullPathWithExtension = fullPath + '.' + extension
		if (await fs.exists(fullPathWithExtension) && (await fs.lstat(fullPathWithExtension)).isFile()) {
			return fullPathWithExtension
		}
	}
}
