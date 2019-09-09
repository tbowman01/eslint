/**
 * @fileoverview `IgnorePattern` class.
 *
 * `IgnorePattern` class has the set of glob patterns and the base path.
 *
 * It provides a static method.
 *
 * - `IgnorePattern.createIgnore(ignorePatterns, options)`
 *      Create the predicate function from multiple `IgnorePattern` objects.
 *
 * It provides two properties and a method.
 *
 * - `patterns`
 *      The glob patterns that ignore to lint.
 * - `basePath`
 *      The base path of the glob patterns. If absolute paths existed in the
 *      glob patterns, those are handled as relative paths to the base path.
 * - `getPatternsRelativeTo(basePath)`
 *      Get `patterns` as modified for a given base path. It modifies the
 *      absolute paths in the patterns as prepending the difference of two base
 *      paths.
 *
 * `ConfigArrayFactory` creates `IgnorePattern` objects when it processes
 * `ignorePatterns` properties.
 *
 * @author Toru Nagashima <https://github.com/mysticatea>
 */
"use strict";

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const assert = require("assert");
const path = require("path");
const ignore = require("ignore");
const debug = require("debug")("eslint:ignore-pattern");

/** @typedef {ReturnType<import("ignore").default>} Ignore */

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

/**
 * @typedef {Object} CreateIgnoreOptions
 * @property {string} [cwd=process.cwd()] The path to the current working directory.
 * @property {boolean} [dot=false] If `true` then it doesn't ignore dotfiles.
 */

/**
 * Get the path to the common ancestor directory of given paths.
 * @param {string[]} sourcePaths The paths to calculate the common ancestor.
 * @returns {string} The path tp the common ancestor directory.
 */
function getCommonAncestorPath(sourcePaths) {
    let result = sourcePaths[0];

    for (let i = 1; i < sourcePaths.length; ++i) {
        const a = result;
        const b = sourcePaths[i];

        // Set the shorter one (it's the common ancestor if one includes the other).
        result = a.length < b.length ? a : b;

        // Set the common ancestor.
        for (let j = 0, lastSepPos = 0; j < a.length && j < b.length; ++j) {
            if (a[j] !== b[j]) {
                result = a.slice(0, lastSepPos);
                break;
            }
            if (a[j] === path.sep) {
                lastSepPos = j;
            }
        }
    }

    return result;
}

/**
 * Make relative path.
 * @param {string} from The source path to get relative path.
 * @param {string} to The destination path to get relative path.
 * @returns {string} The relative path.
 */
function relative(from, to) {
    const relPath = path.relative(from, to);

    if (path.sep === "/") {
        return relPath;
    }
    return relPath.split(path.sep).join("/");
}

/**
 * Get the trailing slash if existed.
 * @param {string} filePath The path to check.
 * @returns {string} The trailing slash if existed.
 */
function dirSuffix(filePath) {
    const isDir = (
        filePath.endsWith(path.sep) ||
        (process.platform === "win32" && filePath.endsWith("/"))
    );

    return isDir ? "/" : "";
}

//------------------------------------------------------------------------------
// Public
//------------------------------------------------------------------------------

class IgnorePattern {

    /**
     * Create the predicate function from multiple `IgnorePattern` objects.
     * @param {IgnorePattern[]} ignorePatterns The list of ignore patterns.
     * @param {CreateIgnoreOptions} [options] The options.
     * @returns {function(string):boolean} The preficate function. The argument
     * is an absolute path that is checked. If the predicate function returned
     * `true`, it means the path should be ignored.
     */
    static createIgnore(ignorePatterns, { cwd = process.cwd(), dot = false } = {}) {
        assert(path.isAbsolute(cwd), "'basePath' should be an absolute path.");
        const basePaths = [cwd, ...ignorePatterns.map(p => p.basePath)];
        const basePath = getCommonAncestorPath(basePaths);
        const ig = ignore();

        debug("create with %o", { ignorePatterns, dot, basePaths, basePath });

        ig.add("/node_modules/*");
        ig.add("/bower_components/*");
        if (!dot) {
            ig.add(".*");
            ig.add("!../");
        }
        for (const p of ignorePatterns) {
            for (const pattern of p.getPatternsRelativeTo(basePath)) {
                debug("  add", pattern);
                ig.add(pattern);
            }
        }

        return filePath => {
            assert(path.isAbsolute(filePath), "'filePath' should be an absolute path.");
            const relPath = relative(basePath, filePath) + dirSuffix(filePath);
            const result = relPath !== "" && ig.ignores(relPath);

            return result;
        };
    }

    /**
     * @param {string[]} patterns The glob patterns that ignore to lint.
     * @param {string} basePath The base path of `patterns`.
     */
    constructor(patterns, basePath) {
        assert(path.isAbsolute(basePath), "'basePath' should be an absolute path.");

        /**
         * The glob patterns that ignore to lint.
         * @type {string[]}
         */
        this.patterns = patterns;

        /**
         * The base path of `patterns`.
         * @type {string}
         */
        this.basePath = basePath;
    }

    /**
     * Get `patterns` as modified for a given base path. It modifies the
     * absolute paths in the patterns as prepending the difference of two base
     * paths.
     * @param {string} newBasePath The base path.
     * @returns {string[]} Modifired patterns.
     */
    getPatternsRelativeTo(newBasePath) {
        assert(path.isAbsolute(newBasePath), "'newBasePath' should be an absolute path.");
        const { basePath, patterns } = this;

        if (newBasePath === basePath) {
            return patterns;
        }
        const prefix = `/${relative(newBasePath, basePath)}`;

        return patterns.map(pattern => {
            const negative = pattern.startsWith("!");
            const head = negative ? "!" : "";
            const body = negative ? pattern.slice(1) : pattern;

            return body.startsWith("/") ? `${head}${prefix}${body}` : pattern;
        });
    }
}

module.exports = { IgnorePattern };
