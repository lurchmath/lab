
import { Symbol } from '../symbol.js'
import { Application } from "../application.js"
import { Binding } from "../binding.js"
import { LogicConcept } from "../logic-concept.js"
import { metavariable } from "./metavariables.js"
import { Constraint } from "./constraint.js"
import { Substitution } from "./substitution.js"
import { CaptureConstraint, CaptureConstraints } from "./capture-constraint.js"
import {
    constantEF, projectionEF, applicationEF, fullBetaReduce
} from './expression-functions.js'
import { NewSymbolStream } from "./new-symbol-stream.js"

/**
 * A matching problem is a set of {@link Constraint Constraints} to be solved.
 * Some problems have just one solution and others have many.  Examples:
 * 
 *  * If we have a single constraint $(f(x,y),k+3)$, with $f,x,y$
 *    {@link module:Metavariables.metavariable metavariables}, then there is a
 *    single solution: $f\mapsto +$, $x\mapsto k$, $y\mapsto 3$.
 *  * If we have a single constraint $(P(3),3=3)$, with $P$ a
 *    {@link module:Metavariables.metavariable metavariable}, then there are
 *    four solutions, shown below.  Note that the dummy variable used in the
 *    $\lambda$ expression is irrelevant; it could be any symbol other than 3.
 *     * $P\mapsto\lambda x.{}3=3$
 *     * $P\mapsto\lambda x.{}x=3$
 *     * $P\mapsto\lambda x.{}3=x$
 *     * $P\mapsto\lambda x.{}x=x$
 *
 * With more than one constraint, solving the problem becomes more complex,
 * because all constraints must be satisfied at once, and there may be many
 * metavariables.  It is also important that any solution must avoid variable
 * capture, that is, we cannot assign a metavariable $X\mapsto y$ if performing
 * the substitution $X\mapsto y$ in some pattern would require replacing a free
 * $X$ at a location where $y$ is not free to replace that $X$.
 * 
 * This class expresses a matching problem, that is, a set of matching
 * {@link Constraint Constraints}, and includes an algorithm for solving them
 * simultaneously, producing a list of solutions (which may be empty).  Each
 * solution on the list is also a set of {@link Constraint Constraints}, but
 * each one will have a single metavariable as its pattern, that is, it will
 * pass the {@link Constraint#canBeApplied canBeApplied()} test, and thus it is
 * fully reduced, in the sense that there is no more "solving" work to be done.
 */
export class Problem {

    /**
     * Construct a new matching problem with no constraints in it.  Then, if any
     * argument are provided, they are passed directly to the
     * {@link Problem#add add()} function.  See its documentation for how they
     * are processed.
     * 
     * @param {...any} args constraints to add to this problem after its
     *   construction, in a wide variety of forms, as documented in this class's
     *   {@link Problem#add add()} function
     * 
     * @see {@link Problem#add add()}
     */
    constructor ( ...args ) {
        this.constraints = [ ]
        this.add( ...args )
    }

