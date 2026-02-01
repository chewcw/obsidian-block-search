const path = require('path');
const jiti = require('jiti')(path.resolve(__dirname, '..'));
const { searchBlocks } = jiti(path.resolve(__dirname, '..', 'src', 'blocks', 'searcher.ts'));

const blocks = [
  { text: 'this is a block', level: 0, lineNumber: 0, filePath: 'a.md', fileName: 'a.md' },
  { text: 'this is a nested block', level: 1, lineNumber: 1, filePath: 'a.md', fileName: 'a.md' },
  { text: 'another nested block', level: 1, lineNumber: 2, filePath: 'a.md', fileName: 'a.md' }
];

const res = searchBlocks('a\\s', blocks);
console.log('RESULTS:', JSON.stringify(res, null, 2));
console.log('GROUP COUNT:', res.length);
if (res[0]) console.log('FIRST GROUP LINES:', res[0].blocks.map(b => b.text));

