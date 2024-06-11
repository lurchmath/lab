/**
 * Parse a string to convert it to an LC and process Shorthands that appear in
 * an LC.
 *
 * @module Parsing
 */
//////////////////////////////////////////////////////////////////////////////
//
//                       Parsers and Parsing Utilties 
//                       for converting strings to LCs
//

//////////////////////////////////////////////////////////////////////////////
//
// Imports
//
import { Environment } from '../environment.js'
import { Symbol as LurchSymbol } from '../symbol.js'
import './extensions.js'

/**
 * Make both a normal and tracing peggy parser from the given string and capture
 * and customize the error formatting, then return both parsers and the original
 * parser (which throws errors but doesn't trace) in an array.
 * @function
 * @param {string} parserstr - the peggy parser definition string  
 * @returns {function[]} - the normal, tracing, and raw parsers
 */
export const makeParser = parserstr => {
  
  const opts = { cache:true }
  const traceopts = { ...opts , trace:true }
  const rawparser = peggy.generate(parserstr,opts)
  const rawtraceparser = peggy.generate(parserstr,traceopts)
  
  const parser = (s,opts) => {
    try { 
      return rawparser.parse(s,opts)
    } catch(e) {
      if (typeof e.format === 'function') {
        console.log(e.format([{
          grammarSource:parserstr,
          text:s
        }]))
      } else {    
        console.log(e.toString())
      }
      return undefined
    }
  }
  
  // No need for this in a browser
  const traceparser = (typeof global !== 'undefined' ) ?
    s => {
      // make the backtracer
      
      const tracer = new Tracer(s,
        { showTrace : true,
          showFullPath : false,
          hiddenPaths : [ "__" , "_" ]
        }
      )
  
      // show backtracing whether it's an error or not
      try { 
        const ans = rawtraceparser.parse(s,{ tracer:tracer })
        write(tracer.getBacktraceString())
        return ans
      } catch(e) {
        write(tracer.getBacktraceString())
        return undefined
      }
    } : undefined
  
  return { parse: parser, trace: traceparser, raw:  rawparser.parse }
}

export const lc2algebrite = e => {
  if (e instanceof Application && 
      e.numChildren()==3 &&
      e.child(0) instanceof LurchSymbol &&
      e.child(0).text()==='is' && 
      e.child(2) instanceof LurchSymbol &&
      e.child(2).text()==='prime' &&
      e.child(1) instanceof LurchSymbol &&
      e.child(1).text().length > 0 &&
      Number.isInteger(Number(e.child(1).text())) ) {
    const n = Number(e.child(1).text())  
    return `isprime(${n})`
  } else {  
    return '0'
  }
}

export const parseLines = (parser,verbose=true,name='LurchParserTests',opts) => {
  let ans = []
  const lines = 
    loadStr(name,'./parsers/','lurch').split('\n')
       .map(line => line.trim())
       .filter(line => line.length > 0 && line.slice(0,2)!=='//')
  // console.log(`File contains ${lines.length} parseable lines`)
  let pass = 0, fail = 0
  let report = []
  lines.forEach( l => {
    try { 
      ans.push(parser(l,opts))
      pass++
      if (verbose) write(`${Pens.itemPen(l)}\n → ${Pens.stringPen(parser(l,opts))}\n`)
    } catch {
      report.push(l)
      fail++
    }
  })
  report.forEach(l=>console.log(`Could not parse ${Pens.contextPen(l)}`))

  console.log(`Parsed ${pass} lines successfully, ${fail} failed`)
  return (verbose) ? ans : undefined
}

