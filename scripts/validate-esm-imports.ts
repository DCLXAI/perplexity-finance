import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const sourceExtensions = ['.ts', '.tsx', '.mts', '.cts'] as const;
const sourceRoots = ['api', 'routes', 'server', 'src', 'scripts'] as const;

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return listSourceFiles(target);
    return sourceExtensions.some((extension) => target.endsWith(extension)) ? [target] : [];
  });
}

function moduleSpecifiers(file: string): readonly string[] {
  const source = readFileSync(file, 'utf8');
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const specifiers: string[] = [];

  function visit(node: ts.Node): void {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier
      && ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(node)
      && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments.length === 1
      && ts.isStringLiteralLike(node.arguments[0]!)
    ) {
      specifiers.push(node.arguments[0]!.text);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return specifiers;
}

function sourceCandidates(base: string): readonly string[] {
  if (base.endsWith('.js')) {
    const stem = base.slice(0, -3);
    return sourceExtensions.map((extension) => `${stem}${extension}`);
  }
  return [
    ...sourceExtensions.map((extension) => `${base}${extension}`),
    ...sourceExtensions.map((extension) => path.join(base, `index${extension}`)),
  ];
}

function resolveInternal(importer: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith('@/')) {
    base = path.join(root, 'src', specifier.slice(2));
  } else if (specifier.startsWith('.')) {
    base = path.resolve(path.dirname(importer), specifier);
  } else {
    return null;
  }

  return sourceCandidates(base).find((candidate) => existsSync(candidate)) ?? null;
}

const topLevelSourceFiles = readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isFile() && sourceExtensions.some((extension) => entry.name.endsWith(extension)))
  .map((entry) => path.join(root, entry.name));
const allSourceFiles = [
  ...topLevelSourceFiles,
  ...sourceRoots.flatMap((directory) => listSourceFiles(path.join(root, directory))),
];
const problems: string[] = [];

// Keep every relative TypeScript module specifier compatible with emitted Node ESM.
for (const file of allSourceFiles) {
  for (const specifier of moduleSpecifiers(file)) {
    if (!specifier.startsWith('.')) continue;
    const resolved = resolveInternal(file, specifier);
    if (specifier.endsWith('.js') && !resolved) {
      problems.push(`${path.relative(root, file)}: module import "${specifier}" does not resolve to TypeScript source`);
    } else if (resolved && !specifier.endsWith('.js')) {
      problems.push(`${path.relative(root, file)}: relative module import "${specifier}" must end in .js`);
    }
    // Unresolved imports with another explicit extension are CSS, images or other assets.
  }
}

// Vercel emits the API graph as individual ESM files, so aliases are also forbidden there.
const deploymentEntries = listSourceFiles(path.join(root, 'api'));
const visited = new Set<string>();
function visitDeploymentGraph(file: string): void {
  const normalized = path.normalize(file);
  if (visited.has(normalized)) return;
  visited.add(normalized);

  for (const specifier of moduleSpecifiers(normalized)) {
    const resolved = resolveInternal(normalized, specifier);
    if (specifier.startsWith('.') && specifier.endsWith('.js') && !resolved) {
      problems.push(`${path.relative(root, normalized)}: deployment import "${specifier}" does not resolve`);
      continue;
    }
    if (!resolved) continue;
    if (specifier.startsWith('@/')) {
      problems.push(`${path.relative(root, normalized)}: deployment import "${specifier}" must be relative`);
    } else if (!specifier.endsWith('.js')) {
      problems.push(`${path.relative(root, normalized)}: deployment import "${specifier}" must end in .js`);
    }
    visitDeploymentGraph(resolved);
  }
}
for (const entry of deploymentEntries) visitDeploymentGraph(entry);

if (problems.length) {
  throw new Error(`Node ESM import validation failed:\n${problems.join('\n')}`);
}

console.log(JSON.stringify({
  sourceFilesChecked: allSourceFiles.length,
  deploymentEntries: deploymentEntries.length,
  deploymentModules: visited.size,
  relativeTypeScriptSpecifiers: 'explicit .js',
  deploymentAliases: 'none',
  result: 'PASS',
}, null, 2));
