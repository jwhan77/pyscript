import toml from '../src/toml';
import { getLogger } from './logger';
import { version } from './runtime';
import { getAttribute, readTextFromPath, showError } from './utils';

const logger = getLogger('py-config');

export interface AppConfig extends Record<string, any> {
    name?: string;
    description?: string;
    version?: string;
    schema_version?: number;
    type?: string;
    author_name?: string;
    author_email?: string;
    license?: string;
    autoclose_loader?: boolean;
    runtimes?: RuntimeConfig[];
    packages?: string[];
    paths?: string[];
    plugins?: string[];
    pyscript?: PyScriptMetadata;
}

export type RuntimeConfig = {
    src?: string;
    name?: string;
    lang?: string;
};

export type PyScriptMetadata = {
    version?: string;
    time?: string;
};

const allKeys = {
    string: ['name', 'description', 'version', 'type', 'author_name', 'author_email', 'license'],
    number: ['schema_version'],
    boolean: ['autoclose_loader'],
    array: ['runtimes', 'packages', 'paths', 'plugins'],
};

export const defaultConfig: AppConfig = {
    schema_version: 1,
    type: 'app',
    autoclose_loader: true,
    runtimes: [
        {
            src: 'https://cdn.jsdelivr.net/pyodide/v0.21.3/full/pyodide.js',
            name: 'pyodide-0.21.3',
            lang: 'python',
        },
    ],
    packages: [],
    paths: [],
    plugins: [],
};

export function loadConfigFromElement(el: Element): AppConfig {
    let srcConfig: AppConfig;
    let inlineConfig: AppConfig;
    if (el === null) {
        srcConfig = {};
        inlineConfig = {};
    } else {
        const configType = getAttribute(el, 'type') || 'toml';
        srcConfig = extractFromSrc(el, configType);
        inlineConfig = extractFromInline(el, configType);
    }
    srcConfig = mergeConfig(srcConfig, defaultConfig);
    const result = mergeConfig(inlineConfig, srcConfig);
    result.pyscript = {
        version: version,
        time: new Date().toISOString(),
    };
    return result;
}

function extractFromSrc(el: Element, configType: string) {
    const src = getAttribute(el, 'src');
    if (src) {
        logger.info('loading ', src);
        return validateConfig(readTextFromPath(src), configType);
    }
    return {};
}

function extractFromInline(el: Element, configType: string) {
    if (el.innerHTML !== '') {
        logger.info('loading <py-config> content');
        return validateConfig(el.innerHTML, configType);
    }
    return {};
}

function fillUserData(inputConfig: AppConfig, resultConfig: AppConfig): AppConfig {
    for (const key in inputConfig) {
        // fill in all extra keys ignored by the validator
        if (!(key in defaultConfig)) {
            resultConfig[key] = inputConfig[key];
        }
    }
    return resultConfig;
}

function mergeConfig(inlineConfig: AppConfig, externalConfig: AppConfig): AppConfig {
    if (Object.keys(inlineConfig).length === 0 && Object.keys(externalConfig).length === 0) {
        return defaultConfig;
    } else if (Object.keys(inlineConfig).length === 0) {
        return externalConfig;
    } else if (Object.keys(externalConfig).length === 0) {
        return inlineConfig;
    } else {
        let merged: AppConfig = {};

        for (const keyType in allKeys) {
            const keys: string[] = allKeys[keyType];
            keys.forEach(function (item: string) {
                if (keyType === 'boolean') {
                    merged[item] =
                        typeof inlineConfig[item] !== 'undefined' ? inlineConfig[item] : externalConfig[item];
                } else {
                    merged[item] = inlineConfig[item] || externalConfig[item];
                }
            });
        }

        // fill extra keys from external first
        // they will be overridden by inline if extra keys also clash
        merged = fillUserData(externalConfig, merged);
        merged = fillUserData(inlineConfig, merged);

        return merged;
    }
}

function parseConfig(configText: string, configType = 'toml') {
    let config: object;
    if (configType === 'toml') {
        try {
            // TOML parser is soft and can parse even JSON strings, this additional check prevents it.
            if (configText.trim()[0] === '{') {
                const errMessage = `config supplied: ${configText} is an invalid TOML and cannot be parsed`;
                showError(`<p>${errMessage}</p>`);
                throw Error(errMessage);
            }
            config = toml.parse(configText);
        } catch (err) {
            const errMessage: string = err.toString();
            showError(`<p>config supplied: ${configText} is an invalid TOML and cannot be parsed: ${errMessage}</p>`);
            // we cannot easily just "throw err" here, because for some reason
            // playwright gets confused by it and cannot print it
            // correctly. It is just displayed as an empty error.
            // If you print err in JS, you get something like this:
            //     n {message: '...', offset: 19, line: 2, column: 19}
            // I think that 'n' is the minified name?
            // The workaround is to re-wrap the message into SyntaxError(), so that
            // it's correctly handled by playwright.
            throw SyntaxError(errMessage);
        }
    } else if (configType === 'json') {
        try {
            config = JSON.parse(configText);
        } catch (err) {
            const errMessage: string = err.toString();
            showError(`<p>config supplied: ${configText} is an invalid JSON and cannot be parsed: ${errMessage}</p>`);
            throw err;
        }
    } else {
        showError(`<p>type of config supplied is: ${configType}, supported values are ["toml", "json"].</p>`);
    }
    return config;
}

function validateConfig(configText: string, configType = 'toml') {
    const config = parseConfig(configText, configType);

    const finalConfig: AppConfig = {};

    for (const keyType in allKeys) {
        const keys: string[] = allKeys[keyType];
        keys.forEach(function (item: string) {
            if (validateParamInConfig(item, keyType, config)) {
                if (item === 'runtimes') {
                    finalConfig[item] = [];
                    const runtimes = config[item] as object[];
                    runtimes.forEach(function (eachRuntime: object) {
                        const runtimeConfig: object = {};
                        for (const eachRuntimeParam in eachRuntime) {
                            if (validateParamInConfig(eachRuntimeParam, 'string', eachRuntime)) {
                                runtimeConfig[eachRuntimeParam] = eachRuntime[eachRuntimeParam];
                            }
                        }
                        finalConfig[item].push(runtimeConfig);
                    });
                } else {
                    finalConfig[item] = config[item];
                }
            }
        });
    }

    return fillUserData(config, finalConfig);
}

function validateParamInConfig(paramName: string, paramType: string, config: object): boolean {
    if (paramName in config) {
        return paramType === 'array' ? Array.isArray(config[paramName]) : typeof config[paramName] === paramType;
    }
    return false;
}
