import type { StringObject } from '../../types'
import set from 'lodash/set'

export function spreadObject(obj: Record<string, string>): StringObject {
  const newObject: StringObject = {}
  Object.keys(obj).forEach((key) => {
    // const keyList = key.split('.')
    // 使用正则表达式分割字符串，仅将单个`.`作为分隔符，忽略连续的`.`
    // 正则表达式解释：(?<!\.)\.(?!\.) 匹配前后不是点的单个点
    const keyList = key.split(/(?<!\.)\.(?!\.)/).filter((segment) => segment)
    set(newObject, keyList, obj[key])
  })
  return newObject
}
