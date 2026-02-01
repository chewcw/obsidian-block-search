const jiti = require('jiti')(__filename);
const { searchBlocks } = jiti('./src/blocks/searcher.ts');
const blocks = [
  { text: 'this is a block', level: 0, lineNumber: 0, filePath: 'a.md', fileName: 'a.md' },
  { text: 'this is a nested block', level: 1, lineNumber: 1, filePath: 'a.md', fileName: 'a.md' },
  { text: 'another nested block', level: 1, lineNumber: 2, filePath: 'a.md', fileName: 'a.md' }
];

console.log(JSON.stringify(searchBlocks('a\\s', blocks), null, 2));
