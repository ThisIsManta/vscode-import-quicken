## 2.0.4
- Improve start-up time.

## 2.0.3
- Fix could not scan node modules for direct file imports.

## 2.0.2
- Fix critical error when checking Yarn workspaces.
- Fix critical error when having no `dependencies` field.

## 2.0.1
- Upgrade dependencies.
- Reduce bundle size.

## 2.0.0
- Improve start-up time.
- Use the shortest path automatically when there is a file that re-exports the selected identifier (for example, an index file) and vice versa depends on the path of the current active document.

## 1.9.0
- Add support of module namespaces.

## 1.8.2
- Fix could not copy the imported identifier when merging an import using `autoCopy` settings.

## 1.8.1
- Fix could not merge named import with default import.

## 1.8.0
- Fix unnamed default imports.
- Fix too many of the same identifiers due to re-exports.
- Amend the list so that identifiers from index files are present in the list.
- Improve import generation performance.

## 1.7.2
- Fix node module default auto imports.
- Fix missing import identifiers.

## 1.7.1
- Amend not showing error dialogs when duplicate imports.

## 1.7.0
- Amend file path so the list shows full path.
- Amend default import identifiers.
- Amend node module default and namespace auto imports.
- Add namespace imports to the list.
- Add support of multiple-source filters in the extension configuration.

## 1.6.0
- Add reading type definitions from triple-slash directives.
- Add ability to directly import module files.
- Fix missing exported identifiers, given `export * from 'another-node-module'`.

## 1.5.2
- Fix wrongly interpret `include` and `exclude` in tsconfig.json.

## 1.5.1
- Improve time performance by internally merging TypeScript into JavaScript.
- Improve import generation recognition.
- Add reading type definitions from index.d.ts and `types` in package.json.
- Add progressive update to the list during initialization process.

## 1.5.0
- Add ability to sort recently used items at the top of the list.
- Add `autoCopy` settings.

## 1.4.2
- Fix listing duplicate node modules and their identifiers.
- Fix adding only named imports for cached node module identifiers.
- Add ability to skip asking for a named import only if the default/namespace import is only used.

## 1.4.1
- Add file name for exported identifiers.
- Amend no re-initialization when extension configuration has been changed.
- Amend import pattern recognition for the current active document.
- Improve performance up to 60% faster during initialization process.
- Remove ".git" files from the list.

## 1.4.0
- Fix did not filter out unwanted files.
- Add Node.js APIs to the list from the global node_modules.
- Add progress indicator while initializing.
- Add support of `include` and `exclude` in tsconfig.json.
- Amend list ordering so that node modules are placed first.

## 1.3.0
- Fix unable to add recently used named imports.
- Fix duplicate dependencies in package.json.
- Add reading type definitions from `typings` in package.json.
- Amend activation point from checking an active file to checking the existence of package.json
- Add syntax guessing for Stylus.
- Amend non-blocking initialization process.
- Remove list sorting logic for performance.

## 1.2.0
- Add recently used named imports for JavaScript/TypeScript node modules.
- Fix unable to recognize newly created files.

## 1.1.7
- Improve syntax guessing performance for JavaScript.

## 1.1.6
- Improve syntax guessing performance for JavaScript.
- Fix reading wrong type definitions from another node_modules.

## 1.1.5
- Fix stale identifier cache for deleted files.

## 1.1.4
- Fix unable to list recently changed identifiers.

## 1.1.3
- Fix the error when the processing file does not belong to any workspace.

## 1.1.2
- Fix the problem with JavaScript bundler.

## 1.1.1
- Fix missing initial progress status.
- Fix the error while processing file change.

## 1.1.0
- Replace `importQuicken.javascript.exclude` and `importQuicken.typescript.exclude` with `importQuicken.javascript.filter` and `importQuicken.typescript.filter` settings respectively.