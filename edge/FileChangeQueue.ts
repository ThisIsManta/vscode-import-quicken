import { fs } from 'mz'
import * as vscode from 'vscode'

export default class FileChangeQueue extends vscode.Disposable {
	private fileChangeList: Array<{ filePath: string, removed: boolean }> = []
	private lastTimeout: NodeJS.Timeout = null
	private processing = false
	private onFileChange: ({ filePath: string, removed: boolean }) => Promise<void>
	private disposed = false

	constructor(onFileChange: ({ filePath: string, removed: boolean }) => Promise<void>) {
		super(() => {
			this.fileChangeList.splice(0, this.fileChangeList.length)
			if (this.lastTimeout !== null) {
				clearTimeout(this.lastTimeout)
			}
			this.processing = false
			this.disposed = true
		})

		this.onFileChange = onFileChange
	}

	private push(filePath: string, removed: boolean) {
		if (filePath.split(/\\|\//).includes('.git')) {
			return
		}

		if (fs.existsSync(filePath) && fs.lstatSync(filePath).isDirectory()) {
			return
		}

		const index = this.fileChangeList.findIndex(item => item.filePath === filePath)
		if (index >= 0) {
			this.fileChangeList.splice(index, 1)
			this.fileChangeList.push({ filePath, removed })
		} else {
			this.fileChangeList.push({ filePath, removed })
		}
	}

	private async process() {
		if (this.processing) {
			return
		}

		this.processing = true

		while (this.fileChangeList.length > 0) {
			if (this.disposed) {
				return
			}

			await this.onFileChange(this.fileChangeList[0])
			this.fileChangeList.shift()
		}

		this.processing = false
	}

	add(filePath: string) {
		this.push(filePath, false)
	}

	remove(filePath: string) {
		this.push(filePath, true)
	}

	processLazily() {
		if (this.processing || this.disposed) {
			return
		}

		clearTimeout(this.lastTimeout)
		this.lastTimeout = setTimeout(() => { this.process }, 1000)
	}

	processImmediately() {
		this.process()
	}
}
