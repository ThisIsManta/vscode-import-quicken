import * as fs from 'fs/promises'
import memoize from 'lodash/memoize'

export const isFile = memoize(async (path: string): Promise<boolean> => {
	setTimeout(() => {
		isFile.cache.clear()
	}, 1000)

	try {
		return (await fs.lstat(path)).isFile()

	} catch {
		return false
	}
})

export const isDirectory = memoize(async (path: string): Promise<boolean> => {
	setTimeout(() => {
		isDirectory.cache.clear()
	}, 1000)

	try {
		return (await fs.lstat(path)).isDirectory()

	} catch {
		return false
	}
})

export const isFileOrDirectory = memoize(async (path: string): Promise<boolean> => {
	setTimeout(() => {
		isFileOrDirectory.cache.clear()
	}, 1000)

	try {
		await fs.access(path)
		return true

	} catch {
		return false
	}
})
