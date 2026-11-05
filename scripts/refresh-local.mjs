import {readFile, writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {buildGraph, notionClient} from '../lib/notion.mjs';
const scope = JSON.parse(await readFile('atlas-scope.json', 'utf8'));
const secrets = JSON.parse(await readFile(`${homedir()}/.config/notion-atlas/secrets.json`, 'utf8'));
const result = await buildGraph(scope, notionClient(secrets.NOTION_TOKEN));
if (process.argv.includes('--write')) {
  await writeFile('data.json', JSON.stringify(result.graph, null, 2) + '\n');
  await writeFile('data.js', 'window.ATLAS_DATA = ' + JSON.stringify(result.graph).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029') + ';\n');
}
console.log(JSON.stringify({nodes: result.graph.nodes.length, edges: result.graph.edges.length, roots: result.graph.roots.length}));
