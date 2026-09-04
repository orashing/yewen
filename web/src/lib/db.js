import { supabase, supabaseConfigured } from './supabase'

const LOCAL_KEY = 'content-os-v08-demo'
const LEGACY_KEYS = ['content-os-v07-demo','content-os-v06-demo','content-os-v05-demo','content-os-v04-demo','content-os-v03-demo','content-os-v02-demo']

function readLocal() {
  try {
    const current = localStorage.getItem(LOCAL_KEY)
    const legacy = LEGACY_KEYS.map(k=>localStorage.getItem(k)).find(Boolean)
    const value = JSON.parse(current || legacy || 'null')
    const normalized = value || {topics: [], contents: [], opinions: [], versions: [], reviews: [], sources: [], calendar: [], knowledge: [], repurposes: [], leads: [], bridge_runs: [], radar_sources: [], watch_queries: [], trend_signals: [], xhs_accounts: [], research_runs: [], posts: [], metrics: [], publish_jobs: [], preferences: {ai_mode:'manual',config:{}}}
    if (!normalized.calendar) normalized.calendar = []
    if (!normalized.knowledge) normalized.knowledge = []
    if (!normalized.repurposes) normalized.repurposes = []
    if (!normalized.leads) normalized.leads = []
    if (!normalized.bridge_runs) normalized.bridge_runs = []
    if (!normalized.radar_sources) normalized.radar_sources = []
    if (!normalized.watch_queries) normalized.watch_queries = []
    if (!normalized.trend_signals) normalized.trend_signals = []
    if (!normalized.xhs_accounts) normalized.xhs_accounts = []
    if (!normalized.research_runs) normalized.research_runs = []
    if (!normalized.posts) normalized.posts = []
    if (!normalized.metrics) normalized.metrics = []
    if (!normalized.publish_jobs) normalized.publish_jobs = []
    if (!normalized.preferences) normalized.preferences = {ai_mode:'manual',config:{}}
    if (normalized && !current) localStorage.setItem(LOCAL_KEY, JSON.stringify(normalized))
    return normalized
  } catch {
    return {topics: [], contents: [], opinions: [], versions: [], reviews: [], sources: [], calendar: [], knowledge: [], repurposes: [], leads: [], bridge_runs: [], radar_sources: [], watch_queries: [], trend_signals: [], xhs_accounts: [], research_runs: [], posts: [], metrics: [], publish_jobs: [], preferences:{ai_mode:'manual',config:{}}}
  }
}

function writeLocal(data) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(data))
}

function localId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function now() { return new Date().toISOString() }

async function currentUserId() {
  if (!supabaseConfigured) return 'demo-user'
  const {data: {user}} = await supabase.auth.getUser()
  if (!user) throw new Error('未登录')
  return user.id
}

export async function listTopics() {
  if (!supabaseConfigured) return readLocal().topics.sort((a,b)=>(b.updated_at||'').localeCompare(a.updated_at||''))
  const {data, error} = await supabase.from('topics').select('*').order('updated_at', {ascending:false})
  if (error) throw error
  return data || []
}

export async function createTopic(input) {
  const row = {
    title: input.title,
    raw_input: input.raw_input || input.title,
    target_audience: input.target_audience || '',
    content_type: input.content_type || '',
    purpose: input.purpose || 'decision',
    score: input.score || {},
    radar_meta: input.radar_meta || {},
    status: input.status || 'SELECTED',
  }
  if (!supabaseConfigured) {
    const state = readLocal()
    const saved = {...row, id: localId('topic'), user_id:'demo-user', created_at:now(), updated_at:now()}
    state.topics.push(saved); writeLocal(state); return saved
  }
  row.user_id = await currentUserId()
  const {data, error} = await supabase.from('topics').insert(row).select().single()
  if (error) throw error
  return data
}

export async function listContents() {
  if (!supabaseConfigured) return readLocal().contents.sort((a,b)=>(b.updated_at||'').localeCompare(a.updated_at||''))
  const {data, error} = await supabase.from('contents').select('*, topics(title)').order('updated_at', {ascending:false})
  if (error) throw error
  return data || []
}

export async function getContent(id) {
  if (!supabaseConfigured) return readLocal().contents.find(x=>x.id===id) || null
  const {data, error} = await supabase.from('contents').select('*, topics(title)').eq('id', id).single()
  if (error) throw error
  return data
}

