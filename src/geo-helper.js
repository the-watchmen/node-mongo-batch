import _ from 'lodash'
import debug from '@watchmen/debug'
import * as geocoderAdapters from '@watchmen/geocodr'
import {getRequiredArg, getArg} from '@watchmen/helpr/dist/args'

const dbg = debug(__filename)

export function getGeocoderAdapter() {
  let adapter = geocoderAdapters[getRequiredArg('geocoder.provider')]
  const params = getArg('geocoder.params')
  if (params) {
    const geoParams = _.isString(params) ? JSON.parse(params) : params

    adapter = {
      ...adapter,
      params: {
        ...adapter.params,
        ...geoParams
      }
    }
  }

  dbg('get-geocoder-adapter: url=%o', adapter.url)
  return adapter
}