    /**
     * Add constraints to this problem.  Arguments are accepted in any of the
     * following forms.
     * 
     *  * `p.add( p1, e1, p2, e2, ... )`, where `p1`,`p2`,... are patterns and
     *    `e1`,`e2`,... are expressions, as defined in the
     *    {@link Constraint Constraint} class, so that we might construct
     *    {@link Constraint Constraint} instances from them
     *  * `p.add( [ p1, e1, p2, e2, ... ] )`, same as the previous, but in array
     *    form rather than separate arguments
     *  * `p.add( [ [ p1, e1 ], [ p2, e2 ], ... ] )`, same as the previous, but
     *    as an array of pairs rather than flattened
     *  * `p.add( c1, c2, ... )`, where each of `c1`,`c2`,... is a
     *    {@link Constraint Constraint} instance
     *  * `p.add( [ c1, c2, ... ] )`, same as the previous, but in array form
     *    rather than separate arguments
     *  * `p.add( other )`, where `other` is another instance of the Problem
     *    class, and we are to add all of its constraints to `p`
     * 
     * No {@link Constraint Constraint} is added if it is already present, in
     * the sense of there being an {@link Constraint#equals equal Constraint}
     * already stored in this object.
     * 
     * {@link Constraint Constraints} are stored internally in increasing order
     * of {@link Constraint#complexity complexity()}, and this function
     * preserves that order when adding new constraints.  This makes it easy for
     * algorithms to find an easy constraint to process, by taking the first one
     * off the internal list.
     * 
     * @param  {...any} args constraints to add to this problem, in any of the
     *   forms given above
     */
    add ( ...args ) {
        // ensure there is an args[0] to ask questions about
        if ( args.length == 0 ) return
        // if args[0] looks like a pattern, build constraints and recur on them
        if ( args[0] instanceof LogicConcept ) {
            for ( let i = 0 ; i < args.length - 1 ; i += 2 )
                this.add( new Constraint( args[i], args[i+1] ) )
            return
        }
        // if args[0] is an array, there are many possibilities:
        if ( args[0] instanceof Array ) {
            // ensure non-empty
            if ( args[0].length == 0 ) return
            // if it looks like it might be p1,e1,..., or c1,c2,...,
            // handle via recursion
            if ( args[0][0] instanceof LogicConcept
              || args[0][0] instanceof Constraint ) {
                this.add( ...args[0] )
                return
            }
            // if it looks like it might be [p1,e1],..., also recur, flattening
            if ( args[0][0] instanceof Array ) {
                this.add( ...args[0].flat() )
                return
            }
            // else invalid arguments
            throw 'Cannot add this type of data to a Problem'
        }
        // all that's left is to add Constraint instances; this is the main
        // workhorse part of this function, to which all other cases devolve
        args.forEach( constraint => {
            // can add only constraints, and only if we don't already have it
            if ( !( constraint instanceof Constraint ) )
                throw 'Cannot add this type of data to a Problem'
            if ( this.constraints.some(
                    already => already.equals( constraint ) ) )
                return // no need to add two copies of a constraint
            // find location to insert that preserves increasing complexity
            const index = this.constraints.findIndex( already =>
                already.complexity() >= constraint.complexity() )
            this.constraints.splice(
                index == -1 ? this.constraints.length : index, 0, constraint )
        } )
    }

    /**
     * Construct a new Problem just like this one, except with the given
     * {@link Constraint Constraints} added.  In other words, just call this
     * instance's {@link Problem#copy copy()} function, and then call
     * {@link Problem#add add()} in the copy, then return the new object.
     * 
     * @param  {...any} args the constraints to add to the problem, in any of
     *   the forms supported by the {@link Problem#add add()} function
     * @returns {Problem} a new problem instance equal to this one plus the new
     *   constraints specified as arguments
     */
    plus ( ...args ) {
        const result = this.copy()
        result.add( ...args )
        return result
    }

    /**
     * Most clients will not call this function; it is mostly for internal use.
     * Various algorithms within this class occasionally need to remove a
     * constraint, and this function is used to do so.
     * 
     * @param {integer|Constraint} toRemove the caller can provide an integer
     *   between 0 and this problem's length minus 1, inclusive, to have this
     *   function remove the constraint at that index; or the caller can provide
     *   a {@link Constraint Constraint} instance, and this function will remove
     *   any constraint equal to that one, if this Problem contains such a copy
     * 
     * @see {@link Problem#add add()}
     * @see {@link Problem#empty empty()}
     */
    remove ( toRemove ) {
        if ( toRemove instanceof Constraint )
            toRemove = this.constraints.findIndex( constraint =>
                constraint.equals( toRemove ) )
        if ( /^\d+$/.test( toRemove ) && toRemove < this.length )
            this.constraints.splice( toRemove, 1 )
    }

    /**
     * Construct a new Problem just like this one, except with the constraint at
     * the given index removed.  In other words, just call this instance's
     * {@link Problem#copy copy()} function, and then call
     * {@link Problem#remove remove()} in the copy, then return the new object.
     * 
     * @param {integer|Constraint} toRemove the {@link Constraint Constraint}
     *   to remove, or a copy of it, or the index of it; this argument will be
     *   passed directly to {@link Problem.remove remove()}, so see the
     *   documentation there for details
     * @returns {Problem} a new problem instance equal to this one minus the
     *   constraint at the given index
     */
    without ( toRemove ) {
        const result = this.copy()
        result.remove( toRemove )
        return result
    }