export async function saveContent({contentId, topicId, selectedTitle, titleOptions, brief, body, tags, factualClaims=[], factCheck={}, cardPlan={}, editorialReview={}, nativeTextPlan={}, status, reason='save'}) {
  const snapshotBase = {topic_id: topicId, title: selectedTitle || '', title_options:titleOptions || [], brief:brief || {}, body:body || '', tags:tags || [], factual_claims:factualClaims || [], fact_check:factCheck || {}, compliance_flags:factCheck?.compliance_flags || [], card_plan:cardPlan || {}, editorial_review:editorialReview || {}, native_text_plan:nativeTextPlan || {}, editorial_score:Number(editorialReview?.overall_score||0), status}

  if (!supabaseConfigured) {
    const state = readLocal()
    let content = contentId ? state.contents.find(x=>x.id===contentId) : null
    if (!content) {
      content = {...snapshotBase, id:localId('content'), user_id:'demo-user', version:1, created_at:now(), updated_at:now()}
      state.contents.push(content)
    } else {
      content.version = (content.version || 1) + 1
      Object.assign(content, snapshotBase, {updated_at:now()})
    }
    state.versions.push({id:localId('version'), content_id:content.id, user_id:'demo-user', version:content.version, snapshot:{...content}, reason, created_at:now()})
    writeLocal(state)
    return content
  }

  const {data, error} = await supabase.rpc('save_content_v09', {
    p_content_id:contentId||null,
    p_topic_id:topicId,
    p_snapshot:snapshotBase,
    p_status:status,
    p_reason:reason,
  })
  if(error) throw error
  const content=Array.isArray(data)?data[0]:data
  if(!content) throw new Error('云端保存未返回内容记录')

  return content
}

export async function listVersions(contentId) {
  if (!supabaseConfigured) return readLocal().versions.filter(x=>x.content_id===contentId).sort((a,b)=>b.version-a.version)
  const {data, error} = await supabase.from('content_versions').select('*').eq('content_id', contentId).order('version', {ascending:false})
  if (error) throw error
  return data || []
}

export async function approveContent(contentId, notes='') {
  if (!supabaseConfigured) {
    const state = readLocal()
    const content = state.contents.find(x=>x.id===contentId)
    if (!content) throw new Error('内容不存在')
    content.status='APPROVED'; content.approved_at=now(); content.approved_version=content.version; content.updated_at=now()
    state.reviews.push({id:localId('review'), content_id:contentId, action:'approved', notes, created_at:now()})
    writeLocal(state); return content
  }
  const {data, error} = await supabase.rpc('approve_content_v09', {p_content_id:contentId, p_notes:notes||''})
  if (error) throw error
  return Array.isArray(data)?data[0]:data
}

export async function listOpinions() {
  if (!supabaseConfigured) return readLocal().opinions.sort((a,b)=>(Number(b.is_pinned)-Number(a.is_pinned)) || (b.updated_at||'').localeCompare(a.updated_at||''))
  const {data, error} = await supabase.from('opinion_library').select('*').order('is_pinned',{ascending:false}).order('updated_at',{ascending:false})
  if (error) throw error
  return data || []
}

export async function saveOpinion(opinion) {
  const row = {
    title: opinion.title,
    viewpoint: opinion.viewpoint,
    reasoning: opinion.reasoning || '',
    exceptions: opinion.exceptions || '',
    tone_note: opinion.tone_note || '',
    tags: opinion.tags || [],
    is_pinned: Boolean(opinion.is_pinned),
  }
  if (!supabaseConfigured) {
    const state = readLocal()
    let saved
    if (opinion.id) {
      saved = state.opinions.find(x=>x.id===opinion.id)
      Object.assign(saved, row, {updated_at:now()})
    } else {
      saved = {...row, id:localId('opinion'), user_id:'demo-user', created_at:now(), updated_at:now()}
      state.opinions.push(saved)
    }
    writeLocal(state); return saved
  }
  const userId = await currentUserId()
  if (opinion.id) {
    const {data, error} = await supabase.from('opinion_library').update(row).eq('id',opinion.id).select().single()
    if (error) throw error
    return data
  }
  const {data, error} = await supabase.from('opinion_library').insert({...row,user_id:userId}).select().single()
  if (error) throw error
  return data
}

export async function deleteOpinion(id) {
  if (!supabaseConfigured) {
    const state = readLocal(); state.opinions = state.opinions.filter(x=>x.id!==id); writeLocal(state); return
  }
  const {error} = await supabase.from('opinion_library').delete().eq('id',id)
  if (error) throw error
}

