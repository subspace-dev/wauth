import fs from 'fs';

const packageJSON = JSON.parse(fs.readFileSync('./package.json', 'utf8'));

console.log(`SDK version: ${packageJSON.version}`);
fs.writeFileSync('./src/version.ts', `export const WAUTH_VERSION = "${packageJSON.version}";\n`);