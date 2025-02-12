const fs = require('fs');
const path = require('path');

const rootPackageJson = require('../package.json');
const newVersion = rootPackageJson.version;

const packagesDir = path.join(__dirname, '..', 'packages'); // Assuming packages are in 'packages' dir
const packageDirs = fs
  .readdirSync(packagesDir)
  .filter((dir) => fs.statSync(path.join(packagesDir, dir)).isDirectory());

packageDirs.forEach((packageDirName) => {
  const packageJsonPath = path.join(
    packagesDir,
    packageDirName,
    'package.json',
  );
  if (fs.existsSync(packageJsonPath)) {
    const packageJson = require(packageJsonPath);
    packageJson.version = newVersion;
    fs.writeFileSync(
      packageJsonPath,
      JSON.stringify(packageJson, null, 2) + '\n',
    );
    console.log(`Updated version in ${packageJsonPath} to ${newVersion}`);
  }
});

console.log('Package versions updated successfully.');