export async function saveFactCheck(contentId, factCheck) {
  if (!contentId) throw new Error('请先保存内容再做事实核验')
  const payload = {
    fact_check: factCheck || {},
    compliance_flags: factCheck?.compliance_flags || [],
    status: 'FACT_CHECK',
  }
  if (!supabaseConfigured) {
    const state = readLocal()
    const content = state.contents.find(x => x.id === contentId)
    if (!content) throw new Error('内容不存在')
    Object.assign(content, payload, {updated_at: now()})
    state.sources = state.sources || []
    state.sources = state.sources.filter(x => x.content_id !== contentId)
    for (const item of factCheck?.items || []) {
      for (const src of item.sources || []) {
        state.sources.push({id:localId('source'), content_id:contentId, user_id:'demo-user', claim:item.claim, url:src.url, source_name:src.title || src.publisher || '', verification_status:item.status, notes:item.verdict, created_at:now()})
      }
    }
    writeLocal(state)
    return content
  }
  const {data,error}=await supabase.rpc('save_fact_check_v09',{p_content_id:contentId,p_fact_check:factCheck||{},p_compliance_flags:factCheck?.compliance_flags||[]})
  if(error)throw error
  const saved=Array.isArray(data)?data[0]:data
  if(!saved)throw new Error('事实核验保存未返回内容记录')

  return saved
}

export async function saveCardPlan(contentId, cardPlan) {
  if (!contentId) throw new Error('请先保存内容再生成卡片')
  if (!supabaseConfigured) {
    const state=readLocal(); const content=state.contents.find(x=>x.id===contentId)
    if(!content) throw new Error('内容不存在')
    content.card_plan=cardPlan || {}; content.updated_at=now(); writeLocal(state); return content
  }
  const {data,error}=await supabase.from('contents').update({card_plan:cardPlan || {}}).eq('id',contentId).select().single()
  if(error) throw error
  return data
}

export async function uploadCardBlobs(contentId, blobs) {
  if (!contentId) throw new Error('缺少 contentId')
  if (!supabaseConfigured) return blobs.map((blob,i)=>({kind:'card',storage_path:'',metadata:{index:i+1,local:true,size:blob.size},blob}))
  const userId=await currentUserId()
  const uploaded=[]
  for(let i=0;i<blobs.length;i+=1){
    const path=`${userId}/${contentId}/card-${String(i+1).padStart(2,'0')}.png`
    const {error}=await supabase.storage.from('content-assets').upload(path,blobs[i],{contentType:'image/png',upsert:true})
    if(error) throw error
    uploaded.push({user_id:userId,content_id:contentId,kind:'card',storage_path:path,metadata:{index:i+1,size:blobs[i].size}})
  }
  const {error:delError}=await supabase.from('assets').delete().eq('content_id',contentId).eq('kind','card')
  if(delError) throw delError
  if(uploaded.length){const {error:insertError}=await supabase.from('assets').insert(uploaded); if(insertError) throw insertError}
  return uploaded
}

export async function listAssets(contentId) {
  if (!supabaseConfigured) return []
  const {data,error}=await supabase.from('assets').select('*').eq('content_id',contentId).order('created_at',{ascending:true})
  if(error) throw error
  return data || []
}

export async function getSignedAssetUrl(path, expires=3600) {
  if (!supabaseConfigured || !path) return ''
  const {data,error}=await supabase.storage.from('content-assets').createSignedUrl(path,expires)
  if(error) throw error
  return data?.signedUrl || ''
}


export async function listCalendarItems(startDate='', endDate='') {
  if (!supabaseConfigured) {
    return readLocal().calendar
      .filter(x=>(!startDate||x.planned_date>=startDate)&&(!endDate||x.planned_date<=endDate))
      .sort((a,b)=>a.planned_date.localeCompare(b.planned_date)||((a.slot||1)-(b.slot||1)))
  }
  let query=supabase.from('calendar_items').select('*').order('planned_date',{ascending:true}).order('slot',{ascending:true})
  if(startDate) query=query.gte('planned_date',startDate)
  if(endDate) query=query.lte('planned_date',endDate)
  const {data,error}=await query
  if(error) throw error
  return data || []
}

