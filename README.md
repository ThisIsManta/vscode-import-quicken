**Import Quicken** is yet another Visual Studio Code extension that helps quickly generating `import`/`require` snippets in JavaScript, TypeScript, and Stylus.

This extension is heavily inspired by [**Quick Require**](https://marketplace.visualstudio.com/items?itemName=milkmidi.vs-code-quick-require).

## Available commands

- **Add an import/require statement** (default keybinding: _Ctrl+Shift+I_) – the extension scans your repository and list out files, exported identifiers, node modules from _package.json_, and imported identifiers from node modules. The coding convention, such as single/double quotes, semi-colons in JavaScript are recognized automatically without any further configurations.
- **Fix broken import/require statements**
- **Convert require to import statements**

Note that the extension may not support multi-folder workspace.

## Basic usage

Simply press _Ctrl+Shift+I_ on your keyboard to list all matching identifiers, and choose one file that you would like to insert a snippet based on it.

![Add an import statement](docs/add-import.gif)

Fixing broken path in an `import`/`require` statement has never been this easy. The command _Import Quicken: Fix Import/Require_ will try to find the closest match based on the file path without hassle. If more than one match is found, the extension will prompt you.

![Fix broken import statements](docs/fix-import.gif)

## Advance usage

In order to populate [Node.js APIs](https://nodejs.org/api/), such as `child_process`, `crypto`, `fs`, and so on, the module [`@types/node`](https://www.npmjs.com/package/@types/node) must be installed locally or globally using `npm install @types/node`.