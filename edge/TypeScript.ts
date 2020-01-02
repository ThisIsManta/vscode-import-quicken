import * as _ from 'lodash'
import { Minimatch } from 'minimatch'
import { fs } from 'mz'
import * as fp from 'path'
import * as ts from 'typescript'
import * as vscode from 'vscode'

import FileInfo, { getPosixPath } from './FileInfo'
import { ExtensionConfiguration } from './global'
import JavaScript from './JavaScript'

export default class TypeScript extends JavaScript {
	private tsconfigCache = new Map<string, { compilerOptions: ts.CompilerOptions, include?: Array<string>, exclude?: Array<string> }>()
	private tsconfigWatcher: vscode.FileSystemWatcher

	setConfiguration(config: ExtensionConfiguration) {
		super.setConfiguration(_.merge({}, config, { javascript: config.typescript }))
	}

	async setItems() {
		const φ = async (path: string) => {
			const { config, error } = ts.parseConfigFileTextToJson(path, await fs.readFile(path, 'utf-8'))
			if (config && !error) {
				this.tsconfigCache.set(path, config)
			}
		}

		vscode.workspace.findFiles('**/tsconfig.json').then(links => {
			for (const link of links) {
				φ(link.fsPath)
			}
		})

		this.tsconfigWatcher = vscode.workspace.createFileSystemWatcher('**/tsconfig.json')
		this.tsconfigWatcher.onDidCreate(link => {
			φ(link.fsPath)
		})
		this.tsconfigWatcher.onDidChange(link => {
			φ(link.fsPath)
		})
		this.tsconfigWatcher.onDidDelete(link => {
			this.tsconfigCache.delete(link.fsPath)
		})

		super.setItems()
	}

	dispose() {
		super.dispose()

		this.tsconfigCache.clear()

		if (this.tsconfigWatcher) {
			this.tsconfigWatcher.dispose()
		}
	}

	getCompatibleFileExtensions() {
		const tsconfig = this.getTypeScriptConfigurations()
		if (tsconfig?.compilerOptions.allowJs) {
			return ['ts', 'tsx', 'js', 'jsx']
		}

		return ['ts', 'tsx']
	}

	checkIfImportDefaultIsPreferredOverNamespace() {
		const tsconfig = this.getTypeScriptConfigurations()
		return tsconfig?.compilerOptions.esModuleInterop ?? false
	}

	protected createFileFilter(document: vscode.TextDocument) {
		const baseFilter = super.createFileFilter(document)

		const tsconfig = this.getTypeScriptConfigurations(document)

		const jsAllowed = tsconfig?.compilerOptions.allowJs
		const jsExtension = /jsx?$/i

		// Presume the input pattern is written in POSIX style
		const inclusionList = tsconfig?.include?.map(pattern =>
			new Minimatch(fp.posix.resolve(getPosixPath(fp.dirname(tsconfig.filePath)), pattern)))
		const exclusionList = tsconfig?.exclude?.map(pattern =>
			new Minimatch(fp.posix.resolve(getPosixPath(fp.dirname(tsconfig.filePath)), pattern)))

		return (fileInfo: FileInfo) => {
			if (!baseFilter(fileInfo)) {
				return false
			}

			if (!jsAllowed && jsExtension.test(fileInfo.fileExtensionWithoutLeadingDot)) {
				return false
			}

			if (inclusionList && inclusionList.every(pattern => !pattern.match(fileInfo.fullPathForPOSIX))) {
				return false
			}

			if (exclusionList && exclusionList.some(pattern => pattern.match(fileInfo.fullPathForPOSIX))) {
				return false
			}

			return true
		}
	}

	private getTypeScriptConfigurations(document?: vscode.TextDocument) {
		for (const [filePath, tsconfig] of _.sortBy(Array.from(this.tsconfigCache), ([path]) => -fp.dirname(path).split(fp.sep).length)) {
			if ((document ?? vscode.window.activeTextEditor?.document).uri.fsPath.startsWith(fp.dirname(filePath) + fp.sep)) {
				return {
					filePath,
					...tsconfig,
				}
			}
		}
	}
}