export async function replaceCalendarItems(startDate, endDate, items) {
  if (!supabaseConfigured) {
    const state=readLocal()
    state.calendar=state.calendar.filter(x=>x.planned_date<startDate||x.planned_date>endDate)
    for(const item of items){
      state.calendar.push({
        ...item, id:localId('cal'), user_id:'demo-user', topic_id:item.topic_id||null,
        status:item.status||'planned', metadata:item.metadata||{}, created_at:now(), updated_at:now(),
      })
    }
    writeLocal(state)
    return state.calendar.filter(x=>x.planned_date>=startDate&&x.planned_date<=endDate)
  }
  const userId=await currentUserId()
  const {error:delError}=await supabase.from('calendar_items').delete().gte('planned_date',startDate).lte('planned_date',endDate)
  if(delError) throw delError
  if(!items.length) return []
  const rows=items.map(item=>({
    user_id:userId, topic_id:item.topic_id||null, planned_date:item.planned_date, slot:item.slot||1,
    title:item.title, purpose:item.purpose||'decision', angle:item.angle||'', rationale:item.rationale||'',
    source_topic_title:item.source_topic_title||'', status:item.status||'planned', metadata:item.metadata||{},
  }))
  const {data,error}=await supabase.from('calendar_items').insert(rows).select()
  if(error) throw error
  return data || []
}

export async function updateCalendarItem(id, patch) {
  if (!supabaseConfigured) {
    const state=readLocal(); const item=state.calendar.find(x=>x.id===id)
    if(!item) throw new Error('日历项不存在')
    Object.assign(item,patch,{updated_at:now()}); writeLocal(state); return item
  }
  const {data,error}=await supabase.from('calendar_items').update(patch).eq('id',id).select().single()
  if(error) throw error
  return data
}

export async function deleteCalendarItem(id) {
  if (!supabaseConfigured) {
    const state=readLocal(); state.calendar=state.calendar.filter(x=>x.id!==id); writeLocal(state); return
  }
  const {error}=await supabase.from('calendar_items').delete().eq('id',id)
  if(error) throw error
}


// --- v0.5 knowledge / repurpose / CRM / manual AI bridge ---
export async function listKnowledgeItems() {
  if (!supabaseConfigured) return readLocal().knowledge.sort((a,b)=>(b.updated_at||'').localeCompare(a.updated_at||''))
  const {data,error}=await supabase.from('knowledge_items').select('*').order('updated_at',{ascending:false})
  if(error) throw error
  return data || []
}

export async function saveKnowledgeItem(item) {
  const row={kind:item.kind||'case',title:item.title||'',summary:item.summary||'',content:item.content||'',tags:item.tags||[],is_sensitive:Boolean(item.is_sensitive),metadata:item.metadata||{}}
  if(!row.title.trim()) throw new Error('标题不能为空')
  if(!supabaseConfigured){
    const state=readLocal(); let saved
    if(item.id){saved=state.knowledge.find(x=>x.id===item.id); if(!saved) throw new Error('知识条目不存在'); Object.assign(saved,row,{updated_at:now()})}
    else{saved={...row,id:localId('knowledge'),user_id:'demo-user',created_at:now(),updated_at:now()};state.knowledge.push(saved)}
    writeLocal(state); return saved
  }
  const userId=await currentUserId()
  if(item.id){const {data,error}=await supabase.from('knowledge_items').update(row).eq('id',item.id).select().single();if(error)throw error;return data}
  const {data,error}=await supabase.from('knowledge_items').insert({...row,user_id:userId}).select().single();if(error)throw error;return data
}

export async function deleteKnowledgeItem(id){
  if(!supabaseConfigured){const state=readLocal();state.knowledge=state.knowledge.filter(x=>x.id!==id);writeLocal(state);return}
  const {error}=await supabase.from('knowledge_items').delete().eq('id',id);if(error)throw error
}

export async function listRepurposedOutputs(contentId=''){
  if(!supabaseConfigured) return readLocal().repurposes.filter(x=>!contentId||x.content_id===contentId).sort((a,b)=>(b.updated_at||'').localeCompare(a.updated_at||''))
  let query=supabase.from('repurposed_outputs').select('*').order('updated_at',{ascending:false})
  if(contentId) query=query.eq('content_id',contentId)
  const {data,error}=await query;if(error)throw error;return data||[]
}

export async function saveRepurposedOutputs(contentId, outputs){
  if(!contentId) throw new Error('请先保存主内容')
  if(!supabaseConfigured){
    const state=readLocal()
    for(const out of outputs||[]){
      let item=state.repurposes.find(x=>x.content_id===contentId&&x.channel===out.channel)
      const row={content_id:contentId,channel:out.channel,title:out.title||'',body:out.body||'',notes:out.notes||'',metadata:out.metadata||{},updated_at:now()}
      if(item)Object.assign(item,row);else state.repurposes.push({...row,id:localId('repurpose'),user_id:'demo-user',created_at:now()})
    }
    writeLocal(state);return state.repurposes.filter(x=>x.content_id===contentId)
  }
  const userId=await currentUserId();const rows=(outputs||[]).map(out=>({user_id:userId,content_id:contentId,channel:out.channel,title:out.title||'',body:out.body||'',notes:out.notes||'',metadata:out.metadata||{}}))
  if(!rows.length)return []
  const {data,error}=await supabase.from('repurposed_outputs').upsert(rows,{onConflict:'user_id,content_id,channel'}).select();if(error)throw error;return data||[]
}