    /**
     * The length of a problem is the number of constraints in it.  Note that
     * as a problem is solved, the algorithm successively removes constraints as
     * it satisfies them (sometimes replacing them with one or more simpler
     * ones), so this value may change over time, up or down.
     * 
     * @returns {integer} the number of constraints in this problem
     * 
     * @see {@link Problem#empty empty()}
     */
    get length () {
        return this.constraints.length
    }

    /**
     * Is this problem empty?  That is, does it have zero constraints?  Return
     * true if so, false otherwise
     * 
     * @returns {boolean} whether this problem is empty (no constraints)
     * 
     * @see {@link Problem#length length}
     */
    empty () {
        return this.constraints.length == 0
    }

    /**
     * Create a shallow copy of this object, paying attention only to its
     * constraint set.  Note that while a problem is being solved, various
     * information about it may be computed from the context in which that
     * problem arose, including variable binding constraints, solutions already
     * computed and cached, and more.  This function does not copy any of that
     * information; it copies only the constraint set (and if the results of
     * the {@link Problem#captureConstraints captureConstraints()} function
     * has been cached, it copies that as well).
     * 
     * @returns {Problem} a shallow copy of this object
     */
    copy () {
        const result = new Problem()
        result.constraints = this.constraints.slice()
        if ( this._captureConstraints )
            result._captureConstraints = this._captureConstraints.deepCopy()
        if ( this._stream )
            result._stream = this._stream.copy()
        result._debug = this._debug
        return result
    }

    /**
     * Equality of two problems is determined solely by the content of their
     * constraint sets.  Any other information computed as part of the solution
     * of the problem, such as variable capture constraints or cached solutions,
     * are not compared.  This function returns true if and only if the set of
     * constraints is the same in both problems.
     * 
     * @param {Problem} other another instance of the Problem class with which
     *   to compare this one
     * @returns {boolean} whether the two instances are equal
     */
    equals ( other ) {
        if ( this.constraints.length != other.constraints.length ) return false
        return this.constraints.every( c1 =>
            other.constraints.some( c2 => c1.equals( c2 ) ) )
    }

    /**
     * Recall that we can ask, for a {@link Constraint Constraint}, whether it
     * {@link Constraint#canBeApplied canBeApplied()}, and if it can, then such
     * {@link Constraint#applyTo application} can be done to many different
     * types of objects.  We can treat Problems the same way, because they are
     * sets of constraints.
     * 
     * A problem can be applied if every one of its constraints can.  This
     * function answers that question.
     * 
     * @returns {boolean} whether all the {@link Constraint Constraints} in this
     *   problem {@link Constraint#canBeApplied can be applied}
     * 
     * @see {@link Problem#applyTo applyTo()}
     * @see {@link Problem#appliedTo appliedTo()}
     */
    canBeApplied () {
        return this.constraints.every( constraint =>
            constraint.isAnInstantiation() )
    }

    /**
     * Apply each constraint in this Problem to the given `target`.  This
     * function therefore makes calls to the {@link Constraint#applyTo applyTo()
     * function in its Constraints}.  See that function for more details on how
     * each type of target is treated.
     * 
     * @param {LogicConcept|CaptureConstraint|CaptureConstraints|Problem} target
     *   the object to which this problem should be applied
     * 
     * @see {@link Problem#canBeApplied canBeApplied()}
     * @see {@link Problem#appliedTo appliedTo()} (for Problems)
     * @see {@link Constraint#applyTo applyTo()} (for Constraints)
     */
    applyTo ( target ) {
        this.constraints.forEach( constraint =>
            new Substitution( constraint ).applyTo( target ) )
    }

    /**
     * Apply each constraint in this Problem to a copy of the given `target`,
     * returning that new copy.  This is analogous to the
     * {@link Constraint#appliedTo appliedTo() function for Constraints}.  See
     * that function for more details on how each type of target is treated.
     * 
     * @param {LogicConcept|Constraint|CaptureConstraint|CaptureConstraints|Problem} target 
     *   the object to which this problem should be applied
     * @returns {LogicConcept|Constraint|CaptureConstraint|CaptureConstraints|Problem}
     *   a copy of the original `target`, now with this problem applied to it
     * 
     * @see {@link Problem#canBeApplied canBeApplied()}
     * @see {@link Problem#applyTo applyTo()} (for Problems)
     * @see {@link Constraint#appliedTo appliedTo()} (for Constraints)
     */
    appliedTo ( target ) {
        if ( target instanceof LogicConcept ) {
            for ( let i = 0 ; i < this.constraints.length ; i++ )
                if ( target.equals( this.constraints[i].pattern ) )
                    return this.constraints[i].expression.copy()
            const copy = target.copy()
            this.applyTo( copy )
            return copy
        } else {
            let result = target
            this.constraints.forEach( constraint =>
                result = new Substitution( constraint ).appliedTo( result ) )
            return result
        }
    }

