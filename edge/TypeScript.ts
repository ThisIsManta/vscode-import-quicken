import * as _ from 'lodash'
import { fs } from 'mz'
import * as fp from 'path'
import * as ts from 'typescript'
import * as vscode from 'vscode'

import { ExtensionLevelConfigurations } from './global'
import JavaScript from './JavaScript'

const JAVASCRIPT_EXTENSION = /\.jsx?$/i
const TYPESCRIPT_EXTENSION = /\.tsx?$/i

export default class TypeScript extends JavaScript {
	constructor(extensionLevelConfig: ExtensionLevelConfigurations) {
		super({
			...extensionLevelConfig,
			javascript: {
				...extensionLevelConfig.javascript,
				filter: {
					...extensionLevelConfig.javascript.filter,
					...extensionLevelConfig.typescript.filter,
				},
			},
		})
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

	protected async createFileFilter() {
		const baseFilter = await super.createFileFilter()

		if (await this.checkIfAllowJs()) {
			return baseFilter

		} else {
			// Reject JS files
			return (filePath: string) => !JAVASCRIPT_EXTENSION.test(filePath) && baseFilter(filePath)
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
			const { config, error } = ts.parseConfigFileTextToJson(path, await fs.readFile(path, 'utf-8'))
			if (config && !error) {
				return config
			}
		}
	}
}
