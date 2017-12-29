import debug from 'debug'
import _ from 'lodash'
import requireUncached from 'require-uncached'
import {evalInContext, setState, asTemplate} from '@watchmen/test-helpr'
import {setArgDefault} from '@watchmen/helpr'

const dbg = debug('test:batch:steps')

export default function(context) {
  return function() {
    this.When(/^we run the '([^']+)' ingester$/, async ingesterString => {
      try {
        const ingester = evalInContext({js: asTemplate(ingesterString), context})
        dbg('when-we-run-the-ingester: ingester=%o', ingester)
        const result = await requireUncached(ingester).default
        setState({result})
        dbg('when-we-run-the-ingester: result=%o', result)
      } catch (err) {
        dbg('caught error=%o', err)
        throw err
      }
    })

    this.When(
      /^we run the '([^']+)' ingester with environment:$/,
      async (ingesterString, envString) => {
        const ingester = evalInContext({js: asTemplate(ingesterString), context})
        dbg('when-we-run-the-ingester-with-env: ingester=%o', ingester)
        try {
          // eslint-disable-next-line no-eval
          const env = evalInContext({js: envString, context})
          dbg('env=%o', env)

          _.each(env, (value, key) => setArgDefault({key, value}))

          const result = await requireUncached(ingester).default
          setState({result})
          dbg('when-we-run-the-ingester-with-env: result=%o', result)
        } catch (err) {
          dbg('caught error=%o', err)
          throw err
        }
      }
    )

    this.Given(/^the following initial environment:$/, envString => {
      try {
        const env = evalInContext({js: envString, context})
        dbg('given-env: env=%o', env)
        _.each(env, (value, key) => setArgDefault({key, value}))
      } catch (err) {
        dbg('given-state: caught error=%o', err)
        throw err
      }
    })
  }
}
