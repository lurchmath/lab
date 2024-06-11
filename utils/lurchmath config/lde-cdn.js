
/**
 * This file imports all needed classes from the main branch of the LDE repo.
 * We do it in this file so that anywhere else in the app, it can just load this
 * file and know it's getting the right classes.  Then if we need to change the
 * URL, we can do it here in one place, rather than in many places throughout
 * the codebase.
 */

export {
    LogicConcept, MathConcept,
    Environment, Declaration, Expression, LurchSymbol
} from '../lde/src/index.js' 
// from 'https://cdn.jsdelivr.net/gh/lurchmath/lde@master/src/index.js'

import branchLDE from '../lde/src/experimental/global-validation.js'
//from 'https://cdn.jsdelivr.net/gh/lurchmath/lde@85e7368b912116420a2dc7475c616a721ec38ba1/src/experimental/global-validation.js'
export const LDE = branchLDE
