function cleanText(value=''){return String(value||'').trim()}

function safeHttpUrl(value=''){
  try{const u=new URL(String(value||''));return ['http:','https:'].includes(u.protocol)?u.toString():''}catch{return ''}
}

export function sanitizeImportedFactCheck(input){
  const fact=input||{items:[],compliance_flags:[],summary:'',searched_web:false}
  const items=(Array.isArray(fact.items)?fact.items:[]).slice(0,40).map(item=>{
    const original=String(item?.status||'needs_review')
    const sources=(Array.isArray(item?.sources)?item.sources:[]).slice(0,6).map(src=>({...src,url:safeHttpUrl(src?.url)})).filter(src=>src.url)
    // A JSON pasted from an external ChatGPT/Codex session is useful evidence, but Content OS
    // did not itself observe the search calls. Never let an imported "verified" bypass the human gate.
    const status=original==='contradicted'?'contradicted':'needs_review'
    const suffix=original==='verified'?'（外部 AI 标记为已验证；Content OS 未直接观察检索过程，需你点开来源后人工确认）':''
    return {
      claim:cleanText(item?.claim),status,original_status:original,
      verdict:`${cleanText(item?.verdict)}${suffix}`.trim(),confidence:Math.min(Number(item?.confidence??0.5),0.75),sources,
    }
  }).filter(x=>x.claim)
  return {
    items,
    compliance_flags:(Array.isArray(fact.compliance_flags)?fact.compliance_flags:[]).slice(0,20),
    summary:cleanText(fact.summary)||'外部 AI 核验结果已导入；verified 项已降级为人工复核。',
    searched_web:Boolean(fact.searched_web),
    imported_external:true,
  }
}

export function extractJson(text=''){
  let raw=cleanText(text)
  const fenced=raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if(fenced) raw=fenced[1].trim()
  const first=raw.indexOf('{'), last=raw.lastIndexOf('}')
  if(first>=0 && last>first) raw=raw.slice(first,last+1)
  return JSON.parse(raw)
}

export function normalizeDailyPackage(input){
  const pkg=input||{}
  if(!pkg.topic?.title) throw new Error('AI结果缺少 topic.title')
  if(!pkg.brief?.thesis) throw new Error('AI结果缺少 brief.thesis')
  if(!Array.isArray(pkg.draft?.titles)||pkg.draft.titles.length<1) throw new Error('AI结果缺少 draft.titles')
  if(!pkg.draft?.body) throw new Error('AI结果缺少 draft.body')
  const titles=[...pkg.draft.titles.slice(0,3)]
  while(titles.length<3) titles.push(titles[0]||pkg.topic.title)
  const fact=sanitizeImportedFactCheck(pkg.fact_check||{items:[],compliance_flags:[],summary:'AI桥接结果未提供事实核验。',searched_web:false})
  const cards=pkg.card_plan||{cards:[]}
  const editorial=pkg.editorial_review||null
  const nativeText=pkg.native_text_plan||null
  if(editorial?.revised_title) titles[0]=cleanText(editorial.revised_title)
  const finalBody=editorial?.revised_body?String(editorial.revised_body):String(pkg.draft.body)
  if(finalBody.length>12000) throw new Error('AI结果正文异常过长（>12000字）')
  if(JSON.stringify(pkg).length>250000) throw new Error('AI结果包异常过大（>250KB）')
  return {
    topic:{title:cleanText(pkg.topic.title),purpose:pkg.topic.purpose||'decision',target_audience:pkg.topic.target_audience||'北京高中生及家长',angle:pkg.topic.angle||''},
    brief:{
      target_audience:pkg.brief.target_audience||pkg.topic.target_audience||'北京高中生及家长',
      purpose:pkg.brief.purpose||pkg.topic.purpose||'decision',content_type:pkg.brief.content_type||'决策型',
      core_conflict:pkg.brief.core_conflict||'',thesis:pkg.brief.thesis||'',reader_takeaway:pkg.brief.reader_takeaway||'',creator_angle:pkg.brief.creator_angle||'',
      outline:Array.isArray(pkg.brief.outline)?pkg.brief.outline:[],facts_to_verify:Array.isArray(pkg.brief.facts_to_verify)?pkg.brief.facts_to_verify:[],risk_flags:Array.isArray(pkg.brief.risk_flags)?pkg.brief.risk_flags:[],
    },
    draft:{titles,body:finalBody,tags:Array.isArray(pkg.draft.tags)?pkg.draft.tags:[],factual_claims:Array.isArray(pkg.draft.factual_claims)?pkg.draft.factual_claims:[]},
    fact_check:{items:Array.isArray(fact.items)?fact.items:[],compliance_flags:Array.isArray(fact.compliance_flags)?fact.compliance_flags:[],summary:fact.summary||'',searched_web:Boolean(fact.searched_web)},
    card_plan:{cards:Array.isArray(cards.cards)?cards.cards:[]},
    editorial_review:editorial,
    native_text_plan:nativeText,
    repurpose:Array.isArray(pkg.repurpose)?pkg.repurpose:[],
  }
}