    /**
     * Alter this object by applying the given
     * {@link Substitution Substitutions} to it, in-place.
     * {@link Constraint Constraints} in this Problem whose patterns contain any
     * of the metavariables on the LHS of any of the given
     * {@link Substitution Substitutions} will be replaced with new
     * {@link Constraint Constraints} whose patterns have been altered by those
     * {@link Substitution Substitutions}.
     * 
     * @param  {...Substitution|...Substitution[]} subs one or more
     *   substitutions to apply to this Problem, or Arrays of substitutions
     * 
     * @see {@link Problem#afterSubstituting afterSubstituting()}
     */
    substitute ( ...subs ) {
        // save the capture constraints for processing later
        const savedCache = this._captureConstraints
        // flatten arrays of substitutions into the main list
        subs = subs.flat()
        // figure out which constraints in this object actually need processing
        const metavars = subs.map( s => s.metavariable.text() )
        const toReplace = this.constraints.filter( c =>
            c.pattern.hasDescendantSatisfying( d =>
                ( d instanceof Symbol ) && metavars.includes( d.text() )
             && d.isA( metavariable ) ) )
        if ( toReplace.length > 0 ) {
            // remove those constraints
            toReplace.forEach( c => this.remove( c ) )
            // compute new patterns for each one by doing substitutions
            const patternsWrapper = new Application(
                ...toReplace.map( c => c.pattern.copy() ) )
            subs.forEach( s => s.applyTo( patternsWrapper ) )
            // add the new constraints built from the new patterns, same expressions
            for ( let i = 0 ; i < patternsWrapper.numChildren() ; i++ )
                this.add( new Constraint( patternsWrapper.child( i ),
                                          toReplace[i].expression ) )
        }
        // now restore and process the capture constraints
        if ( savedCache ) {
            savedCache.constraints.forEach( cc =>
                subs.forEach( sub => sub.applyTo( cc ) ) )
            this._captureConstraints = savedCache
        }
    }

    /**
     * This function behaves the same as
     * {@link Problem#substitute substitute()}, except that it works on and
     * returns a copy of the Problem, rather than altering the original.
     * 
     * @param  {...Substitution|...Substitution[]} subs one or more
     *   substitutions to apply, or Arrays of substitutions
     * 
     * @see {@link Problem#substitute substitute()}
     */
    afterSubstituting ( ...subs ) {
        const result = this.copy()
        result.substitute( ...subs )
        return result
    }

    /**
     * The string representation of a Problem is simply the comma-separated list
     * of string representations of its {@link Constraint Constraints},
     * surrounded by curly brackets to suggest a set.  For example, it might be
     * "{(A,(- x)),(B,(+ 1 t))}" or "{}".
     * 
     * @returns {string} a string representation of the Problem, useful in
     *   debugging
     * 
     * @see {@link Constraint#toString toString() for individual constraints}
     */
    toString () {
        return `{${this.constraints.map(x=>x.toString()).join(',')}}`
    }

    /**
     * Compute the set of capture constraints for this problem and return it.
     * If it has already been computed and cached, return the cached value.
     * 
     * Note that because {@link CaptureConstraint CaptureConstraints} are
     * computed from the set of ordinary {@link Constraint Constraints} in a
     * problem, the cache is invalid if that set is altered, such as by
     * {@link Problem#add add()} or {@link Problem#remove remove()}.  In such a
     * situation, you should be sure to call
     * {@link Problem#clearCaptureConstraints clearCaptureConstraints()} to
     * erase the cache, so the next call to this function will recompute them.
     * 
     * To see the definition of a capture constraint, refer to
     * {@link CaptureConstraint the documentation for that class}.  The set of
     * capture constraints for a Problem is the set of capture constraints for
     * that Problem's set of patterns.
     * 
     * @return {CaptureConstraints} the set of capture constraints generated
     *   by this Problem's patterns (that is, the patterns in its constraints)
     * 
     * @see {@link Problem#add add()}
     * @see {@link Problem#remove remove()}
     * @see {@link CaptureConstraint CaptureConstraint}
     * @see {@link CaptureConstraints CaptureConstraints}
     * @see {@link Constraint Constraint}
     * @see {@link Problem#avoidsCapture avoidsCapture()}
     */
    captureConstraints () {
        if ( !this._captureConstraints )
            this._captureConstraints = new CaptureConstraints(
                ...this.constraints.map( constraint => constraint.pattern ) )
        return this._captureConstraints
    }