/**
 *  ## Process Shorthands 
 *
 * In order to make it convenient to enter large documents in putdown notation,
 * it is convenient to use fromPutdown to enter some reserved content in the
 * document that is preprocessed before evaluating the document.
 *
 * The following are what we have for Shorthands. More might be added later. 
 *
 *   * Scan a document looking for any of the following Shorthands and convert
 *     the next (>) or previous (<) sibling to the corresponding type in the asA
 *     column.
 *
 *       | Shorthand   |  mark asA |
 *       | ------------|-----------|
 *       | 'BIH>'      | 'BIH'     |
 *       | 'declare>'  | 'Declare' |
 *       | 'rule>'     | 'Rule'    |
 *       | 'cases>'    | 'Cases'   |
 *       | 'subs>'     | 'Subs'    |
 *       | 'thm>'      | 'Theorem' |
 *       | '<thm'      | 'Theorem' |
 *       | 'proof>'    | 'Proof'   |
 *       | 'proof>'    | 'Proof'   |
 *
 *   * Scan for occurrences of the symbol `rules>`. Its next sibling should be
 *     an environment containing given Environments. Mark each child of the next
 *     sibling as a `Rule` and delete both the `rules>` symbol and the outer
 *     environment containing the newly marked `Rules.  This allows us to use an
 *     Environment to mark a lot of consecutive `Rules` all at once and then
 *     ignore the wrapper Environment. For libraries this is cleaner than trying
 *     to mark every Rule with `rule>` individually.  
 *
 *   * Scan for occurrences of the symbol `λ` (or  `@` for backwards
 *     compatibility) and replace that with the symbol "LDE EFA" (which then
 *     will still print as '𝜆' but it's what is needed under the hood).
 *
 *   * Scan for occurrences of the symbol `≡`. They are intended to be a
 *     shorthand way to enter IFF rules (equivalences).  The '≡' should be a
 *     child of a Rule environment, and should not be the first or last child.
 *     The Rule will then be replaced by the expanded version and the `≡`
 *     symbols removed, following the cyclic TFAE style of implications.  For
 *     example, if the Rule has the form `:{ a ≡ b c ≡ d }` then it will be
 *     replaced by `:{ {:a {b c}} {:{b c} d } {:d a} }`.
 *
 *   * Scan for occurrences of the symbol `➤`. If found it should be the first
 *     child of an Application whose second child is a symbol whose text is the
 *     text of the comment.  Mark that Application with `.ignore=true` so it is
 *     ignored propositionally.
 *
 *   * Scan for occurrences of the symbol `by` and mark its previous sibling's
 *     `.by` attribute with the text of its next sibling, which must be a
 *     LurchSymbol. Then delete both the `by` and it's next sibling.  Currently
 *     used by the `Cases` tool and the CAS tool.
 *
 *   * Scan for occurrences of the symbol `✔︎`, `✗`, and `⁉︎` and mark its
 *     previous sibling with .expectedResult 'valid', 'indeterminate', and
 *     'invalid' respectively.
 *
 *   * Scan a document looking for the symbol `<<`, which we call a 'marker'.
 *     For every marker, 
 *     - if the preceding sibling is an environment, attribute it as a `BIH`. 
 *
 *     - if the preceding sibling is a declaration, attribute it as a `Declare`, 
 *
 *     - in either case, finally, delete the marker.
 *
 * Naturally we have to run this FIRST before anything else.  These changes are
 * made in-place - they don't return a copy of the document.
 *
 * This does no error checking, so << has to be an outermost expression with a
 * previous sibling and λ has to appear in some sensible location and so on.
 *
 * @function
 * @param {Environment} L - the document
 * @returns {LogicConcept} - the modified document
 */