function compactOpinion(x){return {title:x.title,viewpoint:x.viewpoint,reasoning:x.reasoning||'',exceptions:x.exceptions||'',tone_note:x.tone_note||''}}
function compactKnowledge(x){return {kind:x.kind,title:x.title,summary:x.summary||'',content:(x.content||'').slice(0,900),tags:x.tags||[]}}

export function buildDailyBridgePrompt({calendarItems=[],topics=[],contents=[],opinions=[],knowledge=[],trendSignals=[]}={}){
  const today=new Date().toISOString().slice(0,10)
  const upcoming=[...calendarItems].filter(x=>x.planned_date>=today).sort((a,b)=>a.planned_date.localeCompare(b.planned_date))[0]
  const recent=contents.slice(0,12).map(x=>x.title||x.topics?.title).filter(Boolean)
  const selectedTopics=topics.slice(0,16).map(x=>({title:x.title,purpose:x.purpose||'decision',target_audience:x.target_audience||'',score:x.score||{}}))
  const safeKnowledge=knowledge.filter(x=>!x.is_sensitive).slice(0,10).map(compactKnowledge)
  const context={
    date:today,
    positioning:'北京高考 / 大学与专业决策个人IP；目标是高质量家长线索，不追求低价走量。',
    priority_topic:upcoming?{title:upcoming.title,purpose:upcoming.purpose,planned_date:upcoming.planned_date,angle:upcoming.angle||''}:null,
    topic_pool:selectedTopics,
    recent_titles:recent,
    creator_opinions:opinions.slice(0,8).map(compactOpinion),
    knowledge:safeKnowledge,
    trend_signals:trendSignals.slice(0,12).map(x=>({title:x.title,query:x.query||'',summary:x.summary||'',platform:x.platform||'web',surface:x.surface||'search',search_intent:x.search_intent||0,conversion_fit:x.conversion_fit||0,confidence:x.confidence||0,source:x.source||null})),
  }
  return `你是我的 Content OS 今日主编。请只执行一次完整生产任务：优先使用 priority_topic；没有则综合 topic_pool 与 trend_signals 选择今天最值得发、且不与 recent_titles 重复的一个。热点只能在 confidence 足够且有来源时当作事实依据。受众是北京高中生及家长，内容目标是建立“懂大学、专业、就业取舍”的高客单咨询信任。\n\n如果涉及当前政策、招生规则、分数线、院校项目、就业数据等会变化的事实，请联网查证；优先北京教育考试院、教育部、高校官网等一手来源。没有可靠来源就标记 needs_review，绝对不要编 URL。不要使用“保录、百分百、一分不浪费、内部渠道、官方认证”等表达。\n\n请一次性完成：总编只选1个主推题 → Content Brief → 小红书成稿 → 独立总编审稿（去AI味、反方质疑）→ 事实核验 → 小红书原生文字配图发布包 → 备用6张3:4卡片文案 → 视频号/短视频口播稿、朋友圈版、家长群版。旧职场文风不要默认继承，使用‘升学决策·克制判断型’：结论先行但有边界，具体、克制、像真实咨询，少营销腔和职场吐槽腔。\n\n上下文：\n${JSON.stringify(context,null,2)}\n\n只返回一个 JSON 对象，不要解释，不要 Markdown 代码块。结构必须严格如下：\n${JSON.stringify({
  topic:{title:'',purpose:'decision',target_audience:'',angle:''},
  brief:{target_audience:'',purpose:'decision',content_type:'决策型',core_conflict:'',thesis:'',reader_takeaway:'',creator_angle:'',outline:[''],facts_to_verify:[''],risk_flags:['']},
  draft:{titles:['','',''],body:'',tags:['#北京高考'],factual_claims:['']},
  editorial_review:{publish_ready:true,overall_score:88,human_voice_score:90,ai_tell_score:12,trust_score:90,conversion_score:82,strongest_point:'',objections:[''],ai_tells:[''],logic_gaps:[''],rewrite_notes:[''],revised_title:'',revised_body:''},
  fact_check:{items:[{claim:'',status:'verified',verdict:'',confidence:0.9,sources:[{title:'',url:'https://...',publisher:'',source_type:'official'}]}],compliance_flags:[],summary:'',searched_web:true},
  native_text_plan:{title:'',input_text:'',recommended_style:'简约',fallback_styles:['备忘','基础'],style_reason:'',expected_pages:6,cover_hook:'',paragraph_rules:['2-4句一段'],automation_ready:true},
  card_plan:{cards:[{eyebrow:'北京高考 · 决策',headline:'',body:[''],footer:'O师 · 大学与专业选择',layout:'cover'}]},
  repurpose:[{channel:'video_script',title:'',body:'',notes:''},{channel:'wechat_moments',title:'',body:'',notes:''},{channel:'wechat_group',title:'',body:'',notes:''}]
},null,2)}\n\n额外要求：editorial_review 的 revised_title/revised_body 必须是最终可发布版本；native_text_plan.input_text 必须可直接粘贴到小红书文字配图；默认推荐简约/备忘/基础，科技题材可用科技；card_plan 生成 6 张作为备用；如果 searched_web=false，任何时效性事实不得标 verified。`
}