export async function listLeads(){
  if(!supabaseConfigured) return readLocal().leads.sort((a,b)=>(b.updated_at||'').localeCompare(a.updated_at||''))
  const {data,error}=await supabase.from('leads').select('*').order('updated_at',{ascending:false});if(error)throw error;return data||[]
}

export async function saveLead(lead){
  // This CRM is designed for attribution, not for storing student identity documents.
  // Reject obvious high-risk identifiers/secrets and keep the record alias-first.
  const privacyText=[lead.name_alias,lead.need,lead.contact_note,lead.source_note,lead.next_action].filter(Boolean).join(' ')
  if(/\b\d{17}[0-9Xx]\b/.test(privacyText)) throw new Error('请勿在 Content OS 保存身份证号；使用匿名代号即可。')
  if(/(?:考生号|准考证号|身份证|密码|验证码)\s*[:：]?\s*[A-Za-z0-9_-]{6,}/i.test(privacyText)) throw new Error('检测到考生号/准考证号/密码等高敏信息，请删除后再保存。')
  const row={source_content_id:lead.source_content_id||null,source_post_id:lead.source_post_id||null,name_alias:lead.name_alias||'',stage:lead.stage||'new',city:lead.city||'北京',district:lead.district||'',grade:lead.grade||'',score_range:lead.score_range||'',need:lead.need||'',contact_channel:lead.contact_channel||'',contact_note:lead.contact_note||'',source_channel:lead.source_channel||'xiaohongshu',source_note:lead.source_note||'',estimated_value:Number(lead.estimated_value||0),actual_value:Number(lead.actual_value||0),next_action:lead.next_action||'',next_followup_date:lead.next_followup_date||null,metadata:lead.metadata||{}}
  if(!supabaseConfigured){const state=readLocal();let saved;if(lead.id){saved=state.leads.find(x=>x.id===lead.id);if(!saved)throw new Error('线索不存在');Object.assign(saved,row,{updated_at:now()})}else{saved={...row,id:localId('lead'),user_id:'demo-user',created_at:now(),updated_at:now()};state.leads.push(saved)}writeLocal(state);return saved}
  const userId=await currentUserId();if(lead.id){const {data,error}=await supabase.from('leads').update(row).eq('id',lead.id).select().single();if(error)throw error;return data}
  const {data,error}=await supabase.from('leads').insert({...row,user_id:userId}).select().single();if(error)throw error;return data
}

export async function deleteLead(id){
  if(!supabaseConfigured){const state=readLocal();state.leads=state.leads.filter(x=>x.id!==id);writeLocal(state);return}
  const {error}=await supabase.from('leads').delete().eq('id',id);if(error)throw error
}

export async function listBridgeRuns(limit=12){
  if(!supabaseConfigured) return readLocal().bridge_runs.slice().sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||'')).slice(0,limit)
  const {data,error}=await supabase.from('ai_bridge_runs').select('*').order('created_at',{ascending:false}).limit(limit);if(error)throw error;return data||[]
}

export async function saveBridgeRun(run){
  const row={run_date:run.run_date||new Date().toISOString().slice(0,10),prompt:run.prompt||'',response_json:run.response_json||{},status:run.status||'prompt_ready',metadata:run.metadata||{}}
  if(!supabaseConfigured){const state=readLocal();let saved;if(run.id){saved=state.bridge_runs.find(x=>x.id===run.id);if(!saved)throw new Error('桥接记录不存在');Object.assign(saved,row,{updated_at:now()})}else{saved={...row,id:localId('bridge'),user_id:'demo-user',created_at:now(),updated_at:now()};state.bridge_runs.push(saved)}writeLocal(state);return saved}
  const userId=await currentUserId();if(run.id){const {data,error}=await supabase.from('ai_bridge_runs').update(row).eq('id',run.id).select().single();if(error)throw error;return data}
  const {data,error}=await supabase.from('ai_bridge_runs').insert({...row,user_id:userId}).select().single();if(error)throw error;return data
}

export async function getPreferences(){
  if(!supabaseConfigured) return readLocal().preferences||{ai_mode:'manual',config:{}}
  const userId=await currentUserId();const {data,error}=await supabase.from('user_preferences').select('*').eq('user_id',userId).maybeSingle();if(error)throw error
  return data||{user_id:userId,ai_mode:'manual',config:{}}
}