export const processShorthands = L => {

  // for each symbol named symb, do f, i.e. execute f(symb)
  const processSymbol = ( symb , f ) =>  {
    L.descendantsSatisfying( x => (x instanceof LurchSymbol) && x.text()===symb )
     .forEach( s => f(s) )
  }
  // make next sibling have a given type.  If the optional third argument is missing, do nothing further.  If flag is 'given' make the target a given.  If the flag is 'claim' make the target a claim.
  const makeNext =  (m,type,flag) => {
    const next = m.nextSibling()
    next.makeIntoA(type)
    if (flag === 'given') next.makeIntoA('given')
    if (flag === 'claim') next.unmakeIntoA('given')
    m.remove()
  }
  // make previous sibling have a given type
  const makePrevious =  (m,type) => {
    m.previousSibling().makeIntoA(type)
    m.remove()
  }

  // declare the type of the next or previous sibling 
  processSymbol( 'BIH>'          , m => makeNext(m,'BIH','claim') )
  processSymbol( 'declare>'      , m => makeNext(m,'Declare','given') )
  processSymbol( 'rule>'         , m => makeNext(m,'Rule','given') )  
  processSymbol( 'thm>'          , m => makeNext(m,'Theorem','claim') )  
  processSymbol( '<thm'          , m => makePrevious(m,'Theorem','claim') )  
  processSymbol( 'proof>'        , m => makeNext(m,'Proof','claim') )
  processSymbol( 'cases>'        , m => makeNext(m,'Cases','given') )  
  
  // Mark a rule as the substitution rule, and mark it's conclusion as a 
  // substitution EFA so that it can be instantiated by expressions marked
  // with .by='substitution'
  processSymbol( 'subs>'         , m => {
    m.nextSibling().conclusions().forEach( c => c.makeIntoA('Subs'))
    makeNext(m,'Subs','given')
  })  
  
  // attribute the previous sibling with .by attribute whose value is the text
  // of the next sibling if it is a symbol (and does nothing if it isn't)
  processSymbol( 'by' ,  m => { 
    const LHS = m.previousSibling()
    const RHS = m.nextSibling()
    // it should be a LurchSymbol or an Application
    if (RHS instanceof LurchSymbol) {
      if (RHS.text()==='CAS') {
        LHS.by = { CAS: lc2algebrite(LHS) }
        m.remove()
        RHS.remove()
      } else {
        LHS.by = RHS.text()
        m.remove()
        RHS.remove()
      }
    } else if (RHS instanceof Application ) {
      if (RHS.child(0) instanceof LurchSymbol && RHS.child(0).text()==='CAS') { 
        // TODO: handle the case where no arg is passed or it's not a symbol
        LHS.by = { CAS: RHS.child(1).text() }
        m.remove()
        RHS.remove()
      }
    }
    return 
  } )
  
  // rules> - Mark each of the children of the next sibling (which should be an
  // environment) as a Rule, and delete both the shorthand and the environment. 
  processSymbol( 'rules>' , m => {
    const wrapper = m.nextSibling()
    wrapper.children().forEach( kid => {
      if (kid instanceof Environment) { 
        kid.makeIntoA('Rule') 
        kid.makeIntoA('given')
        // the rule has no creators
        kid.creators=[]
        // TODO: the following would be useful for web UI but not for 
        // Lode, since I've used claim environments in rules.
        // kid.children().forEach( premise => {
        //   if (premise instanceof Environment) {
        //     premise.makeIntoA('given') 
        //   }
        // }) 
      }
      wrapper.shiftChild()
      kid.insertBefore(wrapper) 
    } )
    wrapper.remove()
    m.remove()
  } )
  
  // simple replacements
  processSymbol( 'λ' , m => { 
    m.replaceWith(new LurchSymbol('LDE EFA'))
  } )  
  processSymbol( '@' , m => { 
    m.replaceWith(new LurchSymbol('LDE EFA'))
  } )
  
  // Expand equivalences
  processSymbol( '≡' ,  m => { 
    // find the parent environment, if there is none, then do nothing
    const parent = m.parent()
    if (!parent) return

    // a utility to identify equivalence separators
    const isSeparator = x => x instanceof LurchSymbol && x.text() === '≡'

    // get the children of the parent
    let inputArray = parent.children()
    // an array to hold the groups
    let groups = []
    
    // while there are separators, split the input array into groups
    let k = inputArray.findIndex( isSeparator )
    while ( k !== -1) {
      if (k==1) groups.push(inputArray[0])
      else groups.push(inputArray.slice(0,k))
      inputArray = inputArray.slice(k+1)
      k = inputArray.findIndex( isSeparator )      
    }
    // if there are no more separators, then push what's left
    if (inputArray.length === 1) groups.push(inputArray[0])
    else groups.push(inputArray)
  
    // for each group, if it is an array, create a new Environment containing the group elements, otherwise just use the element itself.  Collect them all into a results array.
    const results = []
    groups.forEach( group => {
      if (Array.isArray(group) ) {
        const newEnv = new Environment( ...group )
        results.push(newEnv)
      } else {
        results.push(group)
      }
    })

    // finally, replace the parent with a new environment containing all of the 
    // cyclic implications.
    const ans = new Environment()
    ans.copyAttributesFrom(parent)

    // put all of the pairs into the new environment except the last one
    results.slice(0,-1).forEach( ( result, i ) => { 
      let myEnv = new Environment( result.asA('given') , 
                                   results[i+1].copy().unmakeIntoA('given') ) 
      ans.pushChild(myEnv)
    } )
    // and complete the cycle with the last one
    ans.pushChild(new Environment( 
      results[results.length-1].asA('given'), 
              results[0].copy().unmakeIntoA('given') ) )
    
    // replace the parent with the new environment  
    parent.replaceWith(ans)
  } )

  // For testing purposes, flag the expected result
  processSymbol( '✔︎' , m => { 
    m.previousSibling().setAttribute('ExpectedResult','valid')
    m.remove() 
  } )
  
  processSymbol( '✗' , m => { 
    m.previousSibling().setAttribute('ExpectedResult','indeterminate') 
    m.remove()
  } )
  
  processSymbol( '⁉︎' , m => { 
    m.previousSibling().setAttribute('ExpectedResult','invalid') 
    m.remove()
  } )
  
  // TODO: make this more consistent with the other shorthands
  processSymbol( '➤' , m => { 
    if (m.parent().isAComment()) m.parent().ignore=true 
  })
  
  // Labels
  //
  // Just a quickie lable mechanism that will be upgraded later.
  // Labels are currently a single symbol of the form name> which assigns
  // 'name' to the .label attribute of the next sibling.  Previous siblings
  // aren't supported yet, nor is whitespace. 
  // L.descendantsSatisfying( s => (s instanceof LurchSymbol) && 
  //   /[^"()\[\]\s]+>/.test(s.text()) )
  //   .forEach( s => { 
  //     s.nextSibling().label=s.text().slice(0,-2).toLowerCase() 
  //     s.remove()
  //   } ) 

     // depricated but kept for backward compatibility
  processSymbol( '<<' , m => { 
    const target = m.previousSibling()
    const type = (target instanceof Declaration) ? 'Declare' : 'BIH'
    target.makeIntoA(type)
    m.remove()
  } )
  // depricated but kept for backward compatibility
  processSymbol( '>>' , m => makeNext(m,'BIH') )
  
  return L
}

///////////////////////////////////////////////////////////////////////////////