export function normalizeTrendSweep(input){
  const x=input||{}
  if(!Array.isArray(x.signals)) throw new Error('热点扫描结果缺少 signals 数组')
  return {
    signals:x.signals.filter(Boolean).map(s=>({
      title:cleanText(s.title),query:cleanText(s.query),summary:cleanText(s.summary),
      platform:s.platform||'web',surface:s.surface||'search',
      freshness:Number(s.freshness??5),search_intent:Number(s.search_intent??5),engagement_signal:Number(s.engagement_signal??5),
      audience_fit:Number(s.audience_fit??5),conversion_fit:Number(s.conversion_fit??5),confidence:Number(s.confidence??0.5),
      observed_at:s.observed_at||new Date().toISOString(),metrics:s.metrics||{},source:s.source||null,
    })).filter(s=>s.title),
    summary:cleanText(x.summary),searched_web:Boolean(x.searched_web),xhs_direct:Boolean(x.xhs_direct),limitations:Array.isArray(x.limitations)?x.limitations:[],
  }
}

export function buildTrendBridgePrompt({focus='北京高考、大学与专业选择',watchQueries=[],radarSources=[],recentTopics=[]}={}){
  const enabledSources=radarSources.filter(x=>x.enabled!==false).map(x=>({name:x.name,platform:x.platform,surface:x.surface,weight:x.weight||1}))
  const keywords=watchQueries.filter(x=>x.enabled!==false).map(x=>({query:x.query,type:x.query_type||'keyword',weight:x.weight||1,notes:x.notes||''}))
  const schema={
    signals:[{title:'',query:'',summary:'',platform:'xiaohongshu',surface:'search',freshness:8,search_intent:9,engagement_signal:7,audience_fit:9,conversion_fit:9,confidence:0.8,observed_at:new Date().toISOString(),metrics:{},source:{platform:'xiaohongshu',surface:'search',title:'',url:'https://...',publisher:'小红书'}}],
    summary:'',searched_web:true,xhs_direct:false,limitations:['']
  }
  return `你是我的“选题热点雷达”。请联网检索今天最值得关注的北京高考/大学专业选择相关信号，并只返回 JSON。\n\n非常重要：\n1. 优先寻找小红书公开可检索到的热点/热议/搜索结果/公开笔记页面，但不要声称你读取了 App 内私有热榜；xhs_direct 必须为 false。\n2. 对下面每个 watch query 尽量定向搜索，观察近期是否有集中讨论、反复出现的问题、明显搜索意图。\n3. 对小红书之外，同时检索北京教育考试院、教育部、高校招生官网和会影响专业选择的就业/行业变化。\n4. 不能编 URL、热度值、点赞收藏数、排名；没有真实来源则 confidence<=0.4，source=null。\n5. 不复制创作者原文，只抽象“用户在讨论什么、为什么值得我讲”。\n6. 目标不是追泛热点，而是找“北京高中家长会搜索/收藏/咨询”的话题。\n7. 避免与 recent_topics 重复。\n\n定位：${focus}\n检索源：${JSON.stringify(enabledSources,null,2)}\n重点检索词：${JSON.stringify(keywords,null,2)}\n最近已做选题：${JSON.stringify(recentTopics.slice(0,40),null,2)}\n\n至少返回 12 条、最多 25 条 signals；其中尽量包含：小红书搜索需求、小红书热议/热点线索、官方政策、高校变化、就业行业信号。每条打分 0-10：freshness / search_intent / engagement_signal / audience_fit / conversion_fit。\n\n只返回 JSON，不要 Markdown，不要解释。结构：\n${JSON.stringify(schema,null,2)}`
}