export async function savePreferences(prefs){
  const row={ai_mode:prefs.ai_mode||'manual',config:prefs.config||{},updated_at:now()}
  if(!supabaseConfigured){const state=readLocal();state.preferences=row;writeLocal(state);return row}
  const userId=await currentUserId();const {data,error}=await supabase.from('user_preferences').upsert({user_id:userId,...row},{onConflict:'user_id'}).select().single();if(error)throw error;return data
}


// --- v0.6 multi-source trend intelligence ---
const DEFAULT_RADAR_SOURCES = [
  {name:'小红书热点榜',platform:'xiaohongshu',surface:'hot_list',enabled:true,weight:1.2,config:{mode:'bridge_or_collector'}},
  {name:'小红书热议话题',platform:'xiaohongshu',surface:'hot_topic',enabled:true,weight:1.15,config:{mode:'bridge_or_collector'}},
  {name:'小红书关键词搜索',platform:'xiaohongshu',surface:'search',enabled:true,weight:1.3,config:{mode:'bridge_or_collector'}},
  {name:'同类账号/竞品主题',platform:'xiaohongshu',surface:'competitor',enabled:true,weight:0.9,config:{mode:'bridge_or_collector'}},
  {name:'北京教育考试院/教育部',platform:'official',surface:'policy',enabled:true,weight:1.4,config:{mode:'web'}},
  {name:'高校招生官网',platform:'university',surface:'policy',enabled:true,weight:1.2,config:{mode:'web'}},
  {name:'就业与行业变化',platform:'web',surface:'career',enabled:true,weight:1.0,config:{mode:'web'}},
]

export async function listRadarSources(){
  if(!supabaseConfigured){
    const state=readLocal();
    if(!state.radar_sources.length){
      state.radar_sources=DEFAULT_RADAR_SOURCES.map(x=>({...x,id:localId('radsrc'),user_id:'demo-user',created_at:now(),updated_at:now()}));writeLocal(state)
    }
    return state.radar_sources
  }
  const {data,error}=await supabase.from('radar_sources').select('*').order('created_at',{ascending:true});if(error)throw error
  if(data?.length)return data
  const userId=await currentUserId();const rows=DEFAULT_RADAR_SOURCES.map(x=>({...x,user_id:userId}))
  const {data:created,error:createError}=await supabase.from('radar_sources').insert(rows).select();if(createError)throw createError;return created||[]
}

export async function updateRadarSource(id,patch){
  if(!supabaseConfigured){const state=readLocal();const item=state.radar_sources.find(x=>x.id===id);if(!item)throw new Error('检索源不存在');Object.assign(item,patch,{updated_at:now()});writeLocal(state);return item}
  const {data,error}=await supabase.from('radar_sources').update(patch).eq('id',id).select().single();if(error)throw error;return data
}

export async function listWatchQueries(){
  if(!supabaseConfigured)return readLocal().watch_queries.filter(x=>x.enabled!==false).sort((a,b)=>(b.weight||1)-(a.weight||1))
  const {data,error}=await supabase.from('watch_queries').select('*').order('weight',{ascending:false}).order('updated_at',{ascending:false});if(error)throw error;return data||[]
}

export async function saveWatchQuery(item){
  const row={query:(item.query||'').trim(),query_type:item.query_type||'keyword',audience:item.audience||'',weight:Number(item.weight||1),enabled:item.enabled!==false,notes:item.notes||''};if(!row.query)throw new Error('检索词不能为空')
  if(!supabaseConfigured){const state=readLocal();let saved;if(item.id){saved=state.watch_queries.find(x=>x.id===item.id);if(!saved)throw new Error('检索词不存在');Object.assign(saved,row,{updated_at:now()})}else{saved={...row,id:localId('watch'),user_id:'demo-user',created_at:now(),updated_at:now()};state.watch_queries.push(saved)}writeLocal(state);return saved}
  const userId=await currentUserId();if(item.id){const {data,error}=await supabase.from('watch_queries').update(row).eq('id',item.id).select().single();if(error)throw error;return data}
  const {data,error}=await supabase.from('watch_queries').insert({...row,user_id:userId}).select().single();if(error)throw error;return data
}

export async function deleteWatchQuery(id){
  if(!supabaseConfigured){const state=readLocal();state.watch_queries=state.watch_queries.filter(x=>x.id!==id);writeLocal(state);return}
  const {error}=await supabase.from('watch_queries').delete().eq('id',id);if(error)throw error
}

