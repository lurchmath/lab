
/**
 * This file imports all needed classes from the main branch of the LDE repo. We
 * do it in this file so that anywhere else in the app, it can just load this
 * file and know it's getting the right classes.  Then if we need to change the
 * URL, we can do it here in one place, rather than in many places throughout
 * the codebase.
 */

// local imports (uncomment to use)
export {
  MathConcept, LogicConcept, Expression, Declaration, Environment, LurchSymbol,
  Matching, Formula, Scoping, Validation, Application
} from '../../lde/src/index.js' 
export { Problem } from '../../lde/src/matching/problem.js'
export { BindingExpression } from '../../lde/src/binding-expression.js'
export { default } from '../../lde/src/validation/conjunctive-normal-form.js' 

/* From CDN (uncomment to use)
export {
  MathConcept, LogicConcept, Expression, Declaration, Environment, LurchSymbol,
  Matching, Formula, Scoping, Validation, Application
} from 
  'https://cdn.jsdelivr.net/gh/lurchmath/lde@master/src/index.js'
export { Problem } from 
  'https://cdn.jsdelivr.net/gh/lurchmath/lde@master/src/matching/problem.js'
export { BindingExpression } from 
   'https://cdn.jsdelivr.net/gh/lurchmath/lde@master/src/binding-expression.js'
export { default } from 
  'https://cdn.jsdelivr.net/gh/lurchmath/lde@master/src/validation/conjunctive-normal-form.js'
*/