import * as fs from 'fs'
import * as fp from 'path'
import * as _ from 'lodash'
import * as vscode from 'vscode'
import { ExtensionLevelConfigurations } from './global'
import JavaScript from './JavaScript'
import * as ts from 'typescript'

const JAVASCRIPT_EXTENSION = /\.jsx?$/i
const TYPESCRIPT_EXTENSION = /\.tsx?$/i

export default class TypeScript extends JavaScript {
	constructor(extensionLevelConfig: ExtensionLevelConfigurations, fileWatch: vscode.FileSystemWatcher) {
		super({
			...extensionLevelConfig,
			javascript: extensionLevelConfig.typescript
		}, fileWatch)
	}

	async getCompatibleFileExtensions() {
		if (await this.checkIfAllowJs()) {
			return ['ts', 'tsx', 'js', 'jsx']
		}

		return ['ts', 'tsx']
	}

	async checkIfImportDefaultIsPreferredOverNamespace() {
		const tsConfig = await this.getTypeScriptConfigurations()
		return _.get<boolean>(tsConfig, 'compilerOptions.esModuleInterop', false)
	}

	async checkIfAllowJs() {
		const tsConfig = await this.getTypeScriptConfigurations()
		return _.get<boolean>(tsConfig, 'compilerOptions.allowJs', false)
	}

	protected async createLanguageSpecificFileFilter() {
		if (await this.checkIfAllowJs()) {
			return () => true

		} else {
			// Reject JS files
			return (link: vscode.Uri) => !JAVASCRIPT_EXTENSION.test(link.fsPath)
		}
	}

	private async getTypeScriptConfigurations() {
		const pathList = await vscode.workspace.findFiles('**/tsconfig.json')
		const path = _.chain(pathList)
			.map(link => link.fsPath)
			.sortBy(path => -fp.dirname(path).split(fp.sep).length)
			.find(path => vscode.window.activeTextEditor.document.uri.fsPath.startsWith(fp.dirname(path) + fp.sep))
			.value()
		if (path) {
			const { config, error } = ts.parseConfigFileTextToJson(path, fs.readFileSync(path, 'utf-8'))
			if (config && !error) {
				return config
			}
		}
	}
}