export async function saveTrendSignals(signals=[]){
  const clean=(signals||[]).map(x=>({title:x.title,query:x.query||'',summary:x.summary||'',platform:x.platform||'web',surface:x.surface||'search',freshness:Number(x.freshness||5),search_intent:Number(x.search_intent||5),engagement_signal:Number(x.engagement_signal||5),audience_fit:Number(x.audience_fit||5),conversion_fit:Number(x.conversion_fit||5),confidence:Number(x.confidence||0.5),observed_at:x.observed_at||now(),metrics:x.metrics||{},source:x.source||null,raw:x.raw||{},status:x.status||'active'})).filter(x=>x.title)
  if(!supabaseConfigured){const state=readLocal();for(const row of clean)state.trend_signals.unshift({...row,id:localId('signal'),user_id:'demo-user',created_at:now()});state.trend_signals=state.trend_signals.slice(0,300);writeLocal(state);return clean}
  if(!clean.length)return[];const userId=await currentUserId();const {data,error}=await supabase.from('trend_signals').insert(clean.map(x=>({...x,user_id:userId}))).select();if(error)throw error;return data||[]
}

export async function listTrendSignals(limit=80){
  if(!supabaseConfigured)return readLocal().trend_signals.slice().sort((a,b)=>(b.observed_at||'').localeCompare(a.observed_at||'')).slice(0,limit)
  const {data,error}=await supabase.from('trend_signals').select('*').order('observed_at',{ascending:false}).limit(limit);if(error)throw error;return data||[]
}

// --- v0.7 dual-account XHS architecture + attribution ---
export async function listXhsAccounts(){
  if(!supabaseConfigured)return readLocal().xhs_accounts.slice().sort((a,b)=>(a.role||'').localeCompare(b.role||''))
  const {data,error}=await supabase.from('xhs_accounts').select('*').order('role',{ascending:true});if(error)throw error;return data||[]
}

export async function saveXhsAccount(item){
  const row={alias:(item.alias||'').trim(),role:item.role||'research',profile_key:item.profile_key||'',enabled:item.enabled!==false,status:item.status||'not_connected',risk_state:item.risk_state||'normal',notes:item.notes||'',config:item.config||{}}
  if(!row.alias)throw new Error('账号别名不能为空')
  if(!supabaseConfigured){const state=readLocal();let saved=state.xhs_accounts.find(x=>x.role===row.role);if(saved)Object.assign(saved,row,{updated_at:now()});else{saved={...row,id:localId('xhs'),user_id:'demo-user',created_at:now(),updated_at:now()};state.xhs_accounts.push(saved)}writeLocal(state);return saved}
  const userId=await currentUserId();const {data,error}=await supabase.from('xhs_accounts').upsert({...row,user_id:userId},{onConflict:'user_id,role'}).select().single();if(error)throw error;return data
}

export async function listResearchRuns(limit=20){
  if(!supabaseConfigured)return readLocal().research_runs.slice().sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||'')).slice(0,limit)
  const {data,error}=await supabase.from('research_runs').select('*').order('created_at',{ascending:false}).limit(limit);if(error)throw error;return data||[]
}

export async function saveResearchRun(run){
  const row={account_id:run.account_id||null,status:run.status||'completed',run_type:run.run_type||'keyword_sweep',query_count:Number(run.query_count||0),signal_count:Number(run.signal_count||0),started_at:run.started_at||now(),finished_at:run.finished_at||now(),error_code:run.error_code||null,notes:run.notes||'',metadata:run.metadata||{}}
  if(!supabaseConfigured){const state=readLocal();const saved={...row,id:localId('rrun'),user_id:'demo-user',created_at:now()};state.research_runs.unshift(saved);writeLocal(state);return saved}
  const userId=await currentUserId();const {data,error}=await supabase.from('research_runs').insert({...row,user_id:userId}).select().single();if(error)throw error;return data
}

export async function listPosts(){
  if(!supabaseConfigured)return readLocal().posts.slice().sort((a,b)=>(b.published_at||b.created_at||'').localeCompare(a.published_at||a.created_at||''))
  const {data,error}=await supabase.from('posts').select('*, contents(title, topics(title))').order('published_at',{ascending:false,nullsFirst:false});if(error)throw error;return data||[]
}

