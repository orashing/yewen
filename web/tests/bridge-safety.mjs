import assert from 'node:assert/strict'
import {normalizeDailyPackage, sanitizeImportedFactCheck} from '../src/lib/aiBridge.js'

const fact = sanitizeImportedFactCheck({
  searched_web:true,
  items:[{claim:'2026北京某规则',status:'verified',verdict:'已核实',confidence:0.99,sources:[{title:'官方',url:'https://example.com/a'}]}],
  compliance_flags:[],summary:'ok'
})
assert.equal(fact.items[0].status,'needs_review')
assert.equal(fact.items[0].original_status,'verified')
assert.ok(fact.items[0].sources[0].url.startsWith('https://'))

const pkg = normalizeDailyPackage({
  topic:{title:'北京650分出不出京'},
  brief:{thesis:'先判断是否有明显平台或专业跃迁'},
  draft:{titles:['标题1'],body:'正文',tags:[],factual_claims:['2026规则']},
  fact_check:{searched_web:true,items:[{claim:'2026规则',status:'verified',verdict:'外部AI说已核实',sources:[{title:'来源',url:'https://example.com'}]}],compliance_flags:[]}
})
assert.equal(pkg.fact_check.items[0].status,'needs_review')
console.log('bridge safety tests passed')