    /**
     * Deletes any cached capture constraints computed by
     * {@link Problem#captureConstraints captureConstraints()}.
     * 
     * @see {@link Problem#captureConstraints captureConstraints()}
     */
    clearCaptureConstraints () {
        delete this._captureConstraints
    }

    /**
     * As we solve a Problem, our solution must not assign metavariables values
     * that would, when substituted for those metavariables, create any variable
     * capture (according to the standard definition of that term).  We use a
     * set of {@link Problem#captureConstraints capture constraints} to keep
     * track of the ways in which we might create variable capture, and thus
     * what we must avoid doing.
     * 
     * This function returns whether any of this Problem's capture constraints
     * have been {@link CaptureConstraints#violated violated()}.  If the answer
     * is false, then this problem may still be able to be solved.  If the
     * answer is true, then this problem has no solutions.
     * 
     * @return {boolean} whether any of this Problem's
     *   {@link Problem#captureConstraints capture constraints} have been
     *   {@link CaptureConstraints#violated violated()}
     * 
     * @see {@link Problem#captureConstraints captureConstraints()}
     */
    avoidsCapture () {
        return !this.captureConstraints().violated()
    }

    // For internal use.  Applies beta reduction to all the patterns in all the
    // problem's constraints.
    betaReduce () {
        this.constraints.slice().forEach( con => {
            const reduced = fullBetaReduce( con.pattern )
            if ( !reduced.equals( con.pattern ) ) {
                this.remove( con )
                this.add( new Constraint( reduced, con.expression ) )
            }
        } )
    }

    // 1. Delete functionality that applies constraints to capture constraints.
    // 2. Delete functionality that asks if capture constraints are satisfied or
    //    violated in isolation.
    // 3. Add functionality that asks if capture constraints are violated in a
    //    given solution (which is a problem, that is, a constraint set).
    // 4. Ensure that capture constraints are carried along when copying a
    //    problem in recursion.
    // 5. Before returning any solution or recurring to expand any solution,
    //    check to see if the problem's capture constraints are violated by that
    //    solution.

