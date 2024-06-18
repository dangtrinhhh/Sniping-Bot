const path = require('path');
const fs = require('fs');

const modulesDir = path.join(__dirname, 'modules');
const modules = {};

fs.readdirSync(modulesDir).forEach((file) => {
    if (path.extname(file) === '.js') {
        const moduleName = path.basename(file, '.js');
        modules[moduleName] = require(path.join(modulesDir, file));
    }
});

module.exports = modules;
