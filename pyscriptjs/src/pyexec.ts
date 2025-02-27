import { getLogger } from './logger';
import { ensureUniqueId } from './utils';
import type { Runtime } from './runtime';

const logger = getLogger('pyexec');

export async function pyExec(runtime: Runtime, pysrc: string, outElem: HTMLElement) {
    // this is the python function defined in pyscript.py
    const set_current_display_target = runtime.globals.get('set_current_display_target');
    ensureUniqueId(outElem);
    set_current_display_target(outElem.id);
    try {
        try {
            return await runtime.run(pysrc);
        } catch (err) {
            // XXX: currently we display exceptions in the same position as
            // the output. But we probably need a better way to do that,
            // e.g. allowing plugins to intercept exceptions and display them
            // in a configurable way.
            displayPyException(err, outElem);
        }
    } finally {
        set_current_display_target(undefined);
    }
}

/**
 * Javascript API to call the python display() function
 *
 * Expected usage:
 *     pyDisplay(runtime, obj);
 *     pyDisplay(runtime, obj, { target: targetID });
 */
export function pyDisplay(runtime: Runtime, obj: any, kwargs: object) {
    const display = runtime.globals.get('display');
    if (kwargs === undefined) display(obj);
    else {
        display.callKwargs(obj, kwargs);
    }
}

function displayPyException(err: any, errElem: HTMLElement) {
    //addClasses(errElem, ['py-error'])
    const pre = document.createElement('pre');
    pre.className = 'py-error';

    if (err.name === 'PythonError') {
        // err.message contains the python-level traceback (i.e. a string
        // starting with: "Traceback (most recent call last) ..."
        logger.error('Python exception:\n' + err.message);
        pre.innerText = err.message;
    } else {
        // this is very likely a normal JS exception. The best we can do is to
        // display it as is.
        logger.error('Non-python exception:\n' + err);
        pre.innerText = err;
    }
    errElem.appendChild(pre);
}