    // alters this object in-place, removing and/or adding constraints
    *allSolutions () {
        const dbg = ( ...args ) => { if ( this._debug ) console.log( ...args ) }
        dbg( `solve ${this} / ${this.constraints.map(x=>x.complexity())}` )
        // We need our own personal symbol stream that will avoid all symbols in
        // this matching problem.  If we don't have one yet, create one.
        if ( !this._stream ) this._stream = new NewSymbolStream(
            ...this.constraints.map( c => c.pattern ),
            ...this.constraints.map( c => c.expression )
        )
        // Ensure our capture constraints have been computed.
        this.captureConstraints()
        // We need utility functions for extending recursively computed
        // solutions with new constraints.  Here are two.
        // The first is for adding a (pattern,expression) constraint.
        const problem = this
        function* add ( constraint ) {
            for ( let result of problem.allSolutions() ) {
                dbg( `\tadding ${constraint} to ${result}` )
                yield result.plus( constraint )
            }
        }
        // The second is for adding a (pattern,efWithMetavars) constraint.
        // That case is more complicated.
        function* addEF ( metavar, expressionFunction, symbols ) {
            if ( typeof( symbols ) === 'undefined' ) symbols = [ ]
            const instantiation = new Constraint( metavar, expressionFunction )
            const copy = problem.afterSubstituting(
                new Substitution( instantiation ) )
            dbg( `try this EF: ${instantiation}` )
            dbg( `gives this problem: ${copy}` )
            // if ( !copy.avoidsCapture() ) return
            copy.betaReduce()
            dbg( `\t==> ${copy}` )
            for ( let solution of copy.allSolutions() ) {
                dbg( `recursive solution: ${solution}` )
                dbg( `\twill add: ${expressionFunction}` )
                for ( let symbol of symbols ) {
                    const constraint = solution.constraints.find(
                        c => c.pattern.equals( symbol ) )
                    if ( constraint ) {
                        solution.remove( constraint )
                        expressionFunction = constraint.appliedTo( expressionFunction )
                        dbg( `\t+ ${constraint} == ${expressionFunction}` )
                    }
                }
                expressionFunction = fullBetaReduce( expressionFunction )
                dbg( `\t==> ${expressionFunction}` )
                // if ( solution.avoidsCapture() )
                    yield solution.plus( instantiation )
            }
        }

        // If this problem is empty, the solution set contains exactly one
        // entry, the empty solution.  We encode solutions as solved problems.
        if ( this.empty() ) {
            yield new Problem()
            return
        }

        // But if it isn't empty, then consider the first constraint.  Note that
        // constraints are ordered so that the easiest to process come first, so
        // index 0 is the right place to start.
        const constraint = this.constraints[0]
        const complexity = constraint.complexity()

        // If that constraint says that this problem is unsolvable, stop now.
        if ( complexity == 0 ) return

        // If that constraint is already satisfied, remove it and recur on the
        // rest.  This modifies this object in place.
        if ( complexity == 1 ) {
            this.remove( 0 )
            yield* this.allSolutions()
            return
        }
        
        // If that constraint is a metavariable instantiation, remove it from
        // the problem, add it to the solution, and apply it to the remaining
        // constraints.  If doing so violates any capture constraints, stop.
        // Otherwise, recur on what remains.
        if ( complexity == 2 ) {
            this.remove( 0 )
            this.substitute( new Substitution( constraint ) )
            // if ( this.avoidsCapture() )
                yield* add( constraint, this.allSolutions() )
            return
        }
        
        // If that constraint is one that can be broken up into multiple,
        // smaller constraints, one for each pair of children from the pattern
        // and expression, do so, updating this problem object and recurring.
        if ( complexity == 3 ) {
            this.remove( 0 )
            this.add( ...constraint.children() )
            yield* this.allSolutions()
            return
        }

        // Finally, the complicated case.  If the constraint is an expression
        // function application case, then we may generate multiple solutions,
        // in all the ways documented below.  But before any of them, we remove
        // this constraint and lift out its various components, because we know
        // it is an expression function application constraint.  We also do some
        // quick sanity checks to be sure the structure is as expected.
        if ( complexity == 4 ) {
            const head = constraint.pattern.child( 1 )
            const args = constraint.pattern.children().slice( 2 )
            const expr = constraint.expression
            if ( !head.isA( metavariable ) )
                throw 'Invalid head of expression function application'
            if ( args.length == 0 )
                throw 'Empty argument list in expression function application'

            // Solution method 1: Head instantiated with a constant function.
            dbg( '--1--' )
            yield* addEF( head, constantEF( args.length, expr ) )
            
            // Solution method 2: Head instantiated with a projection function.
            dbg( '--2--' )
            for ( let i = 0 ; i < args.length ; i++ )
            yield* addEF( head, projectionEF( args.length, i ) )
            
            // Solution method 3: If the expression is compound, we could
            // imitate each child using a different expression function,
            // combining the results into one big answer.  Because we care only
            // about the children, we do not distinguish bindings from
            // applications; we use applications for both cases, just as a
            // wrapper construct.
            dbg( '--3--' )
            const children = expr.children()
            if ( children.length > 0 ) {
                if ( expr instanceof Binding ) {
                    const asApp = new Application(
                        ...expr.children().map( child => child.copy() ) )
                    this.remove( 0 )
                    this.add( new Constraint( constraint.pattern, asApp ) )
                }
                const metavars = this._stream.nextN( children.length )
                    .map( symbol => symbol.asA( metavariable ) )
                yield* addEF( head, applicationEF( args.length, metavars ),
                    metavars )
            } else dbg( 'case 3 does not apply' )

            // Those are the only three solution methods for the EFA case.
            return
        }

        // We should never get here, because complexity should be only 0,1,2,3,
        // or 4.  So the following is just a sanity check.
        throw `Invalid value for constraint complexity: ${complexity}`
    }

}