export async function savePost(post){
  const row={content_id:post.content_id||null,platform:post.platform||'xiaohongshu',external_post_id:post.external_post_id||'',external_url:post.external_url||'',published_at:post.published_at||now()}
  if(!supabaseConfigured){const state=readLocal();let saved=post.id?state.posts.find(x=>x.id===post.id):null;if(saved)Object.assign(saved,row);else{saved={...row,id:localId('post'),user_id:'demo-user',created_at:now()};state.posts.unshift(saved)}writeLocal(state);return saved}
  const userId=await currentUserId();if(post.id){const {data,error}=await supabase.from('posts').update(row).eq('id',post.id).select().single();if(error)throw error;return data}
  const {data,error}=await supabase.from('posts').insert({...row,user_id:userId}).select().single();if(error)throw error;return data
}

export async function listMetrics(){
  if(!supabaseConfigured)return readLocal().metrics.slice().sort((a,b)=>(b.captured_at||'').localeCompare(a.captured_at||''))
  const {data,error}=await supabase.from('metrics').select('*').order('captured_at',{ascending:false});if(error)throw error;return data||[]
}

export async function saveMetric(metric){
  const row={post_id:metric.post_id, captured_at:metric.captured_at||now(), views:Number(metric.views||0),likes:Number(metric.likes||0),saves:Number(metric.saves||0),comments:Number(metric.comments||0),followers_gained:Number(metric.followers_gained||0),qualified_leads:Number(metric.qualified_leads||metric.leads||0),profile_visits:Number(metric.profile_visits||0),dms:Number(metric.dms||0),leads:Number(metric.leads||0),consultations:Number(metric.consultations||0),revenue:Number(metric.revenue||0),metadata:metric.metadata||{}}
  if(!row.post_id)throw new Error('请选择对应笔记')
  if(!supabaseConfigured){const state=readLocal();const saved={...row,id:localId('metric'),user_id:'demo-user'};state.metrics.unshift(saved);writeLocal(state);return saved}
  const userId=await currentUserId();const {data,error}=await supabase.from('metrics').insert({...row,user_id:userId}).select().single();if(error)throw error;return data
}


// --- v0.8 editorial review / native XHS text-to-image plan ---
export async function saveEditorialReview(contentId, review) {
  if (!contentId) throw new Error('请先保存内容')
  const payload={editorial_review:review||{},editorial_score:Number(review?.overall_score||0),updated_at:now()}
  if(!supabaseConfigured){
    const state=readLocal();const content=state.contents.find(x=>x.id===contentId);if(!content)throw new Error('内容不存在')
    Object.assign(content,payload);writeLocal(state);return content
  }
  const {data,error}=await supabase.from('contents').update(payload).eq('id',contentId).select().single()
  if(error)throw error
  return data
}

export async function saveNativeTextPlan(contentId, plan) {
  if (!contentId) throw new Error('请先保存内容')
  const payload={native_text_plan:plan||{},updated_at:now()}
  if(!supabaseConfigured){
    const state=readLocal();const content=state.contents.find(x=>x.id===contentId);if(!content)throw new Error('内容不存在')
    Object.assign(content,payload);writeLocal(state);return content
  }
  const {data,error}=await supabase.from('contents').update(payload).eq('id',contentId).select().single()
  if(error)throw error
  return data
}

export async function queuePublishJob(contentId, nativeTextPlan, scheduledAt=null) {
  if(!contentId) throw new Error('缺少 contentId')
  if(!supabaseConfigured){
    const state=readLocal();if(!state.publish_jobs)state.publish_jobs=[]
    state.publish_jobs=state.publish_jobs.map(x=>(x.content_id===contentId&&['QUEUED','CLAIMED','PUBLISHING'].includes(x.status))?{...x,status:'CANCELLED',finished_at:now(),error_code:'SUPERSEDED'}:x)
    const saved={content_id:contentId,platform:'xiaohongshu',scheduled_at:scheduledAt,status:'QUEUED',publish_mode:'native_text',account_role:'publisher',payload:{native_text_plan:nativeTextPlan||{}},error_code:null,error_detail:null,id:localId('publish'),user_id:'demo-user',created_at:now(),attempts:0}
    state.publish_jobs.unshift(saved);writeLocal(state);return saved
  }
  const {data,error}=await supabase.rpc('enqueue_publish_job_v09',{
    p_content_id:contentId,p_payload:{native_text_plan:nativeTextPlan||{}},p_scheduled_at:scheduledAt,
    p_publish_mode:'native_text',p_account_role:'publisher'
  })
  if(error)throw error
  return Array.isArray(data)?data[0]:data
}

export async function listPublishJobs(){
  if(!supabaseConfigured){const state=readLocal();return (state.publish_jobs||[]).slice().sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||''))}
  const {data,error}=await supabase.from('publish_jobs').select('*').order('created_at',{ascending:false});if(error)throw error;return data||[]
}
