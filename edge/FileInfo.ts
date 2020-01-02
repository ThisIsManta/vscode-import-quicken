import * as _ from 'lodash'
import * as fp from 'path'

const PATH_SEPARATOR_FOR_WINDOWS = /\\/g

const DRIVE_LETTER_FOR_WINDOWS = /^(\w+):(\\|\/)/

export default class FileInfo {
	readonly fullPath: string
	readonly fullPathForPOSIX: string
	readonly fileNameWithExtension: string
	readonly fileNameWithoutExtension: string
	readonly fileExtensionWithoutLeadingDot: string
	readonly directoryName: string
	readonly directoryPath: string
	readonly directoryPathForPOSIX: string

	constructor(fullPath: string) {
		// Correct invalid path usually from "glob"
		if (DRIVE_LETTER_FOR_WINDOWS.test(fullPath) && fullPath.includes(fp.posix.sep)) {
			fullPath = fullPath.replace(new RegExp('\\' + fp.posix.sep, 'g'), fp.win32.sep)
		}

		this.fullPath = fullPath
		this.fullPathForPOSIX = getPosixPath(this.fullPath)
		this.fileExtensionWithoutLeadingDot = fp.extname(this.fullPath).replace(/^\./, '')
		this.fileNameWithExtension = fp.basename(this.fullPath)
		this.fileNameWithoutExtension = this.fileNameWithExtension.replace(new RegExp('\\.' + this.fileExtensionWithoutLeadingDot + '$', 'i'), '')
		this.directoryName = _.last(fp.dirname(this.fullPath).split(fp.sep))
		this.directoryPath = fp.dirname(this.fullPath)
		this.directoryPathForPOSIX = getPosixPath(fp.dirname(this.fullPath))
	}

	getRelativePath(directoryPath: string) {
		let relativePath = getPosixPath(fp.relative(directoryPath, this.fullPath))
		if (relativePath.startsWith('../') === false) {
			relativePath = './' + relativePath
		}

		return relativePath
	}
}

export function getPosixPath(path: string) {
	return (path || '')
		.replace(DRIVE_LETTER_FOR_WINDOWS, '/$1/')
		.replace(PATH_SEPARATOR_FOR_WINDOWS, '/')
}
