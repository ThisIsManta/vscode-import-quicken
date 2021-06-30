import { promises as fs } from 'fs'
import * as _ from 'lodash'

export const isFile = _.memoize(async (path: string): Promise<boolean> => {
	setTimeout(() => {
		isFile.cache.clear()
	}, 1000)

	try {
		return (await fs.lstat(path)).isFile()

	} catch {
		return false
	}
})

export const isDirectory = _.memoize(async (path: string): Promise<boolean> => {
	setTimeout(() => {
		isDirectory.cache.clear()
	}, 1000)

	try {
		return (await fs.lstat(path)).isDirectory()

	} catch {
		return false
	}
})

export const isFileOrDirectory = _.memoize(async (path: string): Promise<boolean> => {
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
