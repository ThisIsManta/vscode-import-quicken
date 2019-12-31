## 1.4.0
- Add Node.js APIs to the list from the global node_modules.

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