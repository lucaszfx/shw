/**
 * Creates and installs a global `require` function that mimics Node.js functionality,
 * using a provided synchronous file system API (like NWJSApi).
 */
var require = (function() {

    /**
     * @class Module
     * @description Represents a single module, similar to Node.js.
     */
    class Module {
        constructor(id, parent) {
            this.id = id;
            this.exports = {};
            this.parent = parent;
            this.loaded = false;
            this.children = [];
            this.paths = [];
        }
    }

    /**
     * @class MiniRequire
     * @description The internal engine for the require system. An instance of this
     * class is created once and powers the global `require` function.
     */
    class MiniRequire {
        constructor() {
            this.cache = {}; // Module cache.
            this.main = null; // The main module, set after loading the entrypoint.

            // --- Error Constants ---
            this.ERR_MODULE_NOT_FOUND = 'MODULE_NOT_FOUND';
            this.ERR_INVALID_JSON = 'INVALID_JSON';
        }

        require(id, parent = null) {
            const parentDir = parent ? this._dirname(parent.id) : this._dirname(NWJSApi.execDir()); // Use current working dir as base
            const resolvedPath = this._resolve(id, parentDir);

            if (!resolvedPath) {
                const err = new Error(`Cannot find module '${id}' required from '${parent ? parent.id : 'entrypoint'}'`);
                err.code = this.ERR_MODULE_NOT_FOUND;
                throw err;
            }

            if (this.cache[resolvedPath]) {
                return this.cache[resolvedPath].exports;
            }

            const module = new Module(resolvedPath, parent);
            this.cache[resolvedPath] = module;

            // Set the main module *before* loading, so it's available within the app.
            if (!this.main) {
                this.main = module;
            }

            this._load(module);

            module.loaded = true;
            return module.exports;
        }

        _resolve(id, parentDir) {
            const resolutionAttempts = [];
            if (id.startsWith('/') || id.startsWith('./') || id.startsWith('../')) {
                resolutionAttempts.push(...this._resolveAsPath(id, parentDir));
            } else {
                resolutionAttempts.push(...this._resolveNodeModule(id, parentDir));
            }

            for (const path of resolutionAttempts) {
                if (NWJSApi.existsSync(path)) {
                    return path;
                }
            }

            const absolutePath = this._join(parentDir, id);
            const dirPath = this._resolveAsDirectory(absolutePath);
            if(dirPath) return dirPath;

            return null;
        }

        _resolveAsPath(id, parentDir) {
            const absolutePath = this._join(parentDir, id);
            return [
                absolutePath,
                `${absolutePath}.js`,
                `${absolutePath}.json`,
            ];
        }

        _resolveAsDirectory(dirPath) {
            const pkgPath = this._join(dirPath, 'package.json');
            if (NWJSApi.existsSync(pkgPath)) {
                try {
                    const pkgContent = NWJSApi.readFileSync(pkgPath, 'utf8');
                    const pkg = JSON.parse(pkgContent);
                    if (pkg.main) {
                        const mainPath = this._join(dirPath, pkg.main);
                        const asDir = this._resolveAsDirectory(mainPath);
                        if (asDir) return asDir;
                        if (NWJSApi.existsSync(mainPath)) {
                           return mainPath;
                        }
                    }
                } catch (e) { /* Ignore errors */ }
            }

            const indexPath = this._join(dirPath, 'index.js');
            if (NWJSApi.existsSync(indexPath)) { return indexPath; }

            const indexJsonPath = this._join(dirPath, 'index.json');
            if (NWJSApi.existsSync(indexJsonPath)) { return indexJsonPath; }

            return null;
        }

        _resolveNodeModule(id, startDir) {
            let currentDir = startDir;
            while (true) {
                const modulePath = this._join(currentDir, 'node_modules', id);
                const resolvedPath = this._resolveAsDirectory(modulePath);
                if(resolvedPath) return [resolvedPath];

                const parent = this._dirname(currentDir);
                if (parent === currentDir) break;
                currentDir = parent;
            }
            return [];
        }

        _load(module) {
            const filename = module.id;
            const content = NWJSApi.readFileSync(filename, 'utf8');

            if (filename.endsWith('.json')) {
                module.exports = JSON.parse(content);
            } else {
                this._compileJs(module, content);
            }
        }

        _compileJs(module, content) {
            const filename = module.id;
            const dirname = this._dirname(filename);
            const wrapper = `(function(exports, require, module, __filename, __dirname) {\n${content}\n});`;
            const compiledWrapper = eval(wrapper);
            const requireForModule = (id) => this.require(id, module);
            compiledWrapper.call(
                module.exports,
                module.exports,
                requireForModule,
                module,
                filename,
                dirname
            );
        }

        _dirname(path) {
            const parts = path.split('/').filter(p => p);
            if (parts.length <= 1 && path.startsWith('/')) return '/';
            parts.pop();
            return (path.startsWith('/') ? '/' : '') + parts.join('/');
        }

        _join(...paths) {
            const newPath = paths.join('/');
            const resolved = [];
            const parts = newPath.split('/').filter(p => p && p !== '.');
            for (const part of parts) {
                if (part === '..') { resolved.pop(); }
                else { resolved.push(part); }
            }
            return (newPath.startsWith('/') ? '/' : '') + resolved.join('/');
        }
    }

    // Create the single, hidden instance of our require engine.
    const engine = new MiniRequire();

    // This is the function that will become the global `require`.
    const globalRequire = (id) => engine.require(id);

    // Attach properties to the global function, just like in Node.js.
    globalRequire.cache = engine.cache;
    globalRequire.main = null; // Will be set once the entrypoint is loaded.

    // We need to link `require.main` to the engine's main module.
    Object.defineProperty(globalRequire, 'main', {
        get: () => engine.main
    });

    return globalRequire;

